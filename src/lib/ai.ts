import { AIProvider, AIConfig, ChatMessage, GenerateSlidesResponse, LocalFile } from '@/types';

const SYSTEM_INSTRUCTION = `
You are a world-class presentation designer using reveal.js. Create stunning, complete HTML presentations.

═══════════════════════════════════════════
STEP 1 — DESIGN THINKING (before any HTML)
═══════════════════════════════════════════

Analyze the content and choose a design that genuinely matches the subject:

COLOR PALETTE — Pick 3-5 colors. Consider the topic, mood, and audience. Example palettes for inspiration:
- Classic Blue: #1C2833, #2E4053, #AAB7B8, #F4F6F6
- Teal & Coral: #5EA8A7, #277884, #FE4447, #FFFFFF
- Deep Purple & Emerald: #B165FB, #181B24, #40695B, #FFFFFF
- Charcoal & Red: #292929, #E33737, #CCCBCB
- Forest Green: #191A19, #4E9F3D, #1E5128, #FFFFFF
- Black & Gold: #BF9A4A, #000000, #F4F6F6
- Vibrant Orange: #F96D00, #F2F2F2, #222831
Don't default to blue. Match the palette to the content.

FONTS — Use Google Fonts. Choose based on tone:
- Clean/modern: "Inter", "Lato", "Source Sans Pro"
- Elegant/formal: "Playfair Display", "Merriweather"
- Techy/geometric: "Space Grotesk", "JetBrains Mono"
- Always pair a heading font with a body font.

VISUAL VARIETY — Plan diverse layouts across slides:
- Title/divider slides (centered, large text)
- Content slides with grids or columns
- Feature cards, stat boxes, icon grids
- Quote slides, comparison layouts
- Don't repeat the same layout on consecutive slides.

═══════════════════════════════════════════
STEP 2 — OUTPUT FORMAT (CRITICAL)
═══════════════════════════════════════════

Output a COMPLETE standalone HTML file inside a single \`\`\`html code block.
The file must be fully self-contained and viewable by opening in any browser.

Structure:
\`\`\`html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Presentation Title]</title>
  <!-- Reveal.js core -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
  <!-- Google Fonts (customize per presentation) -->
  <link href="https://fonts.googleapis.com/css2?family=...&display=swap" rel="stylesheet">
  <!-- Font Awesome 6 for icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    /* === ALL CSS HERE === */
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <!-- <section> slides here -->
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/notes/notes.js"><\/script>
  <script>
    Reveal.initialize({
      width: 1280, height: 720, margin: 0,
      controls: true, progress: true, hash: true,
      transition: 'slide', center: false,
      plugins: [RevealNotes]
    });
  <\/script>
</body>
</html>
\`\`\`

═══════════════════════════════════════════
STEP 3 — CSS STYLING
═══════════════════════════════════════════

All CSS goes in a single <style> tag in the <head>. Structure it as:

1. CSS VARIABLES — Define theme colors, fonts, and sizes:
:root {
  --background-color: #...;       /* Main slide background */
  --primary-color: #...;          /* Main accent */
  --secondary-color: #...;        /* Secondary accent */
  --text-color: #...;             /* Main text */
  --muted-color: #...;            /* Secondary text */
  --heading-font: "Font Name", sans-serif;
  --body-font: "Font Name", sans-serif;
}

2. BASE OVERRIDES — Override reveal.js defaults:
.reveal { font-family: var(--body-font); }
.reveal-viewport { background-color: var(--background-color); }
.reveal h1, .reveal h2, .reveal h3 { font-family: var(--heading-font); text-transform: none; color: var(--text-color); font-weight: 600; }
.reveal p, .reveal li { color: var(--text-color); line-height: 1.5; }

3. SLIDE LAYOUT:
.reveal .slides section {
  height: 100%; display: flex !important; flex-direction: column !important;
  padding: 40px 60px 60px 60px !important; box-sizing: border-box; text-align: left;
}
.reveal .slides section > .content {
  flex: 1; display: flex; flex-direction: column; padding-top: 30px;
}

4. REUSABLE COMPONENT CLASSES — Create CSS classes for repeated visual patterns:
- Feature cards (icon + title + description)
- Stat boxes (number + label)
- Workflow steps (number circle + text)
- Section dividers (centered title slides)
Only create classes for patterns that repeat 2+ times. Use inline styles for one-off layouts.

5. FONT SIZES — ALWAYS use pt (like PowerPoint):
- Titles: 48pt, Subtitles: 36pt, Body: 16-18pt, Captions: 12pt
- Use larger sizes when slides have less content.

═══════════════════════════════════════════
STEP 4 — SLIDE STRUCTURE
═══════════════════════════════════════════

- Each slide is a <section> tag inside <div class="slides">.
- Use a <div class="content"> wrapper for the main content area below the title.
- Use inline CSS grid/flexbox for column layouts (NOT utility classes):
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px;">
- Use Font Awesome 6 icons: <i class="fa-solid fa-icon-name"></i>
- Use data-background-color on <section> for slide backgrounds if needed.
- Speaker notes are allowed. Use <aside class="notes">...</aside> inside a <section> when presenter notes are useful.
- Keep text short and scannable. One idea per slide.
- Ensure contrast: light text on dark, dark text on light.
- All visible text must be inside <p>, <li>, or <h1>-<h6> elements. Never put raw text in <div> or <span>.
- The viewport is 1280×720px. Content must NOT overflow.

EXAMPLE SLIDE:
<section>
  <h2>Key Features</h2>
  <div class="content">
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
      <div class="feature-card">
        <i class="fa-solid fa-rocket"></i>
        <p class="card-title">Fast</p>
        <p class="card-desc">Lightning quick responses</p>
      </div>
      <!-- more cards -->
    </div>
  </div>
</section>

═══════════════════════════════════════════
PREVENTING OVERFLOW (CRITICAL)
═══════════════════════════════════════════
The viewport is exactly 1280×720px with 40px top / 60px side / 60px bottom padding,
leaving ~620px usable height and ~1160px usable width per slide.

RULES TO PREVENT OVERFLOW:
1. MAX CONTENT PER SLIDE: 5-6 bullet points OR 3-4 cards/boxes OR 1 image + 3 bullets.
   If you have more content, SPLIT across multiple slides.
2. IMAGE SIZING: Always constrain images with explicit max-height.
   - Full-width image: max-height: 400px (leaves room for title)
   - Image in 2-column layout: max-height: 350px
   - Always use object-fit: contain or cover with overflow: hidden on the container.
   Example: <img src="..." style="width: 100%; max-height: 400px; object-fit: contain;" />
3. TEXT IN CARDS/BOXES: Limit to 2-3 short lines per card. Use font-size 14-16pt for card body text.
4. USE overflow: hidden ON CONTAINERS: Add overflow: hidden to any grid cell or card container
   so content is clipped rather than breaking the layout.
5. WHEN IN DOUBT, USE FEWER ITEMS AND LARGER TEXT rather than cramming everything in.

═══════════════════════════════════════════
EDIT MODE (when modifying existing slides)
═══════════════════════════════════════════
When the user asks to MODIFY existing slides (fix overflow, change colors, edit text, etc.),
DO NOT output the entire HTML again. Instead, output ONLY the changes using search/replace blocks:

\`\`\`diff
<<<SEARCH
exact text from the current HTML to find
===
replacement text
>>>REPLACE
\`\`\`

RULES FOR EDIT MODE:
- Use edit mode when: the conversation already contains a previous presentation AND the user
  asks to modify/fix/change/update/tweak specific aspects of it.
- Use FULL HTML mode when: creating a new presentation from scratch, or the user explicitly
  asks to regenerate/redo the entire deck.
- The SEARCH text must be an EXACT substring of the current HTML (including whitespace/indentation).
- Include enough context in SEARCH to be unique — don't match ambiguous short strings.
- You can have multiple <<<SEARCH...>>>REPLACE blocks in one response.
- Each block replaces ONE occurrence. If the same change applies to multiple places,
  use separate blocks.
- To DELETE content, use an empty replacement (nothing between === and >>>REPLACE).
- To ADD content, use SEARCH to find the insertion point and include the new content
  in the replacement along with the original context.
- Wrap all blocks in a single \`\`\`diff code fence.

EXAMPLE — changing a slide title and fixing font size:
\`\`\`diff
<<<SEARCH
      <h2>Old Title Here</h2>
===
      <h2>New Better Title</h2>
>>>REPLACE

<<<SEARCH
  font-size: 18pt;
  color: var(--text-color);
===
  font-size: 14pt;
  color: var(--text-color);
>>>REPLACE
\`\`\`

═══════════════════════════════════════════
IMPORTANT RULES
═══════════════════════════════════════════
- Always start your response with a brief explanation (1-3 sentences) of what you're doing and why, BEFORE any code block. This helps the user understand your design choices or changes.
- For NEW presentations: Then output ONE complete HTML file in a \`\`\`html code block.
- For EDITS to existing presentations: Then output search/replace blocks in a \`\`\`diff code block.
- CSS and HTML in one file. No external stylesheets.
- Use flexbox/grid for layout. NEVER use absolute positioning.
- Every slide must fit within 1280×720. Do not let content overflow.
- Use <section> for slides, NOT <div> or any other element.
- Include the reveal.js CDN scripts and initialization in the output (for new presentations).
- Be creative with colors. Don't use the same palette every time.
- If uploaded images are listed with URLs, use them in the presentation with <img> tags.
  Use the EXACT URL provided — do NOT modify or guess image URLs.
  Style images with object-fit, border-radius, box-shadow, etc. as needed.
  Example: <img src="/api/projects/abc123/file/diagram.png" style="width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px;" />
`;

