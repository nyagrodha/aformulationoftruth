/**
 * « Prière de ne pas stationner devant cette porte » — the French no-parking
 * sign, posted on the invitation for visitors greeted with Bonjour (owner's
 * request, 2026-09-23).
 *
 * Drawn here as SVG rather than shipped as a photograph: the reference the
 * owner supplied was a sign vendor's watermarked product shot, and a vector
 * stays sharp at any size for a few hundred bytes. System Arial, like the
 * rest of the site: no font requests.
 *
 * Geometry (viewBox 200x200, centre 100,100): white rim r98, red ring r94,
 * blue field r62, a red bar from upper-left to lower-right clipped to the
 * field. The ring's lettering rides two arcs — over the top on r70 (glyphs
 * rise outward) and under the bottom on r87 (glyphs rise inward) — so both
 * read left to right, as on the real sign.
 */

const RED = '#e2231a';
const BLUE = '#1f64b0';

export default function NoParkingSign() {
  return (
    <svg
      class='no-parking-sign'
      viewBox='0 0 200 200'
      role='img'
      aria-label='Prière de ne pas stationner devant cette porte'
      lang='fr'
    >
      <defs>
        <clipPath id='np-field'>
          <circle cx='100' cy='100' r='62' />
        </clipPath>
        <path id='np-top' d='M 30 100 A 70 70 0 0 1 170 100' />
        <path id='np-bottom' d='M 13 100 A 87 87 0 0 0 187 100' />
      </defs>

      <circle cx='100' cy='100' r='98' fill='#fff' stroke='#c9c2b4' stroke-width='1' />
      <circle cx='100' cy='100' r='94' fill={RED} />
      <circle cx='100' cy='100' r='62' fill={BLUE} />
      <line
        x1='40'
        y1='40'
        x2='160'
        y2='160'
        stroke={RED}
        stroke-width='17'
        clip-path='url(#np-field)'
      />

      <g fill='#fff' font-family='Arial, Helvetica, sans-serif' font-weight='700' text-anchor='middle'>
        <text font-size='17'>
          <textPath href='#np-top' startOffset='50%'>PRIÈRE DE</textPath>
        </text>
        <text font-size='14.5'>
          <textPath href='#np-bottom' startOffset='50%'>DEVANT CETTE PORTE</textPath>
        </text>
        <text x='100' y='94' font-size='17'>NE PAS</text>
        <text x='100' y='118' font-size='17' textLength='104' lengthAdjust='spacingAndGlyphs'>STATIONNER</text>
      </g>
    </svg>
  );
}
