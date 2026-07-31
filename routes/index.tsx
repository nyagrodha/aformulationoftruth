/**
 * Index Route — Prolegomenon + Gate
 *
 * GET /
 *
 * The prolegomenon is a single hero — the address to the reader beside the
 * figure — and terminates in the gate. The
 * gate gathers the two answers + the user's email in a single POST to
 * /api/gate-submit. That endpoint age-encrypts each answer via the Rust gate
 * service (port 8787), hashes the email, and mails a magic link. The magic
 * link lands on /auth/verify, which launches the Deno Fresh questionnaire at
 * /questionnaire.
 *
 * The address itself is never persisted, in any form: hashEmail() takes the
 * SHA-256 of it and only that hash reaches Postgres. There is no
 * encrypted_email column anywhere in the schema, and nothing reversible is
 * kept — the plaintext lives in request memory just long enough to hand to
 * Apple's SMTP for delivery.
 *
 * No external font CDNs, no third-party requests of any kind — the design is
 * set in system faces (Georgia / Arial) via /css/prolegomenon.css.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import Spheroid from '../islands/Spheroid.tsx';

interface IndexData {
  error?: string;
}

/*
 * These keys must match the codes routes/api/gate-submit.ts actually redirects
 * with — fail(..., 'invalid' | 'email' | 'send' | 'server'). They drifted apart
 * once already, which silently swallowed every error but 'server': the visitor
 * was bounced back to the form with nothing to read. Change one, change both.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid: "The server didn't capture your submission. Please try again.",
  email: "The address you submitted isn't valid. Kindly try a different one — maildrop.cc and cock.li both work.",
  send: "We couldn't deliver your authorization link right now. Try again in a moment.",
  server: 'Something went wrong on our end. Please try again.',
};

const DESCRIPTION =
  'Prior to the main sequence, a Proust questionnaire, some thoughts. Folks are ruled by inhibition. For the time you spend ansering the following queries, to the extent possible,  we invite reflective states of awareness.';

/*
 * Share card. Both og:image and twitter:image point here — X falls back to the
 * og:* tags when a twitter:* twin is absent, but every other scraper (Slack,
 * Discord, iMessage, Signal) reads og:image only, so the pair is stated in full
 * rather than left to fallback. Absolute URLs are required: scrapers do not
 * resolve relative paths.
 */
const SHARE_IMAGE = 'https://aformulationoftruth.com/images/dreamMore...always-800.jpg';
const SHARE_IMAGE_ALT =
  'A collage of quotations and photographs, centred on the line: if a little dreaming is dangerous the cure is not to dream less but to dream more, to dream all the time.';

export const handler: Handlers<IndexData> = {
  GET(req, ctx) {
    const code = new URL(req.url).searchParams.get('error') || undefined;
    const error = code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : undefined;
    return ctx.render({ error });
  },
};

