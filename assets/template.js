// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart;
// 小组件模板 v1.0（Scriptable 桌面小组件）
//
// 这是一个「从零开始做小组件」的骨架，正确示范两种渲染方式 + 三档尺寸 +
// iCloud 文件书签数据接入 + silent 静默刷新。复制后按注释替换成你的数据源和 UI。
//
// 交付前必做：
//   1. 本地模拟器验证（三档都跑）：
//        node widget_sim.js 本文件.js small
//        node widget_sim.js 本文件.js medium
//        node widget_sim.js 本文件.js large
//   2. 真机：Scriptable → 新建脚本粘贴 → 先手动跑一次（会弹预览卡）→ 加到桌面。
//   3. 若读 iCloud Drive 数据，先做「文件书签」前置：
//        Scriptable App → 设置 → 文件书签 → 名「iCloudDrive」→ 目标 iCloud Drive 根目录。

// ============================================================
// 1. 数据接入（示例：文件书签访问 iCloud Drive 里的 CSV，按需替换）
// ============================================================
const fm = FileManager.iCloud();
const BOOKMARK = "iCloudDrive";            // 文件书签名（见上方前置说明）
const REL_PATH = "Scriptable/你的数据.csv"; // 相对 iCloud Drive 根目录的路径

let rows = [];   // 解析后的数据行
let errMsg = null;

async function loadData() {
  try {
    if (!fm.bookmarkExists(BOOKMARK)) {
      errMsg = `书签「${BOOKMARK}」不存在：请到 Scriptable 设置→文件书签 新建`;
      return;
    }
    const dir = fm.bookmarkedPath(BOOKMARK);
    const path = fm.joinPath(dir, REL_PATH);
    await fm.downloadFileFromiCloud(path); // 强制拉最新（本地已有则安全跳过）
    if (!fm.fileExists(path)) { errMsg = `找不到 ${REL_PATH}`; return; }
    const text = fm.readString(path);
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(",");
      // ↓ 在这里按你的 CSV 列位解析成对象
      rows.push({ value: parts[0] });
    }
  } catch (e) {
    errMsg = String(e).slice(0, 80);
  }
}

// ============================================================
// 2. 配色（改成你的主题色。金融场景遵守中国习惯：涨/支出=红、跌/收入=绿）
// ============================================================
const C = {
  bg1: "#6C69DC",   // 主紫（渐变起）
  bg2: "#4B49B3",   // 主紫（渐变止）
  text: "#ffffff",
  sub: "rgba(255,255,255,0.85)",
  faint: "rgba(255,255,255,0.6)",
  red: "#E0734A",   // 涨 / 支出
  green: "#4E9B6F", // 跌 / 收入
};

// ============================================================
// 3. 渲染方式 A：ListWidget（文本 / 列表 / 简单进度，推荐先用这个）
//    addText + addStack + addSpacer，所见即所得，几乎不会踩 API 坑
// ============================================================
function renderList(widget) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color(C.bg1), new Color(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;

  const head = w.addText("标题");
  head.font = Font.boldSystemFont(16);
  head.textColor = new Color(C.text);
  w.addSpacer(8);

  const body = w.addText("内容行");
  body.font = Font.systemFont(12);
  body.textColor = new Color(C.sub);
  w.addSpacer(6);

  // 一行「左文字 + 弹性空格 + 右数字」的经典组合
  const row = w.addStack();
  row.layoutHorizontally();
  const label = row.addText("项目");
  label.font = Font.systemFont(12);
  label.textColor = new Color(C.text);
  row.addSpacer();
  const val = row.addText("¥123");
  val.font = Font.semiboldSystemFont(12);
  val.textColor = new Color(C.red);

  w.refreshAfterDate = new Date(Date.now() + 60 * 1000); // iOS 最快 60 秒
  return w;
}

