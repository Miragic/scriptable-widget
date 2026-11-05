---
name: scriptable-widget
slug: scriptable-widget
displayName: Scriptable 小组件生成器
version: 1.0.0
summary: 一句话生成 iPhone 桌面小组件：ListWidget 文本型或 DrawContext 图表型，三档尺寸 + iCloud 文件书签 + 静默刷新，交付前用本地 node 模拟器验证语法与 API 调用。
description: 生成 Scriptable iOS 桌面小组件（JavaScript）。覆盖两种渲染方式（ListWidget 文本型 + DrawContext 图表型）、三档尺寸（small/medium/large/extraLarge）适配、iCloud 文件书签数据接入、silent 静默刷新，并提供本地 node 模拟器（widget_sim.js，含 --csv/--json/--app/--siri/--silent 五开关）在交付前验证语法与 API 调用。当用户要做一个 Scriptable 小组件、iPhone/iOS 桌面小组件、桌面 Widget、记账/股票/天气等数据型小组件，或提到「Scriptable 脚本」「widget」「小组件」时使用。与 shortcuts-editor（编辑 .shortcut 快捷指令）互补，不处理快捷指令本身。
description_en: Generate Scriptable iOS home-screen widgets in JavaScript. Covers both render paths (ListWidget text + DrawContext chart), three widget sizes (small/medium/large/extraLarge), iCloud file-bookmark data access, and silent refresh, plus a local node simulator (widget_sim.js with --csv/--json/--app/--siri/--silent switches) to validate syntax and API usage before delivery. Use when building a Scriptable widget, an iPhone/iOS home-screen widget, or data widgets for bookkeeping, stocks, weather, etc. Complements shortcuts-editor and does not handle Shortcuts itself.
tags:
  - Scriptable
  - 桌面小组件
  - Widget
  - iOS
  - JavaScript
  - 效率工具
license: MIT
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
agent_created: true
---

# Scriptable 桌面小组件生成器

把「我要一个 iPhone 桌面小组件」变成可直接装进 Scriptable 的脚本：一段 JavaScript，读数据（CSV / JSON / API / 文件书签），渲染成 `ListWidget`（文本型）或 `DrawContext`（图表型），支持小/中/大三档尺寸，交付前用本地模拟器验证语法与 API 调用。

## 何时使用

触发词：Scriptable 小组件、桌面小组件、iPhone / iOS 小组件、桌面 Widget、Scriptable 脚本、widget、记账小组件、数据型小组件（股票/天气/倒数日/步数等）。

反向触发：不处理 Apple Shortcuts 快捷指令（那是 `shortcuts-editor` 的范畴）；不做微信小程序或 Android Widget；不做通知/锁屏组件。

## 工作流（按顺序执行）

1. **确认需求**：数据源是什么（CSV 文件 / JSON / 网络 API / 文件书签）、要展示什么、要几档尺寸、要不要图表。
2. **选渲染方式**：纯文本/列表/简单进度 → `ListWidget`；环形图/占比条/圆角卡片/精细排版 → `DrawContext`。原则：**能 ListWidget 就 ListWidget**。
3. **写脚本**：基于 `assets/template.js` 复制改造（已含两种渲染方式 + 三档 + 文件书签 + silent 的完整骨架），按 `references/api-cheatsheet.md` 写 API、绕开 DrawContext 三个坑。
4. **本地验证**：用 `scripts/widget_sim.js` 三档各跑一遍，确认语法正确、API 用对、无运行异常。真实视觉布局仍需真机截图确认。
5. **交付**：交付脚本 + 安装说明（见「交付清单」）。

## 关键决策

### 两种渲染方式（详见 references/api-cheatsheet.md）

- `ListWidget`：`addText` / `addStack` / `addSpacer`，所见即所得。
- `DrawContext`：Canvas 式绘制，**三个坑必须绕**（Scriptable 的 DrawContext 是残缺 API）：
  - 没有 `fillRoundedRect` → `Path.addRoundedRect` + `ctx.addPath` + `ctx.fillPath`
  - 没有 `drawText(x,y,w,h)` → `setFont` + `setTextColor` + `setTextAlignedCenter` + `drawTextInRect`
  - 没有 `beginPath` → `new Path().move/addLine/closeSubpath`

### 三档尺寸（用 config.widgetFamily 区分）

小号精简 / 中号常规 / 大号详尽。`config.widgetFamily` 返回 `"small"|"medium"|"large"|"extraLarge"`。

### 生命周期（三个运行场景）

- 桌面小组件：`Script.setWidget(w)` 后完事，由系统渲染。
- App 手动跑：`config.runsInWidget === false` 时弹 `presentSmall/Medium/Large` 预览卡。
- 外部 URL / 快捷指令调用：带 `mode=silent` 时静默刷新、不弹窗（`scriptable:///run?scriptName=<名>&mode=silent`）。

`refreshAfterDate` 最快档是 **60 秒**，更频繁无效。

