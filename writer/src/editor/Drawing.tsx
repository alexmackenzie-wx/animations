// A drawing is an Excalidraw scene saved beside the document:
//   drawings/<id>.excalidraw  — the editable scene
//   drawings/<id>.svg         — what the Markdown references: ![Drawing](drawings/<id>.svg)
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';
import { docContext } from '../lib/docContext';
import { drawingBus, type DrawingMode } from '../lib/drawingBus';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawing: {
      insertDrawing: (mode: DrawingMode) => ReturnType;
    };
  }
}

const DRAWING_SRC = /(^|\/)drawings\/([^/]+)\.svg$/;
const newId = () => `drawing-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function DrawingView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { src, alt, pending, v } = node.attrs as { src: string | null; alt: string; pending: DrawingMode | null; v: number };
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (src && docContext.path) window.writer.loadDrawing(docContext.path, src).then((d) => live && setSvg(d.svg));
    return () => {
      live = false;
    };
  }, [src, v]);

  const edit = useCallback(
    async (mode?: DrawingMode) => {
      const docPath = docContext.path;
      if (!docPath) return;
      const existing = src ? await window.writer.loadDrawing(docPath, src) : null;
      const id = src ? DRAWING_SRC.exec(src)?.[2] ?? newId() : newId();
      drawingBus.open({
        mode: mode ?? 'sketch',
        scene: existing?.scene ?? null,
        onSave: async (scene, svgText) => {
          const rel = await window.writer.saveDrawing(docPath, id, scene, svgText);
          updateAttributes({ src: rel, pending: null, v: Date.now() });
          setSvg(svgText);
        },
        onCancel: () => {
          if (!src) deleteNode();
        },
      });
    },
    [src, updateAttributes, deleteNode],
  );

  // Freshly inserted: open the editor straight away.
  useEffect(() => {
    if (pending) {
      updateAttributes({ pending: null });
      edit(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NodeViewWrapper className={`drawing${selected ? ' is-selected' : ''}`} data-drag-handle onDoubleClick={() => edit()}>
      {svg ? (
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={alt || 'Drawing'} draggable={false} />
      ) : (
        <div className="drawing__empty">{src ? 'Loading drawing…' : 'Empty drawing'}</div>
      )}
      <button className="drawing__edit" contentEditable={false} onClick={() => edit()} type="button">
        Edit drawing
      </button>
    </NodeViewWrapper>
  );
}

export const Drawing = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,
  priority: 120,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: 'Drawing' },
      // Not persisted: `pending` opens the editor on insert, `v` busts the preview cache.
      pending: { default: null, rendered: false },
      v: { default: 0, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        priority: 60,
        getAttrs: (el) => {
          const src = (el as HTMLElement).getAttribute('src') || '';
          return DRAWING_SRC.test(src) ? { src, alt: (el as HTMLElement).getAttribute('alt') || 'Drawing' } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.attrs.src) state.write(`![${(node.attrs.alt || 'Drawing').replace(/[[\]]/g, '')}](${node.attrs.src})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },

  addCommands() {
    return {
      insertDrawing:
        (mode) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { pending: mode } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingView);
  },
});
