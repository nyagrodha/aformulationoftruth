import express, { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import type { ClientBase, QueryResult } from 'pg';

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
}

interface UserRecord {
  id: number;
}

router.post('/', async (req: Request<Record<string, unknown>, unknown, AnswerRequestBody>, res: Response) => {
  const { email, questionId, answer } = req.body;

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

    await dbClient.query(
      `
        INSERT INTO user_answers (user_id, question_index, question_id, answer_text)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, question_id
      `,
      [userId, questionId, questionId, answer],
    );

    res.json({
      message: 'Answer saved successfully',
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
