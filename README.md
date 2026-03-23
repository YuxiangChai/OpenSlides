# OpenSlides

OpenSlides is a local-first AI presentation workspace for building polished `reveal.js` decks from prompts, uploaded files, and iterative edits.

It combines a React editor, an Express backend, versioned project storage, and multi-provider AI support so you can go from rough idea to presentable slides without leaving the app.

[中文版Readme](./README.zh-CN.md)

## Why OpenSlides

OpenSlides is designed for a practical presentation workflow:

- Generate complete `reveal.js` presentations from a prompt or source files
- Refine decks through follow-up chat instead of starting over
- Edit text inline directly inside the slide preview
- Switch to code view when you want full HTML and CSS control
- Keep auto-saved and manual versions so experimentation feels safe
- Present in-browser or export a standalone HTML deck

## Highlights

| Area | What you get |
| --- | --- |
| AI generation | Supports Gemini, Claude, and OpenAI-compatible APIs |
| Better prompts, lower cost | Provider-aware prompt caching behavior for Gemini, Claude, and OpenAI |
| Source-aware decks | Upload PDFs, images, text, CSV, Markdown, and more as project references |
| Inline editing | Click visible text in the preview to edit slides directly |
| Structured iteration | AI can modify existing decks with diff-based updates instead of regenerating everything |
| Safe history | Auto-saves after generation plus manual named snapshots |
| Overflow recovery | Detects slides that exceed the viewport and can ask AI to fix them |
| Presentation controls | Reveal transitions, navigation color, and auto-play configuration |
| Export paths | Open a presentation tab or download a self-contained HTML file |
| Bilingual UI | English and Chinese interface support |

## Demo

The example below is embedded for quick browsing, with a direct link if your Markdown viewer does not render iframes.

The slides is built on my recent paper [PIRA-Bench](https://arxiv.org/abs/2603.08013). The sources are paper pdf, two images from the paper. It totally cost around $0.3 by using gemini-3.1-pro-preview.

### PIRA-Bench: Proactive GUI Agents

[Open demo HTML](./demos/pira-bench.html)

<iframe
  src="./demos/pira-bench.html"
  title="PIRA-Bench demo"
  width="100%"
  height="540"
  style="border: 1px solid #30363d; border-radius: 12px; background: #0d1117;"
></iframe>

## How It Works

1. Create a project.
2. Upload reference material such as PDFs, images, CSVs, or notes.
3. Configure your AI provider in Settings.
4. Ask OpenSlides to create a deck or revise the current one.
5. Fine-tune in the visual editor or the code editor.
6. Save versions, present in a new tab, or download the deck as HTML.

## Quick Start

### Requirements

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

This starts:

- Vite frontend on `http://localhost:5173`
- Express backend on `http://localhost:3001`

### Build

```bash
npm run build
```

### Run Production Build

```bash
npm run start
```

The backend uses `PORT` if provided, otherwise it defaults to `3001`.

## Configuration

**Notice:** I currently only test with Gemini including the native Gemini and [Aihubmix](https://aihubmix.com/). The rest Claude and OpenAI are all vibe coded. Feel free to PR on these two providers.

Open the Settings panel in the app and choose:

- Provider: `Gemini`, `Claude`, or `OpenAI`
- API key
- Base URL
- Model name

Provider defaults in the current codebase:

| Provider | Default model | Default base URL |
| --- | --- | --- |
| Gemini | `gemini-3.1-pro-preview` | `https://generativelanguage.googleapis.com` |
| Claude | `claude-sonnet-4.6` | `https://api.anthropic.com` |
| OpenAI | `gpt-5.4` | `https://api.openai.com/v1` |

Settings are stored locally in `settings.json` when saved through the backend.

## Workflow Features

### AI-first deck creation

OpenSlides asks the model for a complete standalone `reveal.js` HTML deck. The built-in system prompt pushes for:

- strong visual direction
- real presentation layouts instead of generic slides
- full HTML output
- overflow-aware design decisions
- edit-mode diffs for iterative changes

### Local project storage

Each project is stored on disk under `projects/`, including:

- uploaded files
- saved HTML states
- chat history
- lightweight conversation context

This makes the app easy to inspect, back up, and self-host.

### Version control for decks

OpenSlides keeps two parallel histories:

- auto-saves after AI generations
- manual saves for user-approved milestones

You can load, rename, and delete saved states from the History panel.

### Editing and presentation

Inside the slide workspace, you can:

- edit text inline in the preview
- open raw HTML in code view
- change section transitions
- adjust navigation arrow color
- configure deck auto-play
- open a presentation tab
- download a standalone HTML file

## Provider Notes

| Provider | Integration style | Notes |
| --- | --- | --- |
| Gemini | Native Gemini API plus file upload and cache helpers | Includes file reuse and optional explicit cache creation |
| Claude | Native Anthropic Messages API | Uses `cache_control` markers for stable prompt prefixes |
| OpenAI | Native OpenAI API or compatible proxy | Supports direct OpenAI and OpenAI-compatible endpoints |

## Development Notes

- Frontend: React + TypeScript + Vite
- Backend: Express
- Presentation engine: `reveal.js`
- Styling: Tailwind utilities plus custom component styling
- Data model: local filesystem storage under `projects/`

Useful commands:

```bash
npm run dev
npm run build
npm run start
npm run preview
```

## Acknowledgements

Thanks to [reveal.js](https://revealjs.com/) for the presentation engine that makes this project possible.

Thanks also to [ryanbbrown/revealjs-skill](https://github.com/ryanbbrown/revealjs-skill) for inspiration and helpful Reveal.js workflow ideas.
