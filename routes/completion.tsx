/**
 * Completion Page
 *
 * GET /completion
 *
 * Shown after questionnaire submission. Also where the respondent decides
 * whether they want a copy of what they wrote.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { increment } from '../lib/metrics.ts';

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
    // Last step of the funnel. It was allowlisted for the client-side
    // increment endpoint and nothing ever called it, so the funnel's final
    // figure was 0 on days when people plainly reached this page.
    increment('funnel.completion.viewed');

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
 * No JavaScript, and no radios. The answer is carried by WHICH submit button
 * the respondent presses: a form submitted by a button sends only that
 * button's name/value pair, so `consent=yes` or `consent=no` arrives from the
 * browser itself with nothing scripted in between. The gate is deliberately
 * usable without script -- gate-submit parses urlencoded bodies for exactly
 * that reason -- and this page must not be the exception.
 *
 * `value='yes'` must stay exactly that, lowercase: consentFrom() in
 * routes/api/responses/deliver.ts accepts only the literal string 'yes' and
 * reads everything else as a refusal.
 *
 * The password field is now ALWAYS visible. It used to be hidden behind
 * `.consent-yes:checked ~ .pw-panel`, which needed a radio to check; with the
 * radios gone that selector has nothing to hang on, and the only ways to
 * restore a reveal would be script (breaking the no-JS guarantee) or a hidden
 * checkbox hack (a control the respondent cannot see but can still tab into).
 * An always-visible optional field is the honest version: whoever wants a
 * password types one before pressing "Yes, please", and whoever does not
 * simply leaves it empty.
 */
export function ConsentForm({ resumeToken }: { resumeToken: string }) {
  return (
    <form method='post' action='/api/responses/deliver' class='consent'>
      <input type='hidden' name='resume_token' value={resumeToken} />
      <p class='consent-question'>Would you like a copy of your responses e-mailed to you?</p>

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

      <div class='consent-actions'>
        <button type='submit' name='consent' value='yes' class='consent-btn consent-btn-yes'>Yes, please</button>
        <button type='submit' name='consent' value='no' class='consent-btn consent-btn-no'>No, thanks</button>
      </div>
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
