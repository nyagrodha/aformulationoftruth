/**
 * Completion Page
 *
 * GET /completion
 *
 * Where the questionnaire ends, drawn on the landing page's layout: the same
 * stylesheet (/css/prolegomenon.css), header, folio and footer. Three parts:
 *
 *   1. the offer of an emailed PDF copy of one's responses, at the top;
 *   2. the essay "You are not one self.", ported from the static
 *      public/completion.html removed in 51809820 — the page was superseded,
 *      but its text never came across until now;
 *   3. the way onward.
 *
 * The old page's scripts did not come with it: weather-triggered snow (a fetch
 * to open-meteo.com from the visitor's own browser), rotating quotes, Google
 * Fonts, and a newsletter form that needed script. The newsletter lives on the
 * contact page now, and works without script.
 *
 * /api/responses/deliver redirects back here with ?copy=<outcome>.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import Nav from '../islands/Nav.tsx';
import Folio, { type FolioPart } from '../islands/Folio.tsx';
import SiteFooter from '../components/SiteFooter.tsx';
import { Ornament } from '../components/PageShell.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';

export interface CompletionData {
  resumeToken: string;
  copy?: string;
}

/*
 * What /api/responses/deliver's redirect means. The keys must be exactly the
 * `copy=` codes deliver.ts sends — tests/completion_page_test.tsx reads them
 * out of that file and compares. An unrecognised code shows nothing rather
 * than a guess.
 */
export const COPY_MESSAGES: Record<string, { text: string; problem?: boolean }> = {
  sent: { text: 'Your copy is on its way to the address you signed in with.' },
  declined: { text: 'No copy will be sent. Should you change your mind, you can still ask for one below.' },
  retry: { text: "We couldn't send your copy just now. Please try again in a few minutes.", problem: true },
  unavailable: {
    text: "A copy isn't available for a questionnaire begun before this feature existed.",
    problem: true,
  },
  nosession: {
    text:
      "We couldn't match this request to your questionnaire. If you've cleared your cookies, sign in again with the same email address and return here.",
    problem: true,
  },
  invalid: { text: "Your request didn't come through. Kindly try again.", problem: true },
  error: { text: 'Something went wrong. Please try again.', problem: true },
};

const FOLIO_PARTS: FolioPart[] = [
  { label: '1. your copy', id: 'copy' },
  { label: '2. You are not one self', id: 'essay' },
  { label: '3. onward', id: 'onward' },
];

/* The old page's own title, kept. */
const TITLE =
  "To be a person, to act as one ought, to act according to the categorical imperative--in other words to be a unified self through time (having risked titling this something thoughtless) one may not want to identify a 'self' as unified in any person";

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
    const copy = new URL(req.url).searchParams.get('copy') ?? undefined;
    return ctx.render({ resumeToken, copy });
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

