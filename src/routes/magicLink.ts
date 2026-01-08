import express, { type Request, type Response, type NextFunction, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { generateMagicLink, verifyMagicLink } from '../services/magicLinkService.js';
import { strictAuthRateLimiter } from '../middleware/rateLimiters.js';
import { auditLog } from '../utils/audit.js';
import { env } from '../config/env.js';

const pool = getPool();
const router: ExpressRouter = express.Router();

const magicLinkRequestSchema = z.object({
  email: z.string().email()
});

const verifyTokenSchema = z.object({
  token: z.string().min(1)
});

// Request a magic link
router.post('/request-magic-link', strictAuthRateLimiter(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = magicLinkRequestSchema.parse(req.body);
    const result = await generateMagicLink(pool, payload.email);

    auditLog(req, 'magic_link_requested', { email: payload.email });

    // In development, return the token for testing
    // In production, you would send an email here
    if (env.NODE_ENV !== 'production') {
      res.json({
        ok: true,
        message: 'Magic link generated. Check your email.',
        // Dev only - remove in production
        debug: {
          token: result.token,
          magicLinkUrl: result.magicLinkUrl,
          expiresAt: result.expiresAt
        }
      });
      return;
    }

    // TODO: Integrate email service (SendGrid, Postmark, etc.)
    // await sendMagicLinkEmail(payload.email, result.magicLinkUrl);

    res.json({
      ok: true,
      message: 'If this email is registered, you will receive a magic link shortly.'
    });
  } catch (error) {
    auditLog(req, 'magic_link_request_failed');
    next(error);
  }
});

// Verify a magic link token (called by callback page)
router.get('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({ ok: false, error: 'Token is required' });
      return;
    }

    const verifiedUser = await verifyMagicLink(pool, token);

    // Store in session
    req.session.userEmail = verifiedUser.email;
    req.session.authenticatedAt = verifiedUser.authenticatedAt.toISOString();

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    auditLog(req, 'magic_link_verified', { email: verifiedUser.email });

    res.json({
      ok: true,
      user: {
        email: verifiedUser.email
      }
    });
  } catch (error) {
    auditLog(req, 'magic_link_verify_failed');
    next(error);
  }
});

export default router;
