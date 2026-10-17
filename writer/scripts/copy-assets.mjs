// Copies Excalidraw's hand-drawn fonts into public/ so drawings work fully offline.
// (Xiaolai is a 13 MB CJK font; it is skipped to keep the app small.)
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts');
const dest = join(root, 'public/excalidraw/fonts');

if (!existsSync(src)) process.exit(0);
mkdirSync(dest, { recursive: true });
for (const dir of readdirSync(src)) {
  if (dir === 'Xiaolai') continue;
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
