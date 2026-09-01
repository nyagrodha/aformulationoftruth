/**
 * Primary navigation — a disclosure whose toggle is the ௨ mark.
 *
 * This has to be an island: the open/closed state is client state, and Fresh
 * only hydrates what lives under islands/. The same component as a route or a
 * plain component would render once on the server with `open` false and ship
 * no handlers, leaving a button that does nothing.
 *
 * Items are a prop rather than a module constant because the callers want
 * different ones: the landing page navigates itself by fragment (#begin, #about)
 * while every other page navigates by route. Those fragments exist only on the
 * landing page, so a shared constant would break them everywhere else.
 *
 * Without JS the toggle is inert, so a <noscript> rule in each caller's <head>
 * forces the list open — see components/nav-noscript.ts.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { WordmarkGlyphs } from '../components/Wordmark.tsx';

/*
 * The toggle is the Tamil ௨ (இரண்டு, 2) as drawn artwork, replacing the
 * five-line mark that carried the same glyph as negative space cut from a stack
 * of bars. It is a raster because the artwork is a rendered, lit object rather
 * than a flat contour -- there is no path to inline, and tracing it to one would
 * throw away the thing that makes it read.
 *
 * Served as a single .webp at 372px, three times the 124px the mark is ever
 * painted at, so it stays crisp on a 3x display; intrinsic width/height are
 * declared so the header reserves its box before the image arrives and the
 * wordmark beside it does not jump. Sizing is the stylesheet's business -- see
 * .nav-mark in public/css/nav-mark.css.
 *
 * alt is empty by intent: the glyph is ornament and the control it sits inside
 * already carries the accessible name (aria-label='Menu'). A non-empty alt here
 * would announce twice.
 */
const MARK_SRC = '/images/nav-irendu-372.webp';

function IrenduMark() {
  return (
    <img
      class='nav-mark'
      src={MARK_SRC}
      alt=''
      width='372'
      height='252'
      decoding='async'
    />
  );
}

export interface NavItem {
  label: string;
  href: string;
}

export default function Nav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement | null>(null);
  const toggle = useRef<HTMLButtonElement | null>(null);

  /*
   * False on the server, and false forever if scripting is off. The mark is only
   * a disclosure once there is script to run it: until then it renders as a
   * plain span, so nothing announces aria-expanded="false" next to the list the
   * <noscript> rule has already opened. Flipping it after mount also avoids the
   * flash of an open menu that server-rendering the list visible would give
   * every scripted visitor.
   */
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  /*
   * Escape and outside-clicks close the menu. Bound only while open so the
   * closed nav costs nothing, and torn down on unmount.
   */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      /* Focus may be on a link inside the list we are about to hide. */
      toggle.current?.focus();
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
      {
        /*
         * The mark is the control, and it carries the accessible name: the image
         * is empty-alt ornament, so without a label the button would announce as
         * nothing at all.
         */
      }
      {live
        ? (
          <button
            type='button'
            class='nav-toggle'
            ref={toggle}
            aria-label='Menu'
            aria-expanded={open}
            aria-controls='nav-list'
            onClick={() => setOpen((v) => !v)}
          >
            <IrenduMark />
          </button>
        )
        : (
          <span class='nav-toggle'>
            <IrenduMark />
          </span>
        )}

      {
        /*
         * The wordmark is a link home now, not the control. It needs a name of its
         * own: the glyphs spell a4முலसत्यsya across three scripts, which assistive
         * technology would read out as noise, so they are hidden and the label
         * speaks for them.
         */
      }
      <a class='wordmark wordmark-home' href='/' aria-label='Home'>
        <span aria-hidden='true'>
          <WordmarkGlyphs />
          <span class='wordmark-sub'>a formulation of truth</span>
        </span>
      </a>

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
