/**
 * The five-line mark — five bars, and Tamil ௨ (இரண்டு, 2) cut from the space
 * between the middle three.
 *
 * Inline SVG rather than an <img> or a background image, for three reasons: the
 * bars read `--mark-*` off the cascade, so a caller on a different ground can
 * restate the five tokens without a second asset; it ships no client JS; and the
 * mask that cuts the glyph lives in the same file as the bars it cuts, so the
 * two cannot drift apart.
 *
 * (There is no light/dark switch on this site to inherit — no stylesheet carries
 * a prefers-color-scheme rule. The tokens are tuned for --paper in nav-mark.css.)
 *
 * The outline is the real `two-tamil` glyph from Noto Serif Tamil, extracted to
 * a path and normalised to height 100. It is deliberately NOT <text>: a webfont
 * inside a mask is a runtime dependency, and the site's own SaiIndira.woff2 is a
 * legacy Latin-encoded face that carries no Tamil codepoints at all (0x20–0xFF
 * only), so it could never have rendered ௨ anyway.
 *
 * Bars 1 and 5 are whole. Only 2–4 are masked, which is what makes the glyph
 * read as negative space rather than as a hole punched through the whole mark.
 */

/* Height 100, width 156.7, origin at the glyph's top-left. */
const TAMIL_TWO =
  'M18.8 100Q10.2 100 5.1 95.5Q0 91.1 0 83.2Q0 75.1 5.1 70.8Q10.2 66.4 18.8 66.4H28.8Q21.1 62.1 16.5 55.1Q12 48.1 12 37.9Q12 25 18.2 16.6Q24.3 8.2 34.8 4.1Q45.3 0 58.1 0Q67.8 0 76.8 2.5Q85.9 5 93 10Q100.2 15 104.4 22.5Q108.6 30.1 108.6 39.9Q108.6 51 102.2 59Q95.9 67.1 85.3 71.5Q74.8 75.8 62.1 75.8H17.4Q14.5 75.8 12.4 77.7Q10.4 79.6 10.4 83.2Q10.4 86.6 12.4 88.5Q14.5 90.3 17.4 90.3H156.7V100ZM22.5 37.9Q22.5 51.3 32.2 58.9Q41.9 66.4 59.4 66.4H59.6Q74.8 66.4 83.2 58.3Q91.6 50.3 91.6 37.9Q91.6 28.6 86.9 22.4Q82.3 16.1 74.4 12.9Q66.5 9.7 57.1 9.7Q41.9 9.7 32.2 16.9Q22.5 24.2 22.5 37.9Z';

/*
 * Five bars of 20 on a 60 pitch — thin bars, generous gaps, filling the 260-unit
 * box exactly (4×60 + 20). The proportions are the source artwork's: the stack is
 * very nearly square, not the 3:1 letterbox a row of bars first suggests.
 *
 * The glyph placement is not free. ௨ carries two long horizontal strokes near its
 * foot (the baseline at y≈90 and the tail at y=100 in glyph units), and wherever
 * those land on a bar they erase most of its width. At this scale and offset the
 * baseline crosses bar 4 — which is what the source artwork shows — while the
 * tail clears into the gap below it.
 */
const BAR_Y = [0, 60, 120, 180, 240];
const GLYPH = 'translate(22 55) scale(1.55)';

export interface FiveLineMarkProps {
  /** Sizing is the caller's business, the same way `.wordmark` is. */
  class?: string;
  /**
   * Mask ids are document-global, so two marks on one page would collide and
   * the second would render uncut. Callers rendering more than one pass a
   * distinct id.
   */
  id?: string;
}

export function FiveLineMark({ class: className, id = 'five-line-mark' }: FiveLineMarkProps) {
  const maskId = `${id}-tamil-two`;

  return (
    <svg
      class={`five-line-mark ${className ?? ''}`.trim()}
      viewBox='0 0 300 260'
      xmlns='http://www.w3.org/2000/svg'
      /* The toggle carries the accessible name; the bars are ornament. */
      aria-hidden='true'
      focusable='false'
    >
      <defs>
        <mask id={maskId}>
          {/* White keeps, black cuts. */}
          <rect x='0' y='0' width='300' height='260' fill='#fff' />
          <g transform={GLYPH}>
            {
              /*
               * Stroked, NOT filled. Filling the glyph punches its whole body out
               * of the bars and reads as three ragged holes; stroking cuts only
               * where the contour crosses a bar, so the ௨ is implied by the
               * alignment of thin slices — which is what makes it negative space
               * rather than a hole.
               */
            }
            <path
              d={TAMIL_TWO}
              fill='none'
              stroke='#000'
              stroke-width='6'
              stroke-linejoin='round'
              stroke-linecap='round'
            />
          </g>
        </mask>
      </defs>

      <rect class='mark-bar mark-bar-1' x='0' y={BAR_Y[0]} width='300' height='20' rx='10' fill='var(--mark-1)' />

      <g mask={`url(#${maskId})`}>
        <rect class='mark-bar mark-bar-2' x='0' y={BAR_Y[1]} width='300' height='20' rx='10' fill='var(--mark-2)' />
        <rect class='mark-bar mark-bar-3' x='0' y={BAR_Y[2]} width='300' height='20' rx='10' fill='var(--mark-3)' />
        <rect class='mark-bar mark-bar-4' x='0' y={BAR_Y[3]} width='300' height='20' rx='10' fill='var(--mark-4)' />
      </g>

      <rect class='mark-bar mark-bar-5' x='0' y={BAR_Y[4]} width='300' height='20' rx='10' fill='var(--mark-5)' />
    </svg>
  );
}
