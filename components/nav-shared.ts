/**
 * One nav destination. `pipeline` items are listed but not yet built: they
 * render as text reading "<label> · in the pipeline" and carry no href, so
 * nobody lands on an unfinished page.
 */
export interface NavItem {
  label: string;
  href?: string;
  pipeline?: boolean;
}

/**
 * The rule that shows the nav when there is no script to open it.
 *
 * `Nav` is an island, so its toggle is inert until Fresh hydrates it and inert
 * forever if scripting is off (Tor Browser's safest mode). Every page drops this
 * into a <noscript> block: the fan renders open, with the ௨ already at its open
 * size, instead of leaving a dead control.
 *
 * The [hidden] attribute only carries `display: none` at UA weight; restate the
 * open display rather than relying on removing `hidden`.
 */
export const NAV_NOSCRIPT_CSS = '.nav-rays[hidden]{display:block}.nav-mark{width:74px}';

/**
 * The nav for every page that is not the landing page, left to right across the
 * fan: item k sits at the tip of ray k (data/nav-rays.ts).
 *
 * `begin` is '/#begin' and not '#begin' because that fragment lives on the
 * landing document alone -- see LANDING_NAV, which is why Nav takes items as a
 * prop at all.
 */
export const PAGE_NAV: NavItem[] = [
  { label: 'begin', href: '/#begin' },
  { label: 'about', href: '/about' },
  { label: 'people', href: '/people' },
  { label: 'gift shop', href: '/shop' },
  { label: 'heard on the mesh', href: '/loramesh' },
  { label: 'messenger', pipeline: true },
  { label: 'lotto', pipeline: true },
];

/**
 * The landing page is one long page, so begin and about are fragments that scroll
 * it -- #about is the footer, #begin the gate form. They resolve only on that
 * document; the rest match PAGE_NAV.
 */
export const LANDING_NAV: NavItem[] = [
  { label: 'begin', href: '#begin' },
  { label: 'about', href: '#about' },
  ...PAGE_NAV.slice(2),
];
