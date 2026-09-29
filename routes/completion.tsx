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
  queued: { text: "Your copy is queued. If the connection is down for a moment, we'll keep trying." },
  declined: {
    text:
      'No new copy will be sent — though one already sending cannot be recalled. Should you change your mind, you can still ask for one below.',
  },
  attention: { text: 'Your previous copy request needs attention. Please contact the webmaster.', problem: true },
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

            <p>This is not a tRaGedY. It is more like the weather.</p>

            <p class='essay-dedication'>
              <em>Dedicated to the memory and imaginative talent of Richard Brautigan (1935–1984)</em>
            </p>

            <blockquote class='essay-epigraph'>
              <p lang='sa'>यैरेव पतनं द्रव्यैः सिद्धिस्तैरेव चोदिता</p>
              <p>
                <em>One rises, perfected, by precisely those things by which one falls.</em>
              </p>
              <footer>—Kulārṇava Tantra, 5.47</footer>
            </blockquote>

            <blockquote class='essay-epigraph'>
              <p>
                <em>
                  For in happiness all that is earthly seeks its downfall, and only in good fortune is its downfall
                  destined to find it.
                </em>
              </p>
              <footer>—Walter Benjamin, "Theologico-Political Fragment"</footer>
            </blockquote>

            <Ornament />

            <p class='essay-standalone'>You are not one self.</p>
            <p>This is not a tragedy. It is more like the weather.</p>

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
              He thought this meant something. Therein lies the ego's rub not upon the phallus per se. And it do. The
              answers mean something the way the weather means something.
            </p>
            <Ornament />
            <p>
              A thousand or so years ago in what was then as now Kashmir a philosopher named Abhinavagupta lived. Doing
              what polymaths of brahmanical intellectual tradition do, he likely grew a long beard. Abhinava's name
              against the ornament of Sanskrit that causes this writer's eye pair to glitter translates something like
              "the secret of being continuously new." fwiw his idears kinda rock one's headspace; unlikely he posed for
              a picture.
            </p>
            <p>
              But I am aware of one portrait some devotee drew up of the man, the polymath, the legend. Reportedly his
              eyes shine red—inebriated as we may be by the rasa—surrounded by yoginīs on a raised platform chalice in
              hand he sips. Though I've yet to see it, the portrait has appeared in a dream. Or so I think I recall.
            </p>
            <p>In any case, Abhinava watched people watch plays, nāṭakam in the 'skrit sans devanagari</p>
            <p>
              And Abhinava observed that when Rāma—a god among men fashioned by Vālmīki, a common thug by legend,
              absorbed in repetition of the name Rāma, Rāma, Rāma, māra, māra... reversed as māra ("murder"), remained
              so long in meditation that a valmīk, a termite mound, rose around him and thus fixed his name in the
              record of what was—grieved stage left, the audience too experienced grief.
            </p>
            <p>
              Yet this grief belonged to no one. The spectators had suffered no loss, and Rāma himself did not truly
              suffer, for all knew this was a nāṭakam, a play. What manifests instead is a transpersonal savoring:
              sorrow divested of private ownership, universalized through representation. The emotion, stripped of
              practical consequence and freed from egoic contraction, becomes aesthetic relish—karuṇa-rasa—apprehended
              in luminous detachment.
            </p>
            <p>So whose grief was it?</p>
            <p>
              Abhinavagupta said: it belongs to consciousness recognizing itself.<a
                href='#fn1'
                class='footnote-ref'
                id='fnref1'
              >
                Ψ
              </a>
            </p>
            <p>
              Doing so it creates this effect that metaphor can't quite capture. Likely with a head full of LSD some
              folks remark it's like looking in a mirror and seeing that you are also the mirror; I'd paint a different
              picture with words employing '2-CB'. Recognise within you, the I, as an absence that words alone create
              the possibility for just as around an inside clay the emptiness of a pot.
            </p>
            <p>
              He called this <em>camatkāra</em>, which means something like "wonder" or "the shiver."
            </p>
            <p>The shiver doesn't need an object. It just needs you to stop for a second.</p>
            <Ornament />
            <p>
              Lacan was a French psychoanalyst. From today's standard he smoked too many cigarettes. He said things like
              "the very foundation of interhuman dialogue is misunderstanding.", "the unconscious is structured like a
              language."; "I think where I am not; therefore, I am where I do not think."
            </p>
            <p>
              He also said the self, this thing we call 'I' in English is basically a grammatical error. Imagine that
              bookish cunt we all know start correcting people for saying 'I'... apologies in advance.
            </p>
            <p>
              We all call ourselves by the same name: I. It's who we are and yet when we say I, per Lacanian theory, we
              aren't referring to ourselves. Rather, I appeals to a phoneme—this word I—to stand in where oneself ought
              be. But instead there is this grammatical anomaly.
            </p>
            <p>
              Remember the clay pot? The emptiness that words create? Pāṇini knew about this two thousand years before
              Lacan was born.
            </p>
            <p>
              Pāṇini was an ancient Sanskrit grammarian. He wrote a grammar so precise it could compile computer code if
              computers had existed in 400 BCE. His rules for how language works are like instructions for a very small
              machine that builds sentences one atom at a time.
            </p>
            <p>
              Here's what Pāṇini did that matters: he never gave you a cozy definition like "the nominative case marks
              the subject." He did something sharper. The nominative—the case of I, the case of naming—only appears when
              nothing else has claimed the noun. It's a case of exclusion. Of what remains.
            </p>
            <p>
              In Sanskrit grammar, you don't get to be "I" because you're the doer or the thinker. You get to be "I"
              because no other relationship seized you first. The nominative is the case of residue. What's left over
              when every other connection has been mapped and named.
            </p>
            <p>
              Think about that. "I" is what remains when nothing else applies. Like the empty space in the pot. Like
              consciousness recognizing itself in a play. The subject isn't a thing. It's an absence that appears when
              all the relationships have been accounted for and there's still... this. Whatever this is.
            </p>
            <p>
              Lacan would have loved this. The grammatical anomaly isn't a bug. It's the feature. We're a remainder. A
              leftover. The space that appears when you've mapped everything else.
            </p>
            <p>This is why talking about yourself feels like trying to catch a trout with your hands.</p>
            <p>
              Every time you grasp at trout fishing in America, they slip. Likely cause of that lube you'd been using
              earlier to rub one out.
            </p>
            <Ornament />
            <p>The questionnaire has thirty-five questions.</p>
            <p class='essay-question'>"What is your greatest fear?"</p>
            <p class='essay-question'>"What is the trait you most deplore in yourself?"</p>
            <p class='essay-question'>"How would you like to die?"</p>
            <p>These are not polite questions. They are holes in the rapidly melting ice.</p>
            <p>If you answer honestly, spontaneously, something cold touches your feet.</p>
            <Ornament />
            <p>
              If we think about this too much, we're likely students of Christine Korsgaard's, a Kantian ethicist
              (retired) at Harvard.
            </p>
            <p class='essay-figure'>
              <img
                src='/images/korsgaardonvacuuming-1200-cropped.webp'
                alt="Pre-meme meme from 2012: You can't spell vacuum without u"
                loading='lazy'
                decoding='async'
              />
            </p>
            <p>
              Anyhow 'stine says the self is not something we find. It's something we make. And from birth until death
              we're making a quilt, our lives. Quilts on quilts on quilts--every irl choice a kind of sewing.
            </p>
            <p>
              We stitch ourselves together (or not!) out of what's available: mother's phrases, a teacher's posture,
              songs we heard when we were angsty teens, that stranger's coat I saw once at Cafe Roma and never forgot
              (it was nice!).
            </p>
            <p>
              We are a quilt. We are only ever made of other people's fabrics. These days in the hellscape that is
              later-ish (?) capitalizm, priority is given to individuals, and we make like brands to sell a vanishingly
              fleeting formulation. A you de parvence variously seeking fortune, fame, and all things incompatibile with
              the realities of being a quilt. A family.
            </p>
            <p>This is not sad. Quilts are warm. This has been brought to you by extending the metaphor.</p>
            <Ornament />
            <p>
              The instruction is this: answer once. Then do your best to forget the questions. That dude up there he
              answered it four times. Frankly, tha's a lot.
            </p>
            <p>This is important.</p>
            <p>
              If we think about the questions too often, our responses start to become performative. It creates this
              vicious cycle that, once embarked upon wittingly or not, the ego's in control and the value of the
              mechanic is diminished. We soon (so soon!) start to believe the answers to be who we are. But questions
              are not who you, or I, or anyone else are. They are who we were on a Tuesday in November when our I's were
              tired and the light was grey.
            </p>
            <p>
              Ten years later, having all but perfectly forgotten, we'll be someone else. That person, who is sitting in
              room different than the one you are in now, may answer the same questions and experience a good dose of
              that camatkāra.
            </p>
            <p>The questions don't change. I do.</p>
            <p>
              This is like a river passing the same bridge twice. The bridge thinks it's seeing the same river. The
              river knows better.
            </p>
            <Ornament />
            <p>
              Lacan thought up a concept he called{' '}
              <em>objet petit a</em>. The little object. The thing we're always looking for but can never find.
            </p>
            <p>
              It's the hole in your sould that makes you open the refrigerator late at night/early in the AM when you're
              not even hungry.
            </p>
            <p>
              It's the hole in your ass... I mean, self-understanding that makes anyone think to answer a questionnaire
              in the first place!
            </p>
            <p>
              We're seeking something. We don't know what that is. Engaged thusly a seeker, we wouldn't recognize it.
              But the looking the perfecting feels important.
            </p>
            <p>The looking is the thing.</p>
            <Ornament />
            <p>
              In what is today India long time back some poet put together a word:{' '}
              <em>pratyabhijñā</em>. In english it means recognition.
            </p>
            <p>
              Not seeking, not looking for something new. Remembering something. Becoming Buddha. Buddha being a simple
              past passive participle in Sanskrit. In English it means that which is known. Past in that we always knew
              it, but forgot; passive because we don't gotta do anything to understand it. Precisely the opposite!
            </p>
            <p>
              Like when I walked into a room and suddenly remembered I'd been there before, in a dream or another life
              or (more likely) last Thursday.
            </p>
            <p>That shiver.</p>
            <p>The questionnaire is a machine I host here for producing that shiver.</p>
            <p>Not the answers.</p>
            <p>
              The moment between having read the question and beginning to see the answer... that pause wherein I am
              really nobody in particular, the absence I imagine who can translate a memory. This is what the eye is
              therefore. Have we the courage not to correct but just to answer? Who is it, anyway, who thinks I
              shouldn't write that? Stop giving a fuck. We are a speaking quilt, wondering what it will say next.
            </p>
            <p>That pause is uninterrupted delight, the freedom and bliss of cosnciousness recognizing itself.</p>
            <p>
              The eleventh-century Kashmiris had a word for that too:{' '}
              <em>svātantrya</em>. It means "not needing anything outside yourself to be what you are."
            </p>
            <p>Like a cat in a sunbeam. The cat isn't waiting for anything. The cat is complete.</p>
            <p>
              You are also complete. I just keep forgetting it about you bc we're such bitches to one another because...
              well, late (?) capitsalizm.
            </p>
            <Ornament />
            <p>And the world moves faster now.</p>
            <p>
              In 1890, when Proust answered these questions somewhere in Paris, a person might be one thing for their
              whole life. A baker. A countess. A disappointment to their father.
            </p>
            <p>
              Now you or I can be twelve things before lunch! We can purge in the restroom and be another 7 to 9 before
              bed.
            </p>
            <p>This is confusing, it is far from naturalized, but it also may be an opportunity.</p>
            <p>
              If we are not one self, I don't have to defend any particular self, any version of me against the others.
              I do get to watch though as come for the second time in a day and go like clouds.
            </p>
            <p>Clouds are beautiful. Nobody argues with clouds.</p>
            <Ornament />
            <p class='essay-standalone'>What is your idea of perfect happiness?</p>
            <p>The question is a door.</p>
            <p>Behind the door is another door.</p>
            <p>Behind that door is a room with no floor, only a cloud-filled sky.</p>
            <p>You've been falling through that sky your whole life.</p>
            <p>How did the clouds even get inside? And where am I falling to?</p>
            <p>The fall is the happiness.</p>
            <Ornament />
            <p class='essay-aside'>Whatever nature may there be is in the fall.</p>
            <p>Answer. Wait ten years. Answer again.</p>
            <p>Notice something different.</p>
            <p>Notice the same.</p>
            <p>Notice "different" and "same" are words, and we are not a word.</p>
            <p>We are the ones using the words with one another.</p>
            <p>
              We are the ones who put down or lift up. And all of us do both. But we gotta practice doing more the
              lifting up one another.
            </p>

            <blockquote class='essay-epigraph essay-final'>
              <p lang='sa'>सर्वथा पुनर् अविच्छिन्नचमत्कारनिरपेक्षस्वातन्त्र्याहंविमर्शे</p>
              <p>
                <em>
                  The freedom of the uninterrupted delight of I-consciousness is completely independent of any reference
                  to anything else.
                </em>
              </p>
              <footer>—Abhinavagupta</footer>
            </blockquote>

            <p>The cat in the sunbeam knows this.</p>
            <p>The river knows this.</p>
            <p>Now you know it too.</p>
            <p>Or you always did.</p>
            <p class='essay-close'>That's the whole point.</p>

            <aside class='essay-notes' aria-labelledby='essay-notes-title'>
              <h3 id='essay-notes-title'>Notes</h3>
              <p id='fn1'>
                <a href='#fnref1' aria-label='back to the text'>Ψ</a> See{' '}
                <em>Abhinavabhāratī</em>, Abhinavagupta's commentary on Bharata's{' '}
                <em>Nāṭyaśāstra</em>, particularly his gloss on the <em>rasasūtra</em>{' '}
                (NS 6.31). The Kashmiris called the broader philosophical framework{' '}
                <em>pratyabhijñā</em>—recognition. You don't acquire your nature; you remember it. The aesthetic shiver
                and the liberating insight share the same structure: <em>saṃvid</em> glimpsing{' '}
                <em>saṃvid</em>. Rasa opens a crack; through it, consciousness catches sight of itself. Cf. the famous
                compound:{' '}
                <em>sarvathā punar avicchinnacamatkāranirapekṣasvātantryāhaṃvimarśe</em>—the freedom of the
                uninterrupted delight [in] I-consciousness (<em>ahamvimarśe</em>), is completely independent of any
                reference to anything else.
              </p>
            </aside>
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
