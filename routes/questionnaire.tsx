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
import { verifyQuestionnaireJWT } from '../lib/jwt.ts';
import { getSessionById, updateSessionProgress, updateSessionIndex } from '../lib/questionnaire-session.ts';
import { parseQuestionOrder } from '../lib/questionnaire.ts';
import { increment } from '../lib/metrics.ts';

// The 35 Proust questionnaire questions
const QUESTIONS = [
  // Gate questions (0-1) - already answered
  'What is your idea of perfect happiness?',
  'What is your greatest fear?',
  // Shuffled questions (2-34)
  'What is the trait you most deplore in yourself?',
  'What is the trait you most deplore in others?',
  'Which living person do you most admire?',
  'What is your greatest extravagance?',
  'What is your current state of mind?',
  'What do you consider the most overrated virtue?',
  'On what occasion do you lie?',
  'What do you most dislike about your appearance?',
  'Which living person do you most despise?',
  'What is the quality you most like in a man?',
  'What is the quality you most like in a woman?',
  'Which words or phrases do you most overuse?',
  'What or who is the greatest love of your life?',
  'When and where were you happiest?',
  'Which talent would you most like to have?',
  'If you could change one thing about yourself, what would it be?',
  'What do you consider your greatest achievement?',
  'If you were to die and come back as a person or a thing, what would it be?',
  'Where would you most like to live?',
  'What is your most treasured possession?',
  'What do you regard as the lowest depth of misery?',
  'What is your favorite occupation?',
  'What is your most marked characteristic?',
  'What do you most value in your friends?',
  'Who are your favorite writers?',
  'Who is your hero of fiction?',
  'Which historical figure do you most identify with?',
  'Who are your heroes in real life?',
  'What are your favorite names?',
  'What is it that you most dislike?', // Proust's response: "My own worst qualities. And people who do not feel what is good; who are ignorant the sweetness of sympathy."
  'What is your greatest regret?',
  'How would you like to die?',
  'What is your motto?',
];

