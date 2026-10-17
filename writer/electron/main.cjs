// Writer — Electron main process.
// Owns the window, the native menu, the file system and the spellchecker.
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeTheme, protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const fssync = require('node:fs');

const isMac = process.platform === 'darwin';
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '..', 'dist');

// The built UI is served from app://writer/ rather than file:// so that fetch,
// WebAssembly (grammar checker) and workers (drawing fonts) behave like the web.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function serveApp() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/** @type {BrowserWindow | null} */
let win = null;
let readyToClose = false;
let quitting = false;
let closeTimer = null;

function finishClose() {
  clearTimeout(closeTimer);
  readyToClose = true;
  if (quitting) app.quit();
  else win?.close();
}

// ---------------------------------------------------------------------------
// Settings (a tiny JSON file in the app's userData folder)
// ---------------------------------------------------------------------------

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  folder: null,
  lastFile: null,
  exportFolder: null,
  theme: 'system', // 'system' | 'light' | 'dark'
  fontSize: 21,
  grammar: true,
  sidebar: true,
  typewriter: false,
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fssync.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = DEFAULT_SETTINGS;

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2));
  if (patch.theme) nativeTheme.themeSource = patch.theme;
  return settings;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set(['node_modules', 'drawings', 'assets', '.git']);

/** Pull `title:` out of YAML front matter without a YAML dependency. */
function readTitle(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm) {
    const m = /^title:\s*(.*)$/m.exec(fm[1]);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  const h = /^#\s+(.+)$/m.exec(text);
  return h ? h[1].trim() : null;
}

async function listMarkdown(root, dir = root, depth = 0, out = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < 3 && !IGNORED_DIRS.has(e.name)) await listMarkdown(root, full, depth + 1, out);
    } else if (/\.(md|markdown)$/i.test(e.name)) {
      const [stat, text] = await Promise.all([fs.stat(full), fs.readFile(full, 'utf8')]);
      out.push({
        path: full,
        rel: path.relative(root, full),
        name: e.name,
        title: readTitle(text) || e.name.replace(/\.(md|markdown)$/i, ''),
        mtime: stat.mtimeMs,
        words: (text.replace(/^---[\s\S]*?---/, '').match(/\S+/g) || []).length,
      });
    }
  }
  return out;
}

/** Write atomically so a crash mid-save never truncates a document. */
async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