export default function CompletionPage({ data }: PageProps<CompletionData>) {
  const outcome = data.copy ? COPY_MESSAGES[data.copy] : undefined;

  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>{TITLE}</title>
        <meta name='description' content='You are not one self. This is not a tragedy. It is more like the weather.' />
        <link rel='icon' href='/favicon.ico' sizes='any' />
        <link rel='icon' type='image/png' sizes='32x32' href='/favicons/favicon-32x32.png' />
        <link rel='icon' type='image/png' sizes='16x16' href='/favicons/favicon-16x16.png' />
        <link rel='apple-touch-icon' href='/favicons/apple-touch-icon.png' />
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
            <Nav items={PAGE_NAV} />
          </header>

          {/* ── 1. the copy ─────────────────────────────────────────────── */}
          <section id='copy' class='gate-section completion-offer'>
            <div class='gate-content'>
              <p class='gate-eyebrow'>complete:</p>
              <h1 class='gate-title'>Your responses have been received and encrypted.</h1>
              <blockquote class='gate-description completion-quote'>
                <p>“Our intonations contain our philosophy of life.”</p>
                <cite>Marcel Proust</cite>
              </blockquote>

              {outcome && (
                <div class={outcome.problem ? 'completion-status is-problem' : 'completion-status'} role='status'>
                  {outcome.text}
                </div>
              )}

              {/* Once a copy is on its way the form goes, so a second press cannot send a second one. */}
              {data.copy !== 'sent' && <ConsentForm resumeToken={data.resumeToken} />}
            </div>
          </section>

          {/* ── 2. the essay ────────────────────────────────────────────── */}
          <section id='essay' class='movement essay' aria-labelledby='essay-title'>
            <p class='essay-threshold'>
              <span lang='ta'>நான் யாரு?</span>{' '}
              <img src='/images/nav-irendu-372.webp' alt='2' width={372} height={252} decoding='async' />
            </p>

            <h2 class='essay-kicker' id='essay-title'>You are not one self.</h2>

            <p>This is not a tragedy. It is more like the weather.</p>

            <p class='essay-dedication'>
              <em>Dedicated to the memory and imaginative talent of Richard Brautigan (1935–1984)</em>
            </p>

            <Ornament />

            <p>
              I knew a man once who answered the Proust Questionnaire. It was 1987. His idea of perfect happiness? "A
              cabin in Montana with good light for reading."
            </p>
            <p>
              In 1997 happenstantially coming upon the questionnaire that had shifted from within a box and now stained
              with his soon-to-be crusty sfacim, again he answered. His idea of perfect happiness? Well that had become
              "for my daughter to stop crying at night."
            </p>
            <p>In 2007 it was "to finish the book I'm writing."</p>
            <p>In 2017 it was, like clockwork, "a cabin in Montana with good light for reading."</p>
            <p>
              He thought this meant something. Therein lies the ego's rub not upon the phallus per se. And it did. It
              meant something the way weather means something.
            </p>

            <Ornament />

            <p>
              A thousand or so years ago in what was then as now Kashmir a philosopher named Abhinavagupta lived. Doing
              what polymaths of brahmanical intellectual tradition do, he likely grew a long beard. Abhinava's name
              against an ornament of 'skrit that causes mis ojos to glitter translates to English as "the secret of
              being continuously new." fwiw his idears kinda rock one's headspace; unlikely he posed for a picture. But
              I am aware of one portrait some devotee drew up of the man, the polymath, the legend. Reportedly his eyes
              shine red—inebriated as we may be by the rasa—surrounded by yoginīs on a raised platform chalice in hand
              he sips. Though I've yet to see it, the portrait has appeared in a dream. Or so I think I recall.
            </p>
            <p>In any case, Abhinava watched people watch plays, nāṭakam in the 'skrit sans devanagari.</p>
            <p>
              And he noticed that when Rāma (whose creator coined the character, nee god's name as upon māra, or murder,
              he meditated so long around this common thug a valmīk, or termite mound, enveloped him to become known as
              Valmīkī in the records of how it's been/was) grieved stage left, the audience felt grief. But this grief
              was not theirs. The audience hadn't lost anyone; neither was it Rāma's grief either—everyone knew it was a
              nāṭakam, a play.
            </p>
            <p>So whose grief was it?</p>
            <p>Abhinavagupta said: it belongs to consciousness recognizing itself.</p>
            <p>
              Doing so it creates this effect that metaphor can't quite capture. Likely with a head full of LSD some
              folks remark it's like looking in a mirror and seeing that you are also the mirror; I'd paint a different
              picture with words employing '2-CB'. Recognise within you, the I, as an absence. Words alone engender and
              inaugurate its possibility just as around the inside clay the emptiness of a pot.
            </p>
            <p>
              He called this <em>camatkāra</em>, which means something like "wonder" or "the shiver."
            </p>
            <p>The shiver doesn't need an object. It just needs you to stop for a second.</p>

            <Ornament />

            <p>
              Lacan was a French psychoanalyst who smoked too many cigarettes and said things like "the unconscious is
              structured like a language."
            </p>
            <p>He also said the self is basically a grammatical error.</p>
            <p>
              When you say "I," you are not referring to yourself. You are referring to a word that stands where you
              should be. The real you—if there is one—is somewhere else, hiding behind the sentence.
            </p>
            <p>This is why talking about yourself feels like trying to catch a fish with your hands.</p>
            <p>Every time you grab, it slips.</p>

            <Ornament />

            <p>The questionnaire has thirty-five questions.</p>
            <p>"What is your greatest fear?"</p>
            <p>"What is the trait you most deplore in yourself?"</p>
            <p>"How would you like to die?"</p>
            <p>These are not polite questions. They are holes in the ice.</p>
            <p>If you answer them honestly, something cold touches your feet.</p>

            <Ornament />

            <p>
              Christine Korsgaard is a philosopher at Harvard. She says the self is not something you find. It is
              something you make.
            </p>
            <p>Every choice is a kind of sewing.</p>
            <p>
              You stitch yourself together out of what's available: your mother's phrases, your teacher's posture, songs
              you heard when you were seventeen, a stranger's coat you saw once and never forgot.
            </p>
            <p>You are a quilt made of other people's fabric.</p>
            <p>This is not sad. Quilts are warm.</p>

            <Ornament />

            <p>The instruction is: answer once. Then forget the questions for ten years.</p>
            <p>This is important.</p>
            <p>
              If you think about the questions too often, you will start to believe your answers are who you are. They
              are not who you are. They are who you were on a Tuesday in November when you were tired and the light was
              gray.
            </p>
            <p>Ten years later you will be someone else answering the same questions.</p>
            <p>The questions don't change. You do.</p>
            <p>
              This is like a river passing the same bridge twice. The bridge thinks it's seeing the same river. The
              river knows better.
            </p>

            <Ornament />

            <p>
              Lacan had a concept called{' '}
              <em>objet petit a</em>. The little object. The thing you're always looking for but can never find.
            </p>
            <p>It's the reason you open the refrigerator when you're not hungry.</p>
            <p>It's the reason you answer questionnaires about yourself.</p>
            <p>
              You're looking for something. You don't know what it is. If you found it, you wouldn't recognize it. But
              looking feels important.
            </p>
            <p>The looking is the thing.</p>

            <Ornament />

            <p>
              In India they have a word: <em>pratyabhijñā</em>. It means recognition.
            </p>
            <p>Not learning something new. Remembering something you always knew but forgot.</p>
            <p>
              Like when you walk into a room and suddenly remember you've been there before, in a dream or another life
              or last Thursday.
            </p>
            <p>That shiver.</p>
            <p>The questionnaire is a machine for producing that shiver.</p>
            <p>
              Not the answers. The moment between the question and the answer. The pause where you are nobody in
              particular, just consciousness wondering what it will say.
            </p>
            <p>That pause is freedom.</p>
            <p>
              The eleventh-century Kashmiris had a word for that too:{' '}
              <em>svātantrya</em>. It means "not needing anything outside yourself to be what you are."
            </p>
            <p>Like a cat in a sunbeam. The cat isn't waiting for anything. The cat is complete.</p>
            <p>You are also complete. You just keep forgetting.</p>

            <Ornament />

            <p>The world moves faster now.</p>
            <p>
              In 1890, when Proust answered these questions in a parlor in Paris, a person might be one thing for their
              whole life. A baker. A countess. A disappointment to their father.
            </p>
            <p>Now you can be twelve things before lunch.</p>
            <p>This is confusing but it is also an opportunity.</p>
            <p>
              If you are not one self, you don't have to defend any particular self. You can watch them come and go like
              clouds.
            </p>
            <p>Clouds are beautiful. Nobody argues with clouds.</p>

            <Ornament />

            <p>The question is a door.</p>
            <p>Behind the door is another door.</p>
            <p>Behind that door is a room with no floor, only sky.</p>
            <p>You've been falling through that sky your whole life.</p>
            <p>The fall is the happiness.</p>

            <Ornament />

            <p>Answer. Wait ten years. Answer again.</p>
            <p>Notice that you are different.</p>
            <p>Notice that you are the same.</p>
            <p>Notice that "different" and "same" are just words, and you are not a word.</p>
            <p>You are the one using the words.</p>
            <p>You are the one who can put them down.</p>

            <Ornament />

            <p>The cat in the sunbeam knows this.</p>
            <p>The river knows this.</p>
            <p>Now you know it too.</p>
            <p>Or you always did.</p>
            <p class='essay-close'>That's the whole point.</p>
          </section>

          {/* ── 3. onward ───────────────────────────────────────────────── */}
          <section id='onward' class='gate-section completion-onward'>
            <div class='gate-content'>
              <p class='gate-eyebrow'>onward:</p>
              <p class='completion-links'>
                <a href='/profile-choice'>create a profile</a>
                <a href='/'>
                  <span lang='ta'>முகப்பு</span> · return to the beginning
                </a>
              </p>
              <p class='completion-newsletter'>
                Occasional letters about new essays and changes to the site:{' '}
                <a href='/contact.html#newsletter'>subscribe on the contact page</a>.
              </p>
            </div>
          </section>

          {/* spans all of <main>, so the sticky folio inside follows the reader to the end of it */}
          <div class='folio-track'>
            <Folio parts={FOLIO_PARTS} />
          </div>
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
