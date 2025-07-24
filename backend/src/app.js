// backend/src/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// ← Add these two lines
import questionsRouter from '../routes/questions.js';
import answersRouter   from '../routes/answers.js';

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const publicDir = path.join(__direname, '../public');

// ← Now these routers are defined!
app.use('/api/questions', questionsRouter);
app.use('/api/answers',   answersRouter);

//3 akk other GETs -> serve React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

export default app;
