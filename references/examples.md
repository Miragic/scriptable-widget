# 案例：iPhone 记账小组件（examples）

从 `v3`（ListWidget 文本型）演进到 `v4.6`（DrawContext 图表型）的完整案例。
下面的 ListWidget 版源码可直接复制运行；DrawContext 版给契约与关键绘制思路。

## 需求

读 `iCloud Drive/Scriptable/记账账单.csv`（快捷指令记账时追加的一行），渲染本月账单小组件。
CSV 7 列：`日期,收支,分类,二级分类,金额,账户,备注`。

## ListWidget 版（v3.1，文件书签桥，可直接用）

```js
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart;
// 记账小组件 v3.1(文件书签桥)
// 数据源:iCloud Drive/Scriptable/记账账单.csv(快捷指令直写的那份)

const fm = FileManager.iCloud();
const BOOKMARK = "iCloudDrive";
const REL_PATH = "Scriptable/记账账单.csv";

let rows = [];
let errMsg = null;

function pad2(n) { return String(n).padStart(2, "0"); }

// 把各种日期文本归一化成 yyyy-MM-dd（快捷指令的「当前日期」token 会按系统偏好渲染）
function normDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[年\/\-.]\s*(\d{1,2})[月\/\-.]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  return s.slice(0, 10);
}

async function loadRows() {
  try {
    if (!fm.bookmarkExists(BOOKMARK)) { errMsg = `书签「${BOOKMARK}」不存在`; return; }
    const dir = fm.bookmarkedPath(BOOKMARK);
    const path = fm.joinPath(dir, REL_PATH);
    await fm.downloadFileFromiCloud(path);
    if (!fm.fileExists(path)) { errMsg = `找不到 ${REL_PATH}`; return; }
    const text = fm.readString(path);
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(",");
      if (parts.length < 7) continue;
      const amount = parseFloat(parts[4]);
      rows.push({
        date: normDate(parts[0]), type: parts[1], cat: parts[2], sub: parts[3],
        amount: isNaN(amount) ? 0 : amount, account: parts[5], note: parts.slice(6).join(","),
      });
    }
  } catch (e) { errMsg = String(e).slice(0, 80); }
}

function summarize() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const today = `${ym}-${String(now.getDate()).padStart(2,"0")}`;
  let monthExpense = 0, monthIncome = 0, todayExpense = 0, expenseCount = 0;
  for (const r of rows) {
    if (r.date.startsWith(ym)) {
      if (r.type === "收入") monthIncome += r.amount;
      else { monthExpense += r.amount; expenseCount++; }
    }
    if (r.date === today && r.type !== "收入") todayExpense += r.amount;
  }
  return { ym, today, monthExpense, monthIncome, todayExpense, expenseCount };
}

const C = { bg1:"#2d2d44", bg2:"#1e1e2e", text:"#cdd6f4", sub:"#a6adc8", faint:"#6c7086",
  red:"#f38ba8", green:"#a6e3a1", yellow:"#f9e2af" };

function fmt(n) {
  const v = Math.round(n * 100) / 100;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function main() {
  await loadRows();
  const s = summarize();
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color(C.bg1), new Color(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;

  const head = w.addText(`💰 本月账单`);
  head.font = Font.boldSystemFont(16);
  head.textColor = new Color(C.text);
  w.addSpacer(4);

  if (errMsg) {
    const e = w.addText(`⚠️ ${errMsg}`);
    e.font = Font.systemFont(11);
    e.textColor = new Color(C.yellow);
    e.lineLimit = 4;
  } else if (rows.length === 0) {
    const e = w.addText("还没有账单,先去记一笔吧");
    e.font = Font.systemFont(12);
    e.textColor = new Color(C.faint);
  } else {
    const summary = w.addText(`支出 ¥${fmt(s.monthExpense)}  收入 ¥${fmt(s.monthIncome)}`);
    summary.font = Font.systemFont(12);
    summary.textColor = new Color(C.sub);
    w.addSpacer(4);
    const todayLine = w.addText(`今日支出  ¥${fmt(s.todayExpense)}`);
    todayLine.font = Font.boldSystemFont(14);
    todayLine.textColor = new Color(C.red);
    w.addSpacer(6);
    const recent = rows.slice(-5).reverse();
    for (const r of recent) {
      const row = w.addStack();
      row.layoutHorizontally();
      const label = r.sub && r.sub !== "无" ? `${r.cat}·${r.sub}` : r.cat;
      const left = row.addText(label || "未分类");
      left.font = Font.systemFont(12);
      left.textColor = new Color(C.text);
      left.lineLimit = 1;
      row.addSpacer();
      const sign = r.type === "收入" ? "+" : "-";
      const amt = row.addText(`${sign}¥${fmt(r.amount)}`);
      amt.font = Font.semiboldSystemFont(12);
      amt.textColor = r.type === "收入" ? new Color(C.green) : new Color(C.red);
      w.addSpacer(2);
    }
    w.addSpacer(4);
    const foot = w.addText(`共 ${rows.length} 笔 · 本月支出 ${s.expenseCount} 笔`);
    foot.font = Font.systemFont(10);
    foot.textColor = new Color(C.faint);
  }

  w.refreshAfterDate = new Date(Date.now() + 60 * 1000);
  Script.setWidget(w);

  const silent =
    (args.queryParameters && (args.queryParameters["mode"] === "silent" || args.queryParameters["silent"] === "1")) ||
    (args.widgetParameter && String(args.widgetParameter).indexOf("silent") >= 0);
  if (!config.runsInWidget && !silent) {
    await w.presentMedium();
  }
  Script.complete();
}

main();
```

