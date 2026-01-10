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
  getSessionByToken,
  getSessionById,
  updateSessionProgress,
  updateSessionIndex,
  completeSession,
  storeSessionAnswers,
} from '../../../lib/questionnaire-session.ts';
import { parseQuestionOrder } from '../../../lib/questionnaire.ts';
import { increment } from '../../../lib/metrics.ts';

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
        }
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
        }
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
          }
        );
      }
    } catch (error) {
      console.error(`[answer:${requestId}] JWT verification failed:`, error);
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
        }
      );
    }

    // Get session
    let session;
    try {
      session = await getSessionByToken(resumeToken);
    } catch (error) {
      console.error(`[answer:${requestId}] Session lookup failed:`, error);
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

    // Verify JWT session_id matches session
    if (jwtPayload.session_id !== session.sessionId) {
      increment('errors.4xx');
      increment('questions.session_mismatch');
      console.warn(`[answer:${requestId}] Session mismatch: JWT=${jwtPayload.session_id}, Session=${session.sessionId}`);
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
        }
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
        }
      );
    }

    const parsed = AnswerSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      console.warn(`[answer:${requestId}] Validation failed:`, parsed.error.issues);
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
        }
      );
    }

    const { questionIndex, answer, skipped } = parsed.data;

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
          }
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
        }
      );
    } catch (error) {
      console.error(`[answer:${requestId}] Failed to update session:`, error);
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
        }
      );
    }
  },
};
