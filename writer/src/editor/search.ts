// Find & replace inside the document, with highlighted matches.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { textBlocks } from './textblocks';

type Match = { from: number; to: number };
export type SearchState = { query: string; caseSensitive: boolean; matches: Match[]; index: number };

export const searchKey = new PluginKey<SearchState>('search');

function findMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Match[] = [];
  for (const b of textBlocks(doc)) {
    const hay = caseSensitive ? b.text : b.text.toLowerCase();
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
      out.push({ from: b.pos + 1 + i, to: b.pos + 1 + i + needle.length });
    }
  }
  return out;
}

export const Search = Extension.create({
  name: 'search',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: '', caseSensitive: false, matches: [], index: 0 }),
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
            if (!meta && !tr.docChanged) return prev;
            const next = { ...prev, ...meta };
            if (meta?.query !== undefined || meta?.caseSensitive !== undefined || tr.docChanged) {
              next.matches = findMatches(tr.doc, next.query, next.caseSensitive);
            }
            next.index = next.matches.length ? Math.min(Math.max(next.index, 0), next.matches.length - 1) : 0;
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = searchKey.getState(state);
            if (!s?.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.index ? 'search-match current' : 'search-match' })),
            );
          },
        },
      }),
    ];
  },
});

export const getSearch = (state: EditorState) => searchKey.getState(state)!;

function reveal(view: EditorView, index: number) {
  const m = getSearch(view.state).matches[index];
  if (!m) return;
  const tr = view.state.tr.setMeta(searchKey, { index });
  tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
  view.dispatch(tr);
}

export function setQuery(view: EditorView, query: string, caseSensitive?: boolean) {
  const sel = view.state.selection.from;
  view.dispatch(view.state.tr.setMeta(searchKey, { query, ...(caseSensitive !== undefined && { caseSensitive }) }));
  // Jump to the first match after the cursor.
  const { matches } = getSearch(view.state);
  const i = matches.findIndex((m) => m.from >= sel);
  if (matches.length) {
    view.dispatch(view.state.tr.setMeta(searchKey, { index: i === -1 ? 0 : i }));
    const m = matches[i === -1 ? 0 : i];
    view.domAtPos(m.from).node?.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
}

export function findNext(view: EditorView, dir: 1 | -1 = 1) {
  const { matches, index } = getSearch(view.state);
  if (!matches.length) return;
  reveal(view, (index + dir + matches.length) % matches.length);
}

export function replaceCurrent(view: EditorView, text: string) {
  const { matches, index } = getSearch(view.state);
  const m = matches[index];
  if (!m) return;
  view.dispatch(text ? view.state.tr.insertText(text, m.from, m.to) : view.state.tr.delete(m.from, m.to));
  reveal(view, Math.min(index, getSearch(view.state).matches.length - 1));
}

export function replaceAll(view: EditorView, text: string) {
  const { matches } = getSearch(view.state);
  if (!matches.length) return;
  const tr = view.state.tr;
  for (const m of [...matches].reverse()) {
    if (text) tr.insertText(text, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  view.dispatch(tr);
}

export function clearSearch(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(searchKey, { query: '' }));
}
