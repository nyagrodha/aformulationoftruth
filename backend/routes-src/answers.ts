import express, { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import type { ClientBase, QueryResult } from 'pg';
import { encryptGeolocation } from '../utils/crypto.js';

const router = express.Router();

let dbClient: ClientBase | null = null;

export const setDatabaseClient = (client: ClientBase): void => {
  dbClient = client;
};

const generateHashedUsername = (email: string, jwtSecret: string): string => {
  const hash = crypto
    .createHmac('sha256', jwtSecret)
    .update(email.toLowerCase().trim())
    .digest('hex');

  return `user_${hash.substring(0, 16)}`;
};

router.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

router.use((_req: Request, res: Response, next: NextFunction) => {
  if (!dbClient) {
    res.status(500).json({ error: 'Database not connected' });
    return;
  }
  next();
});

interface AnswerRequestBody {
  email: string;
  questionId: number;
  answer: string;
  sessionId?: number;
}

interface UserRecord {
  id: number;
}

router.post('/', async (req: Request<Record<string, unknown>, unknown, AnswerRequestBody>, res: Response) => {
  const { email, questionId, answer, sessionId } = req.body;

  if (!email || questionId === undefined || answer === undefined) {
    res.status(400).json({
      error: 'Missing required fields: email, questionId, and answer are required',
    });
    return;
  }

  if (!dbClient) {
    res.status(500).json({ error: 'Database not connected' });
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET ?? 'your-secret-key';
    const normalizedEmail = email.toLowerCase().trim();
    const hashedUsername = generateHashedUsername(normalizedEmail, jwtSecret);

    // Extract JWT token from Authorization header for encryption key
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Authorization token required for encryption' });
      return;
    }

    let userId: number | null = null;

    try {
      const userResult: QueryResult<UserRecord> = await dbClient.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [normalizedEmail],
      );

      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      } else {
        const newUserResult: QueryResult<UserRecord> = await dbClient.query(
          `
            INSERT INTO users (email, username, display_name)
            VALUES ($1, $2, $3)
            RETURNING id
          `,
          [normalizedEmail, hashedUsername, hashedUsername],
        );

        userId = newUserResult.rows[0]?.id ?? null;
        if (userId) {
          console.log(
            `Created new user with ID: ${userId}, username: ${hashedUsername} for email: ${normalizedEmail}`,
          );
        }
      }
    } catch (error) {
      console.error('Error handling user:', error);
      res.status(500).json({ error: 'Failed to handle user account' });
      return;
    }

    if (!userId) {
      res.status(500).json({ error: 'Unable to determine user identifier' });
      return;
    }

    // Encrypt the answer using the user's JWT token as the encryption key
    const encryptedAnswer = encryptGeolocation(answer, token);
    console.log(`🔒 Encrypting answer for user ${userId} (email: ${normalizedEmail})`);

    // Get the current answer sequence number for this user
    const sequenceResult = await dbClient.query(
      'SELECT COALESCE(MAX(answer_sequence), 0) + 1 as next_sequence FROM user_answers WHERE user_id = $1',
      [userId]
    );
    const answerSequence = sequenceResult.rows[0].next_sequence;

    // Insert the answer with session and sequence tracking
    await dbClient.query(
      `
        INSERT INTO user_answers (user_id, question_index, question_id, answer_text, session_id, answer_sequence)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, question_id
      `,
      [userId, questionId, questionId, encryptedAnswer, sessionId || null, answerSequence],
    );

    // Mark the question as answered in the question order table if session_id provided
    if (sessionId) {
      await dbClient.query(
        'UPDATE questionnaire_question_order SET answered = TRUE WHERE session_id = $1 AND question_id = $2',
        [sessionId, questionId]
      );

      // Check if all questions are answered to mark session complete
      const completionCheck = await dbClient.query(
        'SELECT COUNT(*) as unanswered FROM questionnaire_question_order WHERE session_id = $1 AND answered = FALSE',
        [sessionId]
      );

      if (completionCheck.rows[0].unanswered === '0') {
        await dbClient.query(
          'UPDATE questionnaire_sessions SET completed = TRUE, completed_at = NOW() WHERE id = $1',
          [sessionId]
        );
        console.log(`✅ Session ${sessionId} completed - all 35 questions answered!`);
      }
    }

    res.json({
      message: 'Answer saved successfully',
      encrypted: true,
      answerSequence,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving answer:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to save answer',
      details: message,
    });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  if (!dbClient) {
    res.status(500).json({ error: 'Database not connected' });
    return;
  }

  try {
    const result = await dbClient.query('SELECT * FROM user_answers ORDER BY id DESC LIMIT 50');
    res.json({
      answers: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching answers:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch answers',
      details: message,
    });
  }
});

export default router;
