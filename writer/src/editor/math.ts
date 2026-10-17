// LaTeX math, rendered with KaTeX and stored as standard Markdown math:
//   inline  $e^{i\pi} + 1 = 0$
//   block   $$
//           \int_0^1 x^2\,dx
//           $$
// Most blog engines (Hugo, Astro, Jekyll, Ghost…) render this with KaTeX or MathJax.
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { Node as PMNode } from '@tiptap/pm/model';

// Minimal shapes of markdown-it's rule state (the package ships without types here).
type Token = { content: string; block: boolean; map: [number, number] | null };
type StateInline = { src: string; pos: number; push(type: string, tag: string, nesting: number): Token };
type StateBlock = { src: string; bMarks: number[]; eMarks: number[]; tShift: number[]; line: number; push(type: string, tag: string, nesting: number): Token };
type Rule = (...args: any[]) => boolean;
type MarkdownIt = {
  inline: { ruler: { after(name: string, rule: string, fn: Rule): void } };
  block: { ruler: { before(name: string, rule: string, fn: Rule, opts?: object): void } };
  renderer: { rules: Record<string, (tokens: Token[], i: number) => string> };
};
import 'katex/dist/katex.min.css';

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `$…$`, pandoc-style: no space just inside the dollars and no digit right after, so "$5 and $10" stays text. */
function mathInline(state: StateInline, silent: boolean) {
  const { src, pos } = state;
  if (src[pos] !== '$' || src[pos + 1] === '$') return false;
  const first = src[pos + 1];
  if (!first || /\s/.test(first)) return false;
  let end = pos + 1;
  for (;;) {
    end = src.indexOf('$', end);
    if (end === -1) return false;
    if (src[end - 1] === '\\') {
      end++;
      continue;
    }
    break;
  }
  if (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] ?? '')) return false;
  if (!silent) state.push('math_inline', '', 0).content = src.slice(pos + 1, end);
  state.pos = end + 1;
  return true;
}

/** `$$ … $$` on their own lines, or `$$…$$` on one line. */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean) {
  const lineText = (n: number) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
  const first = lineText(startLine);
  if (!first.startsWith('$$')) return false;
  const rest = first.slice(2).trim();
  let content: string;
  let last = startLine;
  if (rest.endsWith('$$') && rest.length >= 2) {
    content = rest.slice(0, -2).trim();
  } else {
    const lines = rest ? [rest] : [];
    let closed = false;
    for (last = startLine + 1; last < endLine; last++) {
      const line = lineText(last).trimEnd();
      if (line.endsWith('$$')) {
        if (line.slice(0, -2).trim()) lines.push(line.slice(0, -2));
        closed = true;
        break;
      }
      lines.push(line);
    }
    if (!closed) return false;
    content = lines.join('\n').trim();
  }
  if (silent) return true;
  const token = state.push('math_block', '', 0);
  token.block = true;
  token.content = content;
  token.map = [startLine, last + 1];
  state.line = last + 1;
  return true;
}

function mathPlugin(md: MarkdownIt) {
  if ((md as any).__writerMath) return; // tiptap-markdown calls setup on every parse
  (md as any).__writerMath = true;
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (tokens, i) => `<span data-type="inline-math" data-latex="${escapeAttr(tokens[i].content)}"></span>`;
  md.renderer.rules.math_block = (tokens, i) => `<div data-type="block-math" data-latex="${escapeAttr(tokens[i].content)}"></div>\n`;
}

export type MathTarget = { kind: 'inline' | 'block'; pos: number | null; latex: string };
export type MathClick = (target: MathTarget) => void;

export function mathExtensions(onEdit: MathClick) {
  return [
    InlineMath.extend({
      addStorage() {
        return {
          markdown: {
            serialize(state: any, node: PMNode) {
              state.write(`$${node.attrs.latex}$`);
            },
            parse: { setup: mathPlugin },
          },
        };
      },
    }).configure({
      katexOptions: { throwOnError: false },
      onClick: (node, pos) => onEdit({ kind: 'inline', pos, latex: node.attrs.latex }),
    }),
    BlockMath.extend({
      addStorage() {
        return {
          markdown: {
            serialize(state: any, node: PMNode) {
              state.write('$$');
              state.ensureNewLine();
              state.text(node.attrs.latex, false);
              state.ensureNewLine();
              state.write('$$');
              state.closeBlock(node);
            },
            parse: { setup: mathPlugin },
          },
        };
      },
      addKeyboardShortcuts() {
        return {
          // Typing $$ on an empty line and pressing Enter opens the equation editor.
          Enter: ({ editor }) => {
            const { $from, empty } = editor.state.selection;
            if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.textContent.trim() !== '$$') return false;
            editor.chain().deleteRange({ from: $from.start(), to: $from.end() }).run();
            onEdit({ kind: 'block', pos: null, latex: '' });
            return true;
          },
        };
      },
    }).configure({
      katexOptions: { throwOnError: false, displayMode: true },
      onClick: (node, pos) => onEdit({ kind: 'block', pos, latex: node.attrs.latex }),
    }),
  ];
}
