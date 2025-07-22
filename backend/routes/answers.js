// backend/routes/answers.js
import express from 'express';
import sqlite3 from 'sqlite3';
const router = express.Router();
const db = new sqlite3.Database('./database.sqlite');

// POST /api/answers
router.post('/', (req, res) => {
  const { email, questionId, answerText } = req.body;
  if (!email || !questionId || !answerText) {
    return res.status(400).json({ error: 'Missing fields.' });
  }
  db.run(
    `INSERT INTO answers (email, question_id, answer_text)
     VALUES (?, ?, ?)`,
    [email, questionId, answerText],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, next: `/api/questions/next?email=${encodeURIComponent(email)}` });
    }
  );
});

export default router;