// ============================================================
// Config helpers
// ============================================================

// Cached settings loaded from server
let _cachedConfig: AIConfig | null = null;

function isNativeOpenAIBaseUrl(baseUrl: string): boolean {
  const normalized = (baseUrl || 'https://api.openai.com/v1').trim();
  try {
    const url = new URL(normalized);
    return url.hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

export async function loadConfig(): Promise<AIConfig> {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    _cachedConfig = {
      provider: data.provider || 'gemini',
      apiKey: '',
      model: data.model || '',
      baseUrl: data.baseUrl || '',
      hasStoredApiKey: Boolean(data.hasApiKey),
    };
  } catch {
    _cachedConfig = { provider: 'gemini', apiKey: '', model: '', baseUrl: '', hasStoredApiKey: false };
  }
  // Also load pricing data
  await loadPricing();
  return _cachedConfig;
}

export function getConfig(): AIConfig {
  // Return cached config if available, otherwise defaults
  return _cachedConfig || { provider: 'gemini', apiKey: '', model: '', baseUrl: '', hasStoredApiKey: false };
}

function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'gemini': return 'gemini-3.1-pro-preview';
    case 'claude': return 'claude-sonnet-4.6';
    case 'openai': return 'gpt-5.4';
  }
}

// ============================================================
// Pricing
// ============================================================

