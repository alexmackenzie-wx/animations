import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ignoreLint, refreshGrammar, type LintInfo } from '../editor/grammar';

/** Floating formatting toolbar shown over a text selection. */
export function SelectionToolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const b = (label: string, active: boolean, run: () => void, title: string, cls = '') => (
    <button className={`${active ? 'is-active ' : ''}${cls}`} onMouseDown={(e) => e.preventDefault()} onClick={run} title={title} type="button">
      {label}
    </button>
  );
  return (
    <BubbleMenu
      editor={editor}
      className="toolbar"
      shouldShow={({ editor, state }) =>
        // Only for selected text — not for a selected block like an equation, drawing or image.
        state.selection instanceof TextSelection && !state.selection.empty && editor.isEditable && !editor.isActive('codeBlock')
      }
      options={{ placement: 'top', offset: 10 }}
    >
      {b('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold ⌘B', 'tb-bold')}
      {b('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic ⌘I', 'tb-italic')}
      {b('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Strikethrough ⌘⇧X', 'tb-strike')}
      {b('</>', editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'Inline code ⌘⇧C', 'tb-code')}
      {b('Link', editor.isActive('link'), onLink, 'Link ⌘K')}
      <span className="toolbar__sep" />
      {b('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading ⌥⌘2')}
      {b('H3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Subheading ⌥⌘3')}
      {b('“ ”', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Quote ⌘⇧B')}
    </BubbleMenu>
  );
}

function usePlacement(rect: DOMRect, ref: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 8 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
    const below = rect.bottom + 8;
    const top = below + h > window.innerHeight - 12 ? rect.top - h - 8 : below;
    setPos({ left, top });
  }, [rect, ref]);
  return pos;
}

function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [ref, onClose]);
}

/** ⌘K: add, edit or remove a link on the selection. */
export function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>(editor.getAttributes('link').href ?? '');
  const [rect] = useState(() => {
    const { from, to } = editor.state.selection;
    const a = editor.view.coordsAtPos(from);
    const b = editor.view.coordsAtPos(to);
    return new DOMRect(a.left, a.top, b.right - a.left, b.bottom - a.top);
  });
  const pos = usePlacement(rect, ref);
  useDismiss(ref, onClose);

  const apply = () => {
    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) chain.unsetLink().run();
    else {
      const normalized = /^[a-z][a-z0-9+.-]*:|^[#/]/i.test(href) ? href : `https://${href}`;
      if (editor.state.selection.empty && !editor.isActive('link')) {
        editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href: normalized } }] }).run();
      } else chain.setLink({ href: normalized }).run();
    }
    onClose();
  };

  return (
    <div ref={ref} className="popover link-popover" style={pos}>
      <input
        autoFocus
        placeholder="Paste or type a link"
        value={url}
        spellCheck={false}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
      <button className="btn btn--primary btn--sm" onClick={apply}>
        {url ? 'Apply' : 'Remove'}
      </button>
    </div>
  );
}

/** Click a grammar underline: explanation, one-click fixes, or ignore. */
export function GrammarPopover({ editor, lint, rect, onClose }: { editor: Editor; lint: LintInfo; rect: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = usePlacement(rect, ref);
  useDismiss(ref, onClose);

  const apply = (text: string) => {
    editor.chain().focus().insertContentAt({ from: lint.from, to: lint.to }, text).run();
    onClose();
  };

  return (
    <div ref={ref} className="popover grammar-popover" style={pos}>
      <div className="grammar-popover__kind">{lint.title}</div>
      <p className="grammar-popover__msg">{lint.message}</p>
      {lint.suggestions.length > 0 && (
        <div className="grammar-popover__fixes">
          {lint.suggestions.slice(0, 4).map((s, i) => (
            <button key={i} className="chip" onClick={() => apply(s)}>
              {s === '' ? <em>Remove</em> : s}
            </button>
          ))}
        </div>
      )}
      <button
        className="grammar-popover__ignore"
        onClick={() => {
          ignoreLint(lint.key);
          refreshGrammar(editor.view);
          onClose();
        }}
      >
        Ignore
      </button>
    </div>
  );
}
