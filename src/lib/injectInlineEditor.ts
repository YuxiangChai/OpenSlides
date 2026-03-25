/**
 * Injects inline text editing capabilities into a complete HTML presentation.
 * Makes text elements contenteditable with visual feedback, and communicates
 * changes back to the parent React component via postMessage.
 */
interface InlineEditorLabels {
  clickToEdit: string;
  savedButton: string;
  saveButton: string;
  unsavedChanges: string;
  savedStatus: string;
  textColor: string;
}

const DEFAULT_LABELS: InlineEditorLabels = {
  clickToEdit: 'Click any text to edit',
  savedButton: 'Saved',
  saveButton: 'Save',
  unsavedChanges: 'Unsaved changes',
  savedStatus: 'Saved!',
  textColor: 'Text Color',
};

export function injectInlineEditor(html: string, labels: InlineEditorLabels = DEFAULT_LABELS): string {
  const localizedLabels = { ...DEFAULT_LABELS, ...labels };
  const editorStyles = `
<style data-inline-editor>
  /* Make slides scrollable when content overflows */
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
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
  .reveal .slides section::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4);
  }
  [contenteditable] {
    outline: 2px dashed transparent;
    outline-offset: 2px;
    transition: outline-color 0.15s;
    cursor: text;
    border-radius: 3px;
  }
  [contenteditable]:hover {
    outline-color: rgba(76, 175, 80, 0.35);
  }
  [contenteditable]:focus {
    outline-color: #4CAF50;
    outline-style: solid;
  }
  .inline-editor-toolbar {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(30, 30, 30, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 6px 12px;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 12px;
    color: #ccc;
  }
  .inline-editor-toolbar button {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    color: #fff;
    padding: 4px 12px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
  }
  .inline-editor-toolbar button:hover {
    background: rgba(255,255,255,0.2);
  }
  .inline-editor-toolbar button.save-btn {
    background: #4CAF50;
    border-color: #4CAF50;
  }
  .inline-editor-toolbar button.save-btn:hover {
    background: #43A047;
  }
  .inline-editor-toolbar button.save-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .inline-editor-toolbar .status {
    font-size: 11px;
    color: #888;
    margin-right: 4px;
  }
  .inline-editor-toolbar .status.unsaved {
    color: #FFA726;
  }
  .inline-editor-selection-toolbar {
    position: fixed;
    z-index: 100000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(14, 20, 31, 0.94);
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 48px rgba(0,0,0,0.35);
    transform: translate(-50%, -100%);
  }
  .inline-editor-selection-toolbar.is-hidden {
    display: none;
  }
  .inline-editor-selection-toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 36px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    background: rgba(255,255,255,0.04);
    color: #f4f7fb;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, transform 0.15s;
  }
  .inline-editor-selection-toolbar button:hover {
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.16);
  }
  .inline-editor-selection-toolbar button:active {
    transform: translateY(1px);
  }
  .inline-editor-selection-toolbar .color-trigger {
    padding-right: 12px;
  }
  .inline-editor-selection-toolbar .color-preview {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: inset 0 1px 2px rgba(255,255,255,0.12);
  }
  .inline-editor-color-popover {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    width: 280px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(17, 24, 39, 0.97);
    padding: 14px;
    box-shadow: 0 22px 70px rgba(0,0,0,0.45);
  }
  .inline-editor-color-popover.is-hidden {
    display: none;
  }
  .inline-editor-color-popover .current-swatch {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.04);
  }
  .inline-editor-color-popover .current-swatch-chip {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.16);
  }
  .inline-editor-color-popover .color-panel {
    position: relative;
    height: 176px;
    border: 1px solid rgba(255,255,255,0.10);
    cursor: crosshair;
    margin-bottom: 14px;
    box-shadow: inset 0 1px 8px rgba(0,0,0,0.12);
  }
  .inline-editor-color-popover .color-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, #fff 0%, rgba(255,255,255,0) 100%);
  }
  .inline-editor-color-popover .color-panel::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, #000 0%, rgba(0,0,0,0) 100%);
  }
  .inline-editor-color-popover .color-panel-thumb {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(15,23,42,0.72);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .inline-editor-color-popover .hue-input {
    position: relative;
    width: 100%;
    margin: 0 0 14px;
    height: 12px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.10);
    background: linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
    cursor: pointer;
    touch-action: none;
  }
  .inline-editor-color-popover .hue-thumb {
    position: absolute;
    top: 50%;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(15,23,42,0.72);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .inline-editor-color-popover .color-footer {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .inline-editor-color-popover .hex-input {
    flex: 1;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.03);
    color: #fff;
    padding: 10px 12px;
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
    outline: none;
  }
  .inline-editor-color-popover .hex-input:focus {
    border-color: rgba(96,165,250,0.7);
  }
</style>`;

  const editorScript = `
<script data-inline-editor>
(function() {
  var hasChanges = false;
  var labels = ${JSON.stringify(localizedLabels)};
  var selectionRange = null;
  var currentTextColor = '#ffffff';
  var suppressSelectionRefresh = false;
  var colorDragActive = false;
  var hueDragActive = false;
  var currentHsv = { h: 0, s: 0, v: 1 };

  function normalizeHexColor(value, fallback) {
    fallback = fallback || '#ffffff';
    var trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return ('#' + trimmed).toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      return ('#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]).toLowerCase();
    }
    var rgbMatch = trimmed.match(/^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
    if (rgbMatch) {
      var r = Math.max(0, Math.min(255, Number(rgbMatch[1])));
      var g = Math.max(0, Math.min(255, Number(rgbMatch[2])));
      var b = Math.max(0, Math.min(255, Number(rgbMatch[3])));
      return '#' + [r, g, b].map(function(part) {
        return part.toString(16).padStart(2, '0');
      }).join('');
    }
    return fallback.toLowerCase();
  }

  function buildArrowColorStyle(color) {
    return '<style data-nav-arrow-color>' +
      '.reveal .controls,' +
      '.reveal .controls button,' +
      '.reveal .controls .navigate-left,' +
      '.reveal .controls .navigate-right,' +
      '.reveal .controls .navigate-up,' +
      '.reveal .controls .navigate-down,' +
      '.reveal .controls .navigate-prev,' +
      '.reveal .controls .navigate-next {' +
      'color: ' + color + ' !important;' +
      '}' +
      '.reveal .controls .enabled {' +
      'color: ' + color + ' !important;' +
      '}' +
      '</style>';
  }

  function applyArrowColor(color) {
    var normalized = normalizeHexColor(color, '#ffffff');
    var existing = document.querySelector('style[data-nav-arrow-color]');
    if (existing) {
      existing.remove();
    }
    document.head.insertAdjacentHTML('beforeend', buildArrowColorStyle(normalized));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hexToRgb(value) {
    var normalized = normalizeHexColor(value, '#ffffff');
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(part) {
      return clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0');
    }).join('');
  }

  function rgbToHsv(r, g, b) {
    var rn = r / 255;
    var gn = g / 255;
    var bn = b / 255;
    var max = Math.max(rn, gn, bn);
    var min = Math.min(rn, gn, bn);
    var delta = max - min;
    var h = 0;

    if (delta !== 0) {
      if (max === rn) h = ((gn - bn) / delta) % 6;
      else if (max === gn) h = ((bn - rn) / delta) + 2;
      else h = ((rn - gn) / delta) + 4;
      h *= 60;
      if (h < 0) h += 360;
    }

    return {
      h: h,
      s: max === 0 ? 0 : delta / max,
      v: max
    };
  }

  function hsvToRgb(h, s, v) {
    var hue = ((h % 360) + 360) % 360;
    var chroma = v * s;
    var x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    var m = v - chroma;
    var rPrime = 0;
    var gPrime = 0;
    var bPrime = 0;

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
      b: (bPrime + m) * 255
    };
  }

  function hexToHsv(value) {
    var rgb = hexToRgb(value);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  }

  function hsvToHex(hsv) {
    var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return rgbToHex(rgb.r, rgb.g, rgb.b).toLowerCase();
  }

  function markDirty() {
    hasChanges = true;
    statusEl.textContent = labels.unsavedChanges;
    statusEl.className = 'status unsaved';
    saveBtn.disabled = false;
    saveBtn.textContent = labels.saveButton;
  }

  function getEditableRoot(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.closest('[contenteditable="true"]');
    }
    return node.parentElement ? node.parentElement.closest('[contenteditable="true"]') : null;
  }

  function isSelectionEditable(range) {
    if (!range) return false;
    var startRoot = getEditableRoot(range.startContainer);
    var endRoot = getEditableRoot(range.endContainer);
    return !!startRoot && startRoot === endRoot;
  }

  function getSelectionColor(node) {
    var target = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!target || !(target instanceof HTMLElement)) {
      return '#ffffff';
    }
    return normalizeHexColor(window.getComputedStyle(target).color, '#ffffff');
  }

  function restoreSelection() {
    if (!selectionRange) return false;
    var selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(selectionRange);
    return true;
  }

  // Toolbar
  var toolbar = document.createElement('div');
  toolbar.className = 'inline-editor-toolbar';
  toolbar.setAttribute('data-inline-editor', 'true');
  toolbar.innerHTML =
    '<span class="status">' + labels.clickToEdit + '</span>' +
    '<button class="save-btn" disabled onclick="saveChanges()">' + labels.savedButton + '</button>';
  document.body.appendChild(toolbar);

  var statusEl = toolbar.querySelector('.status');
  var saveBtn = toolbar.querySelector('.save-btn');

  var selectionToolbar = document.createElement('div');
  selectionToolbar.className = 'inline-editor-selection-toolbar is-hidden';
  selectionToolbar.setAttribute('data-inline-editor', 'true');
  selectionToolbar.innerHTML =
    '<div class="color-picker-anchor" style="position: relative;">' +
      '<button type="button" class="color-trigger" data-action="toggle-color" title="' + labels.textColor + '">' +
        '<span class="color-preview"></span>' +
        '<span>' + labels.textColor + '</span>' +
      '</button>' +
      '<div class="inline-editor-color-popover is-hidden">' +
        '<div class="color-panel"><div class="color-panel-thumb"></div></div>' +
        '<div class="hue-input"><div class="hue-thumb"></div></div>' +
        '<div class="color-footer">' +
          '<div class="current-swatch"><div class="current-swatch-chip"></div></div>' +
          '<input type="text" class="hex-input" value="#FFFFFF" placeholder="#FFFFFF" />' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(selectionToolbar);

  var colorTrigger = selectionToolbar.querySelector('[data-action="toggle-color"]');
  var colorPreview = selectionToolbar.querySelector('.color-preview');
  var colorPopover = selectionToolbar.querySelector('.inline-editor-color-popover');
  var colorPanel = selectionToolbar.querySelector('.color-panel');
  var colorPanelThumb = selectionToolbar.querySelector('.color-panel-thumb');
  var hueInput = selectionToolbar.querySelector('.hue-input');
  var hueThumb = selectionToolbar.querySelector('.hue-thumb');
  var colorChip = selectionToolbar.querySelector('.current-swatch-chip');
  var hexInput = selectionToolbar.querySelector('.hex-input');

  selectionToolbar.addEventListener('mousedown', function(event) {
    event.preventDefault();
  });

  function closeColorPopover() {
    colorPopover.classList.add('is-hidden');
  }

  function updateColorUi(color) {
    currentTextColor = normalizeHexColor(color, currentTextColor);
    var nextHsv = hexToHsv(currentTextColor);
    if (nextHsv.s === 0 || nextHsv.v === 0) {
      nextHsv.h = currentHsv.h;
    }
    currentHsv = nextHsv;
    colorPreview.style.backgroundColor = currentTextColor;
    colorChip.style.backgroundColor = currentTextColor;
    hexInput.value = currentTextColor;
    colorPanel.style.backgroundColor = 'hsl(' + currentHsv.h + ' 100% 50%)';
    colorPanelThumb.style.left = (currentHsv.s * 100) + '%';
    colorPanelThumb.style.top = ((1 - currentHsv.v) * 100) + '%';
    colorPanelThumb.style.backgroundColor = currentTextColor;
    hueThumb.style.left = ((currentHsv.h / 360) * 100) + '%';
    hueThumb.style.backgroundColor = hsvToHex({ h: currentHsv.h, s: 1, v: 1 });
  }

  function toggleSelectionToolbar(visible) {
    selectionToolbar.classList.toggle('is-hidden', !visible);
    if (!visible) {
      closeColorPopover();
    }
  }

  function positionSelectionToolbar(rect) {
    var minX = 90;
    var maxX = window.innerWidth - 90;
    var x = Math.min(maxX, Math.max(minX, rect.left + (rect.width / 2)));
    var y = Math.max(72, rect.top - 14);
    selectionToolbar.style.left = x + 'px';
    selectionToolbar.style.top = y + 'px';
  }

  function refreshSelectionToolbar() {
    if (suppressSelectionRefresh) return;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      selectionRange = null;
      toggleSelectionToolbar(false);
      return;
    }

    var range = selection.getRangeAt(0);
    if (!isSelectionEditable(range)) {
      selectionRange = null;
      toggleSelectionToolbar(false);
      return;
    }

    var rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      toggleSelectionToolbar(false);
      return;
    }

    selectionRange = range.cloneRange();
    updateColorUi(getSelectionColor(range.startContainer));
    positionSelectionToolbar(rect);
    toggleSelectionToolbar(true);
  }

  function applySelectionColor(color) {
    var normalized = normalizeHexColor(color, currentTextColor);
    updateColorUi(normalized);
    if (!restoreSelection()) return;
    suppressSelectionRefresh = true;
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, normalized);
      markDirty();
    } finally {
      suppressSelectionRefresh = false;
      setTimeout(refreshSelectionToolbar, 0);
    }
  }

  function updateColorFromPanel(clientX, clientY) {
    var rect = colorPanel.getBoundingClientRect();
    var saturation = clamp((clientX - rect.left) / rect.width, 0, 1);
    var brightness = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    applySelectionColor(hsvToHex({ h: currentHsv.h, s: saturation, v: brightness }));
  }

  function updateHueFromPointer(clientX) {
    var rect = hueInput.getBoundingClientRect();
    var ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    var nextHue = ratio * 360;
    currentHsv.h = nextHue;
    applySelectionColor(hsvToHex({ h: nextHue, s: currentHsv.s, v: currentHsv.v }));
  }

  colorTrigger.addEventListener('click', function() {
    colorPopover.classList.toggle('is-hidden');
    updateColorUi(currentTextColor);
  });

  colorPanel.addEventListener('pointerdown', function(event) {
    colorDragActive = true;
    updateColorFromPanel(event.clientX, event.clientY);
  });

  hueInput.addEventListener('pointerdown', function(event) {
    hueDragActive = true;
    updateHueFromPointer(event.clientX);
  });

  window.addEventListener('pointermove', function(event) {
    if (colorDragActive) {
      updateColorFromPanel(event.clientX, event.clientY);
    }
    if (hueDragActive) {
      updateHueFromPointer(event.clientX);
    }
  });

  window.addEventListener('pointerup', function() {
    colorDragActive = false;
    hueDragActive = false;
  });

  hexInput.addEventListener('input', function(event) {
    updateColorUi(event.target.value);
  });

  hexInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySelectionColor(hexInput.value);
    }
  });

  hexInput.addEventListener('blur', function() {
    applySelectionColor(hexInput.value);
  });

  // Make text elements editable
  var editableSelector = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';
  var elements = document.querySelectorAll(editableSelector);

  elements.forEach(function(el) {
    // Skip toolbar elements
    if (el.closest('.inline-editor-toolbar')) return;
    // Skip if already has contenteditable=false
    if (el.getAttribute('contenteditable') === 'false') return;
    el.setAttribute('contenteditable', 'true');
  });

  // Track changes
  document.addEventListener('input', function(e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') {
      markDirty();
    }
  });

  // Escape to deselect
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.activeElement) {
      document.activeElement.blur();
    }
    // Ctrl/Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (hasChanges) saveChanges();
    }
  });

  document.addEventListener('selectionchange', refreshSelectionToolbar);
  document.addEventListener('mouseup', function() { setTimeout(refreshSelectionToolbar, 0); });
  document.addEventListener('keyup', function() { setTimeout(refreshSelectionToolbar, 0); });

  document.addEventListener('mousedown', function(event) {
    if (!selectionToolbar.contains(event.target) && !colorPopover.contains(event.target)) {
      closeColorPopover();
    }
  });

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'inline-editor-set-arrow-color' && typeof event.data.color === 'string') {
      applyArrowColor(event.data.color);
    }
  });

  // Save: clone DOM, clean up editor artifacts, post to parent
  window.saveChanges = function() {
    var clone = document.documentElement.cloneNode(true);

    // Remove editor UI
    var editorEls = clone.querySelectorAll('[data-inline-editor], .inline-editor-toolbar');
    editorEls.forEach(function(el) { el.remove(); });

    // Strip contenteditable attributes
    var editables = clone.querySelectorAll('[contenteditable]');
    editables.forEach(function(el) { el.removeAttribute('contenteditable'); });

    var cleanHtml = '<!doctype html>\\n' + clone.outerHTML;

    // Post to parent React component
    window.parent.postMessage({
      type: 'inline-editor-save',
      html: cleanHtml
    }, '*');

    hasChanges = false;
    statusEl.textContent = labels.savedStatus;
    statusEl.className = 'status';
    saveBtn.disabled = true;
    saveBtn.textContent = labels.savedButton;

    setTimeout(function() {
      if (!hasChanges) {
        statusEl.textContent = labels.clickToEdit;
      }
    }, 1500);
  };

  // Warn on unload with unsaved changes
  window.addEventListener('beforeunload', function(e) {
    if (hasChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Overflow detection: check all slides including nested vertical sections.
  // Runs multiple times to catch late-loading content (images, fonts, CSS).
  function checkOverflow() {
    var topSections = document.querySelectorAll('.reveal .slides > section');
    var overflowing = [];
    var slideIndex = 0;

    topSections.forEach(function(section) {
      var nested = section.querySelectorAll(':scope > section');
      if (nested.length > 0) {
        // Vertical slide stack — check each child
        nested.forEach(function(child) {
          slideIndex++;
          checkSection(child, slideIndex, overflowing);
        });
      } else {
        slideIndex++;
        checkSection(section, slideIndex, overflowing);
      }
    });

    window.parent.postMessage({
      type: 'overflow-detected',
      slides: overflowing
    }, '*');
  }

  function checkSection(section, index, overflowing) {
    var isOverflow = false;

    // Check the section itself
    if (section.scrollHeight > section.clientHeight + 5) {
      isOverflow = true;
    }

    // Also check inner containers that may clip overflow (overflow: hidden/auto)
    if (!isOverflow) {
      var children = section.querySelectorAll('*');
      for (var j = 0; j < children.length; j++) {
        var child = children[j];
        var style = window.getComputedStyle(child);
        var ov = style.overflow + style.overflowY;
        if (ov.indexOf('hidden') !== -1 || ov.indexOf('auto') !== -1 || ov.indexOf('scroll') !== -1) {
          if (child.scrollHeight > child.clientHeight + 5) {
            isOverflow = true;
            break;
          }
        }
      }
    }

    if (isOverflow) {
      var titleEl = section.querySelector('h1, h2, h3');
      var title = titleEl ? titleEl.textContent.trim() : '';
      overflowing.push({ index: index, title: title });
    }
  }

  // Wait for Reveal, then check multiple times to catch late layout
  function waitForReveal() {
    if (typeof Reveal !== 'undefined' && Reveal.isReady && Reveal.isReady()) {
      scheduleChecks();
    } else if (typeof Reveal !== 'undefined') {
      Reveal.on('ready', function() { scheduleChecks(); });
    } else {
      setTimeout(waitForReveal, 200);
    }
  }

  function scheduleChecks() {
    // Check at multiple intervals to catch fonts/images loading
    checkOverflow();
    setTimeout(checkOverflow, 500);
    setTimeout(checkOverflow, 1500);
    setTimeout(checkOverflow, 3000);
  }

  setTimeout(waitForReveal, 300);

  // Also re-check when images finish loading
  document.querySelectorAll('img').forEach(function(img) {
    if (!img.complete) {
      img.addEventListener('load', function() { setTimeout(checkOverflow, 100); });
      img.addEventListener('error', function() { setTimeout(checkOverflow, 100); });
    }
  });

  // Re-check on slide change (user navigating may reveal overflow on other slides)
  function waitForRevealEvents() {
    if (typeof Reveal !== 'undefined' && Reveal.on) {
      Reveal.on('slidechanged', function() { setTimeout(checkOverflow, 200); });
    } else {
      setTimeout(waitForRevealEvents, 500);
    }
  }
  waitForRevealEvents();
})();
<\/script>`;

  // Inject before </body>
  if (html.includes('</body>')) {
    return html.replace('</body>', editorStyles + editorScript + '\n</body>');
  }
  // Fallback: append at end
  return html + editorStyles + editorScript;
}
