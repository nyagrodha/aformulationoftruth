// backend/server.js
import app from './src/app.js';
import questionsRouter from './routes/questions.js';
import answersRouter from './routes/answers.js';

//mount the questions route under /api/questions
app.use('/api/questions', questionsRouter);
app.use('/api/answers', answersRouter);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
