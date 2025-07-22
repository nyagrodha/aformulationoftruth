import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// serve frontend assets
app.use(express.static(path.join(__dirname, '../public')));

app.use(express.json());

// mount your routers
app.use('/api/questions', questionsRouter);
app.use('/api/answers',   answersRouter);

export default app;
