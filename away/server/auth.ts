import session from 'express-session';
import connectPg from 'connect-pg-simple';
import type { Express, RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { storage } from './storage';
import { emailService } from './services/emailService';

const PgStore = connectPg(session);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
    }
    interface Request {
      user?: User;
    }
  }
}

const emailSchema = z.object({ email: z.string().email() });
const verifySchema = z.object({ token: z.string().min(1) });

function getSession() {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set');
  }

  const ttl = 7 * 24 * 60 * 60 * 1000;
  const store = new PgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl,
    tableName: 'sessions',
  });

  return session({
    secret: process.env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ttl,
    },
  });
}

async function createMagicLink(email: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await storage.createMagicLink({ email, token, expiresAt });
  await emailService.sendMagicLink(email, token);
}

async function authenticateWithToken(req: Express.Request, token: string) {
  const magicLink = await storage.getMagicLink(token);
  if (!magicLink) {
    throw new Error('Invalid or expired token');
  }

  let user = await storage.getUserByEmail(magicLink.email);
  if (!user) {
    user = await storage.createUser({ email: magicLink.email });
  }

  await storage.markMagicLinkUsed(token);

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) { reject(err); return; }
      req.session.userId = user!.id;
      req.user = user!;
      req.session.save((saveErr) => {
        if (saveErr) { reject(saveErr); return; }
        resolve();
      });
    });
  });

  return user;
}

const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many sign-in requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many verification attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function setupAuth(app: Express) {
  app.set('trust proxy', 1);
  app.use(getSession());

  app.post('/api/auth/magic-link', magicLinkLimiter, async (req, res) => {
    try {
      const { email } = emailSchema.parse(req.body);
      await createMagicLink(email.toLowerCase());
      res.json({ message: 'Magic link sent' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid email address' });
        return;
      }
      console.error('Error creating magic link:', error);
      res.status(500).json({ message: 'Failed to send magic link' });
    }
  });

  app.post('/api/auth/magic-link/verify', verifyLimiter, async (req, res) => {
    try {
      const { token } = verifySchema.parse(req.body);
      const user = await authenticateWithToken(req, token);
      res.json({ user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid token' });
        return;
      }
      if (error instanceof Error && error.message === 'Invalid or expired token') {
        res.status(400).json({ message: error.message });
        return;
      }
      console.error('Error verifying magic link:', error);
      res.status(500).json({ message: 'Failed to verify magic link' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: 'Failed to logout' });
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });

  app.get('/api/auth/user', async (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    res.json({ user });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
};
