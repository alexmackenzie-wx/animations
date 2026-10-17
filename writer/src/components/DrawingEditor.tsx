// Full-screen Excalidraw editor with two house styles:
//   Sketch    — hand-drawn strokes and handwriting, for ideas and explanations
//   Wireframe — crisp lines, clean type and a grid, for UI and architecture diagrams
import { Excalidraw, exportToSvg, FONT_FAMILY, newElementWith, ROUNDNESS, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useEffect, useMemo, useState } from 'react';
import type { DrawingMode, DrawingRequest } from '../lib/drawingBus';

type API = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['excalidrawAPI']>>[0];

const PRESETS: Record<DrawingMode, Record<string, unknown>> = {
  sketch: {
    currentItemRoughness: 1,
    currentItemFontFamily: FONT_FAMILY.Excalifont,
    currentItemStrokeColor: '#1e1e1e',
    currentItemBackgroundColor: 'transparent',
    currentItemFillStyle: 'hachure',
    currentItemStrokeWidth: 2,
    currentItemRoundness: 'round',
    gridModeEnabled: false,
    viewBackgroundColor: '#ffffff',
  },
  wireframe: {
    currentItemRoughness: 0,
    currentItemFontFamily: FONT_FAMILY.Nunito,
    currentItemStrokeColor: '#495057',
    currentItemBackgroundColor: '#f1f3f5',
    currentItemFillStyle: 'solid',
    currentItemStrokeWidth: 1,
    currentItemRoundness: 'sharp',
    gridModeEnabled: true,
    objectsSnapModeEnabled: true,
    viewBackgroundColor: '#ffffff',
  },
};

function detectMode(scene: any): DrawingMode | null {
  const r = scene?.appState?.currentItemRoughness;
  return r === 0 ? 'wireframe' : r ? 'sketch' : null;
}

export function DrawingEditor({ request, dark, onClose }: { request: DrawingRequest; dark: boolean; onClose: () => void }) {
  const parsed = useMemo(() => {
    try {
      return request.scene ? JSON.parse(request.scene) : null;
    } catch {
      return null;
    }
  }, [request.scene]);
  const [mode, setMode] = useState<DrawingMode>(detectMode(parsed) ?? request.mode);
  const [api, setApi] = useState<API | null>(null);
  const [saving, setSaving] = useState(false);

  const initialData = useMemo(
    () => ({
      elements: parsed?.elements ?? [],
      files: parsed?.files ?? {},
      appState: { ...parsed?.appState, ...(parsed ? {} : PRESETS[mode]), collaborators: new Map() },
      scrollToContent: true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed],
  );

  /** Switching style restyles the current drawing too, so one click converts sketch ⇄ wireframe. */
  const switchMode = (next: DrawingMode) => {
    setMode(next);
    if (!api) return;
    const p = PRESETS[next];
    const elements = api.getSceneElementsIncludingDeleted().map((el: any) => {
      const patch: Record<string, unknown> = { roughness: p.currentItemRoughness };
      if (el.type === 'text') patch.fontFamily = p.currentItemFontFamily;
      if (el.type === 'rectangle' || el.type === 'diamond') {
        patch.roundness = next === 'sketch' ? { type: ROUNDNESS.ADAPTIVE_RADIUS } : null;
      }
      return newElementWith(el, patch);
    });
    api.updateScene({ elements, appState: p as any });
  };

  const save = async () => {
    if (!api) return;
    const elements = api.getSceneElements();
    if (!elements.length) {
      request.onCancel();
      return onClose();
    }
    setSaving(true);
    const appState = api.getAppState();
    const files = api.getFiles();
    const svg = await exportToSvg({
      elements,
      appState: { ...appState, exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: '#ffffff' },
      files,
      exportPadding: 24,
    });
    svg.setAttribute('role', 'img');
    await request.onSave(serializeAsJSON(elements, appState, files, 'local'), svg.outerHTML);
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
        save();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div className="drawing-editor" role="dialog" aria-label="Drawing editor">
      <header className="drawing-editor__bar">
        <div className="segmented" role="tablist" aria-label="Drawing style">
          {(['sketch', 'wireframe'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => switchMode(m)}>
              {m === 'sketch' ? 'Sketch' : 'Wireframe'}
            </button>
          ))}
        </div>
        <div className="drawing-editor__actions">
          <button className="btn btn--ghost" onClick={cancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Done'} <kbd>⌘↵</kbd>
          </button>
        </div>
      </header>
      <div className="drawing-editor__canvas">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={initialData as any}
          theme={dark ? 'dark' : 'light'}
          name="Drawing"
          UIOptions={{
            canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false },
          }}
        />
      </div>
    </div>
  );
}
