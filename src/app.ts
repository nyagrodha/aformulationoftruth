import path from 'path';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Options as PinoHttpOptions } from 'pino-http';
import { fileURLToPath } from 'url';
import { env, isProduction } from './config/env.js';
import { logger } from './utils/logger.js';
import { sessionMiddleware } from './middleware/session.js';
import { attachUser } from './middleware/auth.js';
import { csrfProtection, handleCsrfErrors } from './middleware/csrf.js';
import authRouter from './routes/auth.js';
import questionnaireRouter from './routes/questionnaire.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Express = express();

if (env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

if (isProduction) {
  app.use((req, res, next) => {
    if (!req.secure) {
      res.status(400).json({ error: 'HTTPS is required in production.' });
      return;
    }

    next();
  });
}

app.use(helmet());
app.use(express.json());
const httpLogger = (pinoHttp as unknown as (options?: PinoHttpOptions) => RequestHandler)({ logger });
app.use(httpLogger);

app.use(sessionMiddleware);
app.use(attachUser);
app.use(csrfProtection as unknown as RequestHandler);

app.get('/auth/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use('/auth', authRouter);
app.use('/api', questionnaireRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(handleCsrfErrors);
app.use(errorHandler);

export default app;