async function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`);
  for (let i = 2; fssync.existsSync(candidate); i++) candidate = path.join(dir, `${base}-${i}${ext}`);
  return candidate;
}

/** Only allow touching files inside the chosen writing folder. */
function guard(p) {
  if (!settings.folder) throw new Error('No writing folder selected');
  const rel = path.relative(settings.folder, path.resolve(p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Refusing to access ${p}`);
  return path.resolve(p);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, patch) => saveSettings(patch));

  ipcMain.handle('folder:choose', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose your writing folder',
      buttonLabel: 'Use Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    await saveSettings({ folder: res.filePaths[0], lastFile: null });
    return res.filePaths[0];
  });

  ipcMain.handle('folder:list', async () => {
    if (!settings.folder) return [];
    const files = await listMarkdown(settings.folder);
    return files.sort((a, b) => b.mtime - a.mtime);
  });

  ipcMain.handle('file:read', (_e, p) => fs.readFile(guard(p), 'utf8'));
  ipcMain.handle('file:write', async (_e, p, content) => {
    await writeAtomic(guard(p), content);
    return true;
  });

  ipcMain.handle('file:create', async (_e, title) => {
    const file = await uniquePath(settings.folder, slugify(title || 'untitled'), '.md');
    const date = new Date().toISOString().slice(0, 10);
    await writeAtomic(file, `---\ntitle: ""\nsubtitle: ""\ndate: ${date}\n---\n\n`);
    return file;
  });

  ipcMain.handle('file:rename', async (_e, p, title) => {
    const from = guard(p);
    const base = slugify(title);
    if (path.basename(from, '.md') === base) return from;
    const to = await uniquePath(path.dirname(from), base, '.md');
    await fs.rename(from, to);
    return to;
  });

  ipcMain.handle('file:trash', async (_e, p) => {
    await shell.trashItem(guard(p));
    return true;
  });

  ipcMain.handle('file:reveal', (_e, p) => shell.showItemInFolder(guard(p)));

  // Resolve a document-relative asset (image or drawing) to a data URL for display.
  ipcMain.handle('asset:dataUrl', async (_e, docPath, rel) => {
    const abs = guard(path.resolve(path.dirname(docPath), decodeURI(rel)));
    const buf = await fs.readFile(abs);
    return `data:${MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'};base64,${buf.toString('base64')}`;
  });

  // Copy a dropped/pasted image next to the document, return its relative path.
  ipcMain.handle('asset:import', async (_e, docPath, name, bytes) => {
    const dir = path.join(path.dirname(guard(docPath)), 'assets');
    const ext = path.extname(name) || '.png';
    const file = await uniquePath(dir, slugify(path.basename(name, ext)), ext.toLowerCase());
    await writeAtomic(file, Buffer.from(bytes));
    return path.relative(path.dirname(docPath), file).split(path.sep).join('/');
  });

  // Drawings live in ./drawings/<id>.excalidraw (editable scene) + <id>.svg (what Markdown references).
  ipcMain.handle('drawing:save', async (_e, docPath, id, scene, svg) => {
    const dir = path.join(path.dirname(guard(docPath)), 'drawings');
    await writeAtomic(path.join(dir, `${id}.excalidraw`), scene);
    await writeAtomic(path.join(dir, `${id}.svg`), svg);
    return `drawings/${id}.svg`;
  });

  ipcMain.handle('drawing:load', async (_e, docPath, rel) => {
    const svgPath = guard(path.resolve(path.dirname(docPath), rel));
    const scenePath = svgPath.replace(/\.svg$/i, '.excalidraw');
    const [svg, scene] = await Promise.all([
      fs.readFile(svgPath, 'utf8').catch(() => null),
      fs.readFile(scenePath, 'utf8').catch(() => null),
    ]);
    return { svg, scene };
  });

  // Export: copy the Markdown plus every local asset it references into a blog folder.
  ipcMain.handle('export:blog', async (_e, docPath, markdown, choose) => {
    let target = settings.exportFolder;
    if (!target || choose) {
      const res = await dialog.showOpenDialog(win, {
        title: 'Export to blog folder',
        buttonLabel: 'Export Here',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (res.canceled || !res.filePaths[0]) return null;
      target = res.filePaths[0];
      await saveSettings({ exportFolder: target });
    }
    const srcDir = path.dirname(guard(docPath));
    const refs = new Set();
    for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (!/^[a-z]+:/i.test(m[1])) refs.add(decodeURI(m[1]));
    }
    for (const rel of refs) {
      const from = path.resolve(srcDir, rel);
      if (!fssync.existsSync(from)) continue;
      const to = path.resolve(target, rel);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
    const out = path.join(target, path.basename(docPath));
    await writeAtomic(out, markdown);
    shell.showItemInFolder(out);
    return out;
  });

  // The renderer flushes unsaved edits before the window is allowed to close.
  ipcMain.handle('app:closeReady', () => finishClose());

  ipcMain.handle('spell:learn', (_e, word) => win.webContents.session.addWordToSpellCheckerDictionary(word));
}

// ---------------------------------------------------------------------------
// Menu — format shortcuts are handled inside the editor, so they are shown in
// the menu but not registered (registerAccelerator: false) to avoid double firing.
// ---------------------------------------------------------------------------

function send(command, arg) {
  win?.webContents.send('menu', command, arg);
}

function item(label, accelerator, command, opts = {}) {
  return { label, accelerator, registerAccelerator: false, click: () => send(command, opts.arg), ...opts.extra };
}

function buildMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('settings') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Document', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open Writing Folder…', accelerator: 'CmdOrCtrl+O', click: () => send('openFolder') },
        { label: 'Quick Open…', accelerator: 'CmdOrCtrl+P', click: () => send('quickOpen') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Export to Blog', accelerator: 'CmdOrCtrl+Alt+E', click: () => send('export') },
        { label: 'Export to Different Folder…', click: () => send('exportChoose') },
        { label: 'Copy as Markdown', accelerator: 'CmdOrCtrl+Alt+Shift+C', click: () => send('copyMarkdown') },
        { type: 'separator' },
        { label: 'Reveal in Finder', accelerator: 'CmdOrCtrl+Alt+R', click: () => send('reveal') },
        { label: 'Move to Trash', click: () => send('trash') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'CmdOrCtrl+Z', 'undo'),
        item('Redo', 'CmdOrCtrl+Shift+Z', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find…', 'CmdOrCtrl+F', 'find'),
        item('Find and Replace…', 'CmdOrCtrl+Alt+F', 'replace'),
        item('Find Next', 'CmdOrCtrl+G', 'findNext'),
        item('Find Previous', 'CmdOrCtrl+Shift+G', 'findPrev'),
        { type: 'separator' },
        { label: 'Check Grammar', type: 'checkbox', checked: settings.grammar, click: (mi) => send('grammar', mi.checked) },
        ...(isMac ? [{ type: 'separator' }, { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }] : []),
      ],
    },
    {
      label: 'Format',
      submenu: [
        item('Bold', 'CmdOrCtrl+B', 'bold'),
        item('Italic', 'CmdOrCtrl+I', 'italic'),
        item('Underline', 'CmdOrCtrl+U', 'underline'),
        item('Strikethrough', 'CmdOrCtrl+Shift+X', 'strike'),
        item('Inline Code', 'CmdOrCtrl+Shift+C', 'code'),
        item('Link…', 'CmdOrCtrl+K', 'link'),
        item('Clear Formatting', 'CmdOrCtrl+\\', 'clear'),
        { type: 'separator' },
        item('Body Text', 'CmdOrCtrl+Alt+0', 'paragraph'),
        item('Heading 1', 'CmdOrCtrl+Alt+1', 'h1'),
        item('Heading 2', 'CmdOrCtrl+Alt+2', 'h2'),
        item('Heading 3', 'CmdOrCtrl+Alt+3', 'h3'),
        { type: 'separator' },
        item('Bulleted List', 'CmdOrCtrl+Shift+8', 'bulletList'),
        item('Numbered List', 'CmdOrCtrl+Shift+7', 'orderedList'),
        item('Checklist', 'CmdOrCtrl+Shift+9', 'taskList'),
        item('Quote', 'CmdOrCtrl+Shift+B', 'blockquote'),
        item('Code Block', 'CmdOrCtrl+Alt+C', 'codeBlock'),
        { type: 'separator' },
        {
          label: 'Alignment',
          submenu: [
            item('Justify (Default)', 'CmdOrCtrl+Shift+J', 'align', { arg: 'justify' }),
            item('Left', 'CmdOrCtrl+Shift+L', 'align', { arg: 'left' }),
            item('Center', 'CmdOrCtrl+Shift+E', 'align', { arg: 'center' }),
            item('Right', 'CmdOrCtrl+Shift+R', 'align', { arg: 'right' }),
          ],
        },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        item('Sketch Drawing', 'CmdOrCtrl+Shift+D', 'drawing', { arg: 'sketch' }),
        item('Wireframe Diagram', 'CmdOrCtrl+Alt+D', 'drawing', { arg: 'wireframe' }),
        { type: 'separator' },
        item('Image…', 'CmdOrCtrl+Shift+I', 'image'),
        item('Table', 'CmdOrCtrl+Alt+T', 'table'),
        item('Divider', 'CmdOrCtrl+Shift+-', 'divider'),
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Alt+S', click: () => send('sidebar') },
        { label: 'Focus Mode', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('focus') },
        { label: 'Typewriter Scrolling', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('typewriter') },
        { type: 'separator' },
        { label: 'Larger Text', accelerator: 'CmdOrCtrl+=', click: () => send('fontSize', 1) },
        { label: 'Smaller Text', accelerator: 'CmdOrCtrl+-', click: () => send('fontSize', -1) },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => send('fontSize', 0) },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: ['system', 'light', 'dark'].map((t) => ({
            label: t[0].toUpperCase() + t.slice(1),
            type: 'radio',
            checked: settings.theme === t,
            click: () => saveSettings({ theme: t }).then((s) => win?.webContents.send('settings', s)),
          })),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'Writer',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17171a' : '#fdfcfa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (readyToClose) return;
    e.preventDefault();
    if (closeTimer) return;
    win.webContents.send('menu', 'flushAndClose');
    // Never trap the user if the renderer is unresponsive.
    closeTimer = setTimeout(finishClose, 1500);
  });

  // Native spelling suggestions on right-click.
  win.webContents.on('context-menu', (_e, params) => {
    const menu = [];
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 6)) {
        menu.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
      }
      if (!params.dictionarySuggestions.length) menu.push({ label: 'No Guesses Found', enabled: false });
      menu.push(
        { type: 'separator' },
        {
          label: 'Learn Spelling',
          click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' },
      );
    }
    if (params.isEditable) {
      menu.push({ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy }, { role: 'paste' });
      if (isMac && params.selectionText) {
        menu.push({ type: 'separator' }, { label: `Look Up “${params.selectionText.slice(0, 24)}”`, click: () => win.webContents.showDefinitionForSelection() });
      }
    } else if (params.selectionText) {
      menu.push({ role: 'copy' });
    }
    if (menu.length) Menu.buildFromTemplate(menu).popup({ window: win });
  });

  // Open external links in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL('app://writer/index.html');

  win.on('closed', () => {
    win = null;
    readyToClose = false;
    closeTimer = null;
  });
}

app.whenReady().then(() => {
  settings = loadSettings();
  nativeTheme.themeSource = settings.theme;
  serveApp();
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('before-quit', () => (quitting = true));

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
