// routes/questions.js

import express from 'express';
const router = express.Router();

// Route-level logging middleware
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware for content negotiation
router.use((req, res, next) => {
  const accepted = req.accepts(['json']);
  if (!accepted) {
    return res.status(406).send('Not Acceptable: Only application/json is supported');
  }
  next();
});

// Middleware for response shaping
router.use((req, res, next) => {
  res.sendJSON = (payload) => {
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      data: payload
    });
  };
  next();
});

// Static list of Proust Questionnaire prompts
const questions = [
  "What is your idea of perfect happiness?",
  "What is your greatest fear?",
  "What is the trait you most deplore in yourself?",
  "What is the trait you most deplore in others?",
  "Which living person do you most admire?",
  "What is your greatest extravagance?",
  "What is your current state of mind?",
  "What do you consider the most overrated virtue?",
  "On what occasion do you lie?",
  "What do you most dislike about your appearance?",
  "Which living person do you most despise?",
  "What is the quality you most like in a man?",
  "What is the quality you most like in a woman?",
  "Which words or phrases do you most overuse?",
  "What or who is the greatest love of your life?",
  "When and where were you happiest?",
  "Which talent would you most like to have?",
  "If you could change one thing about yourself, what would it be?",
  "What do you consider your greatest achievement?",
  "If you were to die and come back as a person or a thing, what would it be?",
  "Where would you most like to live?",
  "What is your most treasured possession?",
  "What do you regard as the lowest depth of misery?",
  "What is your favorite occupation?",
  "What is your most marked characteristic?",
  "What do you most value in your friends?",
  "Who are your favorite writers?",
  "Who is your hero of fiction?",
  "Which historical figure do you most identify with?",
  "Who are your heroes in real life?",
  "What are your favorite names?",
  "What is it that you most dislike?",
  "What is your greatest regret?",
  "How would you like to die?",
  "What is your motto?"
];

// Register route handler for retrieving the full list of questions
router.get('/', (req, res) => {
  res.sendJSON({ questions });
});

export default router;
