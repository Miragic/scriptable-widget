# Scriptable 小组件 API 速查 + 踩坑（api-cheatsheet）

写 Scriptable 桌面小组件时的权威参考。SKILL.md 是流程概览，这里放 API 细节与已验证的坑。

## 两种渲染方式怎么选

| 需求 | 用 | 特点 |
|---|---|---|
| 纯文本、列表、简单进度、收支明细 | `ListWidget` | `addText`/`addStack`/`addSpacer`，所见即所得，几乎不踩坑 |
| 环形图、占比条、圆角卡片、自定义图形、精细排版 | `DrawContext` | Canvas 式绘制，**API 残缺**，三个坑必须绕（见下） |

原则：**能 ListWidget 就 ListWidget**。只有需要「图形/图表/圆角色块」时才上 DrawContext。

## ListWidget 核心 API

```js
const w = new ListWidget();
w.backgroundGradient = g;          // 或用 backgroundColor / backgroundImage
const t = w.addText("文本");       // 返回 WidgetText
t.font = Font.boldSystemFont(16);
t.textColor = new Color("#fff");
t.lineLimit = 2;
t.centerAlignText();
w.addSpacer(8);                    // 带数字=固定高度；不带=弹性撑满
const stack = w.addStack();        // 行容器
stack.layoutHorizontally();        // 横向排列（默认纵向）
stack.addSpacer();                 // 左右元素之间塞弹性空格，实现「左字右数」
w.refreshAfterDate = new Date(Date.now() + 60*1000);
```

## DrawContext 核心 API + 三个坑

DrawContext 用「设置状态 + 调用绘制」模型，**没有 fillRoundedRect、没有 drawText(x,y,w,h)、没有 beginPath**。三个坑的正确绕法：

```js
// 坑1：没有 fillRoundedRect → 用 Path.addRoundedRect + addPath + fillPath
const p = new Path();
p.addRoundedRect(rect, 16, 16);   // rect, 圆角宽, 圆角高
ctx.addPath(p);
ctx.setFillColor(color);
ctx.fillPath();

// 坑2：没有 drawText(x,y,w,h) → 用 setFont+setTextColor+setTextAlignedCenter+drawTextInRect
ctx.setFont(Font.boldSystemFont(20));
ctx.setTextColor(color);
ctx.setTextAlignedCenter();        // 或 setTextAlignedLeft/Right
ctx.drawTextInRect("文字", rect);  // 文字在 rect 内按对齐方式排

// 坑3：没有 beginPath → 用 new Path() 的 move/addLine/closeSubpath
const tri = new Path();
tri.move(new Point(x1,y1));
tri.addLine(new Point(x2,y2));
tri.addLine(new Point(x3,y3));
tri.closeSubpath();
ctx.addPath(tri);
ctx.fillPath();                    // 或 strokePath()
```

其他常用：
```js
const ctx = new DrawContext();
ctx.size = new Size(320, 160);     // 必设，否则空白
ctx.opaque = true;
ctx.respectedScreenScale = true;
ctx.setFillColor(color); ctx.fill(rect);            // 矩形
ctx.fillEllipse(rect);                              // 实心圆
ctx.setStrokeColor(color); ctx.setLineWidth(8); ctx.strokeEllipse(rect); // 描边圆
ctx.drawLine(from, to);                             // 线段
ctx.drawImageInRect(img, rect);                     // 贴图
```

**环形图/进度环**：底环用 `fillEllipse`（实心圆当底色），进度弧用 `Path.addArc(center, radius, startAngle, endAngle, clockwise)` + `strokePath`。

**把 Canvas 变成小组件**：`w.backgroundImage = ctx.getImage()`。

## 几何类型

`Size(w,h)` / `Point(x,y)` / `Rect(x,y,width,height)` 都是普通对象，`new` 出来即可。颜色 `new Color("#rrggbb")` 或 `new Color(r,g,b)`（0~1）。

## 生命周期（三个运行场景）

```js
Script.setWidget(w);                 // 1) 桌面小组件：到此为止，系统渲染

const silent =
  (args.queryParameters && (args.queryParameters["mode"] === "silent" || args.queryParameters["silent"] === "1")) ||
  (args.widgetParameter && String(args.widgetParameter).indexOf("silent") >= 0);

if (!config.runsInWidget && !silent) {
  // 2) App 手动跑 → 弹预览卡；3) URL/快捷指令带 mode=silent → 静默不弹窗
  await w.presentMedium();           // 按尺寸 presentSmall/Medium/Large
}
Script.complete();
```

