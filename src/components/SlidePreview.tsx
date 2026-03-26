import React, { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, Save, History, Clock, Pencil, Check, Trash2, X, Play, Download, Palette } from "lucide-react";
import CodeEditor from "./CodeEditor";
import { useLanguage } from "../hooks/useLanguage";
import { useCDN } from "../hooks/useCDN";
import { applyChinaCDN } from "@/lib/cdn";
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
const DEFAULT_AUTO_SLIDE_MS = 5000;
const MIN_AUTO_SLIDE_MS = 1000;
const MAX_AUTO_SLIDE_MS = 600000;
const REVEAL_VERSION = '5.1.0';
const REVEAL_NOTES_SCRIPT = `<script src="https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/plugin/notes/notes.js"><\/script>`;

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

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const hexToRgb = (value: string): { r: number; g: number; b: number } => {
  const normalized = normalizeHexColor(value);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`;

const rgbToHsv = (r: number, g: number, b: number): HsvColor => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
};

const hsvToRgb = (h: number, s: number, v: number): { r: number; g: number; b: number } => {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = chroma; gPrime = x;
  } else if (hue < 120) {
    rPrime = x; gPrime = chroma;
  } else if (hue < 180) {
    gPrime = chroma; bPrime = x;
  } else if (hue < 240) {
    gPrime = x; bPrime = chroma;
  } else if (hue < 300) {
    rPrime = x; bPrime = chroma;
  } else {
    rPrime = chroma; bPrime = x;
  }

  return {
    r: (rPrime + m) * 255,
    g: (gPrime + m) * 255,
    b: (bPrime + m) * 255,
  };
};

const hexToHsv = (value: string): HsvColor => {
  const { r, g, b } = hexToRgb(value);
  return rgbToHsv(r, g, b);
};

const hsvToHex = ({ h, s, v }: HsvColor): string => {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b).toLowerCase();
};

interface ColorPickerPopoverProps {
  value: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onColorChange: (value: string) => void;
}

const ColorPickerPopover = ({
  value,
  inputValue,
  onInputChange,
  onColorChange,
}: ColorPickerPopoverProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const hueBarRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const isHueDraggingRef = useRef(false);
  const [activeHue, setActiveHue] = useState(() => hexToHsv(value).h);
  const hsv = hexToHsv(value);
  const displayHue = hsv.s === 0 || hsv.v === 0 ? activeHue : hsv.h;

  useEffect(() => {
    if (hsv.s > 0 && hsv.v > 0) {
      setActiveHue(hsv.h);
    }
  }, [hsv.h, hsv.s, hsv.v]);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const saturation = clamp((clientX - rect.left) / rect.width, 0, 1);
    const brightness = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    onColorChange(hsvToHex({ h: displayHue, s: saturation, v: brightness }));
  };

  const updateHueFromPointer = (clientX: number) => {
    const hueBar = hueBarRef.current;
    if (!hueBar) return;
    const rect = hueBar.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextHue = ratio * 360;
    setActiveHue(nextHue);
    onColorChange(hsvToHex({ h: nextHue, s: hsv.s, v: hsv.v }));
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (isDraggingRef.current) {
        updateFromPointer(event.clientX, event.clientY);
      }
      if (isHueDraggingRef.current) {
        updateHueFromPointer(event.clientX);
      }
    };
    const handlePointerUp = () => {
      isDraggingRef.current = false;
      isHueDraggingRef.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  });

  return (
    <div className="absolute left-0 top-full mt-3 w-[18.5rem] rounded-[1.2rem] border border-white/10 bg-[#101826]/97 p-3.5 shadow-[0_26px_80px_rgba(0,0,0,0.52)] backdrop-blur-xl z-20">
      <div
        ref={panelRef}
        role="presentation"
        onPointerDown={(event) => {
          isDraggingRef.current = true;
          updateFromPointer(event.clientX, event.clientY);
        }}
        className="relative mb-3 h-40 w-full cursor-crosshair border border-white/12 shadow-inner touch-none"
        style={{ backgroundColor: `hsl(${displayHue} 100% 50%)` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.7)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: value,
          }}
        />
      </div>

      <div
        ref={hueBarRef}
        role="presentation"
        onPointerDown={(event) => {
          isHueDraggingRef.current = true;
          updateHueFromPointer(event.clientX);
        }}
        className="relative mb-3 h-3 w-full cursor-pointer rounded-full border border-white/10 touch-none"
        style={{
          background:
            'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.78)]"
          style={{
            left: `${(displayHue / 360) * 100}%`,
            backgroundColor: hsvToHex({ h: displayHue, s: 1, v: 1 }),
          }}
        />
      </div>

      <div className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-white/[0.035] px-3 py-2.5">
        <div
          className="h-8 w-8 shrink-0 rounded-[0.8rem] border border-white/15 shadow-inner"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onBlur={(e) => onColorChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onColorChange(inputValue);
            }
          }}
          className="w-full bg-transparent text-sm font-mono uppercase text-white outline-none placeholder:text-slate-500"
          placeholder="#ffffff"
        />
      </div>
    </div>
  );
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

const stripArrowColor = (content: string): string =>
  content.replace(/\s*<style data-nav-arrow-color>[\s\S]*?<\/style>/gi, '');

const AUTO_SLIDE_SCRIPT_REGEX = /\s*<script[^>]*data-auto-slide-config[^>]*>[\s\S]*?<\/script>/gi;

const clampAutoSlideMs = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_SLIDE_MS;
  return Math.min(MAX_AUTO_SLIDE_MS, Math.max(MIN_AUTO_SLIDE_MS, Math.round(value)));
};

const normalizeAutoSlideSecondsInput = (value: string): string => value.replace(/[^\d]/g, '');

const autoSlideMsToSecondsInput = (value: number): string => {
  const seconds = Math.max(1, Math.round(clampAutoSlideMs(value) / 1000));
  return String(seconds);
};

const getAutoSlideMsFromInput = (value: string, fallback: number = DEFAULT_AUTO_SLIDE_MS): number => {
  const trimmed = normalizeAutoSlideSecondsInput(value).trim();
  if (!trimmed) return clampAutoSlideMs(fallback);

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return clampAutoSlideMs(fallback);

  return clampAutoSlideMs(parsed * 1000);
};

const buildAutoSlideScript = (enabled: boolean, intervalMs: number): string => {
  const normalizedIntervalMs = clampAutoSlideMs(intervalMs);
  const autoSlideValue = enabled ? normalizedIntervalMs : 0;

  return `<script data-auto-slide-config data-auto-slide-enabled="${enabled ? 'true' : 'false'}" data-auto-slide-ms="${normalizedIntervalMs}">
(function() {
  var autoSlideEnabled = ${enabled ? 'true' : 'false'};
  var baseAutoSlideMs = ${normalizedIntervalMs};
  var currentCycleMs = baseAutoSlideMs;
  var remainingAutoSlideMs = baseAutoSlideMs;
  var cycleStartedAt = null;
  var pendingCycleSyncId = 0;

  function isTypingTarget(target) {
    if (!target || !(target instanceof HTMLElement)) return false;
    var tagName = target.tagName;
    return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  function getReveal() {
    return typeof Reveal !== 'undefined' ? Reveal : null;
  }

  function getRevealConfig() {
    var reveal = getReveal();
    return reveal && reveal.getConfig ? reveal.getConfig() : null;
  }

  function parseAutoSlideMs(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function getCurrentAutoSlideMs() {
    var reveal = getReveal();
    var currentSlide = reveal && reveal.getCurrentSlide ? reveal.getCurrentSlide() : null;
    if (!currentSlide) return baseAutoSlideMs;

    var fragment = currentSlide.querySelector('.current-fragment[data-autoslide]');
    var fragmentAutoSlide = fragment ? parseAutoSlideMs(fragment.getAttribute('data-autoslide'), 0) : 0;
    if (fragmentAutoSlide > 0) return fragmentAutoSlide;

    var slideAutoSlide = parseAutoSlideMs(currentSlide.getAttribute('data-autoslide'), 0);
    if (slideAutoSlide > 0) return slideAutoSlide;

    var parentNode = currentSlide.parentNode;
    var parentAutoSlide = parentNode && parentNode.getAttribute
      ? parseAutoSlideMs(parentNode.getAttribute('data-autoslide'), 0)
      : 0;
    if (parentAutoSlide > 0) return parentAutoSlide;

    var nextDuration = baseAutoSlideMs;
    if (currentSlide.querySelectorAll('.fragment').length === 0) {
      currentSlide.querySelectorAll('video[data-autoplay], audio[data-autoplay]').forEach(function(el) {
        var mediaDuration = Number(el.duration);
        var playbackRate = Number(el.playbackRate) || 1;
        if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
          var mediaAutoSlide = (mediaDuration * 1000 / playbackRate) + 1000;
          if (mediaAutoSlide > nextDuration) {
            nextDuration = mediaAutoSlide;
          }
        }
      });
    }

    return nextDuration;
  }

  function setConfiguredAutoSlide(ms) {
    var reveal = getReveal();
    if (!reveal || !reveal.configure) return;
    reveal.configure({
      autoSlide: ms,
      autoSlideStoppable: true
    });
  }

  function syncCycleAfterRevealTick(nextDuration) {
    pendingCycleSyncId += 1;
    var syncId = pendingCycleSyncId;

    setTimeout(function() {
      if (syncId !== pendingCycleSyncId) return;

      var reveal = getReveal();
      var isAutoSliding = !!(reveal && reveal.isAutoSliding && reveal.isAutoSliding());
      currentCycleMs = parseAutoSlideMs(nextDuration, getCurrentAutoSlideMs());
      remainingAutoSlideMs = currentCycleMs;
      cycleStartedAt = isAutoSliding ? Date.now() : null;
      setConfiguredAutoSlide(baseAutoSlideMs);
    }, 0);
  }

  function rememberPauseProgress() {
    if (!cycleStartedAt) {
      currentCycleMs = getCurrentAutoSlideMs();
      remainingAutoSlideMs = currentCycleMs;
      return;
    }

    var elapsed = Date.now() - cycleStartedAt;
    currentCycleMs = parseAutoSlideMs(currentCycleMs, baseAutoSlideMs);
    remainingAutoSlideMs = Math.max(1, currentCycleMs - elapsed);
    cycleStartedAt = null;
  }

  function handleAutoSlideShortcut(event) {
    if (!autoSlideEnabled) return;
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;

    if (event.keyCode === 32 && !event.shiftKey) {
      if (typeof Reveal !== 'undefined' && Reveal.toggleAutoSlide) {
        event.preventDefault();
        event.stopPropagation();
        Reveal.toggleAutoSlide();
      }
      return;
    }

    if (event.keyCode === 65 && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function applyOpenSlidesAutoSlide() {
    if (typeof Reveal === 'undefined' || !Reveal.configure) return false;
    Reveal.configure({
      autoSlide: ${autoSlideValue},
      autoSlideStoppable: true
    });
    currentCycleMs = getCurrentAutoSlideMs();
    remainingAutoSlideMs = currentCycleMs;
    cycleStartedAt = autoSlideEnabled ? Date.now() : null;
    return true;
  }

  if (autoSlideEnabled) {
    document.addEventListener('autoslidepaused', function() {
      rememberPauseProgress();
    });

    document.addEventListener('autoslideresumed', function() {
      var resumeDuration = Math.max(1, parseAutoSlideMs(remainingAutoSlideMs, getCurrentAutoSlideMs()));
      setConfiguredAutoSlide(resumeDuration);
      var reveal = getReveal();
      if (reveal && reveal.resumeAutoSlide) {
        reveal.resumeAutoSlide();
      }
      syncCycleAfterRevealTick(resumeDuration);
    });

    document.addEventListener('slidechanged', function() {
      syncCycleAfterRevealTick(getCurrentAutoSlideMs());
    });

    document.addEventListener('fragmentshown', function() {
      syncCycleAfterRevealTick(getCurrentAutoSlideMs());
    });

    document.addEventListener('fragmenthidden', function() {
      syncCycleAfterRevealTick(getCurrentAutoSlideMs());
    });
  }

  if (!applyOpenSlidesAutoSlide()) {
    window.addEventListener('load', function() {
      if (applyOpenSlidesAutoSlide() && autoSlideEnabled) {
        syncCycleAfterRevealTick(getCurrentAutoSlideMs());
      }
    }, { once: true });
  }
  else if (autoSlideEnabled) {
    syncCycleAfterRevealTick(getCurrentAutoSlideMs());
  }

  document.addEventListener('keydown', handleAutoSlideShortcut, true);
})();
<\/script>`;
};

const getAutoSlideSelection = (content: string): { enabled: boolean; intervalMs: number } => {
  const markerMatch = content.match(/<script[^>]*data-auto-slide-config[^>]*>/i)?.[0];
  if (markerMatch) {
    const enabledMatch = markerMatch.match(/data-auto-slide-enabled="(true|false)"/i);
    const intervalMatch = markerMatch.match(/data-auto-slide-ms="(\d+)"/i);
    const intervalMs = clampAutoSlideMs(Number(intervalMatch?.[1] || DEFAULT_AUTO_SLIDE_MS));
    return {
      enabled: enabledMatch?.[1]?.toLowerCase() === 'true',
      intervalMs,
    };
  }

  const configMatch = content.match(/\bautoSlide\s*:\s*(false|\d+)/i);
  if (!configMatch) {
    return { enabled: false, intervalMs: DEFAULT_AUTO_SLIDE_MS };
  }

  if (configMatch[1].toLowerCase() === 'false') {
    return { enabled: false, intervalMs: DEFAULT_AUTO_SLIDE_MS };
  }

  const intervalMs = clampAutoSlideMs(Number(configMatch[1]));
  return {
    enabled: intervalMs > 0,
    intervalMs,
  };
};

const applyAutoSlide = (content: string, enabled: boolean, intervalMs: number): string => {
  const cleaned = content.replace(AUTO_SLIDE_SCRIPT_REGEX, '');
  const scriptTag = buildAutoSlideScript(enabled, intervalMs);

  if (cleaned.includes('</body>')) {
    return cleaned.replace('</body>', `  ${scriptTag}\n</body>`);
  }

  return `${cleaned}\n${scriptTag}`;
};

const ensureRevealNotesSupport = (html: string): string => {
  let result = html;
  const hasNotesScript = /plugin\/notes\/notes\.js/.test(result);
  const hasRevealNotesPlugin = /plugins\s*:\s*\[[\s\S]*?RevealNotes[\s\S]*?\]/.test(result);

  if (!hasNotesScript) {
    const revealScriptPattern = /<script[^>]*src=["'][^"']*reveal\.js(?:@[^"']+)?\/dist\/reveal\.js["'][^>]*><\/script>/i;
    if (revealScriptPattern.test(result)) {
      result = result.replace(revealScriptPattern, (match) => `${match}\n  ${REVEAL_NOTES_SCRIPT}`);
    } else if (result.includes('</body>')) {
      result = result.replace('</body>', `  ${REVEAL_NOTES_SCRIPT}\n</body>`);
    } else {
      result = `${result}\n${REVEAL_NOTES_SCRIPT}`;
    }
  }

  if (hasRevealNotesPlugin) {
    return result;
  }

  if (/plugins\s*:\s*\[/.test(result)) {
    return result.replace(/plugins\s*:\s*\[([\s\S]*?)\]/, (match, plugins) => {
      const trimmed = plugins.trim();
      if (!trimmed) return 'plugins: [RevealNotes]';
      const separator = trimmed.endsWith(',') ? '' : ', ';
      return `plugins: [${trimmed}${separator}RevealNotes]`;
    });
  }

  if (/Reveal\.initialize\s*\(\s*\{/.test(result)) {
    return result.replace(/Reveal\.initialize\s*\(\s*\{/, `Reveal.initialize({\n      plugins: [RevealNotes],`);
  }

  return result;
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

/**
 * Inline external <link rel="stylesheet"> and <script src="..."> tags
 * by fetching their content and embedding it directly in the HTML.
 * This makes the downloaded file fully self-contained and viewable offline.
 */
const inlineExternalResources = async (html: string): Promise<string> => {
  let result = html;

  // Inline CSS: <link rel="stylesheet" href="https://...">
  // Also resolves relative url() references (e.g. font files) into base64 data URIs
  const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*\/?>/gi;
  const cssMatches = [...html.matchAll(cssRegex)];
  for (const match of cssMatches) {
    const fullTag = match[0];
    const url = match[1];
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      let css = await resp.text();

      // Resolve relative url() references within the CSS (fonts, images, etc.)
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const urlRefs = [...css.matchAll(/url\(["']?(?!data:)(\.\.\/[^"')]+|(?!https?:\/\/)[^"')]+)["']?\)/g)];
      for (const ref of urlRefs) {
        const relPath = ref[1];
        const absUrl = new URL(relPath, baseUrl).href;
        try {
          const fontResp = await fetch(absUrl);
          if (!fontResp.ok) continue;
          const blob = await fontResp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          css = css.split(ref[0]).join(`url("${dataUrl}")`);
        } catch {
          // Keep original URL if fetch fails
        }
      }

      result = result.replace(fullTag, `<style data-inlined-from="${url}">\n${css}\n</style>`);
    } catch {
      // Keep original link if fetch fails
    }
  }

  // Inline JS: <script src="https://..."></script>
  // Use base64 data URIs to avoid </script> parsing issues with minified JS
  const jsRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*><\/script>/gi;
  const jsMatches = [...html.matchAll(jsRegex)];
  for (const match of jsMatches) {
    const fullTag = match[0];
    const url = match[1];
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const js = await resp.text();
      const encoded = btoa(unescape(encodeURIComponent(js)));
      result = result.replace(fullTag, `<script src="data:text/javascript;base64,${encoded}"><\/script>`);
    } catch {
      // Keep original script if fetch fails
    }
  }

  return result;
};

// Cache for fetched CDN resources: URL → inlined replacement tag.
// Persists across renders so external resources are only fetched once per session.
const _resourceCache = new Map<string, string>();

const inlineExternalResourcesCached = async (html: string): Promise<string> => {
  let result = html;

  // Inline CSS
  const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*\/?>/gi;
  for (const match of [...html.matchAll(cssRegex)]) {
    const fullTag = match[0];
    const url = match[1];
    if (_resourceCache.has(url)) {
      result = result.replace(fullTag, _resourceCache.get(url)!);
      continue;
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      let css = await resp.text();
      // Resolve relative url() references (fonts, images)
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const urlRefs = [...css.matchAll(/url\(["']?(?!data:)(\.\.\/[^"')]+|(?!https?:\/\/)[^"')]+)["']?\)/g)];
      for (const ref of urlRefs) {
        const absUrl = new URL(ref[1], baseUrl).href;
        try {
          const fontResp = await fetch(absUrl);
          if (!fontResp.ok) continue;
          const blob = await fontResp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          css = css.split(ref[0]).join(`url("${dataUrl}")`);
        } catch { /* keep original */ }
      }
      const replacement = `<style data-inlined-from="${url}">\n${css}\n</style>`;
      _resourceCache.set(url, replacement);
      result = result.replace(fullTag, replacement);
    } catch { /* keep original */ }
  }

  // Inline JS
  const jsRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*><\/script>/gi;
  for (const match of [...html.matchAll(jsRegex)]) {
    const fullTag = match[0];
    const url = match[1];
    if (_resourceCache.has(url)) {
      result = result.replace(fullTag, _resourceCache.get(url)!);
      continue;
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const js = await resp.text();
      const encoded = btoa(unescape(encodeURIComponent(js)));
      const replacement = `<script src="data:text/javascript;base64,${encoded}"><\/script>`;
      _resourceCache.set(url, replacement);
      result = result.replace(fullTag, replacement);
    } catch { /* keep original */ }
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
    let result = ensureRevealNotesSupport(content);
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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/reveal.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
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
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/reveal.js"><\/script>
  ${REVEAL_NOTES_SCRIPT}
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
      transition: 'slide',
      plugins: [RevealNotes]
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
  const [codeScrollTop, setCodeScrollTop] = useState(0);
  const [sectionTransition, setSectionTransition] = useState<SectionTransition>('default');
  const [arrowColor, setArrowColor] = useState<string>(DEFAULT_ARROW_COLOR);
  const [arrowColorInput, setArrowColorInput] = useState<string>(DEFAULT_ARROW_COLOR);
  const [isAutoPlayEnabled, setIsAutoPlayEnabled] = useState(false);
  const [autoPlaySecondsInput, setAutoPlaySecondsInput] = useState<string>(autoSlideMsToSecondsInput(DEFAULT_AUTO_SLIDE_MS));
  const [isArrowColorOpen, setIsArrowColorOpen] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [overflowSlides, setOverflowSlides] = useState<{index: number; title: string}[]>([]);
  const { t } = useLanguage();
  const { useChinaCDN } = useCDN();
  const arrowColorPopoverRef = useRef<HTMLDivElement | null>(null);
  const editorFrameRef = useRef<HTMLIFrameElement | null>(null);
  const inlineEditorLabels = {
    clickToEdit: t('slidePreview.clickToEdit'),
    savedButton: t('slidePreview.savedButton'),
    saveButton: t('slidePreview.saveButton'),
    unsavedChanges: t('slidePreview.unsavedChanges'),
    savedStatus: t('slidePreview.savedStatus'),
    textColor: t('slidePreview.textColor'),
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
  const autoPlayIntervalMs = getAutoSlideMsFromInput(autoPlaySecondsInput);
  const contentWithSectionTransition = applySectionTransition(localContent, sectionTransition);
  const normalizedContent = applyArrowColor(
    applyAutoSlide(
      contentWithSectionTransition,
      isAutoPlayEnabled,
      autoPlayIntervalMs
    ),
    arrowColor
  );
  // For the editor iframe, strip both arrow color and transition so changes
  // are applied via postMessage without causing an iframe reload/flash.
  const strippedTransitionContent = applySectionTransition(localContent, 'default');
  const editorPreviewContent = applyArrowColor(
    applyAutoSlide(
      strippedTransitionContent,
      false,
      autoPlayIntervalMs
    ),
    arrowColor
  );
  const editorFrameContent = stripArrowColor(editorPreviewContent);

  // Pre-inline external CDN resources for the editor iframe so it doesn't
  // depend on network access to CDNs (which may be slow/blocked without VPN).
  const [inlinedEditorContent, setInlinedEditorContent] = useState<string>(editorFrameContent);
  useEffect(() => {
    let cancelled = false;
    const content = useChinaCDN ? applyChinaCDN(editorFrameContent) : editorFrameContent;
    inlineExternalResourcesCached(content).then(inlined => {
      if (!cancelled) setInlinedEditorContent(inlined);
    });
    return () => { cancelled = true; };
  }, [editorFrameContent, useChinaCDN]);

  const createPresentDocument = (html: string): string | null => {
    const docKey = `openslides_present_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      sessionStorage.setItem(docKey, html);
      return docKey;
    } catch {
      return null;
    }
  };

  // Sync slidesData → localContent
  useEffect(() => {
    if (slidesData) {
      // Extract content from markdown code block if present
      const codeBlockMatch = slidesData.match(/```html([\s\S]*?)```/i);
      const extracted = codeBlockMatch ? codeBlockMatch[1].trim() : slidesData;
      setLocalContent(extracted);
      setSectionTransition(getSectionTransitionSelection(extracted));
      const nextArrowColor = getArrowColorSelection(extracted);
      const nextAutoSlide = getAutoSlideSelection(extracted);
      setArrowColor(nextArrowColor);
      setArrowColorInput(nextArrowColor);
      setIsAutoPlayEnabled(nextAutoSlide.enabled);
      setAutoPlaySecondsInput(autoSlideMsToSecondsInput(nextAutoSlide.intervalMs));
    } else {
      setLocalContent(PLACEHOLDER_SLIDES);
      setSectionTransition(getSectionTransitionSelection(PLACEHOLDER_SLIDES));
      const nextArrowColor = getArrowColorSelection(PLACEHOLDER_SLIDES);
      const nextAutoSlide = getAutoSlideSelection(PLACEHOLDER_SLIDES);
      setArrowColor(nextArrowColor);
      setArrowColorInput(nextArrowColor);
      setIsAutoPlayEnabled(nextAutoSlide.enabled);
      setAutoPlaySecondsInput(autoSlideMsToSecondsInput(nextAutoSlide.intervalMs));
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
      const editorFrame = editorFrameRef.current;
      if (!editorFrame || e.source !== editorFrame.contentWindow) {
        return;
      }

      if (e.data?.type === 'inline-editor-save' && e.data.html) {
        const updatedContent = applyArrowColor(
          applyAutoSlide(
            applySectionTransition(e.data.html, sectionTransition),
            isAutoPlayEnabled,
            autoPlayIntervalMs
          ),
          arrowColor
        );
        setLocalContent(updatedContent);
        if (onEditorChange) onEditorChange(updatedContent);
      }
      if (e.data?.type === 'overflow-detected') {
        setOverflowSlides(e.data.slides || []);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [arrowColor, autoPlayIntervalMs, isAutoPlayEnabled, onEditorChange, sectionTransition]);

  const postArrowColorToEditor = (color: string) => {
    const editorFrame = editorFrameRef.current;
    if (!editorFrame?.contentWindow) return;

    editorFrame.contentWindow.postMessage(
      {
        type: 'inline-editor-set-arrow-color',
        color,
      },
      '*'
    );
  };

  useEffect(() => {
    if (viewMode !== 'editor') return;
    postArrowColorToEditor(arrowColor);
  }, [arrowColor, viewMode]);

  const postTransitionToEditor = (transition: string) => {
    const editorFrame = editorFrameRef.current;
    if (!editorFrame?.contentWindow) return;
    editorFrame.contentWindow.postMessage(
      { type: 'inline-editor-set-transition', transition },
      '*'
    );
  };

  useEffect(() => {
    if (viewMode !== 'editor') return;
    postTransitionToEditor(sectionTransition);
  }, [sectionTransition, viewMode]);

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

  const commitAutoPlayConfig = (enabled: boolean, secondsValue: string) => {
    const nextIntervalMs = getAutoSlideMsFromInput(secondsValue);
    const normalizedSeconds = autoSlideMsToSecondsInput(nextIntervalMs);

    setIsAutoPlayEnabled(enabled);
    setAutoPlaySecondsInput(normalizedSeconds);
    setLocalContent((prev) => {
      const updated = applyAutoSlide(prev, enabled, nextIntervalMs);
      if (onEditorChange && updated !== prev) {
        onEditorChange(updated);
      }
      return updated;
    });
  };

  const handleAutoPlayToggle = (enabled: boolean) => {
    commitAutoPlayConfig(enabled, autoPlaySecondsInput);
  };

  const handleAutoPlaySecondsKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    commitAutoPlayConfig(isAutoPlayEnabled, autoPlaySecondsInput);
  };

  const handlePresent = () => {
    const content = normalizedContent;
    let html = makeImageUrlsAbsolute(buildPresentationHtml(content));
    if (useChinaCDN) html = applyChinaCDN(html);
    const docKey = createPresentDocument(html);
    if (!docKey) {
      window.alert('Unable to prepare presentation HTML for presenting.');
      return;
    }

    const presentWindow = window.open(
      `/present?docKey=${encodeURIComponent(docKey)}&ts=${Date.now()}`,
      '_blank'
    );
    if (!presentWindow) {
      window.alert('Unable to open the presentation tab. Please allow pop-ups for this site.');
    }
  };

  const handleDownload = async () => {
    const content = normalizedContent;
    // Make URLs absolute, inline images as base64, inline external CSS/JS for fully standalone file
    let html = makeImageUrlsAbsolute(buildPresentationHtml(content));
    if (useChinaCDN) html = applyChinaCDN(html);
    html = await inlineImages(html);
    html = await inlineExternalResources(html);

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectId ? `${projectId}_presentation.html` : 'presentation.html';
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
            title="Open presentation in a new tab"
          >
            <Play size={14} />
            <span>{t('slidePreview.present')}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            title={t('slidePreview.download')}
          >
            <Download size={14} />
            <span>{t('slidePreview.download')}</span>
          </button>
        </div>
      </div>

      {viewMode === "editor" && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-b border-border bg-panel/80 relative">
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
              onClick={() => {
                setArrowColorInput(arrowColor);
                setIsArrowColorOpen((open) => !open);
              }}
              className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#111827]/72 px-3 py-2 text-sm text-white transition-all hover:border-white/20 hover:bg-[#162033]"
            >
              <div
                className="h-5 w-5 rounded-lg border border-white/20 shadow-inner"
                style={{ backgroundColor: arrowColor }}
              />
              <span className="font-mono text-sm uppercase text-white">{arrowColor}</span>
              <Palette size={15} className="text-slate-400 transition-colors group-hover:text-slate-200" />
            </button>

            {isArrowColorOpen && (
              <ColorPickerPopover
                value={arrowColor}
                inputValue={arrowColorInput}
                onInputChange={setArrowColorInput}
                onColorChange={(value) => {
                  handleArrowColorChange(value);
                  setArrowColorInput(normalizeHexColor(value, arrowColor));
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-300">
            <label className="flex items-center gap-2">
              <span className="text-gray-400">{t('slidePreview.autoPlay')}</span>
              <input
                type="checkbox"
                checked={isAutoPlayEnabled}
                onChange={(e) => handleAutoPlayToggle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-gray-400">{t('slidePreview.everySeconds')}</span>
              <input
                type="number"
                min={1}
                max={Math.floor(MAX_AUTO_SLIDE_MS / 1000)}
                step={1}
                inputMode="numeric"
                value={autoPlaySecondsInput}
                onChange={(e) => setAutoPlaySecondsInput(normalizeAutoSlideSecondsInput(e.target.value))}
                onBlur={() => {
                  if (isAutoPlayEnabled) {
                    commitAutoPlayConfig(true, autoPlaySecondsInput);
                  } else {
                    setAutoPlaySecondsInput(autoSlideMsToSecondsInput(getAutoSlideMsFromInput(autoPlaySecondsInput)));
                  }
                }}
                onKeyDown={handleAutoPlaySecondsKeyDown}
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isAutoPlayEnabled}
              />
            </label>
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
                ref={editorFrameRef}
                title="Slide Editor"
                srcDoc={injectInlineEditor(inlinedEditorContent, inlineEditorLabels)}
                onLoad={() => { postArrowColorToEditor(arrowColor); postTransitionToEditor(sectionTransition); }}
                style={{
                  border: 0,
                  borderRadius: '8px',
                  width: '100%',
                  aspectRatio: '16/9',
                  maxHeight: '100%',
                }}
                sandbox="allow-scripts"
              />
            </div>
          </div>
        ) : viewMode === "code" ? (
          <CodeEditor code={localContent} onChange={setLocalContent} initialScrollTop={codeScrollTop} onScrollChange={setCodeScrollTop} />
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

    </div>
  );
}
