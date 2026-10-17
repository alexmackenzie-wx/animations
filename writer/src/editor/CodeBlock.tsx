// Code blocks rendered as a floating "window" card, in the spirit of ray.so.
import CodeBlock from '@tiptap/extension-code-block';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { LANGUAGES, languageLabel } from './highlight';

function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const lang: string = node.attrs.language || '';
  const [copied, setCopied] = useState(false);
  const options = LANGUAGES.some(([id]) => id === lang) ? LANGUAGES : [...LANGUAGES, [lang, languageLabel(lang)] as [string, string]];

  const copy = async () => {
    await navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <NodeViewWrapper className="code-card" data-language={lang || 'text'}>
      <div className="code-card__bar" contentEditable={false}>
        <span className="code-card__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <label className="code-card__lang">
          <span>{languageLabel(lang)}</span>
          <select
            value={lang}
            disabled={!editor.isEditable}
            onChange={(e) => updateAttributes({ language: e.target.value || null })}
            aria-label="Code language"
          >
            {options.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="code-card__copy" onClick={copy} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const FancyCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // Select just the code when pressing Cmd+A inside a block.
      'Mod-a': () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name !== 'codeBlock') return false;
        const start = $from.start();
        const end = $from.end();
        const sel = this.editor.state.selection;
        if (sel.from === start && sel.to === end) return false;
        return this.editor.commands.setTextSelection({ from: start, to: end });
      },
    };
  },
}).configure({ defaultLanguage: null, enableTabIndentation: true, tabSize: 2 });
