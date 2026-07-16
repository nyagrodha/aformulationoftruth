/**
 * Index Route — Prolegomenon + Gate
 *
 * GET /
 *
 * The prolegomenon runs as twelve movements and terminates in the gate. The
 * gate gathers the two answers + the user's email in a single POST to
 * /api/gate-submit. That endpoint age-encrypts each answer via the Rust gate
 * service (port 8787), age-encrypts the email, and mails a magic link. The
 * magic link lands on /auth/verify, which launches the Deno Fresh
 * questionnaire at /questionnaire.
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
  invalid: "We couldn't read your submission. Please try again.",
  email: "That email address isn't valid. Kindly try again.",
  send: "We couldn't deliver your authorization link right now. Try again in a moment.",
  server: 'Something went wrong on our end. Please try again.',
};

const DESCRIPTION =
  'Some thoughts prior to the main sequence, a Proust questionnaire. A practice in self-inquiry: these questions invite reflective states of awareness.';

export const handler: Handlers<IndexData> = {
  GET(req, ctx) {
    const code = new URL(req.url).searchParams.get('error') || undefined;
    const error = code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : undefined;
    return ctx.render({ error });
  },
};

/** The ✦ rule that closes every movement but the last. */
function SectionBreak() {
  return (
    <div class="section-break" aria-hidden="true">
      <i></i>
      <span>✦</span>
      <i></i>
    </div>
  );
}

function MovementIndex({ n }: { n: string }) {
  return (
    <div class="movement-index" aria-hidden="true">
      <span>{n}</span>
      <i></i>
    </div>
  );
}