export default function Home({ data }: PageProps<IndexData>) {
  const { error } = data;
	  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title> a formulation of truth</title>
        <meta name='description' content={DESCRIPTION} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='a formulation of truth' />
        <meta property='og:title' content='a formulation of truth' />
        <meta property='og:description' content={DESCRIPTION} />
        <meta property='og:image' content={SHARE_IMAGE} />
        <meta property='og:image:width' content='800' />
        <meta property='og:image:height' content='436' />
        <meta property='og:image:alt' content={SHARE_IMAGE_ALT} />
        <meta property='og:url' content='https://aformulationoftruth.com' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content='Prolegomenon — a formulation of truth' />
        <meta name='twitter:description' content={DESCRIPTION} />
        <meta name='twitter:image' content={SHARE_IMAGE} />
        <meta name='twitter:image:alt' content={SHARE_IMAGE_ALT} />

        {
          /*
          Declared explicitly. Absent a <link rel="icon">, browsers fall back to
          requesting /favicon.ico at the origin root by convention — which is how
          the Create React App default icon kept surfacing long after the CRA
          build itself was gone. Markup edits could not dislodge it; only
          replacing the file at that path could.
        */
        }
        <link rel='icon' href='/favicon.ico' sizes='any' />
        <link rel='icon' type='image/png' sizes='32x32' href='/favicons/favicon-32x32.png' />
        <link rel='icon' type='image/png' sizes='16x16' href='/favicons/favicon-16x16.png' />
        <link rel='apple-touch-icon' href='/favicons/apple-touch-icon.png' />
        <link rel='manifest' href='/manifest.json' />

        <link rel='stylesheet' href='/css/prolegomenon.css' />
      </head>
      <body>
        <main>
          <header class='site-header'>
            <a class='wordmark' href='#top' aria-label='a formulation of truth'>
              <span class='wordmark-glyphs'>
                a4<span lang='ta'>முல</span>
                <span lang='sa'>सत्य</span>sya
              </span>
              <span class='wordmark-sub'>a formulation of truth</span>
            </a>
            <nav class='site-nav' aria-label='Primary navigation'>
              <a href='#prolegomenon'>Introduction</a>
              <a href='#begin'>Gate</a>
              <a href='#about'>About</a>
            </nav>
          </header>

          {/* ── hero ────────────────────────────────────────────────────── */}
          <section class='hero' id='top' aria-labelledby='prolegomenon'>
            <div class='hero-copy'>
              <p class='hero-title'>
                Every reader find themselves. The writer’s work is merely a kind of optical instrument that
                makes it possible for the reader to discern what, without this book, readers would perhaps never have seen
                in themselves.
              </p>

              <p class='eyebrow' id='prolegomenon'>PROLEGOMENON:</p>
              <p class='incipit'>
                <span class='drop-cap' aria-hidden='true'>Y</span>
                <span class='sr-only'>Y</span>our answers — anyone's answers — may become for another reader just such an ātmanopticon: in our world where nothing ever happens the same way twice, truth resides in the reconstruction of events without precedent.
              </p>

              <div class='hero-prose'>
                <p>
                  A practice/<i lang='sa-Latn'>sādhana</i>: the questions invite an unguarded, thoughtful state; and what
                  the answer at times just astonishes in describing some interior (<span lang='ta'>அகம்</span>) — a
                  subject, the grammatical <em>I</em>, a formulation of truth.
                </p>
                <p>
                  Return after enough time and (a species) amnesia to respond again. The earlier answers belong to
                  someone else; the one answering now is provisional too. Another self emerges in the collision of the
                  past in the present from memories we create and their associations. This is not a tragedy. It’s more
                  like the weather.
                </p>
                <p>
                  The questionnaire keeps their record — so many persons in succession, bearing one name: <em>I</em>.
                </p>
                <p>
                  Insofar as recognition adds nothing new or points out something that hasn’t always been known it can be
                  captured well by double-dipping ‘I’, ‘I-I’ sees the ones already given — who you were when you answered
                  then. Who answers now, who will — as one light regarding itself.
                </p>
                <p>Find who sleeps.</p>
                <p>That is what this instrument is for.</p>
              </div>
            </div>

            {
              /*
              The figure: a linear slope of desire, real-valued over expectation,
              meeting the hot possibility function f(x) — unbounded, racing its
              asymptote — at the single force-point of habit. The shaded region
              left of habit, where desire outruns what is possible, is misery.
            */
            }
            <figure class='geometry'>
              <svg
                viewBox='0 0 384 391'
                role='img'
                aria-labelledby='figure-title figure-desc'
              >
                <title id='figure-title'>
                  Desire, possibility, and habit
                </title>
                <desc id='figure-desc'>
                  A linear slope of desire, defined as a real number over expectation, meets the possibility function
                  f(x) — which is unbounded, diverging toward an asymptote of any possible value — at a single point,
                  habit. The region between them, where desire exceeds possibility, is misery.
                </desc>

                {/* misery: bounded above by desire, below by f(x), left of habit */}
                <path
                  class='fig-misery'
                  d='M 48 331 L 210 250 C 175 305, 120 340, 48 344 Z'
                />

                {/* axes */}
                <line class='fig-axis' x1='48' y1='20' x2='48' y2='344' />
                <line class='fig-axis' x1='48' y1='344' x2='316' y2='344' />
                <path class='fig-axis' d='M 316 344 l -7 -3.5 l 0 7 Z' />

                {/* the asymptote f(x) never reaches: any possible value */}
                <line class='fig-asymptote' x1='286' y1='20' x2='286' y2='344' />

                {/* f(x) — possibility, unbounded */}
                <path
                  class='fig-possibility'
                  d='M 48 344 C 120 340, 175 305, 210 250 C 240 200, 268 130, 278 24'
                />

                {/* desire — linear slope, real-valued */}
                <line class='fig-desire' x1='48' y1='331' x2='312' y2='199' />

                {/* habit — the force-point where they meet */}
                <circle class='fig-habit' cx='210' cy='250' r='5.5' />

                <text class='fig-label fig-label-real' x='40' y='26'>ℝ</text>
                <text class='fig-label fig-label-x' x='182' y='368'>expectation</text>
                {
                  /* desire is labelled past the asymptote, at the line's own
                    terminus, so it collides with nothing */
                }
                <text class='fig-label fig-label-desire' x='320' y='202'>desire</text>
                <text class='fig-label fig-label-possibility' x='243' y='74'>
                  f(x) possibility
                </text>
                <text class='fig-label fig-label-habit' x='220' y='272'>habit</text>
                <text class='fig-label fig-label-misery' x='118' y='318'>misery</text>
                {/* held high on the asymptote, clear of both the curve and the line */}
                <text
                  class='fig-label fig-label-asymptote'
                  transform='translate(298 92) rotate(90)'
                >
                  any possible value
                </text>
              </svg>
            </figure>

            <Spheroid />
            {/* anchored to the page, not to the molecule: it drifts, IV does not */}
            <span class='spheroid-sigil' aria-hidden='true'>IV</span>

            <aside class='folio' aria-hidden='true'>
              <span>I · TEXT</span>
              <i></i>
              <b>
                01
                <br />
                12
              </b>
            </aside>
          </section>

          {/* ── the gate — where the prolegomenon terminates ─────────────── */}
          <section id='begin' class='gate-section'>
            <div class='gate-content'>
              <p class='gate-eyebrow'>a gate:</p>
              <h2 class='gate-title'>we meet @ this gate:</h2>
              <p class='gate-description'>
                What follow are not intended to be polite questions. Consider this an ice-breaker, and these are holes
                in the ice. Answer honestly, spontaneously and something cold touches the feet.
              </p>

              {error && (
                <div class='gate-error' role='alert'>
                  {error}
                </div>
              )}

              <form
                id='gate-form'
                class='gate-form'
                method='POST'
                action='/api/gate-submit'
                enctype='application/x-www-form-urlencoded'
                autocomplete='off'
              >
                <div class='form-group'>
                  <label for='answer1'>What is your idea of perfect happiness?</label>
                  <textarea
                    id='answer1'
                    name='answer1'
                    rows={4}
                    maxLength={20000}
                    placeholder='You may respond to all the questions in one session, or complete the questionnaire over the course of days... When you return simply enter the same email address you use today to login.'
                    aria-describedby='accessibility-hint'
                  >
                  </textarea>
                </div>

                <div class='form-group'>
                  <label for='answer2'>What is your greatest fear?</label>
                  <textarea
                    id='answer2'
                    name='answer2'
                    rows={4}
                    maxLength={20000}
                    placeholder="You may only submit one questionnaire. The site enforces a period of waiting between submissions and the application will contact you via email when you're able to submit another set of responses."
                    aria-describedby='accessibility-hint'
                  >
                  </textarea>
                  <p class='accessibility-note' id='accessibility-hint'>
                    For voice input, use{' '}
                    <a
                      href='https://github.com/cjpais/Handy'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      Handy
                    </a>{' '}
                    — free offline speech-to-text.
                  </p>
                </div>

                <div class='form-group'>
                  <label for='email'>Email</label>
                  <input
                    type='email'
                    id='email'
                    name='email'
                    autocomplete='email'
                    required
                    placeholder='your.email@example.com'
                  />
                  <p class='privacy-notice'>
                    All what you type is age-encrypted before storage. Your address is used once, to deliver your link
                    through Apple's mail servers, and is never itself stored — the database keeps only a SHA-256 hash
                    of it. We don't care to see your email address. There is no tracking, no profiling, no analytics,
                    and nothing is shared with anyone beyond that delivery.
                  </p>
                </div>

                <button type='submit' id='gate-submit-btn' class='gate-submit'>
                  Begin
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer id='about'>
          <a class='wordmark' href='#top'>
            a4<span lang='ta'>முல</span>
            <span lang='sa'>सत्य</span>sya
          </a>

          <div>
            <p>a questionnaire to become acquainted oneself with a sequence of selves this lifetime.</p>
            <p style='margin-top: 1rem;'>
              Encrypted database hosted in Iceland by{' '}
              <a
                href='https://billing.flokinet.is/aff.php?aff=543'
                target='_blank'
                rel='noopener noreferrer'
              >
                FlokiNET
              </a>
            </p>
            <p style='margin-top: 0.5rem; word-break: break-all;'>
              Onion mirror:{' '}
              <a
                href='http://a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion/'
                rel='noopener noreferrer'
              >
                a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion
              </a>
            </p>
          </div>

          <div class='footer-links' style='justify-content: flex-end;'>
            <a href='/about.html'>about</a>
            <a href='/contact.html'>contact</a>
            <a href='/privacy.html'>privacy</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