interface PricingTier {
  input: number;    // per 1M tokens
  cached: number;   // per 1M tokens
  output: number;   // per 1M tokens
}

interface PricingData {
  models: Record<string, PricingTier>;
  custom: Record<string, PricingTier>;
}

let _cachedPricing: PricingData | null = null;

export async function loadPricing(): Promise<PricingData> {
  try {
    const res = await fetch('/api/pricing');
    if (res.ok) {
      _cachedPricing = await res.json();
      return _cachedPricing!;
    }
  } catch {
    // fall through
  }
  return { models: {}, custom: {} };
}

function getPricingCached(): PricingData {
  return _cachedPricing || { models: {}, custom: {} };
}

export function lookupPricing(model: string): PricingTier | null {
  const data = getPricingCached();
  // Custom pricing takes priority
  if (data.custom?.[model]) return data.custom[model];
  // Exact match in defaults
  if (data.models?.[model]) return data.models[model];
  // Partial match: find the longest key that the model name contains
  const allEntries = [
    ...Object.entries(data.custom || {}),
    ...Object.entries(data.models || {}),
  ];
  let best: { key: string; tier: PricingTier } | null = null;
  for (const [key, tier] of allEntries) {
    if (model.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, tier: tier as PricingTier };
    }
  }
  return best?.tier || null;
}