interface QuestionnaireData {
  authenticated: boolean;
  sessionId: string;
  questionOrder: number[];
  currentIndex: number;
  currentQuestion: string;
  questionNumber: number;
  totalQuestions: number;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<QuestionnaireData> = {
  async GET(req, ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    const jwtToken = getCookie(cookies, 'jwt');

    // Verify JWT authentication
    if (!jwtToken) {
      console.log('[questionnaire] No JWT cookie, redirecting to login');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
    if (!jwtPayload) {
      console.log('[questionnaire] Invalid JWT, redirecting to login');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    // Get session from database using session_id from JWT
    const session = await getSessionById(jwtPayload.session_id);
    if (!session) {
      console.log('[questionnaire] Session not found, redirecting to login');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    // Parse question order from session
    const questionOrder = parseQuestionOrder(session.questionOrder);

    // Questions 2-34 (33 questions total after gate)
    const remainingQuestions = questionOrder.slice(2);
    const totalQuestions = remainingQuestions.length;
    const currentIndex = session.currentIndex;

    // Check if completed
    if (currentIndex >= totalQuestions) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/completion.html' },
      });
    }

    const questionNum = remainingQuestions[currentIndex];
    const currentQuestion = QUESTIONS[questionNum];
    const overallNum = currentIndex + 3; // +2 for gate questions, +1 for 1-indexing

    increment('questionnaire.viewed');

    return ctx.render({
      authenticated: true,
      sessionId: session.sessionId,
      questionOrder: remainingQuestions,
      currentIndex,
      currentQuestion,
      questionNumber: overallNum,
      totalQuestions: 35, // Total including gate questions
    });
  },

  async POST(req, _ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    const jwtToken = getCookie(cookies, 'jwt');

    // Verify JWT authentication
    if (!jwtToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
    if (!jwtPayload) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    // Get session from database
    const session = await getSessionById(jwtPayload.session_id);
    if (!session) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    // Parse form data
    const formData = await req.formData();
    const answer = formData.get('answer')?.toString() || '';
    const action = formData.get('action')?.toString() || 'continue';

    const questionOrder = parseQuestionOrder(session.questionOrder);
    const remainingQuestions = questionOrder.slice(2);
    const currentIndex = session.currentIndex;
    const questionNum = remainingQuestions[currentIndex];

    // Store the answer
    const skipped = action === 'skip' || answer.trim() === '';

    try {
      // Store answer via API
      const baseUrl = new URL(req.url).origin;
      const storeRes = await fetch(`${baseUrl}/api/questions/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `jwt=${jwtToken}`,
        },
        body: JSON.stringify({
          questionIndex: questionNum,
          answer: skipped ? '' : answer,
          skipped,
        }),
      });

      if (!storeRes.ok) {
        console.error('[questionnaire] Failed to store response:', await storeRes.text());
      }
    } catch (error) {
      console.error('[questionnaire] Error storing response:', error);
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
    if (nextIndex >= remainingQuestions.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/completion.html' },
      });
    }

    // Redirect back to questionnaire (will show next question)
    return new Response(null, {
      status: 302,
      headers: { Location: '/questionnaire' },
    });
  },
};

export default function QuestionnairePage({ data }: PageProps<QuestionnaireData>) {
  const { currentQuestion, questionNumber, totalQuestions } = data;

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>a formulation of truth</title>
        <meta name="description" content="An apparatus for attention. Self-inquiry through the Proust Questionnaire." />
        <link rel="stylesheet" href="/css/main.css" />
        <style>{`
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
          .question-count {
            font-size: 0.75rem;
            color: #666;
            letter-spacing: 0.1em;
            margin-bottom: 2rem;
          }
          .question-text {
            font-size: 1.5rem;
            line-height: 1.6;
            color: #fff;
            margin-bottom: 2rem;
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
            border-color: #ff69b4;
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
            background: linear-gradient(135deg, #ff69b4, #ff8c42);
            color: #000;
            font-weight: bold;
          }
          .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(255, 105, 180, 0.3);
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
          .voice-hint {
            font-size: 0.75rem;
            color: #444;
            margin-top: 1rem;
          }
          .voice-hint a {
            color: #00ff88;
            text-decoration: none;
          }
          .voice-hint a:hover {
            text-decoration: underline;
          }
          footer {
            padding: 2rem;
            text-align: center;
          }
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
        `}</style>
      </head>
      <body>
        {/* Commented out per design review - blue circled items
        <nav>
          <a href="/" class="logo">A4T</a>
          <div class="nav-links">
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
          </div>
        </nav>
        */}

        <main>
          <div class="questionnaire-container">
            <div class="progress-bar">
              <div
                class="progress-fill"
                style={`width: ${(questionNumber / totalQuestions) * 100}%`}
              ></div>
            </div>

            <p class="question-count">
              question {questionNumber} of {totalQuestions}
            </p>

            <h1 class="question-text">{currentQuestion}</h1>

            {/* Commented out per design review - yellow circled item
            <p class="hint">
              Take your time. There are no right answers, only honest ones.
            </p>
            */}

            <form method="POST" action="/questionnaire" class="answer-form">
              <textarea
                name="answer"
                placeholder="Take your time..."
                aria-label="Your answer"
              ></textarea>

              <div class="button-group">
                <button type="submit" name="action" value="continue" class="btn-primary">
                  Continue
                </button>
                <button type="submit" name="action" value="skip" class="btn-secondary">
                  Skip
                </button>
              </div>
            </form>

            {/* Commented out per design review - blue circled item
            <p class="voice-hint">
              For voice input, use <a href="https://github.com/cjpais/Handy" target="_blank" rel="noopener">Handy</a> — free offline speech-to-text
            </p>
            */}
          </div>
        </main>

        <footer>
          <div class="footer-links">
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
            <a href="/privacy.html">Privacy</a>
            <a href="/accessibility.html">Accessibility</a>
          </div>
          <p class="footer-copy">
            Hosted in Iceland by <a href="https://billing.flokinet.is/aff.php?aff=543" target="_blank" rel="noopener" style="color: #666; text-decoration: none;">FlokiNET</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
