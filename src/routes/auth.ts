import express, { type Request, type Response, type NextFunction, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import {
  authenticateUser,
  createPasswordResetToken,
  registerUser,
  resetPasswordWithToken
} from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';
import { strictAuthRateLimiter } from '../middleware/rateLimiters.js';
import { auditLog } from '../utils/audit.js';
import { env } from '../config/env.js';

const pool = getPool();
const router: ExpressRouter = express.Router();

const signupSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/i, 'Username can only contain letters, numbers, and underscores.'),
  password: z.string().min(12)
});

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1)
});

const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

const passwordResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12)
});

router.post('/signup', strictAuthRateLimiter(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = signupSchema.parse(req.body);
    const user = await registerUser(pool, payload);
    await establishSession(req, user.id);
    auditLog(req, 'signup_success', { userId: user.id });
    res.status(201).json({ user, csrfToken: req.csrfToken() });
  } catch (error) {
    auditLog(req, 'signup_failed');
    next(error);
  }
});

router.post('/login', strictAuthRateLimiter(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await authenticateUser(pool, payload);
    await establishSession(req, user.id);
    auditLog(req, 'login_success', { userId: user.id });
    res.json({ user, csrfToken: req.csrfToken() });
  } catch (error) {
    auditLog(req, 'login_failed');
    next(error);
  }
});

router.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    await destroySession(req);
    auditLog(req, 'logout', { userId });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/session', (req: Request, res: Response) => {
  if (!req.user) {
    res.json({ authenticated: false, csrfToken: req.csrfToken() });
    return;
  }

  res.json({ authenticated: true, user: req.user, csrfToken: req.csrfToken() });
});

router.post('/session/refresh', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    await establishSession(req, req.user.id);
    res.json({ user: req.user, csrfToken: req.csrfToken() });
  } catch (error) {
    next(error);
  }
});

router.post('/password/request', strictAuthRateLimiter(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = passwordResetRequestSchema.parse(req.body);
    const token = await createPasswordResetToken(pool, payload.email);

    if (token && env.NODE_ENV !== 'production') {
      res.json({ message: 'If the account exists, a password reset email has been sent.', token });
      return;
    }

    res.json({ message: 'If the account exists, a password reset email has been sent.' });
  } catch (error) {
    auditLog(req, 'password_reset_request_failed');
    next(error);
  }
});

router.post('/password/reset', strictAuthRateLimiter(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = passwordResetSchema.parse(req.body);
    await resetPasswordWithToken(pool, payload.token, payload.password);
    auditLog(req, 'password_reset_completed');
    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    auditLog(req, 'password_reset_failed');
    next(error);
  }
});

/*
// Phase 2 scaffold (OAuth 2.0 / OIDC) - disabled until AUTH_MODE=oauth
if (env.AUTH_MODE === 'oauth') {
  // import { generators, Issuer } from 'openid-client';
  // router.get('/oauth/google', async (req, res, next) => {
  //   try {
  //     const googleIssuer = await Issuer.discover('https://accounts.google.com');
  //     const client = new googleIssuer.Client({
  //       client_id: process.env.GOOGLE_CLIENT_ID!,
  //       client_secret: process.env.GOOGLE_CLIENT_SECRET!,
  //       redirect_uris: [`${process.env.APP_BASE_URL}/auth/oauth/google/callback`],
  //       response_types: ['code']
  //     });
  //     const state = generators.state();
  //     req.session.oauthState = state;
  //     const url = client.authorizationUrl({
  //       scope: 'openid email profile',
  //       state
  //     });
  //     res.redirect(url);
  //   } catch (err) {
  //     next(err);
  //   }
  // });
}

// Phase 2 scaffold (self-issued JWT) - disabled until AUTH_MODE=jwt
if (env.AUTH_MODE === 'jwt') {
  // import { SignJWT } from 'jose';
  // router.post('/token', async (req, res) => {
  //   const token = await new SignJWT({ sub: req.user?.id })
  //     .setProtectedHeader({ alg: 'HS256' })
  //     .setIssuedAt()
  //     .setExpirationTime('1h')
  //     .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
  //   res.json({ token });
  // });
}
*/

export default router;

async function establishSession(req: Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }

      req.session.userId = userId;
      req.session.save((saveError: Error | null) => {
        if (saveError) {
          reject(saveError);
          return;
        }
        resolve();
      });
    });
  });
}

async function destroySession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
