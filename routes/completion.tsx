/**
 * Completion Page
 *
 * GET /completion
 *
 * Shown after questionnaire submission. Also where the respondent decides
 * whether they want a copy of what they wrote.
 */

import { Handlers, PageProps } from '$fresh/server.ts';

interface CompletionData {
  resumeToken: string;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<CompletionData> = {
  GET(req, ctx) {
    // The page needs to say WHICH session a copy is being requested for. The
    // opaque resume token is already the client's handle on its session, so it
    // is threaded through the form rather than inventing a second identifier.
    const resumeToken = getCookie(req.headers.get('Cookie'), 'resume_token') ?? '';
    return ctx.render({ resumeToken });
  },
};

/**
 * Consent to receive a PDF copy.
 *
 * No JavaScript. The password panel is revealed by a CSS sibling selector on
 * the checked radio (public/css/consent.css). The gate is deliberately usable
 * without script -- gate-submit parses urlencoded bodies for exactly that
 * reason -- and this page must not be the exception.
 */
export function ConsentForm({ resumeToken }: { resumeToken: string }) {
  return (
    <form method='post' action='/api/responses/deliver' class='consent'>
      <input type='hidden' name='resume_token' value={resumeToken} />
      <p class='consent-question'>Would you like a copy of your responses e-mailed to you?</p>

      {
        /*
        The radio must NOT be nested inside its label. `.consent-yes:checked ~
        .pw-panel` is a sibling combinator and siblings must share a parent;
        nested, the input's only sibling is the label text, the panel can never
        be revealed, and on the no-JS path the password field silently does not
        exist. Input hoisted to the form, label bound by for/id.
      */
      }
      <input type='radio' name='consent' value='yes' id='consent-yes' class='consent-yes' required />
      <label class='consent-choice' for='consent-yes'>Yes, please</label>

      <div class='pw-panel'>
        <input
          type='password'
          name='password'
          placeholder='optional password'
          autocomplete='new-password'
          maxLength={256}
        />
        <p class='pw-note'>
          Remember this password. No one can reset it. Should you forget it, however, you may request another copy of
          the pdf be sent to you.
        </p>
      </div>

      <input type='radio' name='consent' value='no' id='consent-no' required />
      <label class='consent-choice' for='consent-no'>No</label>

      <button type='submit' class='cta cta-primary'>Send me a .pdf email</button>
    </form>
  );
}

export default function CompletionPage(props: PageProps<CompletionData>) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta name='description' content='An apparatus for attention. Self-inquiry through the Proust Questionnaire.' />
        <link rel='stylesheet' href='/css/main.css' />
        <link rel='stylesheet' href='/css/consent.css' />
      </head>
      <body>
        <nav>
          <a href='/' class='logo'>A4T</a>
        </nav>

        <main>
          <section class='section gate-section' style='min-height: 100vh; display: flex; align-items: center;'>
            <div class='gate-content'>
              <div
                class='gate-icon'
                style='color: var(--neon-emerald); text-shadow: 0 0 20px var(--emerald-glow), 0 0 40px var(--emerald-glow);'
              >
                *
              </div>

              <h2 class='gate-title' style='color: var(--neon-emerald); text-shadow: 0 0 15px var(--emerald-glow);'>
                Complete
              </h2>

              <p class='gate-description'>
                Your responses have been received and encrypted.
              </p>

              <div class='quote-block' style='text-align: left; max-width: 500px; margin: 2rem auto;'>
                <p>"Our intonations contain our philosophy of life."</p>
                <cite>Marcel Proust</cite>
              </div>

              <p class='section-text' style='max-width: 500px; margin: 0 auto 2rem; text-align: center;'>
                The questionnaire you completed is inspired by the famous Proust Questionnaire, a form of self-inquiry
                that reveals the interior landscape of a person.
              </p>

              <ConsentForm resumeToken={props.data.resumeToken} />

              <div style='display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem;'>
                <a href='/profile-choice' class='cta cta-primary'>Create a profile</a>
                <a href='/' class='cta'>Return to the beginning</a>
              </div>
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
                rel='noopener'
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
