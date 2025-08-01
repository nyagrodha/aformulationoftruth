import express from 'express';
import cors from 'cors';
import path from 'path';
import questionsRouter from './routes/questions.js';

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/questions', questionsRouter);

// Serve frontend build
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