## DrawContext 版（v4.6）契约

三档内容设计（用 DrawContext 画圆角色块 + 环形图）：

| 尺寸 | 内容 |
|---|---|
| 小号 small | 剩余大字 + 占比条 + 本月支出/收入/今日支出 |
| 中号 medium | 剩余 + 收支双段条 + 最近消费 3 条 |
| 大号 large | 收支余三卡 + 环形图（中心=本月剩余，环=支出橙+剩余紫，整圆=收入）+ 最近消费 5 条 |

环形图实现要点：底环 `fillEllipse` 当整圆（=收入总量），再叠一个「支出橙色弧 + 剩余紫色弧」用 `Path.addArc` 分段画，中心用 `drawTextInRect` 居中写「本月剩余」。配色从 Catppuccin 深色切到浅蓝白底 + 主紫 `#6C69DC`、支出 `#E0734A`、收入 `#4E9B6F`。

## 演进教训（踩坑记录）

1. **数据源从 `documentsDirectory` 切到文件书签**：早期用 `fm.documentsDirectory()` 存 CSV，但快捷指令直写的是系统 iCloud Drive 的 `Scriptable/` 目录，两边不是同一个沙盒 → 小组件读不到账。改为「文件书签桥」（bookmark 指向 iCloud Drive 根目录）才打通。
2. **日期必须归一化**：快捷指令的「当前日期」token 会按系统偏好渲染成 `2026/9/9`、`2026年9月9日` 等多种格式，直接 `slice(0,10)` 取不到标准 `yyyy-MM-dd` → 统计全错。用正则 + `new Date` 兜底归一化。
3. **CSV 备注列允许含逗号**：`split(",")` 后第 7 列以后要用 `slice(6).join(",")` 重新拼，不能只取 `parts[6]`。
4. **文件名/唤起 URL 绑死**：脚本名 `记账小组件v3` 与 `scriptable:///run?scriptName=记账小组件v3` 绑死，改名要同步 URL；快捷指令 alert 文本带版本号防多版本并存跑错。
5. **DrawContext 三个坑**见 `api-cheatsheet.md`，这是从「文本版」升级到「图表版」时踩得最狠的。
