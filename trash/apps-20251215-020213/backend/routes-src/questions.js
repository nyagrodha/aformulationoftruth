// routes/questions.js

import express from 'express';
import { fisherYatesShuffle } from '../utils/fisherYates_shuffle.js';

const router = express.Router();

let dbClient = null;

export const setDatabaseClient = (client) => {
  dbClient = client;
};

// Route-level logging middleware
//router.use((req, res, next) => {
//  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

// Route-level logging middleware
//router.use((req, res, next) => {
//  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
//  next();
//});

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
  res.json({ questions });
});

/**
 * Initialize shuffled question order for a session
 * Uses Fischer-Yates algorithm for uniform distribution
 */
async function initializeSessionQuestions(sessionId) {
  if (!dbClient) {
    throw new Error('Database not connected');
  }

  // Check if questions already initialized for this session
  const existing = await dbClient.query(
    'SELECT COUNT(*) FROM questionnaire_question_order WHERE session_id = $1',
    [sessionId]
  );

  if (existing.rows[0].count > 0) {
    console.log(`Session ${sessionId} already has shuffled questions`);
    return;
  }

  // Generate shuffled array of question indices using Fischer-Yates
  const shuffledIndices = fisherYatesShuffle([...Array(questions.length).keys()]);

  // Insert all 35 questions in shuffled order
  const insertPromises = shuffledIndices.map((questionId, position) =>
    dbClient.query(
      `INSERT INTO questionnaire_question_order
       (session_id, question_position, question_id, question_text)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, position, questionId, questions[questionId]]
    )
  );

  await Promise.all(insertPromises);
  console.log(`✅ Initialized ${questions.length} shuffled questions for session ${sessionId}`);
}

/**
 * Get the next unanswered question for a session
 */
router.get('/next', async (req, res) => {
  const sessionId = req.query.session_id || req.query.sessionId;

  if (!sessionId) {
    return res.status(400).json({
      error: 'session_id is required',
      message: 'Please provide a session_id query parameter'
    });
  }

  if (!dbClient) {
    return res.status(500).json({ error: 'Database not connected' });
  }

  try {
    // Initialize questions for this session if not already done
    await initializeSessionQuestions(sessionId);

    // Get the next unanswered question (by position)
    const result = await dbClient.query(
      `SELECT id, question_id, question_text, question_position
       FROM questionnaire_question_order
       WHERE session_id = $1 AND answered = FALSE
       ORDER BY question_position ASC
       LIMIT 1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      // All questions answered
      return res.json({
        completed: true,
        message: 'All questions have been answered'
      });
    }

    const questionData = result.rows[0];

    // Mark as presented
    await dbClient.query(
      'UPDATE questionnaire_question_order SET presented_at = NOW() WHERE id = $1',
      [questionData.id]
    );

    // Return the question
    res.json({
      id: questionData.question_id,
      text: questionData.question_text,
      position: questionData.question_position + 1, // 1-based for display
      total: questions.length,
      completed: false
    });
  } catch (error) {
    console.error('Error getting next question:', error);
    res.status(500).json({
      error: 'Failed to get next question',
      details: error.message
    });
  }
});

export default router;
