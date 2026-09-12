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
import type { VNode } from 'preact';
import Nav, { type NavItem } from '../islands/Nav.tsx';
import Spheroid from '../islands/Spheroid.tsx';
import Folio, { type FolioPart } from '../islands/Folio.tsx';
import SiteFooter from '../components/SiteFooter.tsx';
import { NAV_NOSCRIPT_CSS } from '../components/nav-shared.ts';

/*
 * The landing page is one long page, so its nav is fragment anchors that scroll
 * it — #about is the footer, #begin the gate form. These bare fragments are why
 * items is a prop: they resolve only on this document, and PAGE_NAV carries the
 * '/#begin' form every other page needs.
 *
 * Messaging and the gift shop are the two that leave the page.
 */
const LANDING_NAV: NavItem[] = [
  { label: 'begin', href: '#begin' },
  { label: 'about', href: '#about' },
  { label: 'people', href: '/people' },
  { label: 'messenger', href: '/messenger' },
  { label: 'gift shop', href: '/shop' },
];

/*
 * The folio's contents, in page order. Each id opens its part: the quote leads
 * the hero (#top), the eyebrow opens the prolegomenon, and #begin is the gate.
 */
const FOLIO_PARTS: FolioPart[] = [
  { label: '1. Proust quote', id: 'top' },
  { label: '2. Prolegomenon', id: 'prolegomenon' },
  { label: '3. a gate', id: 'begin' },
];

interface IndexData {
  error?: VNode;
}

/*
 * These keys must match the codes routes/api/gate-submit.ts actually redirects
 * with — fail(..., 'invalid' | 'email' | 'send' | 'server'). They drifted apart
 * once already, which silently swallowed every error but 'server': the visitor
 * was bounced back to the form with nothing to read. Change one, change both.
 */
const ERROR_MESSAGES: Record<string, VNode> = {
  invalid: <>Unfortunately, the server didn't capture your submission. Kindly try again.</>,
  email: (
    <>
      The email address you submitted isn't valid. Try a different one —{' '}
      <a href='https://maildrop.cc' target='_blank' rel='noopener noreferrer'>maildrop.cc</a> and{' '}
      <a href='https://cock.li' target='_blank' rel='noopener noreferrer'>cockmail</a> both work.
    </>
  ),
  send: <>We couldn't deliver your authorization link right meow. Try again in a moment.</>,
  server: (
    <>
      Something went wrong. Try again — it usually resolves itself. If it doesn't, a brief note to the{' '}
      <a href='mailto:formitselfisemptiness@aformulationoftruth.com'>webmaster</a> would help me find out why.
    </>
  ),
};

const DESCRIPTION = 'Inhibition rules us humans.';

/*
 * Share card. Both og:image and twitter:image point here — X falls back to the
 * og:* tags when a twitter:* twin is absent, but every other scraper (Slack,
 * Discord, iMessage, Signal) reads og:image only, so the pair is stated in full
 * rather than left to fallback. Absolute URLs are required: scrapers do not
 * resolve relative paths.
 */
const SHARE_IMAGE = 'https://aformulationoftruth.com/images/dreamMore...always-800.jpg';
const SHARE_IMAGE_ALT =
  'A collage of quotations, photographs, and a poem, centred on the line: if a little dreaming is dangerous the cure is not to dream less but to dream more, to dream all the time.';

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
        <title>a formulation of truth</title>
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
        <link rel='stylesheet' href='/css/nav-mark.css' />
        {/* The toggle is inert without JS, so leave the menu open instead. */}
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
      </head>
      <body>
        <main class='folio-host'>
          <header class='site-header'>
            <Nav items={LANDING_NAV} />
          </header>

          {/* ── hero ────────────────────────────────────────────────────── */}
          <section class='hero' id='top' aria-labelledby='prolegomenon'>
            <div class='hero-copy'>
              <p class='hero-title'>
                Every reader finds themselves. The writer’s work is merely a kind of optical instrument that makes it
                possible for the reader to discern what, without this book, they would perhaps never have seen in
                themselves.
              </p>

              <p class='eyebrow' id='prolegomenon'>PROLEGOMENON:</p>
              <p class='incipit'>
                <img
                  class='drop-cap'
                  src='/images/y-illuminated-560.webp'
                  alt=''
                  aria-hidden='true'
                  width={532}
                  height={560}
                />
                <span class='sr-only'>Y</span>our answers — anyone's answers — may become for another reader just such
                an ātmanopticon: that optical lens-like perspective one among you composes that, without having read it,
                another reader may not ever have recognized that quality or trait within themselves.
              </p>

              <div class='hero-prose'>
                <p>
                  A practice/<i lang='sa-Latn'>sādhana</i>: the questions invite an unguarded, thoughtful state, and at
                  times the answer astonishes in what it describes of some interior (<span lang='ta'>அகம்</span>) — a
                  subject, the grammatical <em>I</em>, a formulation of truth.
                </p>
                <p>
                  Return, after enough time and a species of amnesia, to respond again. The earlier answers belong to
                  someone else; the one answering now is provisional too. Another self emerges where the past collides
                  with the present, out of the memories we make and their associations. This is not a tragedy. It’s more
                  like the weather.
                </p>
                <p>
                  The questionnaire keeps their record — so many persons in succession, bearing one name: <em>I</em>.
                </p>
                <p>
                  Insofar as recognition adds nothing new — points to nothing that hasn’t always been known — it is well
                  captured by doubling the ‘I’: ‘I-I’ sees the ones already given, who you were when you answered then;
                  who answers now; who will — as one light regarding itself.
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
          </section>

          {/* ── the gate — where the prolegomenon terminates ─────────────── */}
          <section id='begin' class='gate-section'>
            <div class='gate-content'>
              <p class='gate-eyebrow'>a gate:</p>
              <h2 class='gate-title'>Here we meet @ a gate:</h2>
              <p class='gate-description'>
                What follow are not polite questions. They are holes in the ice. Answer honestly and something cold
                touches the feet.
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
                    placeholder='Answer every question in one sitting, or complete the questionnaire over several days… When you return, simply sign in with the same email address you use today.'
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
                    placeholder="You may submit one questionnaire at a time. A waiting period follows each submission; you'll be emailed when you're able to submit another set of responses."
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
                    Your answers are age-encrypted before storage, and so is your address. The database keeps a SHA-256
                    hash of it, to recognise your session, and an age-encrypted copy that only the key box which mails
                    your finished questionnaire can open. We have no wish to see your email address. We use it for three
                    things and nothing else: to send you your link, to deliver your answers to you as a PDF, and to
                    remind you, some time later, to answer the questions again. Each of those goes out through Apple's
                    mail servers. There is no tracking, no profiling, no analytics, and nothing is shared with anyone
                    beyond that delivery.
                  </p>
                </div>

                <button type='submit' id='gate-submit-btn' class='gate-submit'>
                  Begin
                </button>
              </form>
            </div>
          </section>

          {/* spans all of <main>, so the sticky folio inside follows the reader to the gate's end */}
          <div class='folio-track'>
            <Folio parts={FOLIO_PARTS} />
          </div>
        </main>

        <SiteFooter home='#top' id='about' />
      </body>
    </html>
  );
}
