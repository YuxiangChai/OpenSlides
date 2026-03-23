import React, { useEffect, useRef, useState } from "react";
import { Loader2, Save, History, Clock, Pencil, Check, Trash2, X, Play, Download } from "lucide-react";
import CodeEditor from "./CodeEditor";
import { useLanguage } from "../hooks/useLanguage";
import { VersionState, ViewMode } from "@/types";
import { injectInlineEditor } from "@/lib/injectInlineEditor";

interface SlidePreviewProps {
  slidesData: string | null;
  isGenerating: boolean;
  onSave: (content: string) => void;
  isSaving: boolean;
  manualVersions: VersionState[];
  autoVersions: VersionState[];
  currentVersion: string | null;
  onLoadVersion: (stateId: string) => void;
  onRenameVersion: (stateId: string, name: string) => void;
  onDeleteVersion: (stateId: string) => void;
  isCreatingNewChat: boolean;
  onEditorChange?: (html: string) => void;
  onFixOverflow?: (prompt: string) => void;
  projectId?: string;
}

interface VersionItemProps {
  version: VersionState;
  isAuto: boolean;
}

type SectionTransition = 'default' | 'none' | 'fade' | 'slide' | 'convex' | 'concave' | 'zoom';
const DEFAULT_ARROW_COLOR = '#ffffff';

const SECTION_TRANSITION_OPTIONS: { value: SectionTransition; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'slide', label: 'Slide' },
  { value: 'fade', label: 'Fade' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'convex', label: 'Convex' },
  { value: 'concave', label: 'Concave' },
  { value: 'none', label: 'None' },
];

/**
 * Check if content is a complete HTML document (from the new AI output format).
 */
const isCompleteHtml = (content: string): boolean => {
  return /<!doctype\s+html/i.test(content.trim()) || /^<html[\s>]/i.test(content.trim());
};

const getSectionTransitionSelection = (content: string): SectionTransition => {
  const matches = [...content.matchAll(/<section\b[^>]*\sdata-transition="([^"]+)"/gi)];
  if (matches.length === 0) return 'default';

  const values = Array.from(new Set(matches.map((match) => (match[1] || '').trim().toLowerCase())));
  if (values.length !== 1) return 'default';

  const onlyValue = values[0];
  return SECTION_TRANSITION_OPTIONS.some((opt) => opt.value === onlyValue)
    ? (onlyValue as SectionTransition)
    : 'default';
};

const applySectionTransition = (content: string, transition: SectionTransition): string => {
  const stripped = content.replace(/\sdata-transition="[^"]*"/gi, '');

  if (transition === 'default') {
    return stripped;
  }

  return stripped.replace(/<section\b/gi, `<section data-transition="${transition}"`);
};

const normalizeHexColor = (value: string, fallback: string = DEFAULT_ARROW_COLOR): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback.toLowerCase();
};

const buildArrowColorStyle = (color: string): string => `
<style data-nav-arrow-color>
  .reveal .controls,
  .reveal .controls button,
  .reveal .controls .navigate-left,
  .reveal .controls .navigate-right,
  .reveal .controls .navigate-up,
  .reveal .controls .navigate-down,
  .reveal .controls .navigate-prev,
  .reveal .controls .navigate-next {
    color: ${color} !important;
  }
  .reveal .controls .enabled {
    color: ${color} !important;
  }
</style>`.trim();

const getArrowColorSelection = (content: string): string => {
  const match = content.match(/<style data-nav-arrow-color>[\s\S]*?color:\s*(#[0-9a-fA-F]{3,6})\s*!important;[\s\S]*?<\/style>/i);
  return normalizeHexColor(match?.[1] || DEFAULT_ARROW_COLOR);
};

const applyArrowColor = (content: string, color: string): string => {
  const normalized = normalizeHexColor(color);
  const cleaned = content.replace(/\s*<style data-nav-arrow-color>[\s\S]*?<\/style>/gi, '');
  const styleTag = buildArrowColorStyle(normalized);

  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `  ${styleTag}\n</head>`);
  }

  return `${styleTag}\n${cleaned}`;
};

/**
 * Build presentation HTML for present/download.
 * If content is already a complete HTML doc, use it as-is.
 * Otherwise, wrap fragment (<style> + <section>) in a full document (legacy support).
 */
const SCROLLABLE_STYLE = `<style data-scrollable>
.reveal .slides section {
  overflow-y: auto !important;
  overflow-x: hidden !important;
}
.reveal .slides section::-webkit-scrollbar {
  width: 4px;
}
.reveal .slides section::-webkit-scrollbar-track {
  background: transparent;
}
.reveal .slides section::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
}
.reveal .slides section::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.4);
}
</style>`;

