import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";

import { storage } from "./storage";
import { emailService } from "./services/emailService";
import { logAuth } from "./logger";

const PgStore = connectPg(session);

const emailRequestSchema = z.object({
  email: z.string().email(),
  gateSessionId: z.string().optional(),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    }

    interface Request {
      user?: User;
    }
  }
}

function ensureEnv(name: string) {
  if (!process.env[name]) {
    throw new Error(`Environment variable ${name} must be provided`);
  }
}

export function getSession() {
  ensureEnv("SESSION_SECRET");
  ensureEnv("DATABASE_URL");

  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const store = new PgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const isProduction = process.env.NODE_ENV === "production";

  // Get domain from environment, strip any protocol prefix
  const configuredDomain = process.env.DOMAIN || process.env.APP_PUBLIC_HOST;
  // Only set domain if explicitly configured (allows localhost to work without domain)
  const cookieDomain = configuredDomain && isProduction ? `.${configuredDomain.replace(/^(https?:\/\/)?/, '')}` : undefined;

  console.log('[AUTH DEBUG] Session config - isProduction:', isProduction, 'cookieDomain:', cookieDomain || 'not set');

  return session({
    secret: process.env.SESSION_SECRET!,
    store,
    resave: false,
    saveUninitialized: false,
    name: 'connect.sid', // Explicit cookie name for clarity
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
      path: '/', // Explicit path
      domain: cookieDomain, // Explicit domain for cross-subdomain support
    },
  });
}

async function createMagicLink(email: string, gateSessionId?: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await storage.createMagicLink({
    email,
    token,
    expiresAt,
    gateSessionId,
  });

  await emailService.sendMagicLink(email, token);
}

