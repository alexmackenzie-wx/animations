import { useEffect } from 'react';
import type { Settings } from '../global';

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onChooseFolder: () => void;
  onClose: () => void;
};

export function SettingsSheet({ settings, onChange, onChooseFolder, onClose }: Props) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <div className="field">
          <span>Writing folder</span>
          <button className="btn btn--ghost btn--sm path" onClick={onChooseFolder} title={settings.folder ?? ''}>
            {settings.folder ?? 'Choose…'}
          </button>
        </div>
        <div className="field">
          <span>Blog export folder</span>
          <span className="path muted" title={settings.exportFolder ?? ''}>
            {settings.exportFolder ?? 'Asked on first export'}
          </span>
        </div>
        <div className="field">
          <span>Appearance</span>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'is-active' : ''} onClick={() => onChange({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Text size</span>
          <input type="range" min={15} max={30} value={settings.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} />
          <span className="muted">{settings.fontSize}px</span>
        </div>
        <label className="field">
          <span>Check grammar</span>
          <input type="checkbox" checked={settings.grammar} onChange={(e) => onChange({ grammar: e.target.checked })} />
        </label>
        <label className="field">
          <span>Typewriter scrolling</span>
          <input type="checkbox" checked={settings.typewriter} onChange={(e) => onChange({ typewriter: e.target.checked })} />
        </label>
        <p className="muted small">Spelling uses macOS’s system dictionary. Grammar is checked on your Mac by Harper, so nothing leaves your machine.</p>
      </div>
    </div>
  );
}
