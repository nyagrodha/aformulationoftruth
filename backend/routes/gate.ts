import { Router, Request, Response } from 'express';
import { Client } from 'pg';

const router = Router();
let dbClient: Client;

export function setDatabaseClient(client: Client) {
  dbClient = client;
}

// GET /api/gate/questions - Get all gate questions
router.get('/questions', async (req: Request, res: Response) => {
  try {
    const result = await dbClient.query(`
      SELECT id, question_text, question_order, required
      FROM gate_questions
      ORDER BY question_order ASC
    `);

    res.json({
      success: true,
      questions: result.rows
    });
  } catch (error) {
    console.error('Error fetching gate questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gate questions'
    });
  }
});

// GET /api/gate/questions/:questionId - Get a specific gate question
router.get('/questions/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;

    const result = await dbClient.query(`
      SELECT id, question_text, question_order, required
      FROM gate_questions
      WHERE id = $1
    `, [questionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gate question not found'
      });
    }

    res.json({
      success: true,
      question: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching gate question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gate question'
    });
  }
});

// POST /api/gate/answers - Submit answer to a gate question
router.post('/answers', async (req: Request, res: Response) => {
  try {
    const { userId, questionId, answer } = req.body;

    if (!userId || !questionId || !answer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, questionId, answer'
      });
    }

    // Check if answer already exists
    const existing = await dbClient.query(`
      SELECT id FROM gate_answers
      WHERE user_id = $1 AND question_id = $2
    `, [userId, questionId]);

    if (existing.rows.length > 0) {
      // Update existing answer
      await dbClient.query(`
        UPDATE gate_answers
        SET answer = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2 AND question_id = $3
      `, [answer, userId, questionId]);

      res.json({
        success: true,
        message: 'Answer updated successfully'
      });
    } else {
      // Insert new answer
      await dbClient.query(`
        INSERT INTO gate_answers (user_id, question_id, answer)
        VALUES ($1, $2, $3)
      `, [userId, questionId, answer]);

      res.json({
        success: true,
        message: 'Answer saved successfully'
      });
    }
  } catch (error) {
    console.error('Error saving gate answer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save answer'
    });
  }
});

// GET /api/gate/answers/:userId - Get all gate answers for a user
router.get('/answers/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await dbClient.query(`
      SELECT
        ga.id,
        ga.question_id,
        gq.question_text,
        gq.question_order,
        ga.answer,
        ga.created_at,
        ga.updated_at
      FROM gate_answers ga
      JOIN gate_questions gq ON ga.question_id = gq.id
      WHERE ga.user_id = $1
      ORDER BY gq.question_order ASC
    `, [userId]);

    res.json({
      success: true,
      answers: result.rows
    });
  } catch (error) {
    console.error('Error fetching gate answers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch answers'
    });
  }
});

// GET /api/gate/progress/:userId - Check user's gate question progress
router.get('/progress/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [totalQuestions, answeredQuestions] = await Promise.all([
      dbClient.query(`SELECT COUNT(*) as count FROM gate_questions WHERE required = true`),
      dbClient.query(`
        SELECT COUNT(*) as count
        FROM gate_answers ga
        JOIN gate_questions gq ON ga.question_id = gq.id
        WHERE ga.user_id = $1 AND gq.required = true
      `, [userId])
    ]);

    const total = parseInt(totalQuestions.rows[0].count);
    const answered = parseInt(answeredQuestions.rows[0].count);
    const completed = answered >= total;

    res.json({
      success: true,
      progress: {
        total,
        answered,
        completed,
        remaining: total - answered
      }
    });
  } catch (error) {
    console.error('Error checking gate progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check progress'
    });
  }
});

export default router;
