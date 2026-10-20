// Minimal YAML front matter handling: title/subtitle are edited in the UI,
// every other key (date, tags, slug, draft…) is preserved verbatim for the blog.

export type Doc = {
  title: string;
  subtitle: string;
  /** Raw front matter lines other than title/subtitle, kept in order. */
  extra: string[];
  body: string;
};

const unquote = (v: string) => {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
};

export function parseDoc(text: string): Doc {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { title: '', subtitle: '', extra: [], body: text };
  let title = '';
  let subtitle = '';
  const extra: string[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(title|subtitle):\s*(.*)$/.exec(line);
    if (kv) {
      if (kv[1] === 'title') title = unquote(kv[2]);
      else subtitle = unquote(kv[2]);
    } else {
      extra.push(line);
    }
  }
  return { title, subtitle, extra, body: text.slice(m[0].length).replace(/^\r?\n/, '') };
}

export function serializeDoc(doc: Doc): string {
  const lines = [`title: ${JSON.stringify(doc.title)}`];
  if (doc.subtitle) lines.push(`subtitle: ${JSON.stringify(doc.subtitle)}`);
  lines.push(...doc.extra.filter((l, i, a) => l.trim() || i < a.length - 1));
  return `---\n${lines.join('\n')}\n---\n\n${doc.body.trimEnd()}\n`;
}

export const countWords = (s: string) => (s.match(/[\p{L}\p{N}’'-]+/gu) || []).length;

/** Words in a Markdown file, ignoring front matter and HTML markup (embeds, SVG). */
export const countMarkdownWords = (md: string) =>
  countWords(md.replace(/^---[\s\S]*?---/, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));
