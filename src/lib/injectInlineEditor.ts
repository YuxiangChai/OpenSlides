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
}

const DEFAULT_LABELS: InlineEditorLabels = {
  clickToEdit: 'Click any text to edit',
  savedButton: 'Saved',
  saveButton: 'Save',
  unsavedChanges: 'Unsaved changes',
  savedStatus: 'Saved!',
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
</style>`;

  const editorScript = `
<script data-inline-editor>
(function() {
  var hasChanges = false;
  var labels = ${JSON.stringify(localizedLabels)};

  // Toolbar
  var toolbar = document.createElement('div');
  toolbar.className = 'inline-editor-toolbar';
  toolbar.innerHTML =
    '<span class="status">' + labels.clickToEdit + '</span>' +
    '<button class="save-btn" disabled onclick="saveChanges()">' + labels.savedButton + '</button>';
  document.body.appendChild(toolbar);

  var statusEl = toolbar.querySelector('.status');
  var saveBtn = toolbar.querySelector('.save-btn');

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
      hasChanges = true;
      statusEl.textContent = labels.unsavedChanges;
      statusEl.className = 'status unsaved';
      saveBtn.disabled = false;
      saveBtn.textContent = labels.saveButton;
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
