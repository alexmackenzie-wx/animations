// Images: relative paths (./assets/…) are resolved against the open document.
import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { docContext } from '../lib/docContext';

const isRemote = (src: string) => /^(https?:|data:|blob:)/i.test(src);

export function useResolvedSrc(src: string | null | undefined, version?: unknown) {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!src) setResolved(null);
    else if (isRemote(src)) setResolved(src);
    else if (docContext.path)
      window.writer
        .assetDataUrl(docContext.path, src)
        .then((url) => live && setResolved(url))
        .catch(() => live && setResolved(null));
    return () => {
      live = false;
    };
  }, [src, version]);
  return resolved;
}

function ImageView({ node, selected }: ReactNodeViewProps) {
  const src = useResolvedSrc(node.attrs.src);
  return (
    <NodeViewWrapper className={`figure${selected ? ' is-selected' : ''}`} data-drag-handle>
      {src ? <img src={src} alt={node.attrs.alt || ''} title={node.attrs.title || undefined} draggable={false} /> : <div className="figure__missing">Image not found: {node.attrs.src}</div>}
    </NodeViewWrapper>
  );
}

export const LocalImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ inline: false, allowBase64: true });
