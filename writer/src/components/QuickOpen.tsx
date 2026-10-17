import { useEffect, useMemo, useState } from 'react';
import type { FileEntry } from '../global';

/** Subsequence match, scored so earlier and contiguous hits win. */
function score(q: string, s: string) {
  if (!q) return 1;
  s = s.toLowerCase();
  let i = 0;
  let total = 0;
  let last = -1;
  for (const ch of q.toLowerCase()) {
    const at = s.indexOf(ch, i);
    if (at === -1) return 0;
    total += at === last + 1 ? 3 : 1;
    total -= at * 0.01;
    last = at;
    i = at + 1;
  }
  return total;
}

export function QuickOpen({ files, onOpen, onClose }: { files: FileEntry[]; onOpen: (p: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const results = useMemo(
    () =>
      files
        .map((f) => ({ f, s: Math.max(score(q, f.title), score(q, f.rel) * 0.8) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map((r) => r.f),
    [files, q],
  );
  useEffect(() => setSel(0), [q]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Open document…"
          value={q}
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, results.length - 1));
            else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
            else if (e.key === 'Enter' && results[sel]) onOpen(results[sel].path);
            else if (e.key === 'Escape') onClose();
            else return;
            e.preventDefault();
          }}
        />
        <ul>
          {results.map((f, i) => (
            <li key={f.path} className={i === sel ? 'is-active' : ''} onMouseEnter={() => setSel(i)} onClick={() => onOpen(f.path)}>
              <span>{f.title || 'Untitled'}</span>
              <small>{f.rel}</small>
            </li>
          ))}
          {!results.length && <li className="palette__empty">No documents match</li>}
        </ul>
      </div>
    </div>
  );
}
