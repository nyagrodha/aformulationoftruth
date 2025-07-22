// backend/routes/questions.js
const express = require('express');
const router  = express.Router();

const questions = [
  'What is your idea of perfect happiness?',
  'What is your greatest fear?',
  // …and so on, all 35 Proust questions…
];

// GET /api/questions → { questions: [...] }
router.get('/', (req, res) => {
  res.json({ questions });
});

module.exports = router;
