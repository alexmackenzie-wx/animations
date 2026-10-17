// Popover for writing LaTeX with a live KaTeX preview.
import type { Editor } from '@tiptap/core';
import katex from 'katex';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MathTarget } from '../editor/math';

export function MathEditor({ editor, target, onClose }: { editor: Editor; target: MathTarget; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [latex, setLatex] = useState(target.latex);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  const block = target.kind === 'block';

  const anchor = useMemo(() => {
    if (target.pos != null) {
      const dom = editor.view.nodeDOM(target.pos) as HTMLElement | null;
      if (dom?.getBoundingClientRect) return dom.getBoundingClientRect();
    }
    const c = editor.view.coordsAtPos(editor.state.selection.from);
    return new DOMRect(c.left, c.top, 1, c.bottom - c.top);
  }, [editor, target]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(12, block ? anchor.left + anchor.width / 2 - w / 2 : anchor.left), window.innerWidth - w - 12);
    const top = anchor.bottom + 10 + h > window.innerHeight - 12 ? Math.max(12, anchor.top - h - 10) : anchor.bottom + 10;
    setPos({ left, top });
  }, [anchor, block, latex]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const preview = useMemo(() => {
    if (!latex.trim()) return '';
    return katex.renderToString(latex, { throwOnError: false, displayMode: block });
  }, [latex, block]);

  const apply = () => {
    const value = latex.trim();
    const chain = editor.chain().focus();
    if (target.pos == null) {
      // Started from a selection: the equation replaces the selected text.
      if (value && !editor.state.selection.empty) chain.deleteSelection();
      if (value && block) {
        // An equation on an empty line replaces the line; otherwise it goes after the current block.
        const { $from } = editor.state.selection;
        const node = { type: 'blockMath', attrs: { latex: value } };
        const emptyLine = $from.depth > 0 && $from.parent.isTextblock && $from.parent.content.size === 0;
        const at = emptyLine ? { from: $from.before(), to: $from.after() } : $from.depth > 0 ? $from.after(1) : $from.pos;
        chain.insertContentAt(at, node).run();
      } else if (value) chain.insertInlineMath({ latex: value }).run();
    } else if (!value) {
      remove();
      return;
    } else {
      (block ? chain.updateBlockMath({ latex: value, pos: target.pos }) : chain.updateInlineMath({ latex: value, pos: target.pos })).run();
    }
    onClose();
  };

  const remove = () => {
    if (target.pos != null) {
      const node = editor.state.doc.nodeAt(target.pos);
      if (node) editor.chain().focus().deleteRange({ from: target.pos, to: target.pos + node.nodeSize }).run();
    }
    onClose();
  };

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const t = setTimeout(() => window.addEventListener('mousedown', down), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', down);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="popover math-editor" style={pos} role="dialog" aria-label="Edit equation">
      <div className="math-editor__label">{block ? 'Equation' : 'Inline math'}</div>
      <textarea
        ref={input}
        value={latex}
        spellCheck={false}
        placeholder={block ? '\\int_0^1 x^2\\,dx = \\frac{1}{3}' : 'e^{i\\pi} + 1 = 0'}
        rows={block ? 3 : 1}
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            editor.commands.focus();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !block)) {
            e.preventDefault();
            apply();
          }
        }}
      />
      <div className={`math-editor__preview${preview ? '' : ' is-empty'}`} dangerouslySetInnerHTML={{ __html: preview || 'Preview' }} />
      <div className="math-editor__actions">
        {target.pos != null && (
          <button className="btn btn--ghost btn--sm" onClick={remove}>
            Delete
          </button>
        )}
        <span className="math-editor__hint">{block ? '⌘↵ to finish' : '↵ to finish'}</span>
        <button className="btn btn--primary btn--sm" onClick={apply}>
          Done
        </button>
      </div>
    </div>
  );
}
