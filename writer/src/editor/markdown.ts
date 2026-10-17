// Markdown serialization tweaks.
//
// Body text is justified by default and that default is *not* written to the
// file. If you explicitly align a paragraph or heading (left/center/right), it is
// saved as a tiny HTML block — the only portable way to express alignment in
// Markdown — which every blog renderer passes straight through.
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import { Extension } from '@tiptap/core';
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model';
import { defaultMarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown';

type Serialize = (state: MarkdownSerializerState, node: PMNode, parent: PMNode, index: number) => void;

function alignedHTML(node: PMNode) {
  const tag = node.type.name === 'heading' ? `h${node.attrs.level}` : 'p';
  const holder = document.createElement('div');
  holder.appendChild(DOMSerializer.fromSchema(node.type.schema).serializeFragment(node.content));
  return `<${tag} style="text-align: ${node.attrs.textAlign}">${holder.innerHTML}</${tag}>`;
}

const withAlignment =
  (fallback: Serialize): Serialize =>
  (state, node, parent, index) => {
    if (node.attrs.textAlign) {
      state.write(alignedHTML(node));
      state.closeBlock(node);
    } else {
      fallback(state, node, parent, index);
    }
  };

export const AlignedParagraph = Paragraph.extend({
  addStorage() {
    return { markdown: { serialize: withAlignment(defaultMarkdownSerializer.nodes.paragraph as Serialize), parse: {} } };
  },
});

export const AlignedHeading = Heading.extend({
  addStorage() {
    return { markdown: { serialize: withAlignment(defaultMarkdownSerializer.nodes.heading as Serialize), parse: {} } };
  },
});

/**
 * markdown-it-task-lists turns a whole list into a checklist if *any* item has a
 * checkbox, which garbles lists that mix bullets and tasks. Split such lists
 * into runs of plain bullets and runs of tasks instead.
 */
export const MixedTaskLists = Extension.create({
  name: 'mixedTaskLists',
  priority: 1, // run after the task list's own DOM fix-ups
  addStorage() {
    return {
      markdown: {
        parse: {
          updateDOM(element: HTMLElement) {
            for (const list of Array.from(element.querySelectorAll<HTMLElement>('ul[data-type="taskList"]'))) {
              const items = Array.from(list.children) as HTMLElement[];
              const isTask = (li: HTMLElement) => li.classList.contains('task-list-item');
              if (items.every(isTask)) continue;
              const runs: { task: boolean; items: HTMLElement[] }[] = [];
              for (const li of items) {
                const task = isTask(li);
                if (runs.at(-1)?.task === task) runs.at(-1)!.items.push(li);
                else runs.push({ task, items: [li] });
              }
              for (const run of runs) {
                const ul = document.createElement('ul');
                if (run.task) {
                  ul.setAttribute('data-type', 'taskList');
                  ul.className = 'contains-task-list';
                }
                ul.append(...run.items);
                list.before(ul);
              }
              list.remove();
            }
          },
        },
      },
    };
  },
});
