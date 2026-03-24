import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  initialScrollTop?: number;
  onScrollChange?: (scrollTop: number) => void;
}

const INDENT_SIZE = 2;
const FONT = "'Fira Code', 'Consolas', 'Monaco', monospace";
const FONT_SIZE = '13px';
const LINE_HEIGHT = '1.5';
const PADDING = 16; // px

export default function CodeEditor({ code, onChange, initialScrollTop = 0, onScrollChange }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<number | { start: number; end: number } | null>(null);
  const [charWidth, setCharWidth] = useState(0);
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  // Measure monospace character width
  useEffect(() => {
    const span = document.createElement('span');
    span.style.fontFamily = FONT;
    span.style.fontSize = FONT_SIZE;
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'pre';
    span.textContent = 'X'.repeat(100);
    document.body.appendChild(span);
    setCharWidth(span.offsetWidth / 100);
    document.body.removeChild(span);
  }, []);

  // Measure wrapped line heights via hidden mirror
  const measureLineHeights = useCallback(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    // Match the mirror width to the textarea's actual content width
    if (textareaRef.current) {
      mirror.style.width = `${textareaRef.current.clientWidth}px`;
    }
    const lines = code.split('\n');
    const heights: number[] = [];
    mirror.innerHTML = '';
    for (const line of lines) {
      const div = document.createElement('div');
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordBreak = 'break-all';
      div.style.fontFamily = FONT;
      div.style.fontSize = FONT_SIZE;
      div.style.lineHeight = LINE_HEIGHT;
      div.style.tabSize = '2';
      div.textContent = line || '\u00A0';
      mirror.appendChild(div);
    }
    for (let i = 0; i < mirror.children.length; i++) {
      heights.push((mirror.children[i] as HTMLElement).getBoundingClientRect().height);
    }
    setLineHeights(heights);
  }, [code]);

  useEffect(() => {
    measureLineHeights();
  }, [code, measureLineHeights]);

  useEffect(() => {
    const observer = new ResizeObserver(() => measureLineHeights());
    if (mirrorRef.current?.parentElement) {
      observer.observe(mirrorRef.current.parentElement);
    }
    return () => observer.disconnect();
  }, [measureLineHeights]);

  // Restore cursor position after content update
  useEffect(() => {
    if (cursor !== null && textareaRef.current) {
      if (typeof cursor === 'number') {
        textareaRef.current.selectionStart = cursor;
        textareaRef.current.selectionEnd = cursor;
      } else {
        textareaRef.current.selectionStart = cursor.start;
        textareaRef.current.selectionEnd = cursor.end;
      }
      setCursor(null);
    }
  }, [code, cursor]);

  // Restore scroll position after line heights are measured
  const hasRestoredScroll = useRef(false);
  useEffect(() => {
    if (!hasRestoredScroll.current && initialScrollTop && lineHeights.length > 0 && textareaRef.current) {
      hasRestoredScroll.current = true;
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.scrollTop = initialScrollTop;
        if (preRef.current) preRef.current.scrollTop = initialScrollTop;
        if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = initialScrollTop;
      });
    }
  }, [lineHeights, initialScrollTop]);

  // Sync scroll positions
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    if (preRef.current) {
      preRef.current.scrollTop = target.scrollTop;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = target.scrollTop;
    }
    onScrollChange?.(target.scrollTop);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const { value, selectionStart, selectionEnd } = target;

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = selectionStart;
      const end = selectionEnd;
      const startLineStart = value.lastIndexOf('\n', start - 1) + 1;
      let endLineEnd = value.indexOf('\n', end);
      if (endLineEnd === -1) endLineEnd = value.length;

      if (end > start && value[end - 1] === '\n') {
        endLineEnd = end - 1;
      }

      const beforeBlock = value.substring(0, startLineStart);
      const block = value.substring(startLineStart, endLineEnd);
      const afterBlock = value.substring(endLineEnd);
      const lines = block.split('\n');

      if (e.shiftKey) {
        const newLines = lines.map(line => {
          if (line.startsWith('  ')) return line.substring(2);
          if (line.startsWith(' ')) return line.substring(1);
          return line;
        });
        onChange(beforeBlock + newLines.join('\n') + afterBlock);
        setCursor({
          start: startLineStart,
          end: startLineStart + newLines.join('\n').length + (end > start && value[end - 1] === '\n' ? 1 : 0)
        });
      } else {
        if (start === end) {
          onChange(value.substring(0, start) + "  " + value.substring(end));
          setCursor(start + 2);
          return;
        }
        const newLines = lines.map(line => "  " + line);
        onChange(beforeBlock + newLines.join('\n') + afterBlock);
        setCursor({
          start: startLineStart,
          end: startLineStart + newLines.join('\n').length + (end > start && value[end - 1] === '\n' ? 1 : 0)
        });
      }
      return;
    }

    if (e.key === '>') {
      const textBefore = value.substring(0, selectionStart);
      const lastOpenBracket = textBefore.lastIndexOf('<');
      if (lastOpenBracket !== -1) {
        const potentialTag = textBefore.substring(lastOpenBracket + 1);
        if (!potentialTag.startsWith('/')) {
          const tagMatch = potentialTag.match(/^([a-zA-Z0-9-]+)/);
          if (tagMatch && potentialTag.indexOf('>') === -1) {
            e.preventDefault();
            const tagName = tagMatch[1];
            const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
            if (voidTags.includes(tagName.toLowerCase())) {
              onChange(value.substring(0, selectionStart) + ">" + value.substring(selectionEnd));
              setCursor(selectionStart + 1);
            } else {
              onChange(value.substring(0, selectionStart) + `></${tagName}>` + value.substring(selectionEnd));
              setCursor(selectionStart + 1);
            }
          }
        }
      }
    }
  };

  const lines = code.split('\n');
  const defaultLineH = 13 * 1.5;

  // Build highlighted HTML with indent guides injected into each line
  const highlightedHtml = useMemo(() => {
    const raw = Prism.languages.html || Prism.languages.markup
      ? Prism.highlight(code || '', Prism.languages.html || Prism.languages.markup, 'html')
      : (code || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (charWidth === 0) return raw + '<br />';

    // Split highlighted HTML by newlines (Prism preserves newlines as literal \n)
    const highlightedLines = raw.split('\n');
    const sourceLines = code.split('\n');

    const result = highlightedLines.map((hLine, i) => {
      const sourceLine = sourceLines[i] || '';
      const leadingSpaces = sourceLine.match(/^ */)?.[0].length || 0;
      const indentLevel = Math.floor(leadingSpaces / INDENT_SIZE);

      if (indentLevel === 0) return hLine;

      // Build guide spans for this line
      let guides = '';
      for (let level = 1; level <= indentLevel; level++) {
        const x = ((level - 1) * INDENT_SIZE * charWidth).toFixed(1);
        guides += `<span style="position:absolute;left:${x}px;top:0;bottom:0;width:1px;background:#333;pointer-events:none"></span>`;
      }

      return `<span style="position:relative;display:inline">${guides}</span>${hLine}`;
    });

    return result.join('\n') + '<br />';
  }, [code, charWidth]);

  return (
    <div className="w-full h-full bg-[#1e1e1e] overflow-hidden rounded-lg shadow-inner border border-[#333] flex relative group min-h-0">
      {/* Line Numbers */}
      <div
        ref={lineNumbersRef}
        className="bg-[#1e1e1e] text-[#858585] pr-4 pl-2 text-right select-none border-r border-[#333] overflow-hidden"
        style={{ fontFamily: FONT, minWidth: '3.5rem', fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, paddingTop: PADDING, paddingBottom: PADDING }}
      >
        {lines.map((_, i) => (
          <div
            key={i}
            className="flex items-start justify-end"
            style={{ height: lineHeights[i] || defaultLineH }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative h-full overflow-hidden min-h-0">
        {/* Hidden mirror for measuring wrapped line heights */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            visibility: 'hidden',
            top: 0,
            left: 0,
            right: 0,
            padding: `${PADDING}px`,
            fontFamily: FONT,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            tabSize: 2,
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />

        {/* Syntax Highlighted Layer with indent guides */}
        <pre
          ref={preRef}
          className="absolute inset-0 m-0 bg-transparent pointer-events-none z-0"
          style={{
            fontFamily: FONT,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            overflow: 'auto',
            tabSize: 2,
            scrollbarWidth: 'none',
            padding: `${PADDING}px`,
          }}
        >
          <code
            className="language-html"
            style={{
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              whiteSpace: 'inherit',
              wordBreak: 'inherit',
              tabSize: 'inherit',
              letterSpacing: 'inherit',
              wordSpacing: 'inherit',
            }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>

        {/* Editable Textarea Layer */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white outline-none resize-none overflow-auto custom-scrollbar selection:bg-[#264f78]/30 z-10"
          spellCheck="false"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          style={{
            fontFamily: FONT,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            tabSize: 2,
            padding: `${PADDING}px`,
          }}
        />
      </div>
    </div>
  );
}
