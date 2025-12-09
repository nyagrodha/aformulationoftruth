import type { NextFunction, Request, Response } from 'express';
import { getPool } from '../db/pool.js';
import { findUserById } from '../db/userRepository.js';
import { toPublicUser } from '../services/authService.js';

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const { userId } = req.session;

  if (!userId) {
    next();
    return;
  }

  try {
    const pool = getPool();
    const user = await findUserById(pool, userId);

    if (user) {
      req.user = toPublicUser(user);
    }
  } catch (error) {
    next(error);
    return;
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  next();
}

export function requireRole(role: 'user' | 'admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.role !== role && role === 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
