/**
 * Folio — the landing page's vertical contents rail.
 *
 * It lists the page's parts, sets a saffron dot beside the one being read, and
 * counts it at the foot (01 / 03). Following the reader down the page is the
 * stylesheet's work, not this island's: the rail is position: sticky inside a
 * track the height of <main> (see .folio-track in public/css/prolegomenon.css),
 * so it rides through the hero and the gate and stops short of the footer with
 * or without script.
 *
 * What needs script is knowing which part is current. Without it the server's
 * render stands — part one marked — and the links still jump to each part.
 */

import { useEffect, useState } from 'preact/hooks';

export interface FolioPart {
  label: string;
  /** id of the element that opens the part; also the link's fragment */
  id: string;
}

/*
 * A part becomes current once its opening edge rises past this fraction of the
 * viewport — roughly where the eye settles, rather than the very top, so the
 * marker moves as a heading arrives instead of after it has scrolled away.
 */
const READING_LINE = 0.4;

const pad = (n: number) => String(n).padStart(2, '0');

export default function Folio({ parts }: { parts: FolioPart[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const targets = parts.map(({ id }) => document.getElementById(id));
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = innerHeight * READING_LINE;
      let next = 0;
      targets.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) next = i;
      });
      setCurrent(next);
    };

    /* Scroll fires faster than frames paint; measure at most once per frame. */
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => {
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav class='folio' aria-label='Contents'>
      <ol>
        {parts.map(({ label, id }, i) => (
          <li key={id} class={i === current ? 'is-current' : undefined}>
            <i aria-hidden='true'></i>
            <a href={`#${id}`} aria-current={i === current ? 'location' : undefined}>{label}</a>
          </li>
        ))}
      </ol>
      <b aria-hidden='true'>
        {pad(current + 1)}
        <br />
        {pad(parts.length)}
      </b>
    </nav>
  );
}
