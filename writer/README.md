# Writer

A calm, local, Markdown-first writing app for macOS. Substack-style page,
justified type, beautiful code blocks, built-in drawing, and spelling and
grammar checks that never leave your Mac.

Every document is a plain `.md` file in a folder you choose, ready to drop
into your blog.

## Run it

You need [Node.js](https://nodejs.org) 22.12 or newer (check with `node -v`).

```bash
cd writer
npm install
npm run dev        # live-reloading development app
```

### Install as a Mac app

```bash
npm run dist
```

This creates `release/Writer-<version>-arm64.dmg`. Open it and drag **Writer**
into **Applications**. The app is ad-hoc signed rather than signed with an
Apple Developer ID, so the first launch needs a right-click → **Open**. If
macOS refuses, run `xattr -cr /Applications/Writer.app` once.

To update later: `git pull`, `npm install`, `npm run dist`, then drag the new
Writer into Applications and choose **Replace**. Your documents and settings
are not touched.

## What's inside

| | |
| --- | --- |
| **Writing** | Title and subtitle fields, serif body text (Newsreader), justified with hyphenation, adjustable line width (Settings → Line width), smart quotes and dashes, focus mode, typewriter scrolling |
| **Markdown** | Files are CommonMark/GFM with YAML front matter (`title`, `subtitle`, plus any keys you add, such as `date`, `tags` or `slug`, which are kept as they are) |
| **Code blocks** | ray.so-style window cards with Shiki syntax highlighting (any language), a language picker and a copy button |
| **Drawings** | Excalidraw built in, with two styles you can switch between at any time: **Sketch** (hand-drawn) and **Wireframe** (clean lines, grid, snapping) |
| **Math** | LaTeX rendered with KaTeX. Inline `$…$` (⇧⌘M) and display `$$…$$` (⌥⌘M, `/equation`, or type `$$` then ↵). Click an equation to edit it with a live preview |
| **HTML & SVG** | Embed raw HTML: SVG animations, widgets, iframes (`/html`, ⌥⌘H). It's written to the Markdown verbatim and previewed live in a sandbox where scripts run but can't reach the app. Full HTML pages are published inside a self-sizing `<iframe>` so their styles can't leak into your blog |
| **Blocks** | Hover any block for a ⋮⋮ handle: delete, duplicate, move up/down, and add or remove table rows and columns |
| **Spelling** | The macOS system dictionary. Right-click for suggestions or **Learn Spelling** |
| **Grammar** | [Harper](https://writewithharper.com), running locally. Click a blue or purple underline to see the suggestion, apply it, or ignore it |
| **Export** | **Export to Blog** copies the `.md` file and every image or drawing it references into your blog folder |

### Alignment

Body text is justified by default, and that default is never written into the
file. When you explicitly align a paragraph or heading left, center or right,
it is saved as a small HTML tag, which every Markdown blog renders:

```html
<p style="text-align: center">Centered line.</p>
```

Headings are always left-aligned unless you set them otherwise.

### Drawings on disk

```
my-post.md
drawings/
  drawing-abc123.excalidraw   ← editable scene (also opens at excalidraw.com)
  drawing-abc123.svg          ← what the post shows: ![Drawing](drawings/drawing-abc123.svg)
assets/
  photo.png                   ← pasted or dropped images
```

## Shortcuts

| Action | Shortcut |
| --- | --- |
| New document / Quick open | ⌘N / ⌘P |
| Open writing folder | ⌘O |
| Save (also autosaves) | ⌘S |
| Export to blog | ⌥⌘E |
| Bold / Italic / Underline | ⌘B / ⌘I / ⌘U |
| Strikethrough / Inline code | ⇧⌘X / ⇧⌘C |
| Link | ⌘K |
| Clear formatting | ⌘\ |
| Body text / Heading 1–3 | ⌥⌘0 / ⌥⌘1–3 |
| Bulleted / Numbered / Checklist | ⇧⌘8 / ⇧⌘7 / ⇧⌘9 |
| Quote / Code block | ⇧⌘B / ⌥⌘C |
| Justify / Left / Center / Right | ⇧⌘J / ⇧⌘L / ⇧⌘E / ⇧⌘R |
| Sketch drawing / Wireframe | ⇧⌘D / ⌥⌘D |
| Image / Table / Divider | ⇧⌘I / ⌥⌘T / ⇧⌘- |
| Inline math / Equation | ⇧⌘M / ⌥⌘M |
| HTML / SVG embed | ⌥⌘H |
| Find / Find and replace | ⌘F / ⌥⌘F (⌘G, ⇧⌘G to step through matches) |
| Focus mode / Typewriter scrolling | ⇧⌘F / ⇧⌘T |
| Toggle sidebar | ⌥⌘S |
| Text size | ⌘= / ⌘- / ⌘0 |
| Settings | ⌘, |

Type `/` at the start of a line (or after a space) for the block menu: headings,
lists, quote, code, divider, sketch, wireframe, equation, inline math, HTML embed, image and table. Keep typing to
filter, then press ↵.

Markdown shortcuts work as you type: `#`, `##`, `-`, `1.`, `[ ]`, `>`,
` ``` `, `---`, `**bold**`, `_italic_`.

⌘E is reserved for the upcoming "review with Claude" command.

## Project layout

```
electron/main.cjs        window, native menu, file access, spellcheck menu
electron/preload.cjs     the small API the UI may call
src/App.tsx              app shell: documents, saving, commands
src/editor/              Tiptap extensions: Markdown, code cards, drawings, grammar, find
src/components/          sidebar, popovers, find bar, quick open, drawing editor
src/styles.css           all styling (light and dark)
```
