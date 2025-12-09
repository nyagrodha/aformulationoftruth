import rateLimit from 'express-rate-limit';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { rateLimitDefaults } from '../config/env.js';

export function strictAuthRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: rateLimitDefaults.windowMs,
    max: rateLimitDefaults.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });
}
