import type { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      case 'USER_EXISTS':
        res.status(409).json({ error: 'Unable to process signup' });
        return;
      case 'RESET_INVALID':
      case 'RESET_EXPIRED':
        res.status(400).json({ error: 'Password reset link is invalid or expired' });
        return;
      default:
        res.status(400).json({ error: 'Request could not be completed' });
        return;
    }
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}
