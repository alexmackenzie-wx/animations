import type { Node as PMNode } from '@tiptap/pm/model';

export type TextBlock = { node: PMNode; pos: number; text: string };

/**
 * Every textblock in the document with its plain text. Leaf inline nodes
 * (hard breaks, inline images) become a single U+FFFC so that string offsets
 * map 1:1 onto document positions: docPos = pos + 1 + offset.
 */
export function textBlocks(doc: PMNode, include: (node: PMNode) => boolean = () => true): TextBlock[] {
  const out: TextBlock[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (include(node)) out.push({ node, pos, text: node.textBetween(0, node.content.size, undefined, '￼') });
    return false;
  });
  return out;
}
