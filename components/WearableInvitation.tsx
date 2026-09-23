/**
 * The invitation a scanner sees after a wearable's QR -- /w/:token (fixed
 * wearables) and /e/:code (brooch encounters) render the same page.
 * Moved verbatim from routes/w/[token].tsx; text and markup are unchanged.
 */
import type { WearableData } from '../lib/wearable.ts';

export default function WearableInvitation(data: WearableData) {
  const greeting = data.displayName
    ? `Hi there! You scanned the QR code belonging to ${data.displayName}, a user @aformulationoftruth. They logged in and completed the Proust questionnaire, and they think you may also enjoy responding.`
    : 'Hi there! You scanned the QR code belonging to a user @aformulationoftruth. They logged in and completed the Proust questionnaire, and they think you may also enjoy responding.';

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

              <h2 class='gate-title'>{greeting}</h2>

              <p class='gate-description'>
                This object carries an invitation: the Proust Questionnaire, a sequence of prompts for self-inquiry.
                What you answer is yours; you choose, at the end, what to divulge &mdash; all, some, or none of it.
              </p>

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
