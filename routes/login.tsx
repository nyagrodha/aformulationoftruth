/**
 * Login Page
 *
 * GET /login
 *
 * Where a returning visitor asks for a fresh link, and where /auth/verify and
 * /questionnaire send anyone whose link or session is gone.
 *
 * A plain form posting to /api/auth/magic-link. It used to be a form with no
 * method or action, driven entirely by an inline fetch() -- so with JavaScript
 * off (Tor Browser at "Safest") pressing the button reloaded the page with the
 * address in the query string and sent nothing. It now carries the same image
 * challenge as the gate (components/GateForm.tsx), because the endpoint behind
 * it mails a stranger-typed address just as the gate does.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import TipJar from '../components/TipJar.tsx';
import { CaptchaFields } from '../components/GateForm.tsx';
import { type Captcha, issueCaptcha } from '../lib/captcha.ts';

interface LoginData {
  error?: string;
  captcha: Captcha;
}

/*
 * Keys are the codes routes/api/auth/magic-link.ts redirects with, plus
 * 'session', which /questionnaire and /auth/verify use. Change one, change both.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid: "The server didn't capture your request. Please try again.",
  email: "That address isn't valid, or its domain doesn't accept mail. Check it for a typo.",
  captcha: "That didn't match, or the challenge had expired. Here is a new image and a new question.",
  rate: 'Too many attempts from your connection. Please wait an hour and try again.',
  busy: 'The site is sending more links than it allows itself right now. Please try again in a little while.',
  send: "We couldn't deliver your link just now. Try again in a moment.",
  server: 'Something went wrong. Please try again.',
  session: 'Your session has ended, or this browser does not have it. Ask for a new link below.',
};

export const handler: Handlers<LoginData> = {
  async GET(req, ctx) {
    const code = new URL(req.url).searchParams.get('error') ?? '';
    // A fresh single-use challenge per render, so never cache the page.
    const res = await ctx.render({ error: ERROR_MESSAGES[code], captcha: await issueCaptcha() });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  },
};

export default function LoginPage({ data }: PageProps<LoginData>) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <meta name='robots' content='noindex, nofollow' />
        <title>a formulation of truth</title>
        <meta name='description' content='An apparatus for attention. Self-inquiry through the Proust Questionnaire.' />
        <link rel='icon' href='/favicon.ico' sizes='any' />
        <link rel='stylesheet' href='/css/prolegomenon.css' />
      </head>
      <body>
        <main>
          <section class='gate-section' style='border-top: 0;'>
            <div class='gate-content'>
              <p class='gate-eyebrow'>
                <a href='/'>a formulation of truth</a>
              </p>
              <h2 class='gate-title'>so here we are, at a new beginning</h2>
              <p class='gate-description'>
                Enter the address you began with and we'll send a link that takes you back to where you left off.
              </p>

              {data.error && <div class='gate-error' role='alert'>{data.error}</div>}

              <form
                class='gate-form'
                method='POST'
                action='/api/auth/magic-link'
                enctype='application/x-www-form-urlencoded'
                autocomplete='off'
              >
                <div class='form-group'>
                  <label for='email'>Your email</label>
                  <input
                    type='email'
                    id='email'
                    name='email'
                    placeholder='you@example.com'
                    required
                    autocomplete='email'
                  />
                </div>

                <CaptchaFields captcha={data.captcha} />

                <button type='submit' class='gate-submit'>
                  Send the link
                </button>
              </form>

              <p class='accessibility-note'>
                New here? <a href='/#begin'>Begin at the gate.</a>
              </p>
            </div>
          </section>
        </main>

        <footer>
          <TipJar />
        </footer>
      </body>
    </html>
  );
}
