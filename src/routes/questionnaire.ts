import express, { type Request, type Response, type NextFunction, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router: ExpressRouter = express.Router();
const pool = getPool();

const responseSchema = z.object({
  email: z.string().email(),
  answers: z.record(z.any())
});

router.post('/responses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = responseSchema.parse(req.body);
    const insert = `
      INSERT INTO questionnaire_responses (email, answers)
      VALUES ($1, $2)
      RETURNING id, email, answers, created_at
    `;
    const result = await pool.query(insert, [payload.email.toLowerCase(), payload.answers]);
    res.status(201).json({
      message: 'Responses stored successfully',
      response: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/responses', requireAuth, requireRole('admin'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const query = `
      SELECT id, email, answers, created_at
      FROM questionnaire_responses
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