async function authenticateWithToken(req: Express.Request, token: string, gateSessionId?: string) {
  // DEBUG: Log authentication attempt
  console.log('[AUTH DEBUG] authenticateWithToken called with token:', token.substring(0, 8) + '...');

  const magicLink = await storage.getMagicLink(token);
  if (!magicLink) {
    console.log('[AUTH DEBUG] Magic link not found or expired');
    throw new Error("Invalid or expired token");
  }
  console.log('[AUTH DEBUG] Magic link found for email:', magicLink.email);

  const userEmail = magicLink.email;
  let user = await storage.getUserByEmail(userEmail);

  if (!user) {
    user = await storage.createUser({ email: userEmail });
  }

  // Use gateSessionId from magic link if not provided directly
  const sessionIdToLink = gateSessionId || magicLink.gateSessionId;

  // Link gate responses if session ID available
  if (sessionIdToLink) {
    try {
      await storage.linkGateResponsesToUser(sessionIdToLink, user.id);
      console.log(`Linked gate responses for session ${sessionIdToLink} to user ${user.id}`);
    } catch (error) {
      console.error('Error linking gate responses:', error);
      // Don't fail the auth if linking fails
    }
  }

  await storage.markMagicLinkUsed(token);

  await new Promise<void>((resolve, reject) => {
    console.log('[AUTH DEBUG] Regenerating session...');
    req.session.regenerate((err) => {
      if (err) {
        console.log('[AUTH DEBUG] Session regeneration failed:', err);
        reject(err);
        return;
      }

      req.session.userId = user!.id;
      req.user = user!;
      console.log('[AUTH DEBUG] Session regenerated, userId set to:', user!.id);
      console.log('[AUTH DEBUG] Session ID after regenerate:', req.sessionID);

      req.session.save((saveErr) => {
        if (saveErr) {
          console.log('[AUTH DEBUG] Session save failed:', saveErr);
          reject(saveErr);
          return;
        }

        console.log('[AUTH DEBUG] Session saved successfully, sessionID:', req.sessionID);
        resolve();
      });
    });
  });

  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/auth/magic-link", async (req, res) => {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    try {
      const { email, gateSessionId } = emailRequestSchema.parse(req.body);
      const normalizedEmail = email.toLowerCase();

      logAuth.attempt('Magic link request', {
        email: normalizedEmail,
        ip: clientIp,
        gateSessionId,
        userAgent: req.headers['user-agent'],
      });

      await createMagicLink(normalizedEmail, gateSessionId);

      logAuth.success('Magic link sent', {
        email: normalizedEmail,
        ip: clientIp,
        gateSessionId,
      });

      res.json({ message: "Magic link sent" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logAuth.failure('Magic link request failed - invalid email', {
          ip: clientIp,
          error: 'ZodError',
        });
        res.status(400).json({ message: "Invalid email address" });
        return;
      }

      logAuth.error('Magic link request failed - server error', error as Error, {
        ip: clientIp,
        email: req.body.email,
      });

      res.status(500).json({ message: "Failed to send magic link" });
    }
  });

  app.post("/api/auth/magic-link/verify", async (req, res) => {
    const startTime = Date.now();
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    try {
      const { token, gateSessionId } = req.body;

      logAuth.attempt('Magic link verification attempt', {
        ip: clientIp,
        hasToken: !!token,
        tokenLength: token?.length,
        hasGateSession: !!gateSessionId,
        gateSessionId,
        userAgent: req.headers['user-agent'],
      });

      const user = await authenticateWithToken(req, token, gateSessionId);

      logAuth.success('Magic link verified successfully', {
        userId: user.id,
        email: user.email,
        ip: clientIp,
        sessionId: req.sessionID,
        gateSessionId,
        duration: Date.now() - startTime,
      });

      res.json({ user });
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof z.ZodError) {
        logAuth.failure('Magic link verification failed - invalid token format', {
          ip: clientIp,
          error: 'ZodError',
          issues: error.issues,
          duration,
        });
        res.status(400).json({ message: "Invalid token" });
        return;
      }

      if (error instanceof Error && error.message === "Invalid or expired token") {
        logAuth.failure('Magic link verification failed - token invalid/expired', {
          ip: clientIp,
          token: req.body.token?.substring(0, 8) + '...', // Log first 8 chars only
          error: error.message,
          duration,
        });
        res.status(400).json({ message: error.message });
        return;
      }

      // Log detailed error information for 500 errors
      logAuth.error('Magic link verification failed - server error', error as Error, {
        ip: clientIp,
        tokenProvided: !!req.body.token,
        tokenLength: req.body.token?.length,
        gateSessionId: req.body.gateSessionId,
        sessionId: req.sessionID,
        hasSession: !!req.session,
        duration,
        errorType: (error as Error).constructor.name,
      });

      res.status(500).json({ message: "Failed to verify magic link" });
    }
  });

  // GET /auth/verify - Used by Fresh app for magic link verification
  app.get("/auth/verify", async (req, res) => {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const token = req.query.token as string;
    const gateSessionId = req.query.gateSessionId as string;

    if (!token) {
      logAuth.failure('Auth verify failed - no token provided', {
        ip: clientIp,
        userAgent: req.headers['user-agent'],
      });
      return res.redirect("/begin?error=no_token");
    }

    try {
      logAuth.attempt('GET /auth/verify - magic link verification', {
        ip: clientIp,
        hasToken: true,
        tokenLength: token.length,
        hasGateSession: !!gateSessionId,
        userAgent: req.headers['user-agent'],
      });

      const user = await authenticateWithToken(req, token, gateSessionId);

      logAuth.success('Magic link verified via GET /auth/verify', {
        userId: user.id,
        email: user.email,
        ip: clientIp,
        sessionId: req.sessionID,
        gateSessionId,
      });

      // Session cookie is now set, redirect to questionnaire
      res.redirect("/questionnaire");
    } catch (error) {
      logAuth.failure('GET /auth/verify failed - invalid token', {
        ip: clientIp,
        token: token.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.error("GET /auth/verify error:", error);
      res.redirect("/begin?error=invalid_token");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: "Failed to logout" });
        return;
      }

      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/auth.html");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  console.log('[AUTH DEBUG] isAuthenticated check, path:', req.path);
  console.log('[AUTH DEBUG] Session ID:', req.sessionID);
  console.log('[AUTH DEBUG] Cookie header:', req.headers.cookie || 'none');
  const sessionUserId = req.session.userId;
  console.log('[AUTH DEBUG] Session userId:', sessionUserId || 'not set');

  if (!sessionUserId) {
    console.log('[AUTH DEBUG] Unauthorized - no userId in session');
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const user = await storage.getUser(sessionUserId);

    if (!user) {
      req.session.userId = undefined;
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error checking authentication:", error);
    res.status(500).json({ message: "Failed to verify authentication" });
  }
};

export {};
