/**
 * Middleware Configuration
 *
 * Centralized middleware setup for Express application
 */

import express, { Express } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './environment.js';

/**
 * Configure CORS middleware
 */
export function configureCors(app: Express): void {
  app.use(cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  }));
}

/**
 * Configure body parsers
 */
export function configureBodyParsers(app: Express): void {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
}

/**
 * Configure rate limiting
 */
export function configureRateLimiting(app: Express): void {
  // Global API rate limiter
  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

  // Apply to all API routes
  app.use('/api', apiLimiter);

  // Stricter rate limiting for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: { error: 'Too many authentication attempts. Please try again later.' },
  });

  app.use('/auth', authLimiter);
}

/**
 * Configure trust proxy settings
 */
export function configureTrustProxy(app: Express): void {
  if (config.server.trustProxy) {
    app.set('trust proxy', 1);
  }
}

/**
 * Apply all middleware to the Express app
 */
export function applyMiddleware(app: Express): void {
  configureTrustProxy(app);
  configureCors(app);
  configureBodyParsers(app);
  configureRateLimiting(app);

  console.log('✅ Middleware configured successfully');
}
