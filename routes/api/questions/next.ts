/**
 * Next Question Endpoint
 *
 * GET /api/questions/next
 *
 * Returns next question in shuffled order for the session.
 *
 * Authentication methods (in priority order):
 * 1. X-Resume-Token header (opaque token)
 * 2. session_id query parameter (HMAC hash)
 * 3. resume_token cookie (opaque token)
 *
 * Response includes:
 * - questionIndex: Index of question in canonical order (0-34)
 * - questionText: The question text
 * - currentIndex: Position in shuffled order
 * - totalQuestions: Total number of questions (35)
 * - progress: Percentage complete
 * - answeredQuestions: Array of answered question indices
 */

import { Handlers } from '$fresh/server.ts';
import { getSessionByToken } from '../../../lib/questionnaire-session.ts';
import { parseQuestionOrder } from '../../../lib/questionnaire.ts';
import { increment } from '../../../lib/metrics.ts';

// The 35 Proust questionnaire questions
const QUESTIONS = [
  // Gate questions (0-1)
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
  'What is it that you most dislike?',
  'What is your greatest regret?',
  'How would you like to die?',
  'What is your motto?',
];

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers = {
  async GET(req, _ctx) {
    const requestId = crypto.randomUUID();
    increment('requests.api');

    // Get resume token from header or cookie ONLY
    // NO fallback to email or session_id query param (privacy requirement)
    const resumeTokenHeader = req.headers.get('X-Resume-Token');
    const cookies = req.headers.get('Cookie');
    const resumeTokenCookie = getCookie(cookies, 'resume_token');
    const resumeToken = resumeTokenHeader || resumeTokenCookie;

    if (!resumeToken) {
      increment('errors.4xx');
      increment('questions.missing_resume_token');
      return new Response(
        JSON.stringify({
          error: 'X-Resume-Token header or resume_token cookie required',
          requestId,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        }
      );
    }

    let session;

    try {
      // Hash resume token to get session_id
      session = await getSessionByToken(resumeToken);
    } catch (error) {
      console.error(`[questions:${requestId}] Session lookup failed:`, error);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({
          error: 'Session lookup failed',
          requestId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        }
      );
    }

    if (!session) {
      increment('errors.4xx');
      increment('questions.session_not_found');
      return new Response(
        JSON.stringify({
          error: 'Session not found or expired',
          requestId,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        }
      );
    }

    // Parse question order
    const questionOrder = parseQuestionOrder(session.questionOrder);
    const totalQuestions = questionOrder.length;

    // Check if completed
    if (session.currentIndex >= totalQuestions) {
      increment('questions.completed');
      return new Response(
        JSON.stringify({
          completed: true,
          message: 'Questionnaire completed',
          totalQuestions,
          answeredQuestions: session.answeredQuestions,
          requestId,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        }
      );
    }

    // Get next question
    const questionIndex = questionOrder[session.currentIndex];

    if (questionIndex < 0 || questionIndex >= QUESTIONS.length) {
      console.error(`[questions:${requestId}] Invalid question index: ${questionIndex}`);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({
          error: 'Invalid question index',
          requestId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        }
      );
    }

    const questionText = QUESTIONS[questionIndex];
    const progress = ((session.currentIndex / totalQuestions) * 100).toFixed(1);

    increment('questions.fetched');

    return new Response(
      JSON.stringify({
        questionIndex,
        questionText,
        currentIndex: session.currentIndex,
        totalQuestions,
        progress,
        answeredQuestions: session.answeredQuestions,
        requestId,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          'X-Request-ID': requestId,
        },
      }
    );
  },
};