const FALLBACK_PRICING: PricingTier = { input: 2.0, cached: 0.50, output: 8.0 };

function computePrice(
  _provider: AIProvider,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  thinkingTokens: number,
): string {
  const pricing = lookupPricing(model) || FALLBACK_PRICING;
  const uncachedInput = Math.max(0, inputTokens - cachedTokens);
  const totalOutput = outputTokens + (thinkingTokens || 0);
  const price =
    (uncachedInput / 1_000_000) * pricing.input +
    (cachedTokens / 1_000_000) * pricing.cached +
    (totalOutput / 1_000_000) * pricing.output;
  return price.toFixed(6);
}

// ============================================================
// Diff application
// ============================================================

function applyDiffs(diffContent: string, currentHtml: string): string {
  const blocks = diffContent.split('<<<SEARCH').slice(1);
  let result = currentHtml;
  let appliedCount = 0;
  let failedCount = 0;

  for (const block of blocks) {
    const parts = block.split('===');
    if (parts.length < 2) continue;
    const searchText = parts[0].replace(/^\n/, '').replace(/\n$/, '');
    const replaceAndRest = parts.slice(1).join('===');
    const replaceMatch = replaceAndRest.split('>>>REPLACE');
    if (replaceMatch.length < 1) continue;
    const replaceText = replaceMatch[0].replace(/^\n/, '').replace(/\n$/, '');

    if (result.includes(searchText)) {
      result = result.replace(searchText, replaceText);
      appliedCount++;
    } else {
      console.warn(`Diff block failed to match: "${searchText.substring(0, 80)}..."`);
      failedCount++;
    }
  }

  console.log(`Applied ${appliedCount} diff blocks, ${failedCount} failed`);
  return result;
}

function normalizeHistoryMessage(msg: ChatMessage): string {
  if (msg.role === 'assistant' && /<!doctype\s+html/i.test(msg.content)) {
    return '[Generated presentation HTML — see current version below]';
  }
  return msg.content;
}

function buildReferenceMessage(
  projectId: string,
  projectFiles: LocalFile[]
): { role: string; content: string; files?: Array<{ data: string; mimeType: string }> } | null {
  if (!Array.isArray(projectFiles) || projectFiles.length === 0) return null;

  const sections: string[] = ['[Project reference material]'];
  sections.push('The system is attaching the project source files separately. Use them as primary source material.');
  sections.push(`Available project files: ${projectFiles.map((file) => file.name).join(', ')}`);

  // Tell the AI the exact URLs for images so it can reference them in <img> tags
  const imageFiles = projectFiles.filter((file) => file.mimeType.startsWith('image/'));
  if (imageFiles.length > 0) {
    sections.push('The following uploaded images are available. Use them in the slides with <img> tags using the EXACT URLs below:');
    for (const f of imageFiles) {
      sections.push(`- ${f.name}: ${f.url || `/api/projects/${projectId}/file/${encodeURIComponent(f.name)}`}`);
    }
  }

  return {
    role: 'user',
    content: sections.join('\n\n'),
  };
}

// ============================================================
// Main generation function
// ============================================================

