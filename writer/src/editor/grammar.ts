// Local, private grammar checking powered by Harper (https://writewithharper.com),
// running as WebAssembly in a worker. Spelling is left to macOS's native
// spellchecker, which already learns your vocabulary.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { textBlocks } from './textblocks';

export type LintInfo = {
  from: number;
  to: number;
  kind: string;
  title: string;
  message: string;
  suggestions: string[];
  key: string;
};

type BlockLint = Omit<LintInfo, 'from' | 'to'> & { start: number; end: number };

export const grammarKey = new PluginKey<GrammarState>('grammar');

const SKIP_KINDS = new Set(['Spelling']);
const IGNORED_STORE = 'writer.ignoredLints';

const ignored = new Set<string>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(IGNORED_STORE) || '[]') as string[];
    } catch {
      return [];
    }
  })(),
);

export function ignoreLint(key: string) {
  ignored.add(key);
  localStorage.setItem(IGNORED_STORE, JSON.stringify([...ignored]));
}

type HarperLinter = import('harper.js').WorkerLinter;
let linterPromise: Promise<HarperLinter> | null = null;

function getLinter() {
  linterPromise ??= (async () => {
    const [{ WorkerLinter }, { binary }] = await Promise.all([import('harper.js'), import('harper.js/binary')]);
    const linter = new WorkerLinter({ binary });
    await linter.setup();
    return linter;
  })();
  return linterPromise;
}

/** Harper reports spans in Unicode scalar values; JS strings index UTF-16 units. */
function scalarToUtf16(text: string) {
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    map.push(i);
    i += ch.length;
  }
  map.push(i);
  return map;
}

const cache = new Map<string, BlockLint[]>();

async function lintBlock(text: string): Promise<BlockLint[]> {
  const hit = cache.get(text);
  if (hit) return hit;
  const linter = await getLinter();
  const lints = await linter.lint(text, { language: 'plaintext' });
  const map = scalarToUtf16(text);
  const out: BlockLint[] = [];
  for (const l of lints) {
    const kind = l.lint_kind();
    if (SKIP_KINDS.has(kind)) continue;
    const span = l.span();
    const start = map[span.start] ?? span.start;
    const end = map[span.end] ?? span.end;
    const problem = text.slice(start, end);
    out.push({
      start,
      end,
      kind,
      title: l.lint_kind_pretty(),
      message: l.message(),
      suggestions: l.suggestions().map((s) => s.get_replacement_text()),
      key: `${kind}|${problem}|${l.message()}`,
    });
  }
  if (cache.size > 2000) cache.clear();
  cache.set(text, out);
  return out;
}

async function lintDoc(state: EditorState): Promise<DecorationSet> {
  const blocks = textBlocks(state.doc, (n) => n.type.name !== 'codeBlock' && n.textContent.trim().length > 0);
  const decos: Decoration[] = [];
  for (const b of blocks) {
    for (const l of await lintBlock(b.text)) {
      if (ignored.has(l.key) || l.end <= l.start) continue;
      const from = b.pos + 1 + l.start;
      const to = b.pos + 1 + l.end;
      const info: LintInfo = { ...l, from, to };
      decos.push(Decoration.inline(from, to, { class: `lint lint-${l.kind.toLowerCase()}` }, { lint: info }));
    }
  }
  return DecorationSet.create(state.doc, decos);
}

export type GrammarOptions = {
  isEnabled: () => boolean;
  onLintClick: (lint: LintInfo, rect: DOMRect) => void;
  onCount: (n: number) => void;
};

type GrammarState = { set: DecorationSet; version: number };

export const Grammar = Extension.create<GrammarOptions>({
  name: 'grammar',
  addOptions() {
    return { isEnabled: () => true, onLintClick: () => {}, onCount: () => {} };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<GrammarState>({
        key: grammarKey,
        state: {
          init: () => ({ set: DecorationSet.empty, version: 0 }),
          apply(tr, prev) {
            const next = tr.getMeta(grammarKey) as DecorationSet | undefined;
            if (next) return { ...prev, set: next };
            if (tr.getMeta(REFRESH)) {
              const kept = prev.set.find().filter((d) => !ignored.has((d.spec.lint as LintInfo).key));
              return { set: DecorationSet.create(tr.doc, kept), version: prev.version + 1 };
            }
            return tr.docChanged ? { ...prev, set: prev.set.map(tr.mapping, tr.doc) } : prev;
          },
        },
        props: {
          decorations: (state) => grammarKey.getState(state)?.set,
          handleClick(view, pos) {
            const set = grammarKey.getState(view.state)?.set;
            const found = set?.find(pos, pos, (spec) => !!spec.lint)[0];
            if (!found) return false;
            const lint = found.spec.lint as LintInfo;
            const start = view.coordsAtPos(found.from);
            const end = view.coordsAtPos(found.to);
            options.onLintClick(
              { ...lint, from: found.from, to: found.to },
              new DOMRect(start.left, start.top, Math.max(end.right - start.left, 1), start.bottom - start.top),
            );
            return false;
          },
        },
        view(view: EditorView) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let disposed = false;
          const publish = (set: DecorationSet) => {
            view.dispatch(view.state.tr.setMeta(grammarKey, set).setMeta('addToHistory', false));
            options.onCount(set.find().length);
          };
          const run = async () => {
            if (disposed) return;
            if (!options.isEnabled()) return publish(DecorationSet.empty);
            const doc = view.state.doc;
            try {
              const set = await lintDoc(view.state);
              if (disposed) return;
              // The document moved on while we were linting; try again shortly.
              if (view.state.doc !== doc) return schedule(400);
              publish(set);
            } catch (err) {
              console.warn('Grammar check failed', err);
            }
          };
          const schedule = (ms = 700) => {
            clearTimeout(timer);
            timer = setTimeout(run, ms);
          };
          schedule(300);
          return {
            update(v, prev) {
              if (v.state.doc !== prev.doc) schedule();
              else if (grammarKey.getState(v.state)?.version !== grammarKey.getState(prev)?.version) schedule(0);
            },
            destroy() {
              disposed = true;
              clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});

const REFRESH = 'grammar:refresh';

/** Re-check now: after toggling the setting or ignoring a rule. */
export function refreshGrammar(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(REFRESH, true).setMeta('addToHistory', false));
}
