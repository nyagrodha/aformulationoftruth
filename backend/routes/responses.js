// routes/responses.js
import express from 'express';
import sqlite3 from 'sqlite3';
const router = express.Router();
const db = new sqlite3.Database('./database.sqlite');

// Get all responses for a user (with question text)
router.get('/', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Missing email parameter.' });

  db.all(
    `SELECT q.id as questionId, q.text as question, a.answer, a.created_at
     FROM answers a
     JOIN questions q ON a.question_id = q.id
     WHERE a.email = ?
     ORDER BY a.created_at ASC`,
    [email],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Get a single response by question ID
router.get('/:questionId', (req, res) => {
  const { email } = req.query;
  const questionId = req.params.questionId;
  if (!email) return res.status(400).json({ error: 'Missing email parameter.' });

  db.get(
    `SELECT q.id as questionId, q.text as question, a.answer, a.created_at
     FROM answers a
     JOIN questions q ON a.question_id = q.id
     WHERE a.email = ? AND a.question_id = ?`,
    [email, questionId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) return res.json(row);
      res.status(404).json({ error: 'Response not found.' });
    }
  );
});

export default router;

