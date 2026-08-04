import type { NavItem } from '../islands/Nav.tsx';

/**
 * The rule that forces the menu open when there is no script to open it.
 *
 * `Nav` is an island, so its toggle is inert until Fresh hydrates it and inert
 * forever if scripting is off. Rather than leave a dead control, every page
 * drops this into a <noscript> block and the list renders open.
 *
 * The [hidden] attribute only carries `display: none` at UA weight, which
 * `.nav-list`'s own `display: flex` outranks, so this restates it rather than
 * relying on `hidden` alone.
 */
export const NAV_NOSCRIPT_CSS = '.nav-list[hidden]{display:flex}';

/**
 * The nav for every page that is not the landing page.
 *
 * Shared rather than re-declared per route so that the retired LogoMenu's link
 * to a /lotto.html which never existed cannot come back by being re-typed
 * somewhere. `begin` is '/#begin' and not '#begin' because that fragment lives
 * on the landing document alone — see LANDING_NAV in routes/index.tsx, which is
 * why Nav takes items as a prop at all.
 */
export const PAGE_NAV: NavItem[] = [
  { label: 'begin', href: '/#begin' },
  { label: 'about', href: '/about' },
  { label: 'messaging', href: '/contact.html' },
  { label: 'gift shop', href: '/shop' },
];
