import type { Editor } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DrawingEditor } from './components/DrawingEditor';
import { FindBar } from './components/FindBar';
import { GrammarPopover, LinkPopover, SelectionToolbar } from './components/Popovers';
import { QuickOpen } from './components/QuickOpen';
import { SettingsSheet } from './components/SettingsSheet';
import { Sidebar } from './components/Sidebar';
import { SlashMenu } from './components/SlashMenu';
import { slashBus, type SlashState } from './editor/slash';
import { buildExtensions, runCommand } from './editor/extensions';
import { refreshGrammar, type LintInfo } from './editor/grammar';
import { findNext } from './editor/search';
import type { FileEntry, Settings } from './global';
import { docContext } from './lib/docContext';
import { drawingBus, type DrawingRequest } from './lib/drawingBus';
import { countWords, parseDoc, serializeDoc, type Doc } from './lib/frontmatter';

/** `id` identifies one opening of a file, so renaming it doesn't recreate the editor. */
type OpenDoc = Doc & { path: string; id: number };
let nextDocId = 1;
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const MIN_FONT = 15;
const MAX_FONT = 30;
const DEFAULT_FONT = 21;

/** Column width in ems of the body text: roughly 70, 85 and 100 characters per line. */
const LINE_WIDTHS: Record<Settings['lineWidth'], number> = { narrow: 33, medium: 39, wide: 45 };

/** Resolves the Appearance setting to light/dark and exposes it to CSS as data-theme. */
function useTheme(pref: Settings['theme'] | undefined) {
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = pref === 'dark' || (pref !== 'light' && systemDark);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return dark;
}

/** Textarea that grows with its content — used for the title and subtitle. */
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: React.Ref<HTMLTextAreaElement> }) {
  const { inputRef, ...rest } = props;
  const local = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = local.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  });
  return (
    <textarea
      rows={1}
      {...rest}
      ref={(el) => {
        local.current = el;
        if (typeof inputRef === 'function') inputRef(el);
        else if (inputRef) (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      }}
    />
  );
}

const isImage = (f: File) => /^image\//.test(f.type);

async function importImages(editor: Editor, files: File[], at?: number) {
  const docPath = docContext.path;
  if (!docPath) return;
  for (const file of files) {
    const rel = await window.writer.importAsset(docPath, file.name || 'image.png', new Uint8Array(await file.arrayBuffer()));
    const node = { type: 'image', attrs: { src: rel, alt: file.name.replace(/\.[^.]+$/, '') } };
    if (at != null) editor.chain().focus().insertContentAt(at, node).run();
    else editor.chain().focus().insertContent(node).run();
  }
}

type DocEditorProps = {
  doc: OpenDoc;
  commandRef: React.MutableRefObject<(name: string, arg?: unknown) => void>;
  grammarRef: React.MutableRefObject<boolean>;
  typewriterRef: React.MutableRefObject<boolean>;
  onReady: (editor: Editor | null) => void;
  onChange: () => void;
  onLint: (lint: LintInfo, rect: DOMRect) => void;
  onLintCount: (n: number) => void;
};

