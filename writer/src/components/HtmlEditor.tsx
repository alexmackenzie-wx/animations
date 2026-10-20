// Full-screen HTML editor: source on the left, live sandboxed preview on the right.
import { useEffect, useRef, useState } from 'react';
import type { HtmlRequest } from '../lib/htmlBus';
import { EmbedFrame } from './EmbedFrame';
import { isFullDocument, unwrapDocument, wrapDocument } from '../lib/htmlDoc';

const EXAMPLE = `<svg viewBox="0 0 200 60" width="100%" xmlns="http://www.w3.org/2000/svg">
  <circle cx="30" cy="30" r="10" fill="#e8590c">
    <animate attributeName="cx" values="30;170;30" dur="3s" repeatCount="indefinite" />
  </circle>
</svg>`;

export function HtmlEditor({ request, onClose }: { request: HtmlRequest; onClose: () => void }) {
  const initial = unwrapDocument(request.html) ?? request.html;
  const [html, setHtml] = useState(initial);
  const [preview, setPreview] = useState(initial);
  const previewHeight = useRef(0);
  const fullPage = isFullDocument(html);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  // Debounce the preview so animations don't restart on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setPreview(html), 450);
    return () => clearTimeout(t);
  }, [html]);

  useEffect(() => input.current?.focus(), []);

  const done = () => {
    request.onSave(isFullDocument(html) ? wrapDocument(html, previewHeight.current || 480) : html);
    onClose();
  };
  const cancel = () => {
    request.onCancel();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        done();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div className="html-editor" role="dialog" aria-label="HTML editor">
      <header className="drawing-editor__bar">
        <div className="html-editor__title">
          HTML block
          {fullPage && <span className="html-editor__note">Full page: published inside a frame so its styles can’t affect your blog</span>}
        </div>
        <div className="drawing-editor__actions">
          <button className="btn btn--ghost" onClick={() => file.current?.click()}>
            Import file…
          </button>
          <button className="btn btn--ghost" onClick={cancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={done}>
            Done <kbd>⌘↵</kbd>
          </button>
        </div>
      </header>
      <div className="html-editor__panes">
        <textarea
          ref={input}
          className="html-editor__source"
          value={html}
          spellCheck={false}
          placeholder={`Paste HTML or SVG here, for example:\n\n${EXAMPLE}`}
          onChange={(e) => setHtml(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = el;
              const next = `${html.slice(0, a)}  ${html.slice(b)}`;
              setHtml(next);
              requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
            }
          }}
        />
        <div className="html-editor__preview">
          {preview.trim() ? (
            <EmbedFrame html={preview} minHeight={80} onHeight={(h) => (previewHeight.current = h)} />
          ) : (
            <p className="muted">Live preview appears here.</p>
          )}
        </div>
      </div>
      <input
        ref={file}
        type="file"
        accept=".html,.htm,.svg,text/html,image/svg+xml"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setHtml(await f.text());
        }}
      />
    </div>
  );
}
