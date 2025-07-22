// backend/src/app.js
import express from 'express';
import questionsRouter from '../routes/questions.js';
import answersRouter   from '../routes/answers.js';

const app = express();

// make sure to parse JSON bodies
app.use(express.json());

// mount your routers
app.use('/api/questions', questionsRouter);
app.use('/api/answers',   answersRouter);

export default app;
