import type { ComponentChildren } from 'preact';

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
      </head>
      <body>
        <header class='site-header'>
          <a class='wordmark' href='/' aria-label='a formulation of truth'>
            <span class='wordmark-glyphs'>
              a4<span lang='ta'>முல</span>
              <span lang='sa'>सत्य</span>sya
            </span>
            <span class='wordmark-sub'>a formulation of truth</span>
          </a>
          <nav class='site-nav' aria-label='Primary navigation'>
            <a href='/about'>About</a>
            <a href='/shop'>Shop</a>
            <a href='/'>Begin</a>
          </nav>
        </header>

        <main class='movement'>
          {children}
        </main>

        <footer>
          <a class='wordmark' href='/'>
            a4<span lang='ta'>முல</span>
            <span lang='sa'>सत्य</span>sya
          </a>

          <div>
            <p>
              a questionnaire to become acquainted oneself with a sequence of selves this lifetime.
            </p>
            <p style='margin-top: 1rem;'>
              <a href='/about'>About</a> · <a href='/shop'>Shop</a> · <a href='/contact.html'>Contact</a> ·{' '}
              <a href='/privacy.html'>Privacy</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
