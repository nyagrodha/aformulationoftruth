import csrf from 'csurf';
import type { NextFunction, Request, Response } from 'express';

export const csrfProtection = csrf({ cookie: false });

export function handleCsrfErrors(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next(err);
}
