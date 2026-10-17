// A handle that appears beside whichever block the pointer is over, with a menu
// to delete, duplicate or move it — the easy way to remove tables, drawings,
// equations and other blocks that are awkward to select.
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { useCallback, useEffect, useRef, useState } from 'react';

type Hovered = { pos: number; node: PMNode; rect: DOMRect };

const LABELS: Record<string, string> = {
  paragraph: 'Paragraph',
  heading: 'Heading',
  bulletList: 'List',
  orderedList: 'List',
  taskList: 'Checklist',
  blockquote: 'Quote',
  codeBlock: 'Code block',
  table: 'Table',
  drawing: 'Drawing',
  image: 'Image',
  blockMath: 'Equation',
  horizontalRule: 'Divider',
};

/** The top-level block under the pointer, if any. */
function blockAt(editor: Editor, y: number): Hovered | null {
  const children = Array.from(editor.view.dom.children) as HTMLElement[];
  for (const el of children) {
    const rect = el.getBoundingClientRect();
    if (y < rect.top - 8 || y > rect.bottom + 8) continue;
    let pos: number;
    try {
      pos = editor.view.posAtDOM(el, 0);
    } catch {
      continue;
    }
    const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
    const start = $pos.depth > 0 ? $pos.before(1) : pos;
    const node = editor.state.doc.nodeAt(start);
    if (node && editor.state.doc.resolve(start).depth === 0) return { pos: start, node, rect };
  }
  return null;
}

export function BlockHandle({ editor }: { editor: Editor }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const menuOpen = useRef(false);
  menuOpen.current = menu;

  useEffect(() => {
    const scroller = document.querySelector('.main');
    const onMove = (e: MouseEvent) => {
      if (menuOpen.current) return;
      if (handleRef.current?.contains(e.target as Node)) return;
      const page = editor.view.dom.getBoundingClientRect();
      // Track the pointer across the whole column, including the margin where the handle sits.
      if (e.clientX < page.left - 80 || e.clientX > page.right + 40) return setHovered(null);
      setHovered(blockAt(editor, e.clientY));
    };
    const hide = () => !menuOpen.current && setHovered(null);
    // The handle lives outside the scroller, so moving onto it counts as leaving.
    const onLeave = (e: MouseEvent) => {
      if (handleRef.current?.contains(e.relatedTarget as Node)) return;
      hide();
    };
    scroller?.addEventListener('mousemove', onMove as EventListener);
    scroller?.addEventListener('mouseleave', onLeave as EventListener);
    scroller?.addEventListener('scroll', hide);
    window.addEventListener('keydown', hide);
    return () => {
      scroller?.removeEventListener('mousemove', onMove as EventListener);
      scroller?.removeEventListener('mouseleave', onLeave as EventListener);
      scroller?.removeEventListener('scroll', hide);
      window.removeEventListener('keydown', hide);
    };
  }, [editor]);

  const close = useCallback(() => {
    setMenu(false);
    setHovered(null);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) =>
      !menuRef.current?.contains(e.target as Node) && !handleRef.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [menu, close]);

  if (!hovered) return null;

  // Re-read the node at action time: the document may have changed since hover.
  const current = () => {
    const node = editor.state.doc.nodeAt(hovered.pos);
    return node ? { pos: hovered.pos, node } : null;
  };

  const run = (fn: (pos: number, node: PMNode) => void) => () => {
    const c = current();
    if (c) fn(c.pos, c.node);
    close();
  };

  const remove = run((pos, node) => {
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  });

  const duplicate = run((pos, node) => {
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
  });

  const move = (dir: -1 | 1) =>
    run((pos, node) => {
      const $pos = editor.state.doc.resolve(pos);
      const index = $pos.index(0);
      const sibling = editor.state.doc.maybeChild(index + dir);
      if (!sibling) return;
      const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
      const insertAt = dir === -1 ? pos - sibling.nodeSize : pos + sibling.nodeSize;
      tr.insert(insertAt, node);
      editor.view.dispatch(tr.scrollIntoView());
      editor.commands.focus();
    });

  /** Table actions act on the cell holding the cursor, or the last cell if the cursor is elsewhere. */
  const tableAction = (action: 'addRowAfter' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn') =>
    run((pos, node) => {
      const { from } = editor.state.selection;
      const inside = from > pos && from < pos + node.nodeSize;
      if (!inside) {
        const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + node.nodeSize - 3), -1));
        editor.view.dispatch(tr);
      }
      editor.chain().focus()[action]().run();
    });

  const isTable = hovered.node.type.name === 'table';
  const index = editor.state.doc.resolve(hovered.pos).index(0);
  const label = LABELS[hovered.node.type.name] ?? 'Block';
  const top = hovered.rect.top + (hovered.node.type.name === 'heading' ? 6 : 2);
  const left = editor.view.dom.getBoundingClientRect().left - 34;

  return (
    <>
      <button
        ref={handleRef}
        className={`block-handle${menu ? ' is-open' : ''}`}
        style={{ top, left }}
        title={`${label} options`}
        aria-label={`${label} options`}
        onMouseDown={(e) => e.preventDefault()}
        onMouseLeave={(e) => {
          const into = e.relatedTarget as Node | null;
          if (!menuOpen.current && !document.querySelector('.main')?.contains(into)) setHovered(null);
        }}
        onClick={() => setMenu((m) => !m)}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
          {[2, 8, 14].map((y) => [2, 8].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
        </svg>
      </button>
      {menu && (
        <div ref={menuRef} className="block-menu popover" style={{ top: top + 26, left }} onMouseDown={(e) => e.preventDefault()}>
          <div className="block-menu__label">{label}</div>
          {isTable && (
            <>
              <button onClick={tableAction('addRowAfter')}>Add row</button>
              <button onClick={tableAction('addColumnAfter')}>Add column</button>
              <button onClick={tableAction('deleteRow')}>Delete row</button>
              <button onClick={tableAction('deleteColumn')}>Delete column</button>
              <hr />
            </>
          )}
          <button onClick={move(-1)} disabled={index === 0}>
            Move up
          </button>
          <button onClick={move(1)} disabled={index >= editor.state.doc.childCount - 1}>
            Move down
          </button>
          <button onClick={duplicate}>Duplicate</button>
          <hr />
          <button className="danger" onClick={remove}>
            Delete {label.toLowerCase()}
          </button>
        </div>
      )}
    </>
  );
}
