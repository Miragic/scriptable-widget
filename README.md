# scriptable-widget · Scriptable 桌面小组件生成器

说一句「我要一个 iPhone 桌面小组件」，它给你一段能直接装进 Scriptable 的 JavaScript。

## 它帮你省掉的三件事

- 📊 **不用查 API** —— ListWidget 文本型 / DrawContext 图表型两条渲染路径，API 速查 + DrawContext 三个坑的正确绕法都写好了
- 🔧 **不用盲跑** —— 交付前用本地 node 模拟器验证语法与 API 调用，不崩再装真机
- 🔁 **不用手动刷新** —— iCloud 文件书签 + silent 静默刷新，数据实时同步

## 三种能力

- **两种渲染**：纯文本/列表/简单进度用 `ListWidget`；环形图/折线图/圆角卡片用 `DrawContext`（含三个必踩坑的绕法）
- **数据接入**：CSV / JSON / 网络 API / iCloud 文件书签，都支持
- **本地验证**：`widget_sim.js` 模拟器，五个开关（`--csv` / `--json` / `--app` / `--siri` / `--silent`）覆盖 CSV 解析、网络成功分支、App 手动运行、Siri、静默刷新

## 安装

这是给 AI 助手（WorkBuddy）用的 skill。把整个目录复制到用户级 skills 目录即可：

```bash
cp -R scriptable-widget ~/.workbuddy/skills/
```

之后在对话里说「做个小组件」或「我要一个 iPhone 桌面小组件」，助手就会自动加载它。

## 工作流

1. 确认需求（数据源 / 展示内容 / 尺寸 / 要不要图表）
2. 选渲染方式（能 ListWidget 就 ListWidget）
3. 写脚本（基于 `assets/template.js` 复制改造）
4. 本地验证（`scripts/widget_sim.js` 三档各跑一遍）
5. 交付脚本 + 安装说明

## 适合谁

- 想给 iPhone 桌面做个性化小组件的
- 用 Scriptable 做记账 / 股票 / 天气 / 倒数日 / 步数等数据小组件的
- 想先本地验证、不反复装真机试错的

## 触发词

Scriptable 小组件、桌面小组件、iPhone / iOS 小组件、桌面 Widget、Scriptable 脚本、widget、记账小组件、数据型小组件（股票/天气/倒数日/步数等）。

## 依赖

- 本地验证需要 node（运行 `scripts/widget_sim.js`）

## 目录结构

- `SKILL.md` —— 触发词 + 工作流 + 关键决策 + 交付清单
- `scripts/widget_sim.js` —— 本地模拟器（node 跑，无需真机）
- `assets/template.js` —— 双渲染方式完整骨架（ListWidget + DrawContext + 三档 + 文件书签 + silent）
- `references/api-cheatsheet.md` —— API 速查 + DrawContext 三坑 + 生命周期 + 文件书签
- `references/examples.md` —— 完整案例「iPhone 记账小组件」
