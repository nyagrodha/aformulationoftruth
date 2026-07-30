/**
 * Primary navigation — a disclosure whose toggle is the wordmark itself.
 *
 * This has to be an island: the open/closed state is client state, and Fresh
 * only hydrates what lives under islands/. The same component as a route or a
 * plain component would render once on the server with `open` false and ship
 * no handlers, leaving a button that does nothing.
 *
 * Items are a prop rather than a module constant because the two callers want
 * different ones: the landing page navigates itself by fragment (#prolegomenon,
 * #begin, #about) while the prose pages navigate by route. Only /shop is
 * common to both.
 *
 * Without JS the toggle is inert, so a <noscript> rule in each caller's <head>
 * forces the list open — see PageShell.tsx and routes/index.tsx.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { WordmarkGlyphs } from '../components/Wordmark.tsx';

export interface NavItem {
  label: string;
  href: string;
}

export default function Nav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement | null>(null);

  /*
   * Escape and outside-clicks close the menu. Bound only while open so the
   * closed nav costs nothing, and torn down on unmount.
   */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <nav class='site-nav' aria-label='Primary navigation' ref={root}>
      <button
        type='button'
        class='nav-toggle'
        aria-expanded={open}
        aria-controls='nav-list'
        onClick={() => setOpen((v) => !v)}
      >
        <span class='nav-arrow' aria-hidden='true'>▶</span>
        <span class='wordmark'>
          <WordmarkGlyphs />
          <span class='wordmark-sub'>a formulation of truth</span>
        </span>
      </button>

      <ul id='nav-list' class='nav-list' hidden={!open}>
        {items.map(({ label, href }) => (
          <li key={href}>
            {/* Fragment links don't unmount the island, so close on the way out. */}
            <a href={href} onClick={() => setOpen(false)}>{label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
