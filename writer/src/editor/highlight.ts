// Syntax highlighting for code blocks via Shiki, loaded lazily per language.
import { createHighlightPlugin } from 'prosemirror-highlight';
import { createParser, type Parser } from 'prosemirror-highlight/shiki';
import { bundledLanguagesInfo, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki';

export const CODE_THEME = 'tokyo-night';

let highlighter: Highlighter | undefined;
let loading: Promise<void> | undefined;
let parser: Parser | undefined;
// While a language loads, keep returning its promise: returning plain tokens
// instead would be cached by prosemirror-highlight until the block is edited.
const pendingLangs = new Map<string, Promise<void>>();
const failedLangs = new Set<string>();

const known = new Set(bundledLanguagesInfo.flatMap((l) => [l.id, ...(l.aliases ?? [])]));

/** Languages offered in the code block picker (any Shiki language also works when typed in Markdown). */
export const LANGUAGES: [id: string, label: string][] = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['diff', 'Diff'],
  ['dockerfile', 'Dockerfile'],
  ['go', 'Go'],
  ['graphql', 'GraphQL'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['jsx', 'JSX'],
  ['kotlin', 'Kotlin'],
  ['lua', 'Lua'],
  ['markdown', 'Markdown'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['scss', 'SCSS'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['toml', 'TOML'],
  ['tsx', 'TSX'],
  ['typescript', 'TypeScript'],
  ['yaml', 'YAML'],
  ['zig', 'Zig'],
];

export function languageLabel(id: string | null | undefined) {
  if (!id) return 'Plain text';
  const entry = LANGUAGES.find(([l]) => l === id);
  if (entry) return entry[1];
  return bundledLanguagesInfo.find((l) => l.id === id || l.aliases?.includes(id))?.name ?? id;
}

const lazyParser: Parser = (options) => {
  if (!highlighter) {
    loading ??= createHighlighter({ themes: [CODE_THEME], langs: [] }).then((h) => {
      highlighter = h;
    });
    return loading;
  }
  const h = highlighter;
  const lang = (options.language || '').toLowerCase();
  const usable = lang && known.has(lang) && !failedLangs.has(lang);
  if (usable && !h.getLoadedLanguages().includes(lang)) {
    let pending = pendingLangs.get(lang);
    if (!pending) {
      pending = h
        .loadLanguage(lang as BundledLanguage)
        .catch((err) => {
          console.warn('Could not load language', lang, err);
          failedLangs.add(lang);
        })
        .finally(() => pendingLangs.delete(lang));
      pendingLangs.set(lang, pending);
    }
    return pending;
  }
  parser ??= createParser(h, { theme: CODE_THEME });
  return parser({ ...options, language: usable ? lang : 'text' });
};

export const highlightPlugin = () => createHighlightPlugin({ parser: lazyParser });