### iCloud 数据接入（文件书签）

小组件默认拿不到「快捷指令写进 iCloud Drive 的文件」，必须走文件书签：`FileManager.iCloud()` + `bookmarkedPath("iCloudDrive")` + `downloadFileFromiCloud` 强制拉最新。前置步骤（交付时写进说明）：`Scriptable App → 设置 → 文件书签 → 名 iCloudDrive → 目标 iCloud Drive 根目录`。

### 配色约定

金融/记账类遵守中国习惯：**涨/支出 = 红、跌/收入 = 绿**（与美股相反）。默认 `#E0734A` / `#4E9B6F`。

## 本地验证（scripts/widget_sim.js）

```bash
node widget_sim.js <脚本.js> [small|medium|large|extraLarge] [--csv 样例.csv] [--json '{"k":v}'] [--app] [--silent]
```

mock 了 Scriptable 全套常用 API，输出 addText 文本、DrawContext 绘制统计、setWidget 是否调用。四个开关：

- **`--csv 样例.csv`**：注入样例 CSV 内容给 FileManager 读文件（测 CSV 解析）。
- **`--json '{"rate":7.2}'`**（或 JSON 文件路径）：自定义 `Request.loadJSON` 返回，测「成功分支」；缺省返回 `{mock:true}`。
- **`--app`**：模拟「在 Scriptable App 内手动运行」（`config.runsInWidget=false`），能跑到 Alert 输入 / present 预览卡分支（默认桌面环境 `runsInWidget=true`）。
- **`--siri`**：模拟「经 Siri 运行」（`config.runsWithSiri=true`、`runsInWidget=false`）。
- **`--silent`**：模拟「URL/快捷指令带 mode=silent 唤起」，走静默分支、不弹预览。

- **渲染**：`ListWidget` / `WidgetStack` / `WidgetText` / `WidgetImage` / `WidgetDate` / `WidgetSpacer` / `DrawContext`（含 `setLineDash`/`setLineCap`/`setLineJoin`/`setShadow`）/ `Path` / `LinearGradient` / `Image`
- **数据**：`FileManager.iCloud/local`（书签、读写、`listContents`、`readImage`）/ `Request`（`load`/`loadString`/`loadJSON`/`loadImage`）/ `Data` / `Keychain` / `Pasteboard`
- **格式与设备**：`DateFormatter` / `RelativeDateTimeFormatter` / `Device` / `UUID` / `Font`（全字重）/ `Color`（全静态色 + `dynamic`）
- **交互与通知**：`Notification` / `Alert` / `SFSymbol` / `WebView` / `Safari` / `URLScheme` / `CallbackURL`
- **环境**：`Script` / `config`（`widgetFamily`/`runsInWidget`/`runsInApp`）/ `args`（`queryParameters`/`widgetParameter`/`shortcutParameter`/`plainTexts`/`urls`/`images`）/ `log`

**边界与局限（务必知道）**：

- **网络请求返回 mock 数据**：`loadJSON` 返回 `{mock:true}`、`loadString` 返回 `"mock response body"`。脚本里对网络数据的字段解析要 **try-catch 兜底**（真机也可能请求失败），否则读到 `undefined` 字段会崩。
- **只保证「能跑、不崩、API 用对」**，视觉布局、字体字号、间距必须以真机截图为准。
- **真机独有行为模拟不出来**：iCloud 实际同步、真实网络、系统渲染细节、SF Symbol 实际图形。这些只能靠真机验证。

## 交付清单

交付时脚本 + 说明一起给，说明必须含：

1. **装脚本**：Scriptable → 新建脚本 → 粘贴 → 命名（命名和唤起 URL 绑死，改名前先想清楚）。
2. **文件书签前置**（若读 iCloud Drive 数据）：Scriptable 设置 → 文件书签 → 名 `iCloudDrive` → 目标 iCloud Drive 根目录。
3. **先手动跑一次**：在 App 里运行脚本，确认弹预览卡、数据正常。
4. **加到桌面**：长按桌面 → 加小组件 → 选 Scriptable → 选脚本 → 选尺寸。
5. **触发刷新**（可选）：若要外部触发，给 `scriptable:///run?scriptName=<名>&mode=silent`。
6. **文件头两行不可删**（`// Variables used by Scriptable.` 那两行，删了识别不了）。

## 资源

- `scripts/widget_sim.js` —— 本地模拟器（node 跑，无需真机）。交付前必跑。
- `assets/template.js` —— 双渲染方式完整骨架（ListWidget + DrawContext + 三档 + 文件书签 + silent）。复制后改数据源和 UI。
- `references/api-cheatsheet.md` —— API 速查 + DrawContext 三个坑 + 生命周期 + 文件书签。写脚本时读。
- `references/examples.md` —— 完整案例「iPhone 记账小组件」（ListWidget 版源码 + DrawContext 版契约 + 5 条演进教训）。先读这个对照。
