import type { ComponentChildren } from 'preact';
import Nav, { type NavItem } from '../islands/Nav.tsx';
import { WordmarkGlyphs } from './Wordmark.tsx';

/*
 * The prose pages navigate by route. 'Home' is the landing page — the gate's
 * own submit button still reads 'Begin', and two things called Begin that went
 * different places was the confusion worth removing.
 */
const PAGE_NAV: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact.html' },
  { label: 'Gift Shop', href: '/shop' },
];

/**
 * Section divider. Uses prolegomenon's own `.section-break`, which the
 * stylesheet renders in saffron and expects to contain spans.
 */
export function Ornament() {
  return (
    <div class='section-break' aria-hidden='true'>
      <span>❦</span>
    </div>
  );
}

/**
 * Full-document shell for the prose pages (/about, /shop, the essays).
 *
 * Styled with /css/prolegomenon.css — the same stylesheet as the landing
 * page — so these pages read as part of the same site. It brings the paper
 * palette (--paper #e8ddc5 on --ink #171715), Georgia, and crucially the
 * `.movement p` measure of min(790px, 100%), which is what makes long prose
 * legible rather than running the full window width.
 *
 * Previously this used madras-theme.css and carried a Tamas/Nila/Uruvam theme
 * switcher, both inherited from a stale public/about.html. The switcher was
 * retired from the site long ago; see the regression test.
 */
export function PageShell(
  { title, description, children }: {
    title: string;
    description: string;
    children: ComponentChildren;
  },
) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>{title}</title>
        <meta name='description' content={description} />
        <link rel='stylesheet' href='/css/prolegomenon.css' />
        {/* The toggle is inert without JS, so leave the menu open instead. */}
        <noscript>
          <style>{'.nav-list[hidden]{display:flex}.nav-arrow{display:none}'}</style>
        </noscript>
      </head>
      <body>
        <header class='site-header'>
          <Nav items={PAGE_NAV} />
        </header>

        <main class='movement'>
          {children}
        </main>

        <footer>
          <a class='wordmark' href='/' aria-label='a formulation of truth'>
            <WordmarkGlyphs />
          </a>

          <div>
            <p>
              a questionnaire to become acquainted oneself with a sequence of selves this lifetime.
            </p>
            <p style='margin-top: 1rem;'>
              <a href='/about'>About</a> · <a href='/shop'>Gift Shop</a> · <a href='/contact.html'>Contact</a> ·{' '}
              <a href='/privacy'>Privacy</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
