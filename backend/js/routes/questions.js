// backend/routes/questions.js
import express from 'express';
import sqlite3 from 'sqlite3';
const router = express.Router();
const db = new sqlite3.Database('./database.sqlite');

// GET /api/questions/next?email=…
// Returns the next unanswered question for this user, or { completed: true }
router.get('/next', (req, res) => {
  const userEmail = req.query.email;
  if (!userEmail) {
    return res.status(400).json({ error: 'Missing query param: email' });
  }

  db.get(
    `SELECT q.id, q.text
       FROM questions q
      WHERE q.id NOT IN (
              SELECT question_id
                FROM answers
               WHERE email = ?
            )
   ORDER BY q.id
      LIMIT 1`,
    [userEmail],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) return res.json({ id: row.id, text: row.text });
      return res.json({ completed: true });
    }
  );
});

// GET /api/questions/:id
// Fetches a specific question by its numeric ID
router.get('/:id', (req, res) => {
  const questionId = Number(req.params.id);
  if (!Number.isInteger(questionId) || questionId < 1) {
    return res.status(400).json({ error: 'Invalid question ID.' });
  }

  db.get(
    `SELECT id, text
       FROM questions
      WHERE id = ?`,
    [questionId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) return res.json({ id: row.id, text: row.text });
      return res.status(404).json({ error: 'Question not found.' });
    }
  );
});

export default router;
