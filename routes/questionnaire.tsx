/**
 * Questionnaire Page - JWT Authentication
 *
 * GET /questionnaire
 *
 * Serves the Proust-style questionnaire with shuffled questions.
 * Questions 0-1 are gate questions (already served at /gate).
 * Questions 2-34 are shuffled per session and shown here.
 *
 * Authentication: JWT token in cookie, session state in DB
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { completeSession, updateSessionIndex, updateSessionProgress } from '../lib/questionnaire-session.ts';
import { authenticateRequest, isAuthenticated, jwtCookie } from '../lib/session-auth.ts';
import { interstitialResponse } from '../components/Interstitial.tsx';
import { presentationOrder } from '../lib/questionnaire.ts';
import { increment, trackLatency } from '../lib/metrics.ts';
import { questionTextFor, recordAnswer } from '../lib/answers.ts';

// The question texts live in lib/questions_dakshinaparvanuvadam.ts, which is
// the module that owns them. A verbatim copy of all 35 strings used to sit here
// and a second copy in routes/api/questions/answer.ts — three places to edit,
// two of which would be forgotten, and the stored question text would then
// disagree with the question actually put to the respondent.

interface QuestionnaireData {
  authenticated: boolean;
  sessionId: string;
  questionOrder: number[];
  currentIndex: number;
  currentQuestion: string;
  questionNumber: number;
  totalQuestions: number;
}

/**
 * Minimal escaping for the one place this file builds HTML by hand: the 503
 * page below, which quotes the respondent's own answer back at them. Everything
 * else on this route goes through JSX, which escapes for us.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export const handler: Handlers<QuestionnaireData> = {
  async GET(req, ctx) {
    increment('requests.api');

    // One helper for all three of the checks this used to make by hand, and it
    // adds the one that was missing: a respondent holding only the thirty-day
    // resume_token cookie is let in and given a fresh JWT, instead of being
    // bounced to the landing page as though they had never been here.
    const auth = await authenticateRequest(req);
    if (!isAuthenticated(auth)) {
      return interstitialResponse(auth.failure);
    }
    const { session, refreshedJwt } = auth;

    // Finished sessions are readable now -- getSessionRecord does not filter
    // them out -- so say where they lead rather than treating them as a
    // failure to authenticate.
    if (session.completedAt) {
      return new Response(null, { status: 302, headers: { Location: '/completion' } });
    }

    // The stored order IS the presentation order, so it is used whole.
    //
    // This used to be `.slice(2)`, on the belief that the first two entries
    // were the gate questions. They are not. generateQuestionOrder() already
    // EXCLUDES Q0 and Q1 when the gate has been answered, returning 33 entries
    // (2,196 of the sessions on record); slicing two off that dropped two real
    // questions from every one of them, unasked and unnoticed. For the
    // 35-entry order used when the gate was skipped, the gate questions are
    // shuffled into the list rather than sitting at the front, so the slice
    // discarded whichever two questions happened to land first.
    //
    // It also disagreed with routes/api/questions/answer.ts, which never
    // sliced: the page called the questionnaire finished two questions before
    // the API did.
    const { order: questionOrder, answeredAtGate, total } = presentationOrder(
      session.questionOrder,
    );
    const currentIndex = session.currentIndex;

    // Check if completed
    if (currentIndex >= questionOrder.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/completion' },
      });
    }

    const questionNum = questionOrder[currentIndex];
    const currentQuestion = questionTextFor(questionNum);

    // Position in the respondent's whole run: a 33-entry order had its two gate
    // questions answered at /gate, so they are counted back in to keep
    // "question N of 35" honest.
    const overallNum = answeredAtGate + currentIndex + 1;

    increment('questionnaire.viewed');

    // When the resume token did the work, hand back a JWT so the next request
    // does not repeat the lookup. Only the jwt cookie is rewritten: the resume
    // token in the browser is still valid and re-sending it would only reset
    // its clock, which updateSessionProgress already does server-side.
    const headers = new Headers();
    if (refreshedJwt) {
      headers.append('Set-Cookie', jwtCookie(refreshedJwt));
    }

    return ctx.render({
      authenticated: true,
      sessionId: session.sessionId,
      questionOrder,
      currentIndex,
      currentQuestion,
      questionNumber: overallNum,
      totalQuestions: total,
    }, { headers });
  },

  async POST(req, _ctx) {
    increment('requests.api');

    // Read the body BEFORE authenticating. The order matters more than it
    // looks: this handler used to verify the JWT first and redirect to the
    // landing page on failure, which threw away whatever the respondent had
    // just written, unread and unmentioned. A session lasts 24 hours and people
    // sit with these questions, so the expiry lands mid-answer as a matter of
    // course. Reading first means the text still exists when we discover we
    // cannot store it, and can be handed back.
    const formData = await req.formData();
    const answer = formData.get('answer')?.toString() || '';
    const action = formData.get('action')?.toString() || 'continue';

    const auth = await authenticateRequest(req);
    if (!isAuthenticated(auth)) {
      increment('answers.lost_to_auth');
      return interstitialResponse(auth.failure, answer);
    }
    const { session, refreshedJwt } = auth;

    // Built before the early exits, not after: a request authenticated by the
    // resume token mints a JWT, and EVERY branch that leaves this handler has
    // to carry it. Otherwise someone resuming pays a fresh database lookup on
    // every question forever, having been handed a token nothing ever stored.
    const redirect = (location: string): Response => {
      const headers = new Headers({ Location: location });
      if (refreshedJwt) {
        headers.append('Set-Cookie', jwtCookie(refreshedJwt));
      }
      return new Response(null, { status: 302, headers });
    };

    if (session.completedAt) {
      return redirect('/completion');
    }

    // Whole, for the reason given in the GET handler above.
    const { order: questionOrder } = presentationOrder(session.questionOrder);
    const currentIndex = session.currentIndex;

    // The GET handler bails out here; this one did not, and the asymmetry was
    // a way to write an answer filed under `undefined`. A session can sit at
    // current_index === questionOrder.length with completed_at still unset --
    // that is the state every session finished under the old `.slice(2)`
    // accounting was left in, because the page thought it was done two
    // questions before the API did and never stamped the finish. Posting from
    // such a session indexes past the end of the order, and the resulting
    // `undefined` went straight into recordAnswer as the question index and
    // was encrypted and stored under it.
    if (currentIndex >= questionOrder.length) {
      await completeSession(session.sessionId);
      return redirect('/completion');
    }

    const questionNum = questionOrder[currentIndex];

    // Back navigation: step to the previous question without storing anything.
    // Answers are age-encrypted at rest, so the field is not pre-filled —
    // returning to a question means re-answering it. Guarded at index 0.
    if (action === 'back') {
      const prevIndex = Math.max(0, currentIndex - 1);
      await updateSessionIndex(session.sessionId, prevIndex);
      return redirect('/questionnaire');
    }

    const skipped = action === 'skip' || answer.trim() === '';

    // How long this answer took, bucketed. updatedAt is the last time this
    // session was touched, so for the first answer after a gap it measures the
    // gap rather than the thinking -- the buckets are coarse enough to survive
    // that, and it needs no client state, no hidden field, and nothing stored.
    // trackLatency has existed since the metrics module was written and had no
    // caller, so the report's TIME TAKEN PER ANSWER section has never rendered.
    trackLatency(session.updatedAt.getTime());

    // Store the answer, then advance — in that order, and only on success.
    //
    // This used to POST to our own /api/questions/answer over HTTP, forwarding
    // the `jwt` cookie and nothing else. That endpoint reads its JWT from an
    // `Authorization: Bearer` header and needs a resume token besides, so every
    // such call returned 401. The failure was logged and then ignored: the
    // session advanced regardless, the next question appeared, and the answer
    // was gone. That is how a live questionnaire recorded zero answers for its
    // entire existence while looking perfectly well from the outside.
    //
    // A 5xx here is the correct outcome. Losing what someone wrote is worse
    // than making them submit it again.
    try {
      await recordAnswer({
        sessionId: session.sessionId,
        questionIndex: questionNum,
        answer,
        skipped,
      });
    } catch {
      increment('errors.5xx');
      increment('answers.store_failed');
      // No detail: the thrown error carries the gate's response body, which
      // can quote the answer back at us.
      console.error('[questionnaire] Answer storage failed; session not advanced');
      // Hand the answer back rather than telling them to press Back and hope.
      // A browser returning to a POSTed page may re-render it from cache with
      // an empty textarea, so "submit it again" was advice that could not
      // always be followed. The session is intact and NOT advanced, so
      // resubmitting the same question is exactly the right thing.
      return new Response(
        `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<title>a formulation of truth</title><link rel="stylesheet" href="/css/main.css"></head>` +
          `<body><main><section class="section gate-section"><div class="gate-content">` +
          `<h2 class="gate-title">that could not be saved</h2>` +
          `<p class="gate-description">The encryption service did not answer, so nothing was stored and ` +
          `your place has not moved. Your answer is below. Copy it, then try the question again.</p>` +
          `<div class="form-group"><textarea readonly rows="10">${escapeHtml(answer)}</textarea></div>` +
          `<div class="form-actions"><a href="/questionnaire" class="cta cta-primary">Back to the question</a></div>` +
          `</div></section></main></body></html>`,
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    // Advance to next question
    const nextIndex = currentIndex + 1;

    // Update session progress in database
    if (skipped) {
      await updateSessionIndex(session.sessionId, nextIndex);
    } else {
      await updateSessionProgress(session.sessionId, questionNum, nextIndex);
    }

    // Check if completed
    if (nextIndex >= questionOrder.length) {
      // Stamp the finish here. Previously the page just redirected and left
      // completed_at unset, so a finished questionnaire was indistinguishable
      // from an abandoned one until the same address happened to start again.
      await completeSession(session.sessionId);
      increment('questionnaire.completed');
      return redirect('/completion');
    }

    // Redirect back to questionnaire (will show next question)
    return redirect('/questionnaire');
  },
};

export default function QuestionnairePage({ data }: PageProps<QuestionnaireData>) {
  const { currentIndex, currentQuestion, questionNumber, totalQuestions } = data;

  // Each question is labeled by its numeral in Tamil script — except question 5,
  // which is rendered in Kannada. Positional conversion through a per-script digit
  // table (Tamil ௦-௯ / Kannada ೦-೯); device system fonts supply the glyphs.
  const TA = ['௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯'];
  const KN = ['೦', '೧', '೨', '೩', '೪', '೫', '೬', '೭', '೮', '೯'];
  const toGlyphs = (n: number, digits: string[]) => String(n).split('').map((d) => digits[Number(d)]).join('');
  const isFive = questionNumber === 5;
  const bigNumeral = toGlyphs(questionNumber, isFive ? KN : TA);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta name='description' content='An apparatus for attention. Self-inquiry through the Proust Questionnaire.' />
        <link rel='stylesheet' href='/css/main.css' />
        <style>
          {`
          body {
            background: #000;
            color: #ccc;
            font-family: 'Georgia', serif;
            margin: 0;
            min-height: 100vh;
          }
          nav {
            padding: 1.5rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .logo {
            font-family: 'Courier New', monospace;
            font-size: 0.8rem;
            letter-spacing: 0.2em;
            color: #666;
            text-decoration: none;
          }
          .logo:hover { color: #fff; }
          .nav-links { display: flex; gap: 2rem; }
          .nav-links a {
            font-size: 0.75rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #666;
            text-decoration: none;
          }
          .nav-links a:hover { color: #fff; }
          main {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: calc(100vh - 120px);
            padding: 2rem;
          }
          .questionnaire-container {
            max-width: 600px;
            width: 100%;
            text-align: center;
          }
          .progress-bar {
            background: #1a1a1a;
            height: 4px;
            border-radius: 2px;
            margin-bottom: 2rem;
            overflow: hidden;
          }
          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ff69b4, #ff8c42, #00ff88);
            transition: width 0.3s ease;
          }
          .q-numeral {
            margin-bottom: 2.5rem;
            text-align: center;
          }
          .q-glyph {
            font-size: 2.6rem;
            line-height: 1;
            color: #7fd4e8;
          }
          .q-roman {
            position: fixed;
            bottom: 1.4rem;
            right: 1.6rem;
            font-size: 0.62rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: #4f7c88;
            display: inline-flex;
            align-items: center;
            gap: 0.55rem;
            pointer-events: none;
          }
          .q-roman::before {
            content: '';
            width: 1.6rem;
            height: 1px;
            background: linear-gradient(90deg, transparent, #3a5a62);
          }
          .q-roman-sep { opacity: 0.6; }
          .question-text {
            font-size: 1.6rem;
            line-height: 1.65;
            color: #fff;
            margin-bottom: 2.5rem;
          }
          .hint {
            font-size: 0.85rem;
            color: #555;
            margin-bottom: 2rem;
          }
          .answer-form {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }
          textarea {
            width: 100%;
            min-height: 150px;
            padding: 1rem;
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 4px;
            color: #ccc;
            font-family: 'Georgia', serif;
            font-size: 1rem;
            line-height: 1.6;
            resize: vertical;
          }
          textarea:focus {
            outline: none;
            border-color: #7fd4e8;
            box-shadow: 0 0 0 1px rgba(127, 212, 232, 0.35);
          }
          textarea::placeholder {
            color: #444;
          }
          .button-group {
            display: flex;
            gap: 1rem;
            justify-content: center;
          }
          button {
            padding: 0.875rem 2rem;
            font-size: 0.85rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .btn-primary {
            background: #7fd4e8;
            color: #001014;
            font-weight: bold;
          }
          .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(127, 212, 232, 0.28);
          }
          .skip-row {
            margin-top: 0.25rem;
          }
          .btn-quiet {
            background: transparent;
            border: none;
            padding: 0.25rem;
            color: #4a4a4a;
            font-family: 'Georgia', serif;
            font-size: 0.78rem;
            letter-spacing: 0.04em;
            text-transform: none;
            text-decoration: underline;
            text-underline-offset: 3px;
            cursor: pointer;
          }
          .btn-quiet:hover {
            color: #7a7a7a;
          }
          .btn-secondary {
            background: transparent;
            border: 1px solid #333;
            color: #666;
          }
          .btn-secondary:hover {
            border-color: #555;
            color: #999;
          }
          .btn-back {
            background: transparent;
            border: 1px solid #2a4a52;
            color: #7fd4e8;
          }
          .btn-back:hover {
            border-color: #7fd4e8;
            color: #aeeaf6;
          }
          .voice-hint {
            font-size: 0.75rem;
            color: #444;
            margin-top: 1rem;
          }
          .voice-hint a {
            color: #7fd4e8;
            text-decoration: none;
          }
          .voice-hint a:hover {
            text-decoration: underline;
          }
          footer {
            padding: 2rem;
            text-align: center;
          }
          .resume-hint {
            margin-top: 1.25rem;
            font-size: 0.72rem;
            line-height: 1.6;
            color: #555;
            max-width: 46ch;
          }
          .resume-hint a {
            color: #777;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .resume-hint a:hover { color: #aaa; }
          .footer-links {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin-bottom: 1rem;
          }
          .footer-links a {
            font-size: 0.75rem;
            color: #444;
            text-decoration: none;
          }
          .footer-links a:hover { color: #888; }
          .footer-copy {
            font-size: 0.7rem;
            color: #333;
          }
        `}
        </style>
      </head>
      <body>
        <nav>
          <a href='/' class='logo'>A4T</a>
        </nav>

        <main>
          <div class='questionnaire-container'>
            <div class='progress-bar'>
              <div
                class='progress-fill'
                style={`width: ${(questionNumber / totalQuestions) * 100}%`}
              >
              </div>
            </div>

            <div class='q-numeral' aria-label={`question ${questionNumber} of ${totalQuestions}`}>
              <span class='q-glyph' lang={isFive ? 'kn' : 'ta'}>{bigNumeral}</span>
            </div>

            <h1 class='question-text'>{currentQuestion}</h1>

            <form method='POST' action='/questionnaire' class='answer-form'>
              {
                /*
                autofocus so the cursor is already where the answer goes. Every
                question used to begin with a click or a tab before a single
                character could be typed, thirty-three times over.
                One word is a complete answer, and the placeholder says so:
                people stall on these questions believing a paragraph is owed.
              */
              }
              <textarea
                id='answer'
                name='answer'
                rows={8}
                maxLength={20000}
                autofocus
                spellcheck
                placeholder='One word is an answer.'
                aria-label='Your answer'
              >
              </textarea>

              <div class='button-group'>
                {currentIndex >= 1 && (
                  <button type='submit' name='action' value='back' class='btn-back' formNoValidate>
                    ← Previous
                  </button>
                )}
                <button type='submit' name='action' value='continue' class='btn-primary'>
                  Continue
                </button>
              </div>

              {
                /*
                Skip stays a submit button -- a link cannot carry the `action`
                field, and this page has to work with JavaScript off -- but it
                no longer sits beside Continue as its equal. It was styled as a
                peer, which made passing on a question exactly as easy as
                answering one.
              */
              }
              <div class='skip-row'>
                <button type='submit' name='action' value='skip' class='btn-quiet' formNoValidate>
                  leave this one unanswered
                </button>
              </div>
            </form>

            {
              /*
              Cmd/Ctrl+Enter to submit. A bare inline script rather than an
              island: no manifest entry, no hydration, and with JavaScript off
              the page behaves exactly as it did before. The same pattern is
              already used on /login.
            */
            }
            <script
              // deno-lint-ignore react-no-danger
              dangerouslySetInnerHTML={{
                __html: `document.getElementById('answer').addEventListener('keydown',function(e){` +
                  `if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){` +
                  `e.preventDefault();this.form.querySelector('.btn-primary').click();}});`,
              }}
            >
            </script>

            <p class='voice-hint'>
              For voice input, use <a href='https://github.com/cjpais/Handy' target='_blank' rel='noopener'>Handy</a>
              {' '}
              — free offline speech-to-text
            </p>

            {
              /*
              Persistent rather than shown on exit: this page works without
              JavaScript, so there is no way to detect someone leaving. Quiet
              enough to ignore while answering, present when it matters.

              The thirty days is real and measured from the LAST visit, not the
              first — it is the same clock the key box uses to expire session
              identities (romania/keystore.ts) and the one
              cleanupExpiredSessions now uses. Every return resets it.

              After that the key is gone and the questionnaire cannot be
              resumed, but the answers themselves are not lost: they are also
              encrypted to the offline break-glass key, so recovery is a
              deliberate ceremony rather than an impossibility. The copy says
              "write to the webmaster" for that reason and does not claim the
              work is destroyed.
            */
            }
            <p class='resume-hint'>
              You can stop here and come back. Your place is kept for thirty days from your last visit, and returning
              resets the clock. After that the thread is let go and you would need to write to the{' '}
              <a href='mailto:formitselfisemptiness@aformulationoftruth.com'>webmaster</a>.
            </p>
          </div>
        </main>

        <span class='q-roman' aria-hidden='true'>
          {pad2(questionNumber)} <span class='q-roman-sep'>of</span> {totalQuestions}
        </span>

        <footer>
          <div class='footer-links'>
            <a href='/about'>About</a>
            <a href='/contact.html'>Contact</a>
            <a href='/privacy'>Privacy</a>
          </div>
          <p class='footer-copy'>
            Encrypted &amp; hosted in Iceland
          </p>
        </footer>
      </body>
    </html>
  );
}
