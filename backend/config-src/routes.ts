/**
 * Routes Configuration
 *
 * Centralized route mounting for the Express application
 */

import express, { Express } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

// Import routes
import answersRouter, { setDatabaseClient as setAnswersDb } from '../routes/answers.js';
import questionsRouter from '../routes/questions.js';
import authRouter from '../routes/auth.js';
import phoneRouter, { setDatabaseClient as setPhoneDb } from '../routes/phone-verification.js';
import profileRouter, { setDatabaseClient as setProfileDb } from '../routes/profile.js';

// Import middleware
import { verifyToken } from '../middleware/auth.js';
import { setDatabaseClient as setAuthDb } from '../routes/auth.js';
import { setDatabaseClient as setDbUtilsClient } from '../utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Inject database client into all modules that need it
 */
export function injectDatabaseClient(client: Client): void {
  setAnswersDb(client);
  setAuthDb(client);
  setDbUtilsClient(client);
  setPhoneDb(client);
  setProfileDb(client);
}

/**
 * Mount all API routes
 */
export function mountApiRoutes(app: Express): void {
  // Health check endpoint
  app.get('/api/ping', (_, res) => res.json({ pong: true, timestamp: new Date().toISOString() }));

  // Public routes
  app.use('/auth', authRouter);

  // Protected API routes (require authentication)
  app.use('/api/questions', verifyToken, questionsRouter);
  app.use('/api/answers', answersRouter);
  app.use('/api/phone', phoneRouter);
  app.use('/api/profile', profileRouter);

  console.log('✅ API routes mounted successfully');
}

/**
 * Serve static files from frontend
 */
export function serveStaticFiles(app: Express): void {
  const frontendPublicPath = path.join(__dirname, '../../frontend/public');
  app.use(express.static(frontendPublicPath));

  console.log('✅ Static file serving configured');
}

/**
 * Configure all routes
 */
export function configureRoutes(app: Express, dbClient: Client): void {
  // Inject database client into route handlers
  injectDatabaseClient(dbClient);

  // Mount API routes
  mountApiRoutes(app);

  // Serve static files
  serveStaticFiles(app);
}