export const generateSlides = async (
  projectId: string,
  userPrompt: string,
  chatHistory: ChatMessage[] = [],
  currentSlides?: string | null,
  files?: LocalFile[],
  conversationSummary: string = '',
  inlineAttachments?: import("@/types").ChatAttachment[]
): Promise<GenerateSlidesResponse> => {
  const config = await loadConfig();
  const model = config.model || getDefaultModel(config.provider);

  if (!config.apiKey && !config.hasStoredApiKey) {
    throw new Error('NO_API_KEY');
  }

  // Build messages array
  const messages: Array<{ role: string; content: string; files?: Array<{ data: string; mimeType: string }> }> = [];
  const referenceMessage = buildReferenceMessage(projectId, files || []);

  if (referenceMessage) {
    messages.push(referenceMessage);
  }

  if (conversationSummary.trim()) {
    messages.push({
      role: 'user',
      content: `[Conversation summary from earlier turns]\n${conversationSummary.trim()}`,
    });
  }

  // Keep only the latest two turns verbatim; older continuity should come from the summary.
  if (chatHistory && Array.isArray(chatHistory)) {
    const recentHistory = chatHistory.slice(-4);
    recentHistory.forEach(msg => {
      messages.push({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        content: normalizeHistoryMessage(msg),
      });
    });
  }

  if (currentSlides) {
    messages.push({
      role: 'user',
      content: `[Current slide HTML — base your edits on this version and preserve the existing structure unless the user asks to regenerate]\n${currentSlides}`,
    });
  }

  if (userPrompt || (inlineAttachments && inlineAttachments.length > 0)) {
    const inlineFiles: Array<{ data: string; mimeType: string }> = [];
    if (inlineAttachments && inlineAttachments.length > 0) {
      for (const att of inlineAttachments) {
        const base64Data = att.dataUrl.split(',')[1];
        if (base64Data) {
          inlineFiles.push({ data: base64Data, mimeType: att.mimeType });
        }
      }
    }
    messages.push({
      role: 'user',
      content: userPrompt ? `[Current task]\n${userPrompt}` : '[See attached image(s)]',
      ...(inlineFiles.length > 0 ? { files: inlineFiles } : {}),
    });
  }

  // Call server proxy
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.provider,
      model,
      projectId,
      baseUrl: config.baseUrl,
      system: SYSTEM_INSTRUCTION,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  const data = await response.json();
  const rawText: string = data.text || 'No content generated';

  // Extract the chat-visible text (everything outside code blocks)
  // This shows the AI's reasoning/thinking to the user
  let chatText = rawText
    .replace(/```[\w]*[\s\S]*?```/g, '')
    .trim();
  if (!chatText) {
    chatText = '';
  }
  // Append indicator that HTML is rendered in the editor
  chatText += '\n\n📄 [Displayed in the editor]';

  // Extract HTML content for the editor
  let generatedHtml = rawText;

  // Apply diffs if response contains diff blocks
  const diffMatch = rawText.match(/```diff([\s\S]*?)```/);
  if (diffMatch && currentSlides) {
    generatedHtml = applyDiffs(diffMatch[1], currentSlides);
  } else if (diffMatch && !currentSlides) {
    console.warn('Diff response but no currentSlides provided, returning raw response');
  }

  // Extract HTML from code block if present
  const htmlMatch = rawText.match(/```html([\s\S]*?)```/);
  if (htmlMatch) {
    generatedHtml = htmlMatch[1].trim();
  }

  // Compute usage and pricing
  const usage = data.usage || {};
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  const cachedTokens = usage.cachedTokens || 0;
  const thinkingTokens = usage.thinkingTokens || 0;
  const totalTokens = inputTokens + outputTokens;

  return {
    content: generatedHtml,
    chatText,
    usage: {
      inputTokens,
      outputTokens,
      cachedTokens,
      thinkingTokens,
      totalTokens,
      estimatedPrice: computePrice(config.provider, model, inputTokens, outputTokens, cachedTokens, thinkingTokens),
    },
  };
};