export default function Home({ data }: PageProps<IndexData>) {
  const { error } = data;
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Prolegomenon — a formulation of truth</title>
        <meta name="description" content={DESCRIPTION} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="a formulation of truth" />
        <meta property="og:title" content="Prolegomenon — a formulation of truth" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="https://aformulationoftruth.com/callbackground.png" />
        <meta property="og:url" content="https://aformulationoftruth.com" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Prolegomenon — a formulation of truth" />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content="https://aformulationoftruth.com/callbackground.png" />

        <link rel="stylesheet" href="/css/prolegomenon.css" />
      </head>
      <body>
        <main>
          <header class="site-header">
            <a class="wordmark" href="#top" aria-label="A formulation of truth">
              a4<span lang="ta">முள</span>
              <span lang="sa">सत्य</span>sya
            </a>
            <nav class="site-nav" aria-label="Primary navigation">
              <a href="#prolegomenon">Text</a>
              <a href="#sequence">Sequence</a>
              <a href="#begin">Gate</a>
              <a href="#about">About</a>
            </nav>
          </header>

          {/* ── hero ────────────────────────────────────────────────────── */}
          <section class="hero" id="top" aria-labelledby="prolegomenon">
            <div class="hero-copy">
              <p class="hero-title">
                Some thoughts prior to the main sequence, a Proust questionnaire.
              </p>
              <p class="hero-datestamp">
                Inscribed in the{' '}
                <span class="mathematical">
                  4<sup>y</sup>-dimensional
                </span>{' '}
                common Earth-time characteristic of this planet: summer, Common Era 2026, in
                the reign of Pope Leo XIV.
              </p>

              <p class="eyebrow" id="prolegomenon">PROLEGOMENON:</p>
              <p class="incipit">
                <span class="drop-cap" aria-hidden="true">T</span>
                <span class="sr-only">T</span>he site serves a sequence of prompts. Call them
                questions, or invitations to pause.
              </p>

              <a class="enter" href="#sequence">
                <span aria-hidden="true"></span> continue reading{' '}
                <b aria-hidden="true">→</b>
              </a>
            </div>

            {/*
              The figure: a linear slope of desire, real-valued over expectation,
              meeting the hot possibility function f(x) — unbounded, racing its
              asymptote — at the single force-point of habit. The shaded region
              left of habit, where desire outruns what is possible, is misery.
            */}
            <figure class="geometry">
              <svg
                viewBox="0 0 384 391"
                role="img"
                aria-labelledby="figure-title figure-desc"
              >
                <title id="figure-title">
                  Desire, possibility, and the force-point of habit
                </title>
                <desc id="figure-desc">
                  A linear slope of desire, defined as a real number over expectation,
                  meets the possibility function f(x) — which is unbounded, diverging
                  toward an asymptote of any possible value — at a single point, habit.
                  The region between them, where desire exceeds possibility, is misery.
                </desc>

                {/* misery: bounded above by desire, below by f(x), left of habit */}
                <path
                  class="fig-misery"
                  d="M 48 331 L 210 250 C 175 305, 120 340, 48 344 Z"
                />

                {/* axes */}
                <line class="fig-axis" x1="48" y1="20" x2="48" y2="344" />
                <line class="fig-axis" x1="48" y1="344" x2="316" y2="344" />
                <path class="fig-axis" d="M 316 344 l -7 -3.5 l 0 7 Z" />

                {/* the asymptote f(x) never reaches: any possible value */}
                <line class="fig-asymptote" x1="286" y1="20" x2="286" y2="344" />

                {/* f(x) — possibility, unbounded */}
                <path
                  class="fig-possibility"
                  d="M 48 344 C 120 340, 175 305, 210 250 C 240 200, 268 130, 278 24"
                />

                {/* desire — linear slope, real-valued */}
                <line class="fig-desire" x1="48" y1="331" x2="312" y2="199" />

                {/* habit — the force-point where they meet */}
                <circle class="fig-habit" cx="210" cy="250" r="5.5" />

                <text class="fig-label fig-label-real" x="40" y="26">ℝ</text>
                <text class="fig-label fig-label-x" x="182" y="368">expectation</text>
                {/* desire is labelled past the asymptote, at the line's own
                    terminus, so it collides with nothing */}
                <text class="fig-label fig-label-desire" x="320" y="202">desire</text>
                <text class="fig-label fig-label-possibility" x="243" y="74">
                  f(x) possibility
                </text>
                <text class="fig-label fig-label-habit" x="220" y="272">habit</text>
                <text class="fig-label fig-label-misery" x="118" y="318">misery</text>
                {/* held high on the asymptote, clear of both the curve and the line */}
                <text
                  class="fig-label fig-label-asymptote"
                  transform="translate(298 92) rotate(90)"
                >
                  any possible value
                </text>
              </svg>
            </figure>

            <Spheroid />
            {/* anchored to the page, not to the molecule: it drifts, IV does not */}
            <span class="spheroid-sigil" aria-hidden="true">IV</span>

            <aside class="folio" aria-hidden="true">
              <span>I · TEXT</span>
              <i></i>
              <b>
                01
                <br />
                12
              </b>
            </aside>
          </section>

          {/* ── the sequence ────────────────────────────────────────────── */}
          <article class="sequence" id="sequence">
            <figure class="epigraph">
              <h2>The Knot</h2>
              <blockquote>
                <p>
                  The rainbow shines, but only in the thought
                  <br />
                  of him that looks, yet not in that alone
                  <br />
                  for who makes rainbows by invention?
                </p>
                <p>
                  And there were many standing round a waterfall
                  <br />
                  Who saw one bow each yet not the same to all.
                  <br />
                  For each a hand's breadth further than the next
                  <br />
                  The sun on falling waters writes the text.
                  <br />
                  Which yet is in the eye, or in the thought.
                </p>
                <p>It was a hard thing to undo this knot.</p>
              </blockquote>
              <figcaption>—Gerard Manley Hopkins</figcaption>
            </figure>

            <section class="movement movement-1">
              <MovementIndex n="01" />
              <p class="first-movement">
                <span class="prose-paragraph">
                  The site aformulationoftruth.com serves a sequence of prompts. Call them
                  questions, or invitations to pause.
                </span>
                <span class="prose-paragraph">
                  And in that moment what wells up within beckons to you, a user of language,
                  to translate from this engram a past encoded as living memory in the present
                  as response—as a response you compose to a question. Translated memories,
                  stored perhaps as engrams in a mind whose holographic store might be likened
                  to the most advanced synthesizer of pharmacopia in the universe. As Proust
                  writes,{' '}
                  <q class="inline-quotation">
                    Memory is a sort of pharmacy-laboratory in which chance sometimes makes a
                    soothing drug and sometimes a dangerous poison.
                  </q>
                </span>
                <span class="prose-paragraph">
                  Sometimes those fragments congeal into something that coheres; other
                  fragments remain…well, fragmented, partial. In fact, defiant in how
                  unbothered to be coherent some of the fragments may be.
                </span>
                <span class="prose-paragraph">
                  These sketches in word bear little or no meaning to any reader beyond the
                  writer who translated from their own recollection of a past in reflex
                  response to a prompt. A question:
                </span>
                <span class="paragraph-break"></span>
                <span class="question">Who or what is your greatest love?</span>
                <span class="answer">Big dick Tony.</span>
                <span class="paragraph-break"></span>
                This being an example. It's a fragment. We're sure BDT is lovely, but we know
                precisely one thing about him. And that is a fragment. Not a whole.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-2">
              <MovementIndex n="02" />
              <p>
                Almost a decade ago in response to{' '}
                <em>what is your idea of perfect happiness</em> I composed “a healthy suspicion
                of both/and; an imperfect understanding of either/or.” Through the ensuing
                decade, far from becoming more certain of precisely what meaning that
                aphoristic, grammatically symmetric phrase distills I remain enamored of the
                string's valence. To the first question of the Proust questionnaire ego aquired
                immunity and I remained attached to the formulation. Maybe its accidental
                depth, its boss grammatical construction? Perhaps its mystical resonance plucks
                a chord I've yet to learn how to name.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-3">
              <MovementIndex n="03" />
              <p>
                We humans understand ourselves—and don't—a great degree through word.
                Social-linguistic beings we are through and through! And when upon a
                mellifluous or otherwise erudite sounding phonic chain no less its own creation
                the ego fastens with a temerity I tether my self-understanding to and perform.
                Uncertain though we are certain concepts' consequence. Nonetheless, we parrot
                with certainty these rote phrases that over and over bamboozle us from the
                beginning!
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-4">
              <MovementIndex n="04" />
              <p>
                The saints and sages whose devotion to wisdom traditions and contemplative
                Christian or Buddhist, etc. lifestyles instruct aspirants to discipline the
                body-mind as means to alter consciousness. So refined or perfected that
                conscious our own awareness we may untie this knot to word… even if only for 30
                seconds. Ever faithful one's ego to its action to possess the egoic,
                self-centered concopis, to wit, there to reattach a limited, self-centric I
                almost as soon as our mind ascertains the possibility that another way{' '}
                <em>exists</em>. That knowledge alone, in this crackhead's experience, is not
                going to bestow upon the sādhika a clean break from all those aasanas so very
                human and childlike in nature.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-5">
              <MovementIndex n="05" />
              <p>
                Ramana Maharshi suggests that disciples eliminate the first-person possessive from
                their speech. That is, don’t use ‘my’. It’s remarkable how challenging that
                practice can be! For over half this life I’ve lived, I seek to neuter at its
                source in language the tendency of humans to ‘mine’. But gosh is it ever! But
                equally true and fit for the task of speaking about any situation the
                possessive may be appealed to is the first-person I. Any my statement can be
                reformulated with the absence of explicit grammatical possessive.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-6">
              <MovementIndex n="06" />
              <p>
                So the responses that I gave to these questions, what emerged at 20 years-old
                in Greeley, Colorado and the responses I gave at 32 in Fort Lauderdale, Florida
                sitting in a chair near to aged and ailing Granne, devouring a chicken-salad
                sandwich I’d made her for lunch bore such a difference that I viscerally
                recognized two selves within one body’s lifetime both narrated as a coherent
                and continuous series of events by the ego I, Ralph/ie, heretofore subjected to
                sustained virtuous sādhana in measure far less frequently than I, Ralph/ie
                untethered.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-7">
              <MovementIndex n="07" />
              <p>
                And so the site is served that we may become comfortable as actors with
                changes, radical disruptions.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-8">
              <MovementIndex n="08" />
              <p>
                We write whilst the President of the United States insists he aurally rape us
                subjects daily. The reality we Americans live in under DJT's suzerainty is one
                saturated with falsehood, whereby the president repeats over and over baseless
                bile to dull the faculty by which people recognize truth. Capital in this
                country [shit in a] Diaper Don thinks is him—read that again I wrote it
                correctly—he and each of the cabinet members place above all else. The ink
                parlor I live above hangs a sign prominently stating: Cash is king. In American
                politics only because Diarrhea Diaper Don president can Cash be king. But I
                digress…
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-9">
              <MovementIndex n="09" />
              <p>
                This feeble administration enables the wealthy to purchase influence &amp;
                shape policy more than any and every legitimate administration prior to its
                metastasis. The overreach into daily lives of us Americans big
                tech—Facebook, Amazon, Apple, Microsoft, etc—enable an influence over what a
                people can imagine to be possible in a manner unprecedented. .: no appeal to
                history to help us here and the temptation is to believe that history that
                society &amp; culture has irredeemably crested at its nadir. This is not false.
                True enough billionaires like Bezos family, like Musk harem, and that twat Zuck
                whatever the hell he does in HI will be taxed out of existence. They will be
                made into hundred millionaires or we will imprison them. And if they attempt to
                flee the earth, we'll not allow them to land or resupply.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-10">
              <MovementIndex n="10" />
              <p>
                People of the United States of America: As certain as Presidents do die our
                nation—we forgot who we are. Having worked so hard and finally able to rest
                after fleecing American workers. Diahrrea Don and these obscenely wealthy
                billionaires are to become a footnote that record approximately where at an
                unmarked grave. We forgot, Americans, who we are. And in forgetting we get what
                we choose. Broken families, frayed relations, expenses higher than one's job(s)
                pays. These aspirations are those due the subjects of a rapist president of the
                United States. A loser. A narcissist who, without shame, insists upon aurally
                fucking our consciousness with his word alone. Drowning out fertile, creative,
                rebellious American word he who Dumps Daily in Diapers Don (think explosive
                diahrhea) aims to scar a majority of American's conscious awareness of what is
                true. Focused only on self-aggrandizement, Diaper Don is the first president
                that seeks for a majority of his subjects to be broken. Like a cowboy his
                horse, the Diaper Don seeks to break what was once our moral fabric founded
                upon ideas and ideals for the benefit of himself, the leader of a wealthy
                billionaire class. But today is not yet the time to focus either on these hard
                truths, or on the monumental stupidity those our compatriots who cast their
                vote for such a scoundrel foist upon us who, meeting a bare minimum, listen to
                what a candidate says. Now as president that former candidate without grace is
                dying slowly in front of us, entering his own hell. And once that body so full
                of shit and lies croaks, we will rebuild. Not with Bezos or Musk or Zuck but
                certainly, in large part, from their monies. And other billionaires whose
                fortunes will fund the working-class renaissance of America. When a single
                Black mother of two can get on a stage to thank a movement that finally, after
                over 250 years, removed the white racists foot from her neck. As nations
                forget, so too we may remember…
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-11">
              <MovementIndex n="11" />
              <p>
                And the task of this work is to cultivate the habits of attention. Without
                attention no cultural-political renewal can endure. A society—peoplew—
                incapable of examining themselves cannot (clearly can't!) govern itself. The
                same may be said of a person. Should renewal come it will arrive because you
                and I and ordinary folks across the most beautiful geography on planet earth,
                on its westward spin the pinnacle of civilization will learn again how to
                distinguish truth from performance, possession from custodianship, and
                certainty from wisdom.
              </p>
              <SectionBreak />
            </section>

            <section class="movement movement-12">
              <MovementIndex n="12" />
              <p>
                Perhaps then a mother, exhausted by years of carrying more than any one person
                ought to bear, may stand before her children and discover that history has
                become a little less heavy upon their shoulders than it was upon her own.
              </p>
            </section>
          </article>

          {/* ── the gate — where the prolegomenon terminates ─────────────── */}
          <section id="begin" class="gate-section">
            <div class="gate-content">
              <p class="gate-eyebrow">THE GATE:</p>
              <h2 class="gate-title">Here we meet @ a gate:</h2>
              <p class="gate-description">
                What follow are not polite questions. They are holes in the ice. answer them
                honestly and something cold touches your feet.
              </p>

              {error && (
                <div class="gate-error" role="alert">
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
                  <textarea
                    id="answer1"
                    name="answer1"
                    rows={4}
                    maxLength={20000}
                    placeholder="You may complete the questions in one session or over a course of days... Take your time…"
                    aria-describedby="accessibility-hint"
                  >
                  </textarea>
                </div>

                <div class="form-group">
                  <label for="answer2">What is your greatest fear?</label>
                  <textarea
                    id="answer2"
                    name="answer2"
                    rows={4}
                    maxLength={20000}
                    placeholder="You may only submit one questionnaire per 66 days up to half a year…"
                    aria-describedby="accessibility-hint"
                  >
                  </textarea>
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
                  <label for="email">
                    Email (used once, to send your magic-link authentication token)
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    autocomplete="email"
                    required
                    placeholder="your.email@example.com"
                  />
                  <p class="privacy-notice">
                    All what you type is age-encrypted before storage. The server uses the
                    email supplied once to deliver a single-use magic link, and then it is
                    hashed. There is no tracking, no profiling, no analytics, no third-party
                    sharing throughout the whole site.
                  </p>
                </div>

                <button type="submit" id="gate-submit-btn" class="gate-submit">
                  Begin
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer id="about">
          <a class="wordmark" href="#top">
            a4<span lang="ta">முள</span>
            <span lang="sa">सत्य</span>sya
          </a>

          <div>
            <p>A sequence for becoming acquainted with one self.</p>
            <p style="margin-top: 1rem;">
              Encrypted database hosted in Iceland by{' '}
              <a
                href="https://billing.flokinet.is/aff.php?aff=543"
                target="_blank"
                rel="noopener noreferrer"
              >
                FlokiNET
              </a>
            </p>
            <p style="margin-top: 0.5rem; word-break: break-all;">
              Onion mirror:{' '}
              <a
                href="http://a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion/"
                rel="noopener noreferrer"
              >
                a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion
              </a>
            </p>
          </div>

          <div class="footer-links" style="justify-content: flex-end;">
            <a href="/about.html">about</a>
            <a href="/contact.html">contact</a>
            <a href="/privacy.html">privacy</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