/**
 * Convert relative /api/projects/... image URLs to absolute URLs
 * so they work in blob: URLs (present) and downloaded HTML files.
 */
const makeImageUrlsAbsolute = (html: string): string => {
  const origin = window.location.origin;
  return html.replace(
    /(src=["'])\/api\/projects\//g,
    `$1${origin}/api/projects/`
  );
};

/**
 * Fetch all images referenced via /api/projects/ URLs and embed them
 * as inline base64 data URIs for standalone HTML files.
 */
const inlineImages = async (html: string): Promise<string> => {
  const imgRegex = /src=["'](https?:\/\/[^"']*\/api\/projects\/[^"']+)["']/g;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) return html;

  let result = html;
  for (const match of matches) {
    const url = match[1];
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      result = result.split(url).join(dataUrl);
    } catch {
      // Keep original URL if fetch fails
    }
  }
  return result;
};

const ASPECT_RATIO_STYLE = `<style data-aspect-ratio>
html, body {
  width: 100%; height: 100%; margin: 0;
  overflow: hidden; background: #000;
  display: flex; align-items: center; justify-content: center;
}
.reveal {
  width: 1280px; height: 720px;
  max-width: 100%; max-height: 100%;
}
</style>`;

const ASPECT_RATIO_SCRIPT = `<script data-aspect-ratio>
(function() {
  function resizeReveal() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var scale = Math.min(vw / 1280, vh / 720);
    var el = document.querySelector('.reveal');
    if (!el) return;
    el.style.width = Math.floor(1280 * scale) + 'px';
    el.style.height = Math.floor(720 * scale) + 'px';
  }
  resizeReveal();
  window.addEventListener('resize', resizeReveal);
})();
<\/script>`;

export const buildPresentationHtml = (content: string) => {
  if (isCompleteHtml(content)) {
    let result = content;
    // Inject aspect ratio + scrollable styles into complete HTML
    if (result.includes('</head>')) {
      result = result.replace('</head>', ASPECT_RATIO_STYLE + '\n' + SCROLLABLE_STYLE + '\n</head>');
    }
    // Inject resize script before closing body
    if (result.includes('</body>')) {
      result = result.replace('</body>', ASPECT_RATIO_SCRIPT + '\n</body>');
    }
    return result;
  }

  // Legacy: wrap <style> + <section> fragments
  const styleBlocks: string[] = [];
  const sectionsOnly = content.replace(/<style[\s\S]*?<\/style>/gi, (match) => {
    styleBlocks.push(match);
    return '';
  });
  const aiStyles = styleBlocks.join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #slide-container {
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 40px rgba(0,0,0,0.5);
    }
    .reveal {
      width: 100% !important;
      height: 100% !important;
    }
    /* Reset all Reveal theme defaults */
    .reveal .slides section {
      padding: 0;
      box-sizing: border-box;
      width: 1280px;
      height: 720px;
      text-align: left;
      display: flex;
      flex-direction: column;
    }
    .reveal h1, .reveal h2, .reveal h3, .reveal h4, .reveal h5, .reveal h6,
    .reveal p, .reveal ul, .reveal ol, .reveal li, .reveal span, .reveal div {
      margin: 0;
      padding: 0;
      text-shadow: none;
      font-family: inherit;
      color: inherit;
      text-transform: none;
      letter-spacing: normal;
      line-height: 1.3;
    }
    .reveal ul, .reveal ol { list-style-position: outside; padding-left: 1.5em; }
    .reveal .slides section .slide-el {
      position: absolute;
      margin: 0;
    }
    /* Base layout helper */
    .slide-content {
      padding: 60px;
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      box-sizing: border-box;
    }
  </style>
  ${aiStyles}
</head>
<body>
  <div id="slide-container">
    <div class="reveal">
      <div class="slides">
${sectionsOnly}
      </div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"><\/script>
  <script>
    function resizeContainer() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var scale = Math.min(vw / 1280, vh / 720);
      var container = document.getElementById('slide-container');
      container.style.width = Math.floor(1280 * scale) + 'px';
      container.style.height = Math.floor(720 * scale) + 'px';
    }
    resizeContainer();
    window.addEventListener('resize', resizeContainer);

    Reveal.initialize({
      width: 1280,
      height: 720,
      margin: 0,
      center: false,
      hash: true,
      transition: 'slide'
    });
  <\/script>
