// backend/src/app.js
import express from 'express';
import questionsRouter from '../routes/questions.js';
import answersRouter   from '../routes/answers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

//serve frontend assets from backend/public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(espress.static(path.join(__dirname, '../public')));

// make sure to parse JSON bodies
app.use(express.json());

// mount your routers
app.use('/api/questions', questionsRouter);
app.use('/api/answers',   answersRouter);

export default app;
