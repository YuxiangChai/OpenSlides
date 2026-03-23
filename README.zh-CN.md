# OpenSlides

OpenSlides 是一个以本地存储为核心的 AI 演示文稿工作台，用来把提示词、上传资料和迭代修改，快速变成精致的 `reveal.js` 幻灯片。

它把 React 编辑器、Express 后端、项目版本存储和多模型支持整合在一起，让你可以在同一个界面里完成生成、修改、演示与导出。

[English Version](./README.md)

## 项目定位

OpenSlides 适合这样的工作流：

- 用一句需求或一组参考文件生成完整 `reveal.js` 演示稿
- 通过多轮对话持续修改，而不是每次全部重做
- 直接在预览中点击文本进行行内编辑
- 需要时切到代码视图，手动控制 HTML 与 CSS
- 通过自动保存和手动快照保留每次关键版本
- 在浏览器中演示，或导出为独立 HTML 文件

## 功能亮点

| 模块 | 能力 |
| --- | --- |
| AI 生成 | 支持 Gemini、Claude 与 OpenAI 兼容接口 |
| 成本优化 | 根据不同提供商使用对应的 prompt caching 方式 |
| 资料驱动 | 可上传 PDF、图片、文本、CSV、Markdown 等文件作为上下文 |
| 行内编辑 | 在预览区直接点击文本修改内容 |
| 增量修改 | AI 可基于当前幻灯片做 diff 式编辑，而不是总是整份重写 |
| 版本历史 | 自动保存 AI 生成结果，也支持手动保存命名版本 |
| 溢出检测 | 检测超出 1280x720 视口的页面，并可一键请求 AI 修复 |
| 演示控制 | 支持切换动画、导航箭头颜色、自动播放配置 |
| 导出方式 | 可新开演示页，也可下载独立 HTML |
| 双语界面 | 内置英文与中文界面 |

## 演示示例

下面放了一个可直接浏览的嵌入示例；如果你的 Markdown 查看器不支持 iframe，也可以直接点击链接打开。

这个演示文稿是基于我最近的一篇工作[PIRA-Bench](https://arxiv.org/abs/2603.08013)。仅使用了论文和两张图片作为输入。总花费大约$0.3。

### PIRA-Bench: Proactive GUI Agents

[打开示例 HTML](./demos/pira-bench.html)

<iframe
  src="./demos/pira-bench.html"
  title="PIRA-Bench demo"
  width="100%"
  height="540"
  style="border: 1px solid #30363d; border-radius: 12px; background: #0d1117;"
></iframe>

## 使用流程

1. 创建一个项目。
2. 上传 PDF、图片、表格或文字资料。
3. 在设置中配置 AI 提供商。
4. 让 OpenSlides 生成新幻灯片，或继续修改当前幻灯片。
5. 在可视化编辑器或代码编辑器中细调内容。
6. 保存版本、开始演示，或导出 HTML。

## 快速开始

### 环境要求

- Node.js 18+
- npm

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm run dev
```

默认会同时启动：

- Vite 前端：`http://localhost:5173`
- Express 后端：`http://localhost:3001`

### 构建

```bash
npm run build
```

### 运行生产构建

```bash
npm run start
```

后端端口可通过 `PORT` 指定，默认是 `3001`。

## 配置说明

**注意：** 我目前只实际测试了 Gemini，包括原生 Gemini 和 [Aihubmix](https://aihubmix.com/)。Claude 和 OpenAI 基本都属于 vibe coding，效果不能保证，欢迎针对这两个 provider 提 PR。


在应用右上角的 Settings 中可以设置：

- Provider：`Gemini`、`Claude`、`OpenAI`
- API Key
- Base URL
- Model Name

当前代码中的默认值如下：

| Provider | 默认模型 | 默认 Base URL |
| --- | --- | --- |
| Gemini | `gemini-3.1-pro-preview` | `https://generativelanguage.googleapis.com` |
| Claude | `claude-sonnet-4.6` | `https://api.anthropic.com` |
| OpenAI | `gpt-5.4` | `https://api.openai.com/v1` |

这些设置会由后端保存到本地 `settings.json`。

## 工作流能力

### 以 `reveal.js` 为核心的 AI 生成

OpenSlides 会要求模型直接产出完整、可独立运行的 `reveal.js` HTML 文件。内置系统提示强调：

- 有明确风格的视觉设计
- 更像真实演示稿的版式，而不是普通网页
- 完整 HTML 输出
- 避免内容溢出
- 修改时优先使用 diff 式更新

### 本地项目存储

每个项目都会保存在 `projects/` 目录下，通常包括：

- 上传的参考文件
- 保存过的 HTML 状态
- 聊天记录
- 简化后的上下文摘要

这让项目更容易备份、迁移和自托管。

### 幻灯片版本管理

OpenSlides 同时维护两类历史：

- AI 生成后的自动保存
- 用户确认后的手动保存

你可以在 History 面板中加载、重命名或删除已有版本。

### 编辑与演示

在幻灯片工作区内，你可以：

- 直接在预览中编辑文本
- 打开代码视图修改 HTML
- 设置分节切换动画
- 调整导航箭头颜色
- 配置自动播放
- 在新标签页中演示
- 下载独立 HTML 文件

## 不同 Provider 的说明

| Provider | 接入方式 | 说明 |
| --- | --- | --- |
| Gemini | 原生 Gemini API + 文件上传 + 缓存辅助 | 支持文件复用与显式缓存 |
| Claude | 原生 Anthropic Messages API | 使用 `cache_control` 做稳定前缀缓存 |
| OpenAI | 原生 OpenAI 或兼容代理 | 同时支持官方接口与兼容接口 |

## 开发说明

- 前端：React + TypeScript + Vite
- 后端：Express
- 演示引擎：`reveal.js`
- 样式：Tailwind 工具类结合自定义组件样式
- 数据组织：本地文件系统存储

常用命令：

```bash
npm run dev
npm run build
npm run start
npm run preview
```

## 致谢

感谢 [reveal.js](https://revealjs.com/) 提供强大而优雅的演示引擎。

也感谢 [ryanbbrown/revealjs-skill](https://github.com/ryanbbrown/revealjs-skill)，它提供了很有启发性的 Reveal.js 使用思路与工作流参考。