function DocEditor({ doc, commandRef, grammarRef, typewriterRef, onReady, onChange, onLint, onLintCount }: DocEditorProps) {
  const editor = useEditor(
    {
      extensions: buildExtensions(
        { command: (n, a) => commandRef.current(n, a) },
        { isEnabled: () => grammarRef.current, onLintClick: onLint, onCount: onLintCount },
      ),
      content: doc.body,
      autofocus: false,
      editorProps: {
        attributes: { class: 'prose', spellcheck: 'true', lang: 'en' },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter(isImage);
          if (!files.length) return false;
          importImages(editor!, files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = Array.from(event.dataTransfer?.files ?? []).filter(isImage);
          if (moved || !files.length) return false;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          importImages(editor!, files, pos);
          return true;
        },
      },
      onUpdate: onChange,
      onSelectionUpdate: ({ editor }) => {
        if (!typewriterRef.current) return;
        const scroller = document.querySelector('.main');
        if (!scroller) return;
        const caret = editor.view.coordsAtPos(editor.state.selection.head);
        const box = scroller.getBoundingClientRect();
        const delta = caret.top - (box.top + box.height * 0.45);
        if (Math.abs(delta) > 6) scroller.scrollBy({ top: delta, behavior: 'smooth' });
      },
    },
    [doc.id],
  );

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  if (!editor) return null;
  return (
    <>
      <SelectionToolbar editor={editor} onLink={() => commandRef.current('link')} />
      <EditorContent editor={editor} />
    </>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [words, setWords] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [find, setFind] = useState<{ replace: boolean; token: number } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [lint, setLint] = useState<{ lint: LintInfo; rect: DOMRect } | null>(null);
  const [lintCount, setLintCount] = useState(0);
  const [drawing, setDrawing] = useState<DrawingRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const dark = useTheme(settings?.theme);

  // Refs give long-lived callbacks (editor extensions, IPC listeners) the latest state.
  const docRef = useRef<OpenDoc | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** File operations run one at a time, so a save can never race a rename. */
  const io = useRef<Promise<unknown>>(Promise.resolve());
  const grammarRef = useRef(true);
  const typewriterRef = useRef(false);
  const commandRef = useRef<(name: string, arg?: unknown) => void>(() => {});
  const subtitleInput = useRef<HTMLTextAreaElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);

  docRef.current = doc;
  editorRef.current = editor;
  grammarRef.current = settings?.grammar ?? true;
  typewriterRef.current = settings?.typewriter ?? false;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await window.writer.setSettings(patch));
  }, []);

  const refreshFiles = useCallback(async () => setFiles(await window.writer.listFiles()), []);

  const fullText = useCallback(() => {
    const d = docRef.current;
    const ed = editorRef.current;
    if (!d) return '';
    const body = ed ? (ed.storage as any).markdown.getMarkdown() : d.body;
    return serializeDoc({ ...d, body });
  }, []);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = io.current.then(task, task);
    io.current = run.catch(() => undefined);
    return run;
  }, []);

  const save = useCallback(() => enqueue(async () => {
    clearTimeout(saveTimer.current);
    const d = docRef.current;
    if (!d || !dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      const text = fullText();
      await window.writer.writeFile(d.path, text);
      setStatus(dirty.current ? 'unsaved' : 'saved');
      setFiles((fs) => {
        const entry = { title: d.title || 'Untitled', mtime: Date.now(), words: countWords(text.replace(/^---[\s\S]*?---/, '')) };
        const others = fs.filter((f) => f.path !== d.path);
        const prev = fs.find((f) => f.path === d.path);
        return prev ? [{ ...prev, ...entry }, ...others] : fs;
      });
    } catch (err) {
      console.error(err);
      dirty.current = true;
      setStatus('error');
    }
  }), [fullText, enqueue]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setStatus('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
    const ed = editorRef.current;
    if (ed) setWords((ed.storage as any).characterCount.words());
  }, [save]);

  const openFile = useCallback(
    async (path: string) => {
      await save();
      try {
        const parsed = parseDoc(await window.writer.readFile(path));
        docContext.path = path;
        setDoc({ ...parsed, path, id: nextDocId++ });
        setWords(countWords(parsed.body));
        setStatus('saved');
        setLint(null);
        setQuickOpen(false);
        await updateSettings({ lastFile: path });
      } catch (err) {
        console.error(err);
        flash('Could not open that file');
      }
    },
    [save, updateSettings, flash],
  );

  const newDoc = useCallback(async () => {
    await save();
    const path = await window.writer.createFile();
    await refreshFiles();
    await openFile(path);
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('.title')?.focus(), 50);
  }, [save, refreshFiles, openFile]);

  const chooseFolder = useCallback(async () => {
    await save();
    const folder = await window.writer.chooseFolder();
    if (!folder) return;
    setSettings(await window.writer.getSettings());
    setDoc(null);
    docContext.path = null;
    const list = await window.writer.listFiles();
    setFiles(list);
    if (list[0]) openFile(list[0].path);
  }, [save, openFile]);

  /** Rename "untitled.md" to match its title the first time it gets one. */
  const maybeRename = useCallback(async () => {
    const d = docRef.current;
    if (!d || !d.title.trim()) return;
    const base = d.path.split(/[\\/]/).pop() || '';
    if (!/^untitled(-\d+)?\.md$/.test(base)) return;
    await save();
    const next = await enqueue(async () => {
      const from = docRef.current?.path;
      if (!from) return null;
      const to = await window.writer.renameFile(from, docRef.current!.title);
      // Update the ref immediately so any queued save writes to the new path.
      docRef.current = { ...docRef.current!, path: to };
      docContext.path = to;
      setDoc((cur) => (cur && cur.path === from ? { ...cur, path: to } : cur));
      return to;
    });
    if (next && next !== d.path) {
      await updateSettings({ lastFile: next });
      refreshFiles();
    }
  }, [save, enqueue, updateSettings, refreshFiles]);

  // App-level commands, reachable from the menu bar and from editor shortcuts.
  commandRef.current = (name: string, arg?: unknown) => {
    const ed = editorRef.current;
    const d = docRef.current;
    switch (name) {
      case 'new': return newDoc();
      case 'openFolder': return chooseFolder();
      case 'quickOpen': return setQuickOpen(true);
      case 'settings': return setSettingsOpen(true);
      case 'save':
        dirty.current = dirty.current || !!d;
        return save().then(() => flash('Saved'));
      case 'export':
      case 'exportChoose':
        if (!d) return;
        return save().then(async () => {
          const out = await window.writer.exportBlog(d.path, fullText(), name === 'exportChoose');
          if (out) flash('Exported to blog folder');
        });
      case 'copyMarkdown':
        return navigator.clipboard.writeText(fullText()).then(() => flash('Markdown copied'));
      case 'reveal': return d && window.writer.revealFile(d.path);
      case 'trash':
        if (!d || !confirm(`Move “${d.title || 'Untitled'}” to the Trash?`)) return;
        return window.writer.trashFile(d.path).then(async () => {
          dirty.current = false;
          setDoc(null);
          docContext.path = null;
          const list = await window.writer.listFiles();
          setFiles(list);
          if (list[0]) openFile(list[0].path);
        });
      case 'sidebar': return settings && updateSettings({ sidebar: !settings.sidebar });
      case 'focus': return setFocusMode((f) => !f);
      case 'typewriter':
        if (!settings) return;
        flash(settings.typewriter ? 'Typewriter scrolling off' : 'Typewriter scrolling on');
        return updateSettings({ typewriter: !settings.typewriter });
      case 'fontSize': {
        if (!settings) return;
        const delta = arg as number;
        const size = delta === 0 ? DEFAULT_FONT : Math.min(MAX_FONT, Math.max(MIN_FONT, settings.fontSize + delta));
        return updateSettings({ fontSize: size });
      }
      case 'grammar': {
        const on = typeof arg === 'boolean' ? arg : !settings?.grammar;
        grammarRef.current = on;
        return updateSettings({ grammar: on }).then(() => ed && refreshGrammar(ed.view));
      }
      case 'link': return ed && setLinkOpen(true);
      case 'image': return imageInput.current?.click();
      case 'find':
      case 'replace':
        return ed && setFind((f) => ({ replace: name === 'replace' || !!f?.replace, token: (f?.token ?? 0) + 1 }));
      case 'findNext':
      case 'findPrev':
        if (!ed) return;
        if (!find) return setFind({ replace: false, token: 1 });
        return findNext(ed.view, name === 'findNext' ? 1 : -1);
    }
  };

  // Boot: settings, file list, last document.
  useEffect(() => {
    (async () => {
      const s = await window.writer.getSettings();
      setSettings(s);
      if (!s.folder) return;
      const list = await window.writer.listFiles();
      setFiles(list);
      const last = list.find((f) => f.path === s.lastFile) ?? list[0];
      if (last) openFile(last.path);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native menu → commands. Editor actions first, everything else is app-level.
  useEffect(
    () =>
      window.writer.onMenu((command, arg) => {
        if (command === 'flushAndClose') return void save().then(() => window.writer.closeReady());
        const ed = editorRef.current;
        if (ed) runCommand(ed, command, arg, commandRef.current);
        else commandRef.current(command, arg);
      }),
    [save],
  );
  useEffect(() => window.writer.onSettings(setSettings), []);
  useEffect(() => drawingBus.subscribe(setDrawing), []);
  useEffect(() => slashBus.subscribe(setSlash), []);

  // Find shortcuts also work when the cursor is in the title or nowhere at all.
  // (Inside the editor its own keymap handles them and marks the event handled.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return;
      const key = e.code === 'KeyF' ? 'f' : e.code === 'KeyG' ? 'g' : null;
      if (!key) return;
      e.preventDefault();
      if (key === 'f') commandRef.current(e.altKey ? 'replace' : 'find');
      else commandRef.current(e.shiftKey ? 'findPrev' : 'findNext');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Save when the window loses focus, too.
  useEffect(() => {
    const onBlur = () => save();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [save]);

  // Leaving focus mode with Escape.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !find && !linkOpen && !lint && setFocusMode(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, find, linkOpen, lint]);

  const onEditorReady = useCallback((ed: Editor | null) => setEditor(ed), []);
  const onLint = useCallback((l: LintInfo, rect: DOMRect) => setLint({ lint: l, rect }), []);

  if (!settings) return <div className="app" />;

  if (!settings.folder) {
    return (
      <div className="welcome">
        <div className="drag-region" />
        <div className="welcome__card">
          <h1>Writer</h1>
          <p>A quiet place to write. Everything you write is a plain Markdown file in a folder you choose, ready for your blog.</p>
          <button className="btn btn--primary btn--lg" onClick={chooseFolder}>
            Choose a writing folder
          </button>
        </div>
      </div>
    );
  }

  const showSidebar = settings.sidebar && !focusMode;
  const readMins = Math.max(1, Math.round(words / 238));
  const statusLabel = { saved: 'Saved', saving: 'Saving…', unsaved: 'Edited', error: 'Couldn’t save' }[status];

  return (
    <div
      className={['app', showSidebar && 'with-sidebar', focusMode && 'focus-mode', settings.typewriter && 'typewriter'].filter(Boolean).join(' ')}
      style={{ '--font-size': `${settings.fontSize}px`, '--measure': LINE_WIDTHS[settings.lineWidth ?? 'wide'] } as React.CSSProperties}
    >
      {showSidebar && (
        <Sidebar folder={settings.folder} files={files} current={doc?.path ?? null} onOpen={openFile} onNew={newDoc} onChooseFolder={chooseFolder} />
      )}

      <div className="main-col">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="icon-btn"
              onClick={() => commandRef.current('sidebar')}
              title="Toggle sidebar (⌥⌘S)"
              aria-label="Toggle sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M9 4v16" />
              </svg>
            </button>
          </div>
          <div className="topbar__right">
            <span className={`save-status save-status--${status}`}>{doc && statusLabel}</span>
            {doc && (
              <button className="btn btn--ghost btn--sm" onClick={() => commandRef.current('export')} title="Export to blog (⌥⌘E)">
                Export
              </button>
            )}
          </div>
        </header>

        {find && editor && <FindBar editor={editor} replace={find.replace} focusToken={find.token} onClose={() => setFind(null)} />}

        <main className="main">
          {doc ? (
            <article className="page">
              <AutoTextarea
                className="title"
                placeholder="Title"
                value={doc.title}
                spellCheck
                onChange={(e) => {
                  const title = e.target.value.replace(/\n/g, ' ');
                  setDoc((cur) => cur && { ...cur, title });
                  markDirty();
                }}
                onBlur={maybeRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    subtitleInput.current?.focus();
                  }
                }}
              />
              <AutoTextarea
                inputRef={subtitleInput}
                className="subtitle"
                placeholder="Add a subtitle…"
                value={doc.subtitle}
                spellCheck
                onChange={(e) => {
                  const subtitle = e.target.value.replace(/\n/g, ' ');
                  setDoc((cur) => cur && { ...cur, subtitle });
                  markDirty();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
                    e.preventDefault();
                    // Synchronous focus, so the next keystroke can't land in the subtitle.
                    if (editor) {
                      editor.view.focus();
                      editor.view.dispatch(editor.state.tr.setSelection(Selection.atStart(editor.state.doc)).scrollIntoView());
                    }
                  }
                }}
              />
              <DocEditor
                key={doc.id}
                doc={doc}
                commandRef={commandRef}
                grammarRef={grammarRef}
                typewriterRef={typewriterRef}
                onReady={onEditorReady}
                onChange={markDirty}
                onLint={onLint}
                onLintCount={setLintCount}
              />
            </article>
          ) : (
            <div className="empty">
              <p>Nothing open.</p>
              <button className="btn btn--primary" onClick={newDoc}>
                New document
              </button>
            </div>
          )}
        </main>

        {doc && (
          <footer className="statusbar">
            <span>{words.toLocaleString()} words</span>
            <span>{readMins} min read</span>
            {settings.grammar && lintCount > 0 && (
              <span className="statusbar__lints" title="Click an underlined phrase for suggestions">
                {lintCount} suggestion{lintCount === 1 ? '' : 's'}
              </span>
            )}
          </footer>
        )}
      </div>

      {linkOpen && editor && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
      {lint && editor && <GrammarPopover editor={editor} lint={lint.lint} rect={lint.rect} onClose={() => setLint(null)} />}
      {quickOpen && <QuickOpen files={files} onOpen={openFile} onClose={() => setQuickOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          onChange={(patch) => ('grammar' in patch ? commandRef.current('grammar', patch.grammar) : updateSettings(patch))}
          onChooseFolder={chooseFolder}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {drawing && <DrawingEditor request={drawing} dark={dark} onClose={() => setDrawing(null)} />}
      {slash && <SlashMenu state={slash} />}
      {toast && <div className="toast">{toast}</div>}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (editor && picked.length) importImages(editor, picked);
        }}
      />
    </div>
  );
}
