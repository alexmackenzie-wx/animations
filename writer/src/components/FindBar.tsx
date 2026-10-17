import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { clearSearch, findNext, getSearch, replaceAll, replaceCurrent, setQuery } from '../editor/search';

export function FindBar({ editor, replace, onClose, focusToken }: { editor: Editor; replace: boolean; onClose: () => void; focusToken: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQ] = useState(() => {
    const { from, to } = editor.state.selection;
    return from !== to ? editor.state.doc.textBetween(from, to).slice(0, 80) : getSearch(editor.state).query;
  });
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusToken]);

  useEffect(() => {
    setQuery(editor.view, query, caseSensitive);
  }, [editor, query, caseSensitive]);

  useEffect(() => {
    const update = () => force((n) => n + 1);
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
      clearSearch(editor.view);
    };
  }, [editor]);

  const { matches, index } = getSearch(editor.state);
  const close = () => {
    onClose();
    editor.commands.focus();
  };

  return (
    <div className="findbar" role="search" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="findbar__row">
        <input
          ref={input}
          placeholder="Find"
          value={query}
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              findNext(editor.view, e.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className="findbar__count">{query ? (matches.length ? `${index + 1} of ${matches.length}` : 'No results') : ''}</span>
        <button className={`icon-btn${caseSensitive ? ' is-active' : ''}`} title="Match case" onClick={() => setCase(!caseSensitive)}>
          Aa
        </button>
        <button className="icon-btn" title="Previous (⇧⌘G)" onClick={() => findNext(editor.view, -1)}>
          ↑
        </button>
        <button className="icon-btn" title="Next (⌘G)" onClick={() => findNext(editor.view, 1)}>
          ↓
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={close}>
          ✕
        </button>
      </div>
      {replace && (
        <div className="findbar__row">
          <input
            placeholder="Replace with"
            value={replacement}
            spellCheck={false}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                replaceCurrent(editor.view, replacement);
              }
            }}
          />
          <button className="btn btn--ghost btn--sm" onClick={() => replaceCurrent(editor.view, replacement)}>
            Replace
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => replaceAll(editor.view, replacement)}>
            All
          </button>
        </div>
      )}
    </div>
  );
}
