// Raw HTML blocks (SVG animations, embeds, widgets). Written to Markdown verbatim,
// so they publish exactly as authored; shown here as a live, sandboxed preview.
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useCallback, useEffect } from 'react';
import { EmbedFrame } from '../components/EmbedFrame';
import { htmlBus } from '../lib/htmlBus';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlBlock: {
      insertHtmlBlock: () => ReturnType;
    };
  }
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * HTML the editor itself writes stays editable rather than becoming an embed:
 * aligned paragraphs/headings (see markdown.ts) and tables too rich for GFM syntax.
 */
const EDITABLE = /^(<(p|h[1-6]) style="text-align: (left|center|right)">[\s\S]*<\/\2>|<table[\s>][\s\S]*<\/table>)\s*$/;

// CommonMark starts an HTML block at these tags. Anything else whose first line
// isn't one complete tag (like an <svg> with attributes over several lines) is
// wrapped in a <div> so it always parses back as one block.
const BLOCK_START =
  /^\s*(<!--|<\?|<![A-Z]|<!\[CDATA\[|<(script|pre|style|textarea)[\s>]|<\/?(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)[\s/>])/i;

export function normalizeHtml(html: string) {
  // A blank line would end the HTML block in Markdown, so drop empty lines.
  let out = html.replace(/\r\n/g, '\n').replace(/\n[ \t]*(?=\n)/g, '').trim();
  const firstLine = out.split('\n', 1)[0];
  // CommonMark also accepts any complete tag alone on the first line, e.g. `<svg viewBox="…">`.
  const completeTag = /^<\/?[a-zA-Z][\w-]*(\s+[^<>]*)?\/?>\s*$/.test(firstLine);
  if (!BLOCK_START.test(out) && !completeTag && !/^<!doctype/i.test(out)) out = `<div>\n${out}\n</div>`;
  return out;
}

function htmlBlockPlugin(md: any) {
  if (md.__writerHtml) return;
  md.__writerHtml = true;
  const fallback = md.renderer.rules.html_block ?? ((tokens: any[], i: number) => tokens[i].content);
  md.renderer.rules.html_block = (tokens: any[], i: number, ...rest: unknown[]) => {
    const content: string = tokens[i].content;
    if (EDITABLE.test(content.trim())) return fallback(tokens, i, ...rest);
    return `<div data-type="html-block" data-html="${escapeAttr(content.trim())}"></div>\n`;
  };
}

const isComment = (html: string) => /^<!--[\s\S]*-->$/.test(html.trim());

function HtmlBlockView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const html: string = node.attrs.html || '';
  const pending: boolean = node.attrs.pending;

  const edit = useCallback(() => {
    htmlBus.open({
      html,
      onSave: (next) => (next.trim() ? updateAttributes({ html: next.trim(), pending: false }) : deleteNode()),
      onCancel: () => !html.trim() && deleteNode(),
    });
  }, [html, updateAttributes, deleteNode]);

  useEffect(() => {
    if (pending) {
      updateAttributes({ pending: false });
      edit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isComment(html)) {
    return (
      <NodeViewWrapper className={`html-comment${selected ? ' is-selected' : ''}`} onDoubleClick={edit} data-drag-handle>
        <code>{html.trim()}</code>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={`html-block${selected ? ' is-selected' : ''}`} data-drag-handle>
      {html.trim() ? <EmbedFrame html={html} /> : <div className="html-block__empty">Empty HTML block</div>}
      {/* Clicks pass into the iframe, so a strip and a button handle selection and editing. */}
      <div className="html-block__bar" contentEditable={false}>
        <span>HTML</span>
        <button type="button" onClick={edit}>
          Edit HTML
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      html: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-html') ?? '',
        renderHTML: (attrs) => ({ 'data-html': attrs.html }),
      },
      pending: { default: false, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="html-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'html-block' })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(normalizeHtml(node.attrs.html || ''));
          state.closeBlock(node);
        },
        parse: { setup: htmlBlockPlugin },
      },
    };
  },

  addCommands() {
    return {
      insertHtmlBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { html: '', pending: true } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView);
  },
});
