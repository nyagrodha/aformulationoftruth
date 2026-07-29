import type { ComponentChildren } from 'preact';

/** Filigree divider matching the one in the original about.html. */
export function Ornament() {
  return (
    <div class='ornament' aria-hidden='true'>
      <svg viewBox='0 0 120 14' xmlns='http://www.w3.org/2000/svg' role='img' aria-hidden='true'>
        <path
          d='M6 7 C24 1, 36 13, 54 7 C72 1, 84 13, 102 7'
          stroke-linecap='round'
          stroke-linejoin='round'
        />
        <circle cx='20' cy='7' r='1.2' />
        <circle cx='100' cy='7' r='1.2' />
      </svg>
    </div>
  );
}

/**
 * Full-document shell for the madras-themed prose pages.
 *
 * Deliberately scoped to the four new pages. The existing questionnaire
 * routes use /css/main.css and hand-rolled footers; converting them is a
 * separate change with its own regression risk.
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
        <link rel='stylesheet' href='/css/madras-theme.css' />
      </head>
      <body>
        <div class='theme-toggle'>
          <button class='theme-btn active' data-theme='tamas' aria-label='Tamas theme'>Tamas</button>
          <button class='theme-btn' data-theme='nila' aria-label='Nīla theme'>Nīla</button>
          <button class='theme-btn' data-theme='uruvam' aria-label='Uruvam theme'>Uruvam</button>
        </div>

        <div class='about-container'>
          {children}

          <div style='text-align: center;'>
            <a href='/' class='btn btn-primary back-link'>திரும்பவும்</a>
            <a href='/questionnaire' class='btn btn-secondary back-link' style='margin-left: 1rem;'>
              தொடங்கு
            </a>
          </div>
        </div>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about'>About</a>
              <a href='/contact.html'>Contact</a>
              <a href='/privacy.html'>Privacy</a>
            </div>
          </div>
        </footer>

        <script src='/js/theme-toggle.js'></script>
      </body>
    </html>
  );
}
