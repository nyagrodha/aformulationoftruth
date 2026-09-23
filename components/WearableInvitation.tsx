/**
 * The invitation a scanner sees after a wearable's QR -- /w/:token (fixed
 * wearables) and /e/:code (brooch encounters) render the same page.
 *
 * Copy redesigned 2026-09-23 (task 5g, owner-approved verbatim). `greeting`
 * is chosen by the route handler from Accept-Language (lib/greeting.ts),
 * never from the IP, and is a required prop alongside WearableData.
 * `displayName` is still loaded by the routes (see lib/wearable.ts) but the
 * new copy never names the owner, so it is not rendered here.
 *
 * Drawn in the landing page's look (task 5h): prolegomenon.css, the site nav,
 * the landing's gate for the greeting and the begin button, and SiteFooter.
 */
import type { WearableData } from '../lib/wearable.ts';
import Nav from '../islands/Nav.tsx';
import SiteFooter from './SiteFooter.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from './nav-shared.ts';

export interface WearableInvitationProps extends WearableData {
  /** Chosen from Accept-Language by the route handler; never from the IP. See lib/greeting.ts. */
  greeting: string;
}

export default function WearableInvitation(data: WearableInvitationProps) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta
          name='description'
          content='An apparatus for attention. Self-inquiry through the Proust Questionnaire.'
        />
        <link rel='stylesheet' href='/css/prolegomenon.css' />
        <link rel='stylesheet' href='/css/nav-mark.css' />
        {/* The toggle is inert without JS, so leave the menu open instead. */}
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
      </head>
      <body>
        <header class='site-header'>
          <Nav items={PAGE_NAV} />
        </header>

        <main>
          <section class='gate-section invitation'>
            <div class='gate-content'>
              <h1 class='gate-title'>{data.greeting},</h1>

              <p class='gate-description'>
                That QR code you just scanned has landed you <a href='/'>@aformulationoftruth.com</a>. Welcome.
              </p>

              <div class='hero-prose'>
                <p>
                  The site serves a Proust questionnaire — 35 introspective questions. Recognize this as the beginning
                  of a long experiment this site intends to share with you. The experiment is experiential. What I've
                  attempted to do here is to engineer an experience of enlightenment. Unique to you: no two respondents
                  will answer the questions in the same order… And after a period of time, we'll email you.
                </p>

                <p>
                  You can use your everyday email, but we recommend you create something trashy like a{' '}
                  <a href='https://cock.li' rel='noopener noreferrer'>cockmail</a>{' '}
                  account, or, if dicks don't make you salivate, hit up{' '}
                  <a href='https://maildrop.cc' rel='noopener noreferrer'>maildrop.cc</a>.
                </p>

                <p>
                  You're connected to the site now through that scan. This site doesn't follow you around the web, and
                  it never learns who you are: this scan is remembered only as an anonymous encounter, and your answers
                  are never stored in plain text. Your anonymity is hereby 99.9% guaranteed. Check out the{' '}
                  <a href='/privacy'>privacy policy</a>.
                </p>

                <p>
                  People, remember: there are no others. So please take care to take care of your Self.
                </p>

                <p>Love!</p>

                {data.shareOwnerResponses && (
                  <p>
                    Its bearer has chosen reciprocity: complete the questionnaire and their own responses will be opened
                    to you.
                  </p>
                )}
              </div>

              <a href='/' class='gate-submit'>begin</a>
            </div>
          </section>
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
