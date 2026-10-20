// Full HTML pages (with <!doctype>, <html>, page-wide CSS) can't be pasted into a
// Markdown post as-is: their styles would restyle the whole blog. They're published
// inside an iframe instead, sized to the content, and unwrapped again for editing.

export const isFullDocument = (html: string) => /^\s*(<!doctype\s|<html[\s>])/i.test(html);

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;');

/**
 * Sizes the frame to its content wherever it's published. A srcdoc frame shares
 * its parent's origin, so it can measure its own document. Content extent is
 * measured (not scrollHeight) so pages styled `height: 100%` still fit.
 */
const AUTO_HEIGHT =
  "(f=>{const d=f.contentDocument;if(!d||!d.body)return;d.documentElement.style.overflow='hidden';let last=0;const fit=()=>{let b=0;for(const e of d.body.querySelectorAll('*')){const r=e.getBoundingClientRect();if(r.width||r.height)b=Math.max(b,r.bottom)}const s=getComputedStyle(d.body);const h=Math.ceil(b+parseFloat(s.paddingBottom)+parseFloat(s.marginBottom));if(Math.abs(h-last)>1){last=h;f.style.height=h+'px'}};fit();new ResizeObserver(fit).observe(d.documentElement)})(this)";

export function wrapDocument(html: string, height: number) {
  const h = Math.max(80, Math.round(height));
  // One line on purpose: a blank line would end the Markdown HTML block.
  // The fixed height is only the starting size (and the fallback without JavaScript).
  return `<iframe data-writer-page srcdoc="${escapeAttr(html.trim())}" onload="${AUTO_HEIGHT}" style="width: 100%; height: ${h}px; border: 0; display: block" loading="lazy" title="Embedded page"></iframe>`;
}

/** Returns the original page if this block is one of our wrapped iframes. */
export function unwrapDocument(html: string): string | null {
  const t = html.trim();
  if (!t.startsWith('<iframe data-writer-page')) return null;
  const el = new DOMParser().parseFromString(t, 'text/html').querySelector('iframe[data-writer-page]');
  return el?.getAttribute('srcdoc') ?? null;
}
