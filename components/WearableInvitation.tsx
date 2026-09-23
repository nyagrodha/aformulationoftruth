/**
 * The invitation a scanner sees after a wearable's QR -- /w/:token (fixed
 * wearables) and /e/:code (brooch encounters) render the same page.
 *
 * Copy redesigned 2026-09-23 (task 5g, owner-approved verbatim). `greeting`
 * is chosen by the route handler from Accept-Language (lib/greeting.ts),
 * never from the IP, and is a required prop alongside WearableData.
 * `displayName` is still loaded by the routes (see lib/wearable.ts) but the
 * new copy never names the owner, so it is not rendered here.
 */
import type { WearableData } from '../lib/wearable.ts';

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
        <link rel='stylesheet' href='/css/main.css' />
      </head>
      <body>
        <nav>
          <a href='/' class='logo'>A4T</a>
        </nav>

        <main>
          <section
            class='section gate-section'
            style='min-height: 100vh; display: flex; align-items: center;'
          >
            <div class='gate-content'>
              {
                /*
                 * The nav's own ௨ artwork, small. alt is empty by intent: the
                 * mark is ornament, and the greeting beneath it already says
                 * everything the mark would announce.
                 */
              }
              <img
                class='gate-mark'
                src='/images/nav-irendu-372.webp'
                alt=''
                width='96'
                height='65'
                decoding='async'
              />

              <h2 class='gate-title'>{data.greeting},</h2>

              <p class='gate-description'>
                That QR code you just scanned has landed you <a href='/'>@aformulationoftruth.com</a>. Welcome.
              </p>

              <p class='gate-description'>
                The site serves a Proust questionnaire — 35 introspective questions. Recognize this as the beginning of
                a long experiment this site intends to share with you. The experiment is experiential. What I've
                attempted to do here is to engineer an experience of enlightenment. Unique to you: no two respondents
                will answer the questions in the same order… And after a period of time, we'll email you.
              </p>

              <p class='gate-description'>
                You can use your everyday email, but we recommend you create something trashy like a{' '}
                <a href='https://cock.li' rel='noopener noreferrer'>cockmail</a>{' '}
                account, or, if dicks don't make you salivate, hit up{' '}
                <a href='https://maildrop.cc' rel='noopener noreferrer'>maildrop.cc</a>.
              </p>

              <p class='gate-description'>
                You're connected to the site now through that scan. This site doesn't follow you around the web, and it
                never learns who you are: this scan is remembered only as an anonymous encounter, and your answers are
                never stored in plain text. Your anonymity is hereby 99.9% guaranteed. Check out the{' '}
                <a href='/privacy'>privacy policy</a>.
              </p>

              <p class='gate-description'>
                People, remember: there are no others. So please take care to take care of your Self.
              </p>

              <p class='gate-description'>Love!</p>

              {data.shareOwnerResponses && (
                <p class='gate-description'>
                  Its bearer has chosen reciprocity: complete the questionnaire and their own responses will be opened
                  to you.
                </p>
              )}

              <a href='/' class='button button-primary'>begin</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
