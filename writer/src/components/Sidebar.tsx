import { useMemo, useState } from 'react';
import type { FileEntry } from '../global';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeDate(ms: number) {
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'Just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: abs > 86400 * 300 ? 'numeric' : undefined });
}

type Props = {
  folder: string;
  files: FileEntry[];
  current: string | null;
  onOpen: (path: string) => void;
  onNew: () => void;
  onChooseFolder: () => void;
};

export function Sidebar({ folder, files, current, onOpen, onNew, onChooseFolder }: Props) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? files.filter((f) => f.title.toLowerCase().includes(q) || f.rel.toLowerCase().includes(q)) : files;
  }, [files, filter]);

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <button className="sidebar__folder" onClick={onChooseFolder} title={folder}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span>{folder.split(/[\\/]/).pop()}</span>
        </button>
        <button className="icon-btn" onClick={onNew} title="New document (⌘N)" aria-label="New document">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
      <input className="sidebar__search" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
      <nav className="sidebar__list">
        {shown.map((f) => (
          <button key={f.path} className={`doc-item${f.path === current ? ' is-active' : ''}`} onClick={() => onOpen(f.path)}>
            <span className="doc-item__title">{f.title || 'Untitled'}</span>
            <span className="doc-item__meta">
              {relativeDate(f.mtime)} · {f.words.toLocaleString()} words
            </span>
          </button>
        ))}
        {!shown.length && <p className="sidebar__empty">{filter ? 'No matches' : 'No documents yet'}</p>}
      </nav>
    </aside>
  );
}
