import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { slashBus, type SlashState } from '../editor/slash';

export function SlashMenu({ state }: { state: SlashState }) {
  const { items, rect, select } = state;
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => setActive(0), [items]);

  // Keyboard navigation is driven from the editor while the menu is open.
  useEffect(() => {
    slashBus.setKeyHandler((e) => {
      if (!items.length) return false;
      if (e.key === 'ArrowDown') setActive((i) => (i + 1) % items.length);
      else if (e.key === 'ArrowUp') setActive((i) => (i - 1 + items.length) % items.length);
      else if (e.key === 'Enter' || e.key === 'Tab') select(items[Math.min(activeRef.current, items.length - 1)]);
      else return false;
      return true;
    });
    return () => slashBus.setKeyHandler(() => false);
  }, [items, select]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rect) return;
    const h = el.offsetHeight;
    const below = rect.bottom + 8;
    const top = below + h > window.innerHeight - 12 ? Math.max(12, rect.top - h - 8) : below;
    setPos({ left: Math.min(rect.left - 4, window.innerWidth - el.offsetWidth - 12), top });
  }, [rect, items.length]);

  useEffect(() => {
    ref.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!items.length) {
    return (
      <div ref={ref} className="popover slash-menu" style={pos ?? { left: -9999, top: 0 }}>
        <div className="slash-menu__empty">No matching blocks</div>
      </div>
    );
  }

  let lastGroup = '';
  return (
    <div ref={ref} className="popover slash-menu" style={pos ?? { left: -9999, top: 0 }} onMouseDown={(e) => e.preventDefault()}>
      {items.map((item, i) => {
        const header = item.group !== lastGroup ? item.group : null;
        lastGroup = item.group;
        return (
          <div key={item.title}>
            {header && <div className="slash-menu__group">{header}</div>}
            <button className={`slash-item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => select(item)}>
              <span className="slash-item__text">
                <span className="slash-item__title">{item.title}</span>
                <span className="slash-item__hint">{item.hint}</span>
              </span>
              <kbd>{item.keys}</kbd>
            </button>
          </div>
        );
      })}
    </div>
  );
}
