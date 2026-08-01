/**
 * The a4முலसत्यsya wordmark, in glyph form.
 *
 * Each segment is wrapped so the stylesheet can colour it: `a` and सत्य take
 * the magenta, `4` the blue, முல the gold, and `sya` is left to inherit
 * whatever the surrounding text colour is (ink in the header, the footer's
 * tan in the footer). The triad is the one from the Nav mock; the header and
 * footer resolve it to different values, see the --wm-* notes in
 * prolegomenon.css.
 *
 * Callers supply the `.wordmark` wrapper, because it is an <a> in the footer
 * and a <button> in the header and this component should not decide which.
 */
export function WordmarkGlyphs() {
  return (
    <span class='wordmark-glyphs'>
      <span class='wm-a'>a</span>
      <span class='wm-num'>4</span>
      <span class='wm-ta' lang='ta'>முல</span>
      <span class='wm-sa' lang='sa'>सत्य</span>sya
    </span>
  );
}