// ============================================================
// 4. 渲染方式 B：DrawContext（图表 / 环形图 / 圆角卡片 / 精细排版）
//    ★ 三个必踩的坑，正确绕法如下（Scriptable 的 DrawContext 是残缺 API）：
//      坑1 没有 fillRoundedRect → 用 Path.addRoundedRect + ctx.addPath + ctx.fillPath
//      坑2 没有 drawText(x,y,w,h) → 用 setFont+setTextColor+setTextAlignedCenter+drawTextInRect
//      坑3 没有 beginPath     → 用 new Path() 的 move/addLine/closeSubpath
// ============================================================
function renderCanvas(widget) {
  const ctx = new DrawContext();
  ctx.size = new Size(320, 160); // 中号大概这个尺寸，大号可放大
  ctx.opaque = true;
  ctx.respectedScreenScale = true;

  // 背景（渐变）
  const bgGrad = new LinearGradient();
  bgGrad.colors = [new Color(C.bg1), new Color(C.bg2)];
  bgGrad.locations = [0, 1];
  ctx.setFillColor(bgGrad);
  ctx.fill(new Rect(0, 0, ctx.size.width, ctx.size.height));

  // 圆角卡片（坑1 的正确绕法）
  const cardRect = new Rect(16, 16, ctx.size.width - 32, ctx.size.height - 32);
  const cardPath = new Path();
  cardPath.addRoundedRect(cardRect, 16, 16);
  ctx.addPath(cardPath);
  ctx.setFillColor(new Color("rgba(255,255,255,0.12)"));
  ctx.fillPath();

  // 居中文字（坑2 的正确绕法）
  ctx.setFont(Font.boldSystemFont(20));
  ctx.setTextColor(new Color(C.text));
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect("居中标题", new Rect(0, 28, ctx.size.width, 26));

  // 环形图（底环 + 进度弧）
  const cx = ctx.size.width / 2;
  const cy = 110;
  const r = 30;
  ctx.setFillColor(new Color("rgba(255,255,255,0.15)"));
  ctx.fillEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); // 底环
  const arc = new Path();
  arc.addArc(new Point(cx, cy), r - 4, 0, Math.PI * 1.2, false); // 已走 60% 的弧
  ctx.addPath(arc);
  ctx.setStrokeColor(new Color(C.red));
  ctx.setLineWidth(8);
  ctx.strokePath();

  // 自定义三角形（坑3 的正确绕法：不用 beginPath）
  const tri = new Path();
  tri.move(new Point(cx - 8, cy + 40));
  tri.addLine(new Point(cx + 8, cy + 40));
  tri.addLine(new Point(cx, cy + 52));
  tri.closeSubpath();
  ctx.addPath(tri);
  ctx.setFillColor(new Color(C.text));
  ctx.fillPath();

  const w = new ListWidget();
  w.backgroundImage = ctx.getImage(); // 把 Canvas 结果作为小组件背景
  w.refreshAfterDate = new Date(Date.now() + 60 * 1000);
  return w;
}

// ============================================================
// 5. 入口：三档尺寸 + 渲染方式选择 + 生命周期
// ============================================================
async function main() {
  await loadData();

  // 按尺寸选择不同内容密度（小号精简 / 中号常规 / 大号详尽）
  const family = config.widgetFamily; // "small" | "medium" | "large" | "extraLarge"

  // 选择渲染方式：文本型用 renderList，图表型用 renderCanvas
  const useCanvas = family === "large"; // 示例：大号走图表，中小号走文本
  const w = useCanvas ? renderCanvas() : renderList();

  Script.setWidget(w);

  // silent 静默模式：快捷指令等外部调用时跳过预览弹窗
  const silent =
    (args.queryParameters && (args.queryParameters["mode"] === "silent" || args.queryParameters["silent"] === "1")) ||
    (args.widgetParameter && String(args.widgetParameter).indexOf("silent") >= 0);

  if (!config.runsInWidget && !silent) {
    // 手动运行 / URL 唤起时弹预览卡（等价于「点进去跑一次」）
    if (family === "small") await w.presentSmall();
    else if (family === "large") await w.presentLarge();
    else await w.presentMedium();
  }
  Script.complete();
}

main();
