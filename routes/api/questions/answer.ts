/**
 * Answer Submission Endpoint
 *
 * POST /api/questions/answer
 *
 * Submits an answer to a question and advances session progress.
 *
 * Required headers:
 * - Authorization: Bearer <JWT> (for encryption verification)
 * - X-Resume-Token: <opaque_token> (for session identification)
 *   OR resume_token cookie
 *
 * Request body:
 * {
 *   questionIndex: number,    // Index of question (0-34)
 *   answer: string,           // Encrypted answer from client
 *   skipped: boolean          // True if question was skipped
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   nextIndex: number,        // New current index
 *   completed: boolean        // True if questionnaire finished
 * }
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { verifyQuestionnaireJWT } from '../../../lib/jwt.ts';
import {
  completeSession,
  getSessionByToken,
  updateSessionIndex,
  updateSessionProgress,
} from '../../../lib/questionnaire-session.ts';
import { parseQuestionOrder } from '../../../lib/questionnaire.ts';
import { increment } from '../../../lib/metrics.ts';
import { recordAnswer } from '../../../lib/answers.ts';

// Re-exported for tests/answer_recipients_test.ts, which has imported it from
// this module since before it moved to lib/answers.ts.
export { recipientsForSession } from '../../../lib/answers.ts';

// The question texts come from lib/questions_dakshinaparvanuvadam.ts via
// lib/answers.ts. A verbatim copy of all 35 lived here and another in
// routes/questionnaire.tsx; see the note in lib/answers.ts.

const AnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(34),
  answer: z.string().max(20000),
  skipped: z.boolean(),
});

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    increment('requests.api');

    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      increment('errors.4xx');
      increment('questions.missing_jwt');
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid Authorization header',
          requestId,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    const jwt = authHeader.substring(7);

    // Extract resume token from header or cookie
    const resumeTokenHeader = req.headers.get('X-Resume-Token');
    const cookies = req.headers.get('Cookie');
    const resumeTokenCookie = getCookie(cookies, 'resume_token');
    const resumeToken = resumeTokenHeader || resumeTokenCookie;

    if (!resumeToken) {
      increment('errors.4xx');
      increment('questions.missing_resume_token');
      return new Response(
        JSON.stringify({
          error: 'Missing resume token',
          requestId,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    // Verify JWT
    let jwtPayload;
    try {
      jwtPayload = await verifyQuestionnaireJWT(jwt);
      if (!jwtPayload) {
        increment('errors.4xx');
        increment('questions.invalid_jwt');
        return new Response(
          JSON.stringify({
            error: 'Invalid or expired JWT',
            requestId,
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          },
        );
      }
    } catch {
      // Category only. A verification error can echo the token it failed on.
      console.error(`[answer:${requestId}] JWT verification failed`);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({
          error: 'JWT verification failed',
          requestId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    // Get session
    let session;
    try {
      session = await getSessionByToken(resumeToken);
    } catch {
      // Category only: a driver error can quote the failing statement and its
      // parameters, which here are the resume token and the email hash.
      console.error(`[answer:${requestId}] Session lookup failed`);
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
        },
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
        },
      );
    }

    // getSessionByToken returns finished sessions now, because the delivery
    // endpoint needs them. This one does not: answering a questionnaire that
    // has already ended would write past its own conclusion.
    if (session.completedAt) {
      increment('errors.4xx');
      increment('questions.session_completed');
      return new Response(
        JSON.stringify({
          error: 'This questionnaire is already complete',
          requestId,
        }),
        {
          status: 409,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    // Verify JWT session_id matches session
    if (jwtPayload.session_id !== session.sessionId) {
      increment('errors.4xx');
      increment('questions.session_mismatch');
      // The two session IDs were printed here. A session ID is a bearer
      // credential for someone's answers and CLAUDE.md names it outright; the
      // counter above says a mismatch happened, which is the whole of what an
      // operator can act on.
      console.warn(`[answer:${requestId}] Session token mismatch`);
      return new Response(
        JSON.stringify({
          error: 'Session token mismatch',
          requestId,
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON body',
          requestId,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    const parsed = AnswerSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      // Field names only. parsed.error.issues carries the rejected value,
      // which for this schema is the respondent's answer.
      console.warn(
        `[answer:${requestId}] Validation failed for: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      );
      return new Response(
        JSON.stringify({
          error: 'Invalid request format',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
          requestId,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    const { questionIndex, answer, skipped } = parsed.data;

    // Store answer via Rust Gate (age-encrypted).
    //
    // Recipients are resolved per session: the respondent's own key plus the
    // offline break-glass key, so only they (via Romania) and a deliberate
    // recovery ceremony can ever read it. A session predating this feature
    // resolves to [], which the gate reads as its configured default.
    //
    // A failure here MUST abort. This block used to catch, log and fall
    // through to the progress update below, so a gate outage advanced the
    // session and returned `success: true` for an answer that was never
    // written. Answering again would then be impossible: the question had
    // already gone by.
    try {
      await recordAnswer({
        sessionId: session.sessionId,
        questionIndex,
        answer,
        skipped,
      });
    } catch {
      increment('errors.5xx');
      increment('answers.store_failed');
      // No error detail: it carries the gate's response body, which can quote
      // the answer back at us.
      console.error(`[answer:${requestId}] Answer storage failed; session not advanced`);
      return new Response(
        JSON.stringify({
          error: 'Answer could not be stored; nothing was advanced. Please retry.',
          requestId,
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    try {
      // Calculate next index
      const questionOrder = parseQuestionOrder(session.questionOrder);
      const nextIndex = session.currentIndex + 1;

      // Update session progress
      if (skipped) {
        // Don't add to answered_questions if skipped
        await updateSessionIndex(session.sessionId, nextIndex);
      } else {
        // Add to answered_questions array
        await updateSessionProgress(session.sessionId, questionIndex, nextIndex);
      }

      // Check if questionnaire is completed
      const isCompleted = nextIndex >= questionOrder.length;

      if (isCompleted) {
        await completeSession(session.sessionId);
        increment('questionnaire.completed');

        const responseTime = Date.now() - startTime;
        console.log(`[answer:${requestId}] Questionnaire completed in ${responseTime}ms`);

        return new Response(
          JSON.stringify({
            success: true,
            completed: true,
            message: 'Questionnaire completed',
            nextIndex,
            requestId,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
              'X-Response-Time': `${responseTime}ms`,
            },
          },
        );
      }

      increment('questionnaire.answered');

      const responseTime = Date.now() - startTime;
      console.log(`[answer:${requestId}] Answer submitted in ${responseTime}ms`);

      return new Response(
        JSON.stringify({
          success: true,
          completed: false,
          nextIndex,
          requestId,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            'X-Response-Time': `${responseTime}ms`,
          },
        },
      );
    } catch {
      console.error(`[answer:${requestId}] Failed to update session`);
      increment('errors.5xx');

      return new Response(
        JSON.stringify({
          error: 'Failed to submit answer',
          requestId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }
  },
};
