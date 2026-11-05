#!/usr/bin/env node
/**
 * widget_sim.js —— Scriptable 桌面小组件的本地模拟器（node 跑，无需真机）
 *
 * 用途：在交付小组件脚本前，先在本地验证「语法正确 + 用到的 Scriptable API 都在
 *       mock 范围内（不会因为调用了不存在的 API 而 undefined 崩溃）」，并打印
 *       一份渲染摘要（addText 文本、DrawContext 绘制统计），三档尺寸分别跑一遍。
 *
 * 用法：
 *   node widget_sim.js <脚本.js> [small|medium|large|extraLarge] [选项]
 *
 * 选项：
 *   --csv <样例.csv>      用样例 CSV 内容注入 FileManager 读文件（测 CSV 解析）
 *   --json <json|文件>    Request.loadJSON 的返回数据（测「成功分支」，默认 {mock:true}）
 *   --app                 模拟「在 Scriptable App 内手动运行」（config.runsInWidget=false）
 *   --siri                模拟「经 Siri 运行」（config.runsWithSiri=true，runsInWidget=false）
 *   --silent              模拟「URL/快捷指令带 mode=silent 唤起」（走静默分支，不弹预览）
 *
 * 例：
 *   node widget_sim.js 记账小组件.js small
 *   node widget_sim.js 记账小组件.js large --csv /path/to/记账账单.csv
 *   node widget_sim.js 股票.js medium --json '{"price":1800.5,"changePct":2.3}'
 *   node widget_sim.js 记账.js medium --app --silent
 *
 * 说明：
 *   - 尺寸参数影响 config.widgetFamily（small/medium/large/extraLarge）。
 *   - 不传尺寸默认 medium；不传 --app 默认桌面小组件环境（runsInWidget=true）。
 *   - 真实视觉布局必须靠真机截图，本模拟器只保证「能跑、不崩、API 用对」。
 *   - 网络请求（Request.loadJSON/loadString/loadImage）默认返回 mock 数据：
 *       loadJSON → {mock:true}，loadString → "mock response body"，loadImage → 空 Image。
 *     所以脚本里对网络字段的解析务必 try-catch 兜底（真机也可能请求失败）。
 *     想测「成功分支」用 --json 注入真实结构的数据。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------- 解析参数 ----------------
const argv = process.argv.slice(2);
if (argv.length < 1) {
  console.error('用法: node widget_sim.js <脚本.js> [small|medium|large] [--csv 样例.csv]');
  process.exit(2);
}
const scriptPath = argv[0];
const rest = argv.slice(1);
const sizes = ['small', 'medium', 'large', 'extraLarge'];
const size = rest.find((a) => sizes.includes(a)) || 'medium';
const appMode = rest.includes('--app');      // 模拟「在 Scriptable App 内手动运行」（runsInWidget=false）
const silentMode = rest.includes('--silent'); // 模拟「URL/快捷指令带 mode=silent 唤起」
const siriMode = rest.includes('--siri');     // 模拟「经 Siri 运行」（config.runsWithSiri=true）
const csvFlagIdx = rest.indexOf('--csv');
let sampleCsv = null;
if (csvFlagIdx >= 0 && rest[csvFlagIdx + 1]) {
  sampleCsv = fs.readFileSync(rest[csvFlagIdx + 1], 'utf8');
}
// --json 自定义 Request.loadJSON 的返回（可传 inline JSON 或 JSON 文件路径），用于测「成功分支」
const jsonFlagIdx = rest.indexOf('--json');
let sampleJson = { mock: true };
if (jsonFlagIdx >= 0 && rest[jsonFlagIdx + 1]) {
  const raw = rest[jsonFlagIdx + 1];
  try {
    sampleJson = fs.existsSync(raw) ? JSON.parse(fs.readFileSync(raw, 'utf8')) : JSON.parse(raw);
  } catch (e) {
    console.error(`⚠ --json 参数解析失败，回退为 {mock:true}：${raw}`);
    sampleJson = { mock: true };
  }
}

if (!fs.existsSync(scriptPath)) {
  console.error(`脚本不存在: ${scriptPath}`);
  process.exit(2);
}
const src = fs.readFileSync(scriptPath, 'utf8');

// ---------------- 渲染日志收集 ----------------
const log = {
  texts: [],          // ListWidget 路径 addText 的文本
  stacks: 0,
  spacers: 0,
  draw: {
    fill: 0, fillEllipse: 0, strokeEllipse: 0, fillPath: 0, strokePath: 0,
    drawText: 0, drawTextInRect: 0, drawLine: 0, drawImage: 0, drawImageInRect: 0,
  },
  setWidget: false,
  present: null,      // presentSmall/Medium/Large 实际调用
  errors: [],
};
function recordText(s) { if (typeof s === 'string') log.texts.push(s); }

// ---------------- 基础几何类型 ----------------
function Size(w, h) { this.width = w; this.height = h; }
function Point(x, y) { this.x = x; this.y = y; }
function Rect(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; }

// ---------------- Color ----------------
function Color() {
  // new Color("#rrggbb") 或 new Color(r,g,b) 或 new Color(r,g,b,a)
  const a = arguments;
  let hex = '#888888';
  if (a.length === 1 && typeof a[0] === 'string') hex = a[0];
  else if (a.length >= 3) {
    const r = Math.round(a[0] * 255), g = Math.round(a[1] * 255), b = Math.round(a[2] * 255);
    hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  this._hex = hex;
}
Color.dynamic = (light, dark) => light || dark;
Color.black = () => new Color('#000000');
Color.darkGray = () => new Color('#3a3a3c');
Color.lightGray = () => new Color('#d1d1d6');
Color.white = () => new Color('#ffffff');
Color.gray = () => new Color('#8e8e93');
Color.red = () => new Color('#ff3b30');
Color.green = () => new Color('#34c759');
Color.blue = () => new Color('#007aff');
Color.cyan = () => new Color('#32ade6');
Color.yellow = () => new Color('#ffcc00');
Color.magenta = () => new Color('#ff2d55');
Color.orange = () => new Color('#ff9500');
Color.purple = () => new Color('#af52de');
Color.brown = () => new Color('#a2845e');
Color.clear = () => new Color('#000000');

// ---------------- Font ----------------
const _fontFactory = (size) => ({ size, _mock: 'font' });
const Font = {};
for (const name of ['systemFont', 'boldSystemFont', 'semiboldSystemFont', 'mediumSystemFont',
  'lightSystemFont', 'heavySystemFont', 'blackSystemFont', 'thinSystemFont', 'ultraLightSystemFont',
  'regularSystemFont', 'italicSystemFont', 'roundedSystemFont',
  'monospacedSystemFont', 'regularMonospacedSystemFont', 'systemRoundedFont', 'systemMonospacedFont']) {
  Font[name] = (size) => _fontFactory(size);
}
for (const name of ['largeTitle', 'title1', 'title2', 'title3', 'headline', 'subheadline',
  'body', 'callout', 'footnote', 'caption1', 'caption2']) {
  Font[name] = () => _fontFactory(0);
}

// ---------------- LinearGradient ----------------
function LinearGradient() { this.colors = []; this.locations = [0, 1]; this.startPoint = null; this.endPoint = null; }

// ---------------- Image ----------------
function Image() {}
Image.fromFile = (p) => new Image();

// ---------------- Data（二进制数据） ----------------
function Data() { this._raw = ''; }
Data.fromString = (s) => { const d = new Data(); d._raw = String(s); return d; };
Data.fromBase64String = (b64) => { const d = new Data(); d._raw = Buffer.from(b64, 'base64').toString('utf8'); return d; };
Data.fromJPEG = (img) => { const d = new Data(); d._raw = '[jpeg]'; return d; };
Data.fromPNG = (img) => { const d = new Data(); d._raw = '[png]'; return d; };
Data.prototype.toBase64String = function () { return Buffer.from(this._raw, 'utf8').toString('base64'); };
Data.prototype.toRawString = function () { return this._raw; };
Data.prototype.getBytes = function () { return Array.from(Buffer.from(this._raw, 'utf8')); };

// ---------------- UUID ----------------
const UUID = { string: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16); const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
}) };

// ---------------- DateFormatter ----------------
function DateFormatter() { this.dateFormat = null; this.locale = null; this.timeStyle = null; this.dateStyle = null; }
DateFormatter.prototype.string = function (date) {
  const d = date || new Date();
  const p = (n) => String(n).padStart(2, '0');
  // 自定义格式优先
  if (this.dateFormat) {
    return this.dateFormat
      .replace(/yyyy/g, String(d.getFullYear()))
      .replace(/MMMM/g, 'January')
      .replace(/MMM/g, 'Jan')
      .replace(/MM/g, p(d.getMonth() + 1))
      .replace(/M/g, String(d.getMonth() + 1))
      .replace(/dd/g, p(d.getDate()))
      .replace(/d/g, String(d.getDate()))
      .replace(/HH/g, p(d.getHours()))
      .replace(/mm/g, p(d.getMinutes()))
      .replace(/ss/g, p(d.getSeconds()))
      .replace(/EEEE/g, 'Thursday')
      .replace(/EEE/g, 'Thu');
  }
  // 用 use*DateStyle / use*TimeStyle 时，输出本地化日期（不落入原始 Date 字符串）
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  let datePart = null;
  let timePart = null;
  if (this.dateStyle && this.dateStyle !== 'none') {
    if (this.dateStyle === 'full') datePart = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
    else if (this.dateStyle === 'long') datePart = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    else if (this.dateStyle === 'medium') datePart = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    else if (this.dateStyle === 'short') datePart = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (this.timeStyle && this.timeStyle !== 'none') {
    const hh = p(d.getHours());
    const mm = p(d.getMinutes());
    const ss = p(d.getSeconds());
    if (this.timeStyle === 'full') timePart = `${hh}:${mm}:${ss} GMT+8`;
    else if (this.timeStyle === 'long') timePart = `${hh}:${mm}:${ss}`;
    else timePart = `${hh}:${mm}`; // medium / short
  }
  if (datePart || timePart) return [datePart, timePart].filter(Boolean).join(' ');
  return String(d);
};
DateFormatter.prototype.date = function (str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
};
DateFormatter.prototype.useMediumDateStyle = function () { this.dateStyle = 'medium'; };
DateFormatter.prototype.useShortDateStyle = function () { this.dateStyle = 'short'; };
DateFormatter.prototype.useLongDateStyle = function () { this.dateStyle = 'long'; };
DateFormatter.prototype.useFullDateStyle = function () { this.dateStyle = 'full'; };
DateFormatter.prototype.useNoDateStyle = function () { this.dateStyle = 'none'; };
DateFormatter.prototype.useMediumTimeStyle = function () { this.timeStyle = 'medium'; };
DateFormatter.prototype.useShortTimeStyle = function () { this.timeStyle = 'short'; };
DateFormatter.prototype.useLongTimeStyle = function () { this.timeStyle = 'long'; };
DateFormatter.prototype.useFullTimeStyle = function () { this.timeStyle = 'full'; };
DateFormatter.prototype.useNoTimeStyle = function () { this.timeStyle = 'none'; };

// ---------------- RelativeDateTimeFormatter ----------------
function RelativeDateTimeFormatter() { this._named = true; }
RelativeDateTimeFormatter.prototype.useNamedDateTimeStyle = function () { this._named = true; };
RelativeDateTimeFormatter.prototype.useNumericDateTimeStyle = function () { this._named = false; };
RelativeDateTimeFormatter.prototype.string = function (date, ref) {
  const diff = (ref || new Date()).getTime() - date.getTime();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  let out;
  if (sec < 60) out = `${sec} 秒`;
  else if (sec < 3600) out = `${Math.round(sec / 60)} 分钟`;
  else if (sec < 86400) out = `${Math.round(sec / 3600)} 小时`;
  else out = `${Math.round(sec / 86400)} 天`;
  return (diff >= 0 ? out + '前' : out + '后');
};

// ---------------- Device ----------------
const Device = {
  name: () => 'iPhone',
  model: () => 'iPhone',
  systemName: () => 'iOS',
  systemVersion: () => '17.0',
  locale: () => 'zh_CN',
  language: () => 'zh',
  isPhone: () => true,
  isPad: () => false,
  screenSize: () => new Size(393, 852),
  screenScale: () => 3,
  batteryLevel: () => 0.8,
  isCharging: () => true,
};

// ---------------- Keychain ----------------
const _keychainStore = {};
const Keychain = {
  set: (k, v) => { _keychainStore[k] = String(v); },
  get: (k) => (_keychainStore[k] !== undefined ? _keychainStore[k] : null),
  contains: (k) => (_keychainStore[k] !== undefined),
  remove: (k) => { delete _keychainStore[k]; },
  removeAll: () => { for (const k in _keychainStore) delete _keychainStore[k]; },
};

// ---------------- Pasteboard ----------------
const _pasteboardStore = { string: '', data: null };
const Pasteboard = {
  copyString: (s) => { _pasteboardStore.string = String(s); },
  pasteString: () => _pasteboardStore.string,
  copy: (data) => { _pasteboardStore.data = data; },
  paste: () => _pasteboardStore.data,
};

// ---------------- log（Scriptable 全局日志，不是 console.log） ----------------
function scriptableLog(msg) { console.log('[Scriptable log]', String(msg)); }

// ---------------- Request（网络请求） ----------------
function Request(url) {
  this.url = url;
  this.method = 'GET';
  this.headers = {};
  this.body = null;
  this.timeoutInterval = 60;
  this.response = null;
}
Request.prototype.load = async function () { return Data.fromString('mock'); };
Request.prototype.loadString = async function () { return 'mock response body'; };
Request.prototype.loadJSON = async function () { return sampleJson; };
Request.prototype.loadImage = async function () { return new Image(); };
Request.prototype.addParameterToMultipart = function () {};

// ---------------- WebView ----------------
function WebView() { this._html = ''; }
WebView.prototype.loadURL = async function () { return this; };
WebView.prototype.loadHTML = async function (html) { this._html = String(html); return this; };
WebView.prototype.loadFile = async function () { return this; };
WebView.prototype.getImage = async function () { return new Image(); };
WebView.prototype.evaluateJavaScript = async function () { return null; };
WebView.prototype.present = async function () { return true; };

// ---------------- Notification ----------------
function Notification() {
  this.title = '';
  this.body = '';
  this.sound = null;
  this.identifier = null;
  this._nextTriggerDate = null;
}
Notification.prototype.schedule = function () {};
Notification.prototype.remove = function () {};
Notification.prototype.setTriggerDate = function (d) { this._nextTriggerDate = d; };
Notification.removePending = function () {};
Notification.removeAllPending = function () {};
Notification.removeDelivered = function () {};
Notification.removeAllDelivered = function () {};

// ---------------- SFSymbol ----------------
function SFSymbolImage() {}
const SFSymbol = {
  named: (name) => ({ name, _image: new SFSymbolImage(), applyFont() {}, applyRegularWeight() {}, applySemiboldWeight() {}, applyBoldWeight() {}, applyHeavyWeight() {}, applyBlackWeight() {}, applyUltraLightWeight() {}, applyThinWeight() {}, applyLightWeight() {}, applyMediumWeight() {}, image: new SFSymbolImage() }),
};

// ---------------- Safari / URLScheme / CallbackURL ----------------
const Safari = {
  open: () => {},
  openInApp: () => {},
};
function URLScheme(url) { this.url = url; this._params = {}; }
URLScheme.prototype.addParameter = function (k, v) { this._params[k] = v; };
URLScheme.prototype.open = function () {};
URLScheme.prototype.openCallback = function () {};
URLScheme.forRunningScript = () => new URLScheme('scriptable:///run');
function CallbackURL(url) { this.url = url; this._params = {}; }
CallbackURL.prototype.addParameter = function (k, v) { this._params[k] = v; };
CallbackURL.prototype.open = async function () { return null; };
CallbackURL.prototype.waitForResponse = async function () { return null; };

// ---------------- Alert ----------------
function Alert() { this.title = ''; this.message = ''; this._actions = []; this._cancel = []; this._destructive = []; }
Alert.prototype.addAction = function (t) { this._actions.push(t); };
Alert.prototype.addCancelAction = function (t) { this._cancel.push(t); };
Alert.prototype.addDestructiveAction = function (t) { this._destructive.push(t); };
Alert.prototype.addTextField = function (placeholder, text) { return placeholder || ''; };
Alert.prototype.addSecureTextField = function (placeholder, text) { return placeholder || ''; };
Alert.prototype.textFieldValue = function (i) { return ''; };
Alert.prototype.presentAlert = async function () { return 0; };
Alert.prototype.presentSheet = async function () { return 0; };
Alert.prototype.present = async function () { return 0; };

// ---------------- Path ----------------
function Path() { this._ops = []; }
Path.prototype.move = function (p) { this._ops.push(['move', p]); };
Path.prototype.addLine = function (p) { this._ops.push(['line', p]); };
Path.prototype.addLines = function (pts) { this._ops.push(['lines', pts]); };
Path.prototype.closeSubpath = function () { this._ops.push(['close']); };
Path.prototype.addRect = function (r) { this._ops.push(['rect', r]); };
Path.prototype.addEllipse = function (r) { this._ops.push(['ellipse', r]); };
Path.prototype.addRoundedRect = function (r, w, h) { this._ops.push(['roundedRect', r, w, h]); };
Path.prototype.addArc = function (c, radius, s, e, clockwise) { this._ops.push(['arc', c, radius, s, e, clockwise]); };
Path.prototype.addCurve = function (p, c1, c2) { this._ops.push(['curve', p, c1, c2]); };
Path.prototype.addQuadCurve = function (p, c) { this._ops.push(['quad', p, c]); };

// ---------------- DrawContext ----------------
function DrawContext() {
  this.size = new Size(0, 0);
  this.opaque = false;
  this.respectedScreenScale = true;
}
DrawContext.prototype.setFillColor = function () {};
DrawContext.prototype.setStrokeColor = function () {};
DrawContext.prototype.setTextColor = function () {};
DrawContext.prototype.setFont = function () {};
DrawContext.prototype.setLineWidth = function () {};
DrawContext.prototype.setLineCap = function () {};
DrawContext.prototype.setLineJoin = function () {};
DrawContext.prototype.setLineDash = function () {};
DrawContext.prototype.setShadow = function () {};
DrawContext.prototype.setTextAlignedLeft = function () {};
DrawContext.prototype.setTextAlignedCenter = function () {};
DrawContext.prototype.setTextAlignedRight = function () {};
DrawContext.prototype.fill = function () { log.draw.fill++; };
DrawContext.prototype.fillEllipse = function () { log.draw.fillEllipse++; };
DrawContext.prototype.strokeEllipse = function () { log.draw.strokeEllipse++; };
DrawContext.prototype.addPath = function () {};
DrawContext.prototype.fillPath = function () { log.draw.fillPath++; };
DrawContext.prototype.strokePath = function () { log.draw.strokePath++; };
DrawContext.prototype.drawText = function (t) { recordText(t); log.draw.drawText++; };
DrawContext.prototype.drawTextInRect = function (t) { recordText(t); log.draw.drawTextInRect++; };
DrawContext.prototype.drawLine = function () { log.draw.drawLine++; };
DrawContext.prototype.drawImage = function () { log.draw.drawImage++; };
DrawContext.prototype.drawImageInRect = function () { log.draw.drawImageInRect++; };
DrawContext.prototype.getImage = function () { return new Image(); };

// ---------------- WidgetText / WidgetImage / WidgetDate / Stack / Spacer ----------------
function WidgetText() { this.font = null; this.textColor = null; this.lineLimit = 0; }
WidgetText.prototype.leftAlignText = function () {};
WidgetText.prototype.centerAlignText = function () {};
WidgetText.prototype.rightAlignText = function () {};

function WidgetImage() { this.image = null; this.imageSize = null; this.imageURL = null; this.tintColor = null; this.cornerRadius = 0; this.borderWidth = 0; this.borderColor = null; this.contentMode = null; this.resizable = false; }
WidgetImage.prototype.leftAlignImage = function () {};
WidgetImage.prototype.centerAlignImage = function () {};
WidgetImage.prototype.rightAlignImage = function () {};
WidgetImage.prototype.applyFittingContentMode = function () {};
WidgetImage.prototype.applyFillingContentMode = function () {};

function WidgetDate() { this.date = null; this.textColor = null; this.font = null; this.lineLimit = 0; }
WidgetDate.prototype.applyTimeStyle = function () {};
WidgetDate.prototype.applyDateStyle = function () {};
WidgetDate.prototype.applyRelativeStyle = function () {};
WidgetDate.prototype.applyOffsetStyle = function () {};
WidgetDate.prototype.applyTimerStyle = function () {};
WidgetDate.prototype.leftAlignText = function () {};
WidgetDate.prototype.centerAlignText = function () {};
WidgetDate.prototype.rightAlignText = function () {};

function WidgetSpacer() { this.length = null; }

function WidgetStack() {
  this.children = [];
  this.spacing = 0;
  this.backgroundColor = null;
  this.cornerRadius = 0;
  this.borderWidth = 0;
  this.borderColor = null;
  this.size = null;
  this.url = null;
  this._horizontal = false;
}
WidgetStack.prototype.layoutHorizontally = function () { this._horizontal = true; };
WidgetStack.prototype.layoutVertically = function () { this._horizontal = false; };
WidgetStack.prototype.addText = function (t) { recordText(t); const w = new WidgetText(); this.children.push(w); return w; };
WidgetStack.prototype.addStack = function () { const s = new WidgetStack(); this.children.push(s); return s; };
WidgetStack.prototype.addSpacer = function (len) { log.spacers++; const s = new WidgetSpacer(); s.length = len || null; this.children.push(s); return s; };
WidgetStack.prototype.addImage = function () { const i = new WidgetImage(); this.children.push(i); return i; };
WidgetStack.prototype.addDate = function (d) { const w = new WidgetDate(); w.date = d || new Date(); this.children.push(w); return w; };
WidgetStack.prototype.centerAlignContent = function () {};
WidgetStack.prototype.bottomAlignContent = function () {};
WidgetStack.prototype.topAlignContent = function () {};
WidgetStack.prototype.setPadding = function () {};

// ---------------- ListWidget ----------------
function ListWidget() {
  this.children = [];
  this.backgroundColor = null;
  this.backgroundGradient = null;
  this.backgroundImage = null;
  this.refreshAfterDate = null;
  this.url = null;
  this.spacing = 0;
}
ListWidget.prototype.addText = function (t) { recordText(t); const w = new WidgetText(); this.children.push(w); return w; };
ListWidget.prototype.addStack = function () { log.stacks++; const s = new WidgetStack(); this.children.push(s); return s; };
ListWidget.prototype.addSpacer = function (len) { log.spacers++; const s = new WidgetSpacer(); s.length = len || null; this.children.push(s); return s; };
ListWidget.prototype.addImage = function () { const i = new WidgetImage(); this.children.push(i); return i; };
ListWidget.prototype.addDate = function (d) { const w = new WidgetDate(); w.date = d || new Date(); this.children.push(w); return w; };
ListWidget.prototype.setPadding = function () {};
ListWidget.prototype.presentSmall = function () { log.present = 'small'; return Promise.resolve(); };
ListWidget.prototype.presentMedium = function () { log.present = 'medium'; return Promise.resolve(); };
ListWidget.prototype.presentLarge = function () { log.present = 'large'; return Promise.resolve(); };
ListWidget.prototype.presentExtraLarge = function () { log.present = 'extraLarge'; return Promise.resolve(); };

// ---------------- Script / config / args ----------------
const Script = {
  setWidget: function () { log.setWidget = true; },
  complete: function () {},
  name: function () { return 'widget_sim'; },
  setShortcutOutput: function () {},
};
const config = {
  runsInWidget: !appMode && !siriMode, // 默认桌面小组件环境；--app/--siri 切换为 App 内/Siri 运行
  runsInApp: appMode,
  runsWithSiri: siriMode,
  runsInActionExtension: false,
  runsFromShortcut: false,
  widgetFamily: size,
};
const args = {
  queryParameters: silentMode ? { mode: 'silent' } : {}, // 默认无 silent；--silent 显式模拟静默唤起
  widgetParameter: '',
  shortcutParameter: null,
  plainTexts: [],
  urls: [],
  images: [],
  notification: null,
};

// ---------------- FileManager（iCloud 版） ----------------
function makeFileManager() {
  const fakeRoot = '/tmp/scriptable-icloud';
  const store = {};
  // 默认样例 CSV：日期按「今天」动态生成，保证「本月/今日」统计始终非零、演示不失真
  function makeDefaultCsv() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const ymd = (offset) => {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    };
    return `${ymd(0)} 15:22,支出,餐饮,午餐,36.80,支付宝,公司楼下\n` +
      `${ymd(1)} 08:10,收入,工资,基本工资,15000.00,工资卡,\n` +
      `${ymd(2)} 12:05,支出,交通,地铁,3.40,微信,通勤\n`;
  }
  return {
    bookmarkExists: function () { return true; },
    bookmarkedPath: function () { return fakeRoot; },
    joinPath: function (a, b) { return a.replace(/\/$/, '') + '/' + b.replace(/^\//, ''); },
    downloadFileFromiCloud: function () { return Promise.resolve(); },
    fileExists: function (p) { return store[p] !== undefined || sampleCsv != null || p.endsWith('记账账单.csv'); },
    isFileDownloaded: function (p) { return true; },
    isDirectory: function (p) { return false; },
    fileSize: function (p) { return store[p] !== undefined ? store[p].length : 0; },
    modificationDate: function (p) { return new Date(); },
    creationDate: function (p) { return new Date(); },
    listContents: function (dir) {
      const d = dir.replace(/\/$/, '') + '/';
      return Object.keys(store).filter((k) => k.startsWith(d)).map((k) => k.slice(d.length).split('/')[0]);
    },
    createDirectory: function (dir, intermediate) { return true; },
    remove: function (p) { delete store[p]; },
    readString: function (p) {
      if (store[p] !== undefined) return store[p];
      if (sampleCsv != null) return sampleCsv;
      return makeDefaultCsv();
    },
    writeString: function (p, s) { store[p] = s; },
    readImage: function (p) { return new Image(); },
    writeImage: function (p, img) { store[p] = '[image]'; },
    documentsDirectory: function () { return fakeRoot + '/Documents'; },
    libraryDirectory: function () { return fakeRoot + '/Library'; },
    cacheDirectory: function () { return fakeRoot + '/Caches'; },
    temporaryDirectory: function () { return fakeRoot + '/tmp'; },
    _store: store,
  };
}
const FileManager = { iCloud: makeFileManager, local: makeFileManager };

// ---------------- 组装 mock 全局并执行 ----------------
const mockGlobal = {
  FileManager, ListWidget, WidgetStack, WidgetText, WidgetImage, WidgetDate, WidgetSpacer,
  DrawContext, Path, Color, Font, LinearGradient, Image, Size, Point, Rect,
  Script, config, args,
  Data, UUID, DateFormatter, RelativeDateTimeFormatter, Device, Keychain, Pasteboard,
  Request, WebView, Notification, SFSymbol, Safari, URLScheme, CallbackURL, Alert,
  log: scriptableLog,
  Date,
  console,
};

// 用 async IIFE 包裹，支持顶层 await，并确保异步逻辑跑完
const wrapped = `(async () => {\n${src}\n})()`;
let promise;
try {
  const fn = new Function('__M__', `with (__M__) { return ${wrapped}; }`);
  promise = fn(mockGlobal);
} catch (e) {
  finishError(e);
}
if (promise && typeof promise.then === 'function') {
  promise.then(
    () => setImmediate(finish),
    (e) => { log.errors.push(String(e && e.stack ? e.stack : e)); setImmediate(finish); }
  );
} else {
  setImmediate(finish);
}

function finish() {
  const hasError = log.errors.length > 0;
  console.log('============================================================');
  console.log(' widget_sim 运行摘要');
  console.log('============================================================');
  console.log(` 脚本          : ${path.basename(scriptPath)}`);
  console.log(` 模拟尺寸      : ${size}  (config.widgetFamily)`);
  console.log(` 运行场景      : ${config.runsWithSiri ? 'Siri 运行' : (config.runsInWidget ? '桌面小组件' : 'App 手动运行')}`);
  console.log('------------------------------------------------------------');
  console.log(` addText 文本  : ${log.texts.length} 条`);
  log.texts.slice(0, 40).forEach((t, i) => {
    const s = String(t).replace(/\n/g, '\\n');
    console.log(`   [${String(i + 1).padStart(2)}] ${s.length > 60 ? s.slice(0, 57) + '…' : s}`);
  });
  if (log.texts.length > 40) console.log(`   … 其余 ${log.texts.length - 40} 条省略`);
  console.log(` addStack      : ${log.stacks} 次 | addSpacer: ${log.spacers} 次`);
  const d = log.draw;
  const drawTotal = d.fill + d.fillEllipse + d.strokeEllipse + d.fillPath + d.strokePath +
    d.drawText + d.drawTextInRect + d.drawLine + d.drawImage + d.drawImageInRect;
  console.log(` DrawContext   : ${drawTotal} 次绘制调用`);
  if (drawTotal > 0) {
    console.log(`   fill=${d.fill} fillEllipse=${d.fillEllipse} strokeEllipse=${d.strokeEllipse}` +
      ` fillPath=${d.fillPath} strokePath=${d.strokePath}`);
    console.log(`   drawText=${d.drawText} drawTextInRect=${d.drawTextInRect} drawLine=${d.drawLine}` +
      ` drawImage=${d.drawImage} drawImageInRect=${d.drawImageInRect}`);
  }
  console.log(` Script.setWidget: ${log.setWidget ? '已调用 ✓' : '未调用 ✗'}`);
  console.log(` present       : ${log.present || '(未调用预览)'}`);
  console.log('------------------------------------------------------------');
  if (hasError) {
    console.log(' ❌ 运行出错：');
    log.errors.forEach((e) => console.log('   ' + e.split('\n').slice(0, 6).join('\n     ')));
    console.log('============================================================');
    process.exit(1);
  } else {
    console.log(' ✅ 语法正确、用到的 Scriptable API 均在 mock 范围内、无运行异常');
    console.log('    （视觉布局请以真机截图为准）');
    console.log('============================================================');
    process.exit(0);
  }
}