- `config.runsInWidget`：true=在桌面小组件环境；false=App 内手动运行。
- `config.widgetFamily`：`"small"|"medium"|"large"|"extraLarge"`，据此切内容密度。
- 其他运行场景布尔：`config.runsWithSiri`（Siri 运行）、`config.runsInActionExtension`（共享扩展）、`config.runsFromShortcut`（快捷指令触发）。
- `refreshAfterDate`：iOS 最快刷新档是 **60 秒**，更频繁无效。
- **silent 模式**是给快捷指令/外部 URL 用的：记账类流程里写完数据要触发小组件刷新，用 `scriptable:///run?scriptName=<名>&mode=silent` 唤起，避免每次弹预览卡。

## iCloud 数据接入（文件书签）

小组件默认拿不到「快捷指令写进 iCloud Drive 的文件」，必须走**文件书签**：

```js
const fm = FileManager.iCloud();
const BOOKMARK = "iCloudDrive";                 // 书签名
if (!fm.bookmarkExists(BOOKMARK)) { /* 提示用户去设置里建书签 */ }
const dir = fm.bookmarkedPath(BOOKMARK);         // 书签指向的目录
const path = fm.joinPath(dir, "Scriptable/xx.csv");
await fm.downloadFileFromiCloud(path);           // 强制拉最新
if (!fm.fileExists(path)) { /* 未生成 */ }
const text = fm.readString(path);
```

前置步骤（交付时必须写进说明）：`Scriptable App → 设置 → 文件书签 → 新建，名称=iCloudDrive，目标=iCloud Drive 根目录`。

## 网络请求 Request（股票/天气/汇率等数据小组件）

```js
const req = new Request("https://api.example.com/data");
req.method = "GET";                 // 默认 GET
req.headers = { "Accept": "application/json" };
req.timeoutInterval = 30;           // 秒
const json = await req.loadJSON();  // 或 loadString() / loadImage() / load()（二进制 Data）
```

`loadJSON/loadString/loadImage/load` 都是 async，返回 Promise。**解析字段前 try-catch 兜底**（网络可能失败、字段可能缺失）。模拟器里 `loadJSON` 返回 `{mock:true}`、`loadString` 返回 `"mock response body"`。

## 日期与时间

```js
const df = new DateFormatter();
df.dateFormat = "yyyy-MM-dd HH:mm";     // 自定义格式（yyyy/MM/dd/HH/mm/ss/EEE/EEEE）
df.locale = "zh_CN";
df.string(new Date());                  // Date → 字符串
df.date("2026-01-01");                  // 字符串 → Date
// 或用 style 方式：
df.useMediumDateStyle(); df.useNoTimeStyle();

const rel = new RelativeDateTimeFormatter();
rel.useNamedDateTimeStyle();            // 或 useNumericDateTimeStyle()
rel.string(pastDate, new Date());       // "3 小时前"
```

## 设备 / 凭证 / 剪贴板 / 二进制

```js
Device.name(); Device.systemName(); Device.systemVersion();
Device.isPhone(); Device.isPad(); Device.screenSize(); Device.locale();

Keychain.set("token", "xxx"); Keychain.get("token"); Keychain.contains("token"); Keychain.remove("token");

Pasteboard.copyString("文本"); Pasteboard.pasteString();

const d = Data.fromString("hello");     // fromBase64String / fromJPEG
d.toBase64String(); d.toRawString(); d.getBytes();
const id = UUID.string();               // 唯一标识
```

## SF Symbol（图标）

```js
const sym = SFSymbol.named("star.fill");
sym.applyFont(Font.systemFont(20));
sym.applyHeavyWeight();                 // applyRegular/Semibold/Bold/UltraLight/Light/Medium
const img = sym.image;                  // 转成 Image 后可 addImage
```

## 通知 Notification

```js
const n = new Notification();
n.title = "标题"; n.body = "内容"; n.sound = "default";
n.setTriggerDate(new Date(Date.now() + 3600*1000));
n.schedule();
Notification.removePending(id); Notification.removeAllPending();
```

## 网页 / 跳转 / 弹窗

```js
// WebView：加载网页或 HTML 并截图
const wv = new WebView();
await wv.loadHTML("<html>…</html>");     // 或 loadURL(url)
const shot = await wv.getImage();

// 跳转
Safari.open("https://…");
const scheme = new URLScheme("scriptable:///run");
scheme.addParameter("scriptName", "xxx");
scheme.open();
const cb = new CallbackURL("scriptable:///run"); await cb.open();

// 弹窗
const a = new Alert();
a.title = "确认"; a.addAction("好"); a.addCancelAction("取消");
const idx = await a.presentAlert();      // 或 presentSheet()
```

## 配色约定（中国习惯）

金融/记账类：**涨/支出 = 红，跌/收入 = 绿**（与美股相反）。默认 `#E0734A`（暖橙红）/ `#4E9B6F`（绿）。

## 文件头两行不可删

```js
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart;
```
前两行是 Scriptable 的变量声明标记，删除会导致脚本无法被识别为小组件。
