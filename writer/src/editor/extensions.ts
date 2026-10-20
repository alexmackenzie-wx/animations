import { Extension, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Markdown } from 'tiptap-markdown';
import { AlignedHeading, AlignedParagraph, MixedTaskLists } from './markdown';
import { FancyCodeBlock } from './CodeBlock';
import { LocalImage } from './Image';
import { Drawing } from './Drawing';
import { Grammar, type GrammarOptions } from './grammar';
import { Search } from './search';
import { highlightPlugin } from './highlight';
import { SlashCommand } from './slash';
import { mathExtensions } from './math';
import { HtmlBlock } from './HtmlBlock';

/** Marks the top-level block holding the cursor, so focus mode can dim the rest. */
const FocusBlock = Extension.create({
  name: 'focusBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { $head } = state.selection;
            if ($head.depth < 1) return null;
            const pos = $head.before(1);
            const node = state.doc.nodeAt(pos);
            return node ? DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: 'has-focus' })]) : null;
          },
        },
      }),
    ];
  },
});

const Highlight = Extension.create({
  name: 'codeHighlight',
  addProseMirrorPlugins: () => [highlightPlugin()],
});

export type AppHooks = {
  /** Runs an app-level command (link prompt, find bar, image picker…). */
  command: (name: string, arg?: unknown) => void;
};

/**
 * Word-processor shortcuts not covered by Tiptap's defaults. Shown in the
 * native menu (which doesn't register them) so they appear where you'd expect.
 */
const Shortcuts = Extension.create<AppHooks>({
  name: 'writerShortcuts',
  priority: 1000,
  addOptions: () => ({ command: () => {} }),
  addKeyboardShortcuts() {
    const run = (name: string, arg?: unknown) => () => {
      runCommand(this.editor, name, arg, this.options.command);
      return true;
    };
    return {
      'Mod-Shift-j': run('align', 'justify'),
      'Mod-Shift-x': run('strike'),
      'Mod-Shift-c': run('code'),
      'Mod-e': () => true, // reserved for the upcoming Claude review command
      'Mod-k': run('link'),
      'Mod-\\': run('clear'),
      'Mod-Shift-d': run('drawing', 'sketch'),
      'Mod-Alt-d': run('drawing', 'wireframe'),
      'Mod-Alt-t': run('table'),
      'Mod-Shift--': run('divider'),
      'Mod-Shift-i': run('image'),
      'Mod-Shift-m': run('mathInline'),
      'Mod-Alt-m': run('mathBlock'),
      'Mod-Alt-h': run('htmlBlock'),
      'Mod-f': run('find'),
      'Mod-Alt-f': run('replace'),
      'Mod-g': run('findNext'),
      'Mod-Shift-g': run('findPrev'),
    };
  },
});

export function buildExtensions(hooks: AppHooks, grammar: Partial<GrammarOptions>) {
  return [
    StarterKit.configure({
      paragraph: false,
      heading: false,
      codeBlock: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } },
      dropcursor: { color: 'var(--accent)', width: 2 },
    }),
    AlignedParagraph,
    AlignedHeading.configure({ levels: [1, 2, 3, 4] }),
    // Justified is the default (no attribute); only explicit overrides are stored.
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
    FancyCodeBlock,
    LocalImage,
    Drawing,
    HtmlBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    MixedTaskLists,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Typography,
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Start writing, or type / for blocks…'),
      includeChildren: false,
    }),
    CharacterCount,
    Markdown.configure({ html: true, tightLists: true, linkify: false, breaks: false, transformPastedText: true, transformCopiedText: false }),
    Grammar.configure(grammar),
    Search,
    FocusBlock,
    Highlight,
    Shortcuts.configure(hooks),
    SlashCommand.configure(hooks),
    ...mathExtensions((target) => hooks.command('editMath', target)),
  ];
}

/** One place that maps menu items and shortcuts to editor actions. */
export function runCommand(editor: Editor, name: string, arg: unknown, app: AppHooks['command']) {
  const c = editor.chain().focus();
  switch (name) {
    case 'undo': return c.undo().run();
    case 'redo': return c.redo().run();
    case 'bold': return c.toggleBold().run();
    case 'italic': return c.toggleItalic().run();
    case 'underline': return c.toggleUnderline().run();
    case 'strike': return c.toggleStrike().run();
    case 'code': return c.toggleCode().run();
    case 'clear': return c.unsetAllMarks().clearNodes().unsetTextAlign().run();
    case 'paragraph': return c.setParagraph().run();
    case 'h1': return c.toggleHeading({ level: 1 }).run();
    case 'h2': return c.toggleHeading({ level: 2 }).run();
    case 'h3': return c.toggleHeading({ level: 3 }).run();
    case 'bulletList': return c.toggleBulletList().run();
    case 'orderedList': return c.toggleOrderedList().run();
    case 'taskList': return c.toggleTaskList().run();
    case 'blockquote': return c.toggleBlockquote().run();
    case 'codeBlock': return c.toggleCodeBlock().run();
    case 'align': return arg === 'justify' || !arg ? c.unsetTextAlign().run() : c.setTextAlign(arg as string).run();
    case 'divider': return c.setHorizontalRule().run();
    case 'table': return c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case 'drawing': return c.insertDrawing(arg === 'wireframe' ? 'wireframe' : 'sketch').run();
    case 'htmlBlock': return c.insertHtmlBlock().run();
    case 'mathInline':
    case 'mathBlock': {
      const { from, to } = editor.state.selection;
      const latex = editor.state.doc.textBetween(from, to, ' ');
      return app('editMath', { kind: name === 'mathBlock' ? 'block' : 'inline', pos: null, latex });
    }
    default: return app(name, arg);
  }
}