</body>
</html>`;
};

export default function SlidePreview({
  slidesData,
  isGenerating,
  onSave,
  isSaving,
  manualVersions = [],
  autoVersions = [],
  currentVersion,
  onLoadVersion,
  onRenameVersion,
  onDeleteVersion,
  isCreatingNewChat,
  onEditorChange,
  onFixOverflow,
  projectId
}: SlidePreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [sectionTransition, setSectionTransition] = useState<SectionTransition>('default');
  const [arrowColor, setArrowColor] = useState<string>(DEFAULT_ARROW_COLOR);
  const [arrowColorInput, setArrowColorInput] = useState<string>(DEFAULT_ARROW_COLOR);
  const [isArrowColorOpen, setIsArrowColorOpen] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [presentationFrameSrc, setPresentationFrameSrc] = useState<string | null>(null);
  const [overflowSlides, setOverflowSlides] = useState<{index: number; title: string}[]>([]);
  const { t } = useLanguage();
  const arrowColorPopoverRef = useRef<HTMLDivElement | null>(null);
  const inlineEditorLabels = {
    clickToEdit: t('slidePreview.clickToEdit'),
    savedButton: t('slidePreview.savedButton'),
    saveButton: t('slidePreview.saveButton'),
    unsavedChanges: t('slidePreview.unsavedChanges'),
    savedStatus: t('slidePreview.savedStatus'),
  };

  const PLACEHOLDER_SLIDES = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenSlides</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    :root {
      --background-color: #1a1a2e;
      --primary-color: #6c63ff;
      --text-color: #e8e8e8;
      --muted-color: #a0a0b0;
      --heading-font: "Inter", sans-serif;
      --body-font: "Inter", sans-serif;
    }
    .reveal { font-family: var(--body-font); }
    .reveal-viewport { background-color: var(--background-color); }
    .reveal h1, .reveal h2, .reveal h3 { font-family: var(--heading-font); text-transform: none; color: var(--text-color); font-weight: 700; }
    .reveal p, .reveal li { color: var(--text-color); line-height: 1.6; }
    .reveal .slides section {
      height: 100%; display: flex !important; flex-direction: column !important;
      padding: 60px 80px !important; box-sizing: border-box; text-align: center;
      justify-content: center; align-items: center;
    }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section>
        <h1 style="font-size: 48pt; margin-bottom: 24px;">${t('slidePreview.welcomeTitle')}</h1>
        <p style="font-size: 20pt; color: var(--muted-color);">${t('slidePreview.welcomeText')}</p>
      </section>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"><\/script>
  <script>
    Reveal.initialize({ width: 1280, height: 720, margin: 0, controls: true, progress: true, hash: true, transition: 'slide', center: false });
  <\/script>
</body>
</html>`;

  const [localContent, setLocalContent] = useState<string>(slidesData || PLACEHOLDER_SLIDES);
  const normalizedContent = applyArrowColor(
    applySectionTransition(localContent, sectionTransition),
    arrowColor
  );

  // Sync slidesData → localContent
  useEffect(() => {
    if (slidesData) {
      // Extract content from markdown code block if present
      const codeBlockMatch = slidesData.match(/```html([\s\S]*?)```/i);
      const extracted = codeBlockMatch ? codeBlockMatch[1].trim() : slidesData;
      setLocalContent(extracted);
      setSectionTransition(getSectionTransitionSelection(extracted));
      const nextArrowColor = getArrowColorSelection(extracted);
      setArrowColor(nextArrowColor);
      setArrowColorInput(nextArrowColor);
    } else {
      setLocalContent(PLACEHOLDER_SLIDES);
      setSectionTransition(getSectionTransitionSelection(PLACEHOLDER_SLIDES));
      const nextArrowColor = getArrowColorSelection(PLACEHOLDER_SLIDES);
      setArrowColor(nextArrowColor);
      setArrowColorInput(nextArrowColor);
    }
    setOverflowSlides([]);
  }, [slidesData, t]);

  useEffect(() => {
    if (!isArrowColorOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!arrowColorPopoverRef.current) return;
      if (!arrowColorPopoverRef.current.contains(event.target as Node)) {
        setIsArrowColorOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isArrowColorOpen]);

  // Listen for inline editor saves from the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'inline-editor-save' && e.data.html) {
        setLocalContent(e.data.html);
        if (onEditorChange) onEditorChange(e.data.html);
      }
      if (e.data?.type === 'overflow-detected') {
        setOverflowSlides(e.data.slides || []);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEditorChange]);

  const handleViewChange = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
  };

  const handleSave = () => {
    onSave(normalizedContent);
  };

  const handleSectionTransitionChange = (nextTransition: SectionTransition) => {
    setSectionTransition(nextTransition);
    setLocalContent((prev) => {
      const updated = applySectionTransition(prev, nextTransition);
      if (onEditorChange && updated !== prev) {
        onEditorChange(updated);
      }
      return updated;
    });
  };

  const handleArrowColorChange = (nextColor: string) => {
    const normalized = normalizeHexColor(nextColor, arrowColor);
    setArrowColor(normalized);
    setArrowColorInput(normalized);
    setLocalContent((prev) => {
      const updated = applyArrowColor(prev, normalized);
      if (onEditorChange && updated !== prev) {
        onEditorChange(updated);
      }
      return updated;
    });
  };

  const handlePresent = () => {
    const content = normalizedContent;
    // Make image URLs absolute so they resolve from blob: context
    const html = makeImageUrlsAbsolute(buildPresentationHtml(content));
    try {
      sessionStorage.setItem('openslides_present_html', html);
    } catch {
      window.alert('Unable to prepare presentation HTML for the presentation overlay.');
      return;
    }
    setPresentationFrameSrc(`/present?ts=${Date.now()}`);
  };

  const handleDownload = async () => {
    const content = normalizedContent;
    // Make URLs absolute first, then inline images as base64 for standalone file
    let html = makeImageUrlsAbsolute(buildPresentationHtml(content));
    html = await inlineImages(html);

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presentation.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const startEditing = (version: VersionState) => {
    setEditingVersionId(version.id);
    setEditingName(version.name);
  };

  const saveEditing = (versionId: string) => {
    if (onRenameVersion) {
      onRenameVersion(versionId, editingName);
    }
    setEditingVersionId(null);
  };

  const VersionItem = ({ version, isAuto }: VersionItemProps) => (
    <div key={version.id} className="flex items-center gap-3">
      <div
        className={`flex-1 p-4 rounded-xl border transition-all ${
          currentVersion === version.id
            ? "bg-blue-900/20 border-blue-500/50"
            : "bg-panel border-border hover:border-gray-600"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              currentVersion === version.id ? "bg-blue-600" : "bg-gray-700"
            }`}>
              <Clock size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {editingVersionId === version.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEditing(version.id)}
                      className="p-1 text-green-400 hover:bg-gray-800 rounded"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <h4 className="font-semibold text-gray-200">{version.name}</h4>
                    {!isAuto && (
                      <button
                        onClick={() => startEditing(version)}
                        className="p-1 text-gray-500 hover:text-white transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(version.save_time).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAuto && onDeleteVersion && (
              deletingVersionId === version.id ? (
                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-200">
                  <button
                    onClick={() => {
                      onDeleteVersion(version.id);
                      setDeletingVersionId(null);
                    }}
                    className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                    title="Confirm Delete"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => setDeletingVersionId(null)}
                    className="p-2 bg-gray-700 text-gray-400 hover:bg-gray-600 rounded-lg transition-colors"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeletingVersionId(version.id)}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete Version"
                >
                  <Trash2 size={18} />
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Load / Active Button */}
      <div className="shrink-0 w-24 flex justify-end">
        {currentVersion !== version.id && (
          <button
            onClick={() => onLoadVersion && onLoadVersion(version.id)}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors whitespace-nowrap text-center"
          >
            {t('slidePreview.load')}
          </button>
        )}
        {currentVersion === version.id && (
          <span className="w-full px-3 py-2 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full whitespace-nowrap text-center block">
            {t('slidePreview.active')}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border border-border relative">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel">
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => handleViewChange("editor")}
              className={`w-16 py-1.5 rounded-md text-sm font-medium transition-all text-center ${
                viewMode === "editor"
                  ? "bg-gray-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t('slidePreview.editor')}
            </button>
            <button
              onClick={() => handleViewChange("code")}
              className={`w-16 py-1.5 rounded-md text-sm font-medium transition-all text-center ${
                viewMode === "code"
                  ? "bg-gray-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t('slidePreview.code')}
            </button>
            <button
              onClick={() => handleViewChange("history")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === "history"
                  ? "bg-gray-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <History size={16} className="mx-auto" />
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center justify-center gap-2 w-24 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors ${
              isSaving ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{isSaving ? t('common.saving') : t('common.save')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePresent}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
            title="Present in overlay"
          >
            <Play size={14} />
            <span>{t('slidePreview.present')}</span>
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="Download HTML"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {viewMode === "editor" && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-panel/80 relative">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-gray-400">{t('slidePreview.transition')}</span>
            <select
              value={sectionTransition}
              onChange={(e) => handleSectionTransitionChange(e.target.value as SectionTransition)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              {SECTION_TRANSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div ref={arrowColorPopoverRef} className="relative flex items-center gap-2 text-sm text-gray-300">
            <span className="text-gray-400">{t('slidePreview.arrowColor')}</span>
            <button
              type="button"
              onClick={() => setIsArrowColorOpen((open) => !open)}
              className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <span
                className="h-4 w-4 rounded border border-white/20"
                style={{ backgroundColor: arrowColor }}
              />
              <span className="font-mono uppercase">{arrowColor}</span>
            </button>

            {isArrowColorOpen && (
              <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-2xl z-20">
                <div className="flex flex-col gap-3">
                  <input
                    type="color"
                    value={arrowColor}
                    onChange={(e) => handleArrowColorChange(e.target.value)}
                    className="h-12 w-full cursor-pointer rounded-lg border border-gray-700 bg-transparent"
                  />
                  <input
                    type="text"
                    value={arrowColorInput}
                    onChange={(e) => setArrowColorInput(e.target.value)}
                    onBlur={(e) => handleArrowColorChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleArrowColorChange(arrowColorInput);
                        setIsArrowColorOpen(false);
                      }
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 relative min-h-0">
        {/* Loading overlay */}
        {(isGenerating || isCreatingNewChat) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50 gap-3 bg-background/80 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            {isGenerating && (
              <span className="text-gray-400 font-medium animate-pulse">{t('slidePreview.generating')}</span>
            )}
            {isCreatingNewChat && (
              <span className="text-gray-400 font-medium animate-pulse">Creating New Chat...</span>
            )}
          </div>
        )}

        {/* Content Views */}
        {viewMode === "editor" ? (
          <div className="w-full h-full flex flex-col bg-neutral-900 overflow-hidden">
            {overflowSlides.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/60 border-b border-amber-700/50 text-amber-200 text-xs shrink-0">
                <span className="truncate flex-1">
                  Overflow on slide{overflowSlides.length > 1 ? 's' : ''}{' '}
                  {overflowSlides.map(s => `#${s.index}${s.title ? ` "${s.title}"` : ''}`).join(', ')}
                </span>
                {onFixOverflow && (
                  <button
                    onClick={() => {
                      const slideList = overflowSlides.map(s => `slide ${s.index}${s.title ? ` ("${s.title}")` : ''}`).join(', ');
                      onFixOverflow(
                        `The following slides have content that overflows beyond the visible area: ${slideList}. ` +
                        `Please fix the overflow by reducing content, using smaller font sizes, splitting into more slides, ` +
                        `or using vertical sub-slides (nested <section> tags). Make sure all content fits within the 1280×720 viewport.`
                      );
                    }}
                    className="shrink-0 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                  >
                    Fix
                  </button>
                )}
                <button
                  onClick={() => setOverflowSlides([])}
                  className="shrink-0 text-amber-400 hover:text-amber-200 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              <iframe
                key={sectionTransition}
                title="Slide Editor"
                srcDoc={injectInlineEditor(normalizedContent, inlineEditorLabels)}
                style={{
                  border: 0,
                  borderRadius: '8px',
                  width: '100%',
                  aspectRatio: '16/9',
                  maxHeight: '100%',
                }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        ) : viewMode === "code" ? (
          <CodeEditor code={localContent} onChange={setLocalContent} />
        ) : (
          <div className="w-full h-full bg-background overflow-y-auto custom-scrollbar p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <History size={24} />
              {t('slidePreview.versionHistory')}
            </h3>
            <div className="space-y-4 max-w-3xl mx-auto">
              {autoVersions.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                    {t('slidePreview.autoSaves')}
                  </h4>
                  <div className="space-y-3">
                    {autoVersions.slice().reverse().map((version) => (
                      <VersionItem key={version.id} version={version} isAuto={true} />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                  {t('slidePreview.manualSaves')}
                  <div className="h-px flex-1 bg-gray-700"></div>
                </h4>
                <div className="space-y-3">
                  {manualVersions.length > 0 ? (
                    manualVersions.slice().reverse().map((version) => (
                      <VersionItem key={version.id} version={version} isAuto={false} />
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-4 italic">
                      {t('slidePreview.noSavedVersions')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {presentationFrameSrc && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm">
          <iframe
            key={presentationFrameSrc}
            title="Presentation"
            src={presentationFrameSrc}
            className="w-full h-full border-0 bg-transparent"
            allowFullScreen
          />
          <button
            onClick={() => setPresentationFrameSrc(null)}
            className="absolute top-5 right-5 z-[101] flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-white/45 transition-all hover:bg-black/45 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60"
            title="Close presentation"
            aria-label="Close presentation"
          >
            <X size={22} />
          </button>
        </div>
      )}

    </div>
  );
}
