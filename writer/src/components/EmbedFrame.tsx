// Live, sandboxed preview of raw HTML (SVG animations, widgets, iframes…).
// Served from embed://<id>, a separate origin per block, so scripts run without
// access to the app or its file API.
import { useEffect, useRef, useState } from 'react';
import { docContext } from '../lib/docContext';

export function EmbedFrame({ html, minHeight = 0, onHeight }: { html: string; minHeight?: number; onHeight?: (h: number) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [height, setHeight] = useState(minHeight || 120);

  useEffect(() => {
    let live = true;
    const docPath = docContext.path;
    if (docPath) window.writer.registerEmbed(docPath, html).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [html]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.writerEmbed) return;
      const h = Math.max(minHeight, Math.min(4000, Number(e.data.height) || 0));
      setHeight(h);
      onHeight?.(h);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [minHeight, onHeight]);

  if (!src) return <div className="embed-frame__loading" style={{ height }} />;
  return (
    <iframe
      ref={frame}
      className="embed-frame"
      src={src}
      // Each embed is served from its own embed://<id> origin, distinct from the app's,
      // so allow-same-origin only lets it measure its own nested frames.
      sandbox="allow-scripts allow-same-origin allow-popups"
      style={{ height }}
      title="HTML embed"
      loading="lazy"
    />
  );
}
