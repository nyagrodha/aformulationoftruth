// backend/server.js
import app from './src/app.js';
import questionsRouter from './routes/questions.js';

//mount the questions route under /api/questions
app.use('/api/questions', questionsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
