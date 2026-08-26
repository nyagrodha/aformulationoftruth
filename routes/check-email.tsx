/**
 * /check-email
 *
 * Server-rendered success page reached via 303 redirect from
 * /api/gate-submit when the magic-link email has been accepted by the
 * SMTP relay. No JavaScript, no PII in the URL.
 */

import { Handlers } from '$fresh/server.ts';
import Nav from '../islands/Nav.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';

export const handler: Handlers = {
  GET(_req, ctx) {
    return ctx.render();
  },
};

export default function CheckEmail() {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <meta name='robots' content='noindex, nofollow' />
        <title>check your email — a formulation of truth</title>
        <link rel='stylesheet' href='/css/main.css' />
        <link rel='stylesheet' href='/css/landing.css' />
        <link rel='stylesheet' href='/css/nav-mark.css' />
        {/* The toggle is inert without JS, so leave the menu open instead. */}
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
      </head>
      <body class='landing'>
        <header class='site-header'>
          <Nav items={PAGE_NAV} />
        </header>

        <main>
          <section class='hero landing-hero'>
            <div class='hero-content'>
              <div class='at-symbol' aria-hidden='true'>@</div>
              <h1 class='title'>
                check your inbox
                <span class='title-truth'>to continue</span>
              </h1>
              <p class='icelandic-subtitle'>
                Look for a message from <em>formitselfisemptiness@aformulationoftruth.com</em>.
              </p>
            </div>
          </section>

          <section class='section'>
            <div class='section-inner' style='text-align: center;'>
              {
                /*
                This page is no longer the doorway. A new address goes straight
                into the questionnaire from the gate; you land here when that
                address already had a questionnaire open, in which case the
                honest thing to say is that the link is a way back to it rather
                than a way to start. The previous copy also promised a link that
                expired in fifteen minutes and worked once, neither of which was
                ever true, and which pushed people into resubmitting -- the one
                action that used to abandon the session they were waiting on.
              */
              }
              <p class='section-text'>
                You already have a questionnaire open, so we've sent you a link back to it rather than starting a new
                one. Nothing you wrote before has been lost.
              </p>
              <p class='section-text'>
                The link works for 24 hours, and as many times as you need within them.
              </p>
              <p class='section-text' style='opacity: 0.7;'>
                Not in your inbox? Check spam, or wait a minute — iCloud sometimes takes a moment.
              </p>
              <p style='margin-top: 2rem;'>
                <a href='/' class='cta'>Back to start</a>
              </p>
            </div>
          </section>
        </main>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about'>About</a>
              <a href='/contact.html'>Contact</a>
              <a href='/privacy'>Privacy</a>
            </div>
            <p class='footer-copy'>
              Encrypted database hosted in Iceland by{' '}
              <a
                href='https://fobdongle.com'
                target='_blank'
                rel='noopener noreferrer'
                style='color: var(--neon-emerald); text-decoration: none;'
              >
                FlokiNET
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
