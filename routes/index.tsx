/**
 * Index Route — Landing Page
 *
 * GET /
 *
 * Gathers the two gate answers + the user's email in a single POST to
 * /api/gate-submit. That endpoint age-encrypts each answer via the Rust
 * gate service (port 8787), age-encrypts the email, and mails a magic
 * link. The magic link lands on /auth/verify, which launches the Deno
 * Fresh questionnaire at /questionnaire.
 *
 * No external font CDNs — every face is loaded locally via /css/main.css.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import LogoMenu from '../components/LogoMenu.tsx';

interface IndexData {
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  bad_body: "We couldn't read your submission. Please try again.",
  missing_email: 'enter an email address.',
  bad_email: "The email address entered isn't valid. Kindly try again.",
  no_answer: 'Kindly reconsider. Answer at least one of the two gate questions before continuing.',
  email_failed:
    "We couldn't deliver your authorization link right now. Try again in a moment.",
  server: 'Something went wrong on our end. Please try again.',
};

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
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>a formulation of truth</title>
        <meta
          name="description"
          content="A practice in self-inquiry. These questions invite upon users reflective states of awareness, revealing something interior that vivifies oneself as a formulation of truth."
        />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="a formulation of truth" />
        <meta property="og:title" content="a formulation of truth" />
        <meta
          property="og:description"
          content="A practice in self-inquiry. These questions invite upon users reflective states of awareness, revealing something interior that vivifies oneself as a formulation of truth."
        />
        <meta property="og:image" content="https://aformulationoftruth.com/callbackground.png" />
        <meta property="og:url" content="https://aformulationoftruth.com" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="a formulation of truth" />
        <meta
          name="twitter:description"
          content="A practice in self-inquiry. These questions invite upon users reflective states of awareness, revealing something interior that vivifies oneself as a formulation of truth."
        />
        <meta name="twitter:image" content="https://aformulationoftruth.com/callbackground.png" />

        <link rel="stylesheet" href="/css/main.css" />
        <link rel="stylesheet" href="/css/landing.css" />
      </head>
      <body class="landing">
        <nav>
          <LogoMenu />
          <div class="nav-links">
            <a href="/about.html">about</a>
            <a href="/contact.html">contact</a>
          </div>
        </nav>

        <main>
          <section class="hero landing-hero">
            <div class="hero-content">
              <div class="tamil-glyph" aria-hidden="true">௨</div>
              <p class="tagline tagline-big">
                <span class="tagline-pink">each moment,</span>{' '}
                <span class="tagline-orange">every day</span>
                <br />
                <span class="tagline-staticline">you are</span>
              </p>
              <div class="at-symbol" aria-hidden="true">@</div>
              <h1 class="title">
                a formulation
                <span class="title-truth">of truth</span>
              </h1>
              <p class="icelandic-subtitle">orðun sannleikans</p>
            </div>
            <div class="scroll-indicator">
              <span></span>
            </div>
          </section>

          <section class="section">
            <div class="section-inner">
              <span class="section-label">prolegomenon:</span>
              <p class="section-text">
                A practice in{' '}
                <a
                  href="https://www.davidgodman.org/the-practice-of-self-enquiry/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="quote-link"
                >
                  self-inquiry
                </a>
                , these questions invite upon users reflective states of awareness;
                the unguarded yet thoughtful response reveals something interior (
                <a
                  href="https://en.wikipedia.org/wiki/Akam_(poetry)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="quote-link"
                  lang="ta"
                >
                  அகம்
                </a>
                ) that vivifies oneself a subject, a person, as such the grammatical
                {' '}<em>I</em> and a formulation of truth.
              </p>
            </div>
          </section>

          <section class="section quote-section">
            <div class="section-inner">
              <div class="quote-block">
                <p>
                  "We may, indeed, say that the hour of death is uncertain, but when we say so we represent that hour to ourselves as situated in a vague and remote expanse of time, it never occurs to us that it can have any connexion with the day that has already dawned, or may signify that death — or its first assault and partial possession of us, after which it will never leave hold of us again — may occur this very afternoon, so far from uncertain, this afternoon every hour of which has already been allotted to some occupation."
                </p>
                <cite>Marcel Proust</cite>
              </div>
            </div>
          </section>

          <section id="begin" class="section gate-section">
            <div class="gate-content">
              <div class="gate-icon" aria-hidden="true">?</div>
              <h2 class="gate-title">Here we meet @ a gate:</h2>
              <p class="gate-description">
                What follow are not polite questions. They are holes in the ice.
                answer them honestly and something cold touches your feet.
              </p>

              {error && (
                <div
                  class="status-message error show"
                  role="alert"
                  style="margin-bottom: 1.25rem;"
                >
                  {error}
                </div>
              )}

              <form
                id="gate-form"
                class="gate-form"
                method="POST"
                action="/api/gate-submit"
                enctype="application/x-www-form-urlencoded"
                autocomplete="off"
              >
                <div class="form-group">
                  <label for="answer1">What is your idea of perfect happiness?</label>
                  <div class="textarea-wrapper">
                    <textarea
                      id="answer1"
                      name="answer1"
                      rows={4}
                      maxLength={20000}
                      placeholder="You may complete the questions in one session or over a course of days... Take your time…"
                      aria-describedby="accessibility-hint"
                    ></textarea>
                  </div>
                </div>

                <div class="form-group">
                  <label for="answer2">What is your greatest fear?</label>
                  <div class="textarea-wrapper">
                    <textarea
                      id="answer2"
                      name="answer2"
                      rows={4}
                      maxLength={20000}
                      placeholder="You may only submit one questionnaire per 66 days up to half a year…"
                      aria-describedby="accessibility-hint"
                    ></textarea>
                  </div>
                  <p class="accessibility-note" id="accessibility-hint">
                    For voice input, use{' '}
                    <a
                      href="https://github.com/cjpais/Handy"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Handy
                    </a>
                    {' '}— free offline speech-to-text.
                  </p>
                </div>

                <div class="form-group">
                  <label for="email">Email (used once, to send your magic-link authentication token)</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    autocomplete="email"
                    required
                    placeholder="your.email@example.com"
                  />
                  <p class="privacy-notice">
                    All what you type is age-encrypted before storage. The server uses the email supplied
                    once to deliver a single-use magic link, and then it is hashed. There is no tracking,
                    no profiling, no analytics, no third-party sharing throughout the whole site.
                  </p>
                </div>

                <button
                  type="submit"
                  id="gate-submit-btn"
                  class="cta cta-primary"
                  style="width: 100%;"
                >
                  Begin
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer>
          <div class="footer-inner">
            <div class="footer-links">
              <a href="/about.html">about</a>
              <a href="/contact.html">contact</a>
              <a href="/privacy.html">privacy</a>
            </div>
            <p class="footer-copy">
              Encrypted database hosted in Iceland by{' '}
              <a
                href="https://billing.flokinet.is/aff.php?aff=543"
                target="_blank"
                rel="noopener noreferrer"
                style="color: var(--neon-emerald); text-decoration: none;"
              >
                FlokiNET
              </a>
            </p>
            <p class="footer-copy">
              Onion mirror:{' '}
              <a
                href="http://a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion/"
                rel="noopener noreferrer"
                style="color: var(--neon-emerald); text-decoration: none;"
              >
                a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion
              </a>
            </p>
          </div>
        </footer>

        <script>{`
          // Tiny progressive-enhancement JS only — the form works without
          // this. Submission is a native POST handled server-side by
          // /api/gate-submit (which 303-redirects to /check-email).
          (function () {
            // Smooth-scroll anchor links
            document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
              anchor.addEventListener('click', function (e) {
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                  e.preventDefault();
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              });
            });

            const io = new IntersectionObserver(
              function (entries) {
                entries.forEach(function (entry) {
                  if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                  }
                });
              },
              { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
            );
            document.querySelectorAll('.section-inner, .gate-content').forEach(function (el) {
              el.style.opacity = '0';
              el.style.transform = 'translateY(30px)';
              el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
              io.observe(el);
            });
          })();
        `}</script>
      </body>
    </html>
  );
}
