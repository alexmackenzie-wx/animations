// "/" command menu: type a slash at the start of a word to insert a block.
import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { runCommand, type AppHooks } from './extensions';

export type SlashItem = {
  title: string;
  hint: string;
  keys: string;
  group: 'Basic' | 'Lists' | 'Media';
  aliases: string[];
  command: string;
  arg?: unknown;
};

export const SLASH_ITEMS: SlashItem[] = [
  { group: 'Basic', title: 'Text', hint: 'Plain paragraph', keys: '⌥⌘0', aliases: ['paragraph', 'body', 'p'], command: 'paragraph' },
  { group: 'Basic', title: 'Heading 1', hint: 'Large section heading', keys: '⌥⌘1', aliases: ['h1', 'title'], command: 'h1' },
  { group: 'Basic', title: 'Heading 2', hint: 'Medium section heading', keys: '⌥⌘2', aliases: ['h2', 'subtitle'], command: 'h2' },
  { group: 'Basic', title: 'Heading 3', hint: 'Small section heading', keys: '⌥⌘3', aliases: ['h3'], command: 'h3' },
  { group: 'Basic', title: 'Quote', hint: 'Pull quote or citation', keys: '⇧⌘B', aliases: ['blockquote', 'citation'], command: 'blockquote' },
  { group: 'Basic', title: 'Code block', hint: 'Syntax-highlighted code', keys: '⌥⌘C', aliases: ['code', 'snippet', 'pre'], command: 'codeBlock' },
  { group: 'Basic', title: 'Divider', hint: 'Section break', keys: '⇧⌘-', aliases: ['hr', 'rule', 'separator', 'line'], command: 'divider' },
  { group: 'Lists', title: 'Bulleted list', hint: 'Simple bullets', keys: '⇧⌘8', aliases: ['ul', 'bullet', 'unordered'], command: 'bulletList' },
  { group: 'Lists', title: 'Numbered list', hint: 'Ordered steps', keys: '⇧⌘7', aliases: ['ol', 'ordered', 'number'], command: 'orderedList' },
  { group: 'Lists', title: 'Checklist', hint: 'Tasks with checkboxes', keys: '⇧⌘9', aliases: ['todo', 'task', 'checkbox'], command: 'taskList' },
  { group: 'Media', title: 'Sketch', hint: 'Hand-drawn diagram', keys: '⇧⌘D', aliases: ['drawing', 'draw', 'excalidraw', 'diagram'], command: 'drawing', arg: 'sketch' },
  { group: 'Media', title: 'Wireframe', hint: 'Clean boxes-and-lines diagram', keys: '⌥⌘D', aliases: ['diagram', 'mockup', 'ui'], command: 'drawing', arg: 'wireframe' },
  { group: 'Media', title: 'Equation', hint: 'LaTeX, displayed on its own line', keys: '⌥⌘M', aliases: ['math', 'latex', 'formula', 'tex', 'katex'], command: 'mathBlock' },
  { group: 'Media', title: 'Inline math', hint: 'LaTeX within a sentence', keys: '⇧⌘M', aliases: ['math', 'latex', 'formula', 'tex', '$'], command: 'mathInline' },
  { group: 'Media', title: 'HTML / SVG embed', hint: 'Raw HTML, SVG animation or iframe', keys: '⌥⌘H', aliases: ['html', 'svg', 'embed', 'iframe', 'animation', 'widget'], command: 'htmlBlock' },
  { group: 'Media', title: 'Image', hint: 'Upload from your Mac', keys: '⇧⌘I', aliases: ['picture', 'photo', 'img'], command: 'image' },
  { group: 'Media', title: 'Table', hint: '3 × 3 grid', keys: '⌥⌘T', aliases: ['grid'], command: 'table' },
];

function filterItems(query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return SLASH_ITEMS;
  const starts = (s: string) => s.toLowerCase().startsWith(q);
  const has = (s: string) => s.toLowerCase().includes(q);
  return SLASH_ITEMS.map((item) => ({
    item,
    score: starts(item.title) ? 3 : item.aliases.some(starts) ? 2 : has(item.title) || item.aliases.some(has) ? 1 : 0,
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

// --- Bridge to the React menu ------------------------------------------------

export type SlashState = {
  items: SlashItem[];
  rect: DOMRect | null;
  select: (item: SlashItem) => void;
};

type KeyHandler = (event: KeyboardEvent) => boolean;
let listener: (s: SlashState | null) => void = () => {};
let keyHandler: KeyHandler = () => false;

export const slashBus = {
  subscribe(fn: (s: SlashState | null) => void) {
    listener = fn;
    return () => {
      listener = () => {};
    };
  },
  /** The menu registers how it handles ↑ ↓ ↵ while it's open. */
  setKeyHandler(fn: KeyHandler) {
    keyHandler = fn;
  },
};

export const SlashCommand = Extension.create<AppHooks>({
  name: 'slashCommand',
  addOptions: () => ({ command: () => {} }),
  addProseMirrorPlugins() {
    const hooks = this.options;
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        allowedPrefixes: [' ', ' '],
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== 'codeBlock' && !$from.parent.type.spec.code;
        },
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => applyItem(editor, range, props, hooks.command),
        render: () => {
          const publish = (p: { items: SlashItem[]; clientRect?: (() => DOMRect | null) | null; command: (i: SlashItem) => void }) =>
            listener({ items: p.items, rect: p.clientRect?.() ?? null, select: p.command });
          return {
            onStart: publish,
            onUpdate: publish,
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                listener(null);
                return true;
              }
              return keyHandler(event);
            },
            onExit: () => listener(null),
          };
        },
      }),
    ];
  },
});

function applyItem(editor: Editor, range: Range, item: SlashItem, app: AppHooks['command']) {
  editor.chain().focus().deleteRange(range).run();
  runCommand(editor, item.command, item.arg, app);
}
