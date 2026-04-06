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
  const magicLink = await storage.getMagicLink(token);
  if (!magicLink) {
    throw new Error("Invalid or expired token");
  }

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
    } catch (_error) {
      // Don't fail the auth if linking fails
    }
  }

  await storage.markMagicLinkUsed(token);

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }

      req.session.userId = user!.id;
      req.user = user!;

      req.session.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
          return;
        }
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
    try {
      const { email, gateSessionId } = emailRequestSchema.parse(req.body);
      const normalizedEmail = email.toLowerCase();

      logAuth.attempt('Magic link request', { hasGateSession: !!gateSessionId });

      await createMagicLink(normalizedEmail, gateSessionId);

      logAuth.success('Magic link sent');

      res.json({ message: "Magic link sent" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logAuth.failure('Magic link request failed - invalid input');
        res.status(400).json({ message: "Invalid email address" });
        return;
      }

      logAuth.error('Magic link request failed - server error', error as Error, {});

      res.status(500).json({ message: "Failed to send magic link" });
    }
  });

  app.post("/api/auth/magic-link/verify", async (req, res) => {
    const startTime = Date.now();

    try {
      const { token, gateSessionId } = req.body;

      logAuth.attempt('Magic link verification attempt', {
        hasToken: !!token,
        hasGateSession: !!gateSessionId,
      });

      const user = await authenticateWithToken(req, token, gateSessionId);

      logAuth.success('Magic link verified', {
        duration: Date.now() - startTime,
      });

      res.json({ user });
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof z.ZodError) {
        logAuth.failure('Magic link verification failed - invalid format', { duration });
        res.status(400).json({ message: "Invalid token" });
        return;
      }

      if (error instanceof Error && error.message === "Invalid or expired token") {
        logAuth.failure('Magic link verification failed - token invalid/expired', { duration });
        res.status(400).json({ message: error.message });
        return;
      }

      logAuth.error('Magic link verification failed - server error', error as Error, {
        duration,
        errorType: (error as Error).constructor.name,
      });

      res.status(500).json({ message: "Failed to verify magic link" });
    }
  });

  // GET /auth/verify - Used by Fresh app for magic link verification
  app.get("/auth/verify", async (req, res) => {
    const token = req.query.token as string;
    const gateSessionId = req.query.gateSessionId as string;

    if (!token) {
      logAuth.failure('Auth verify failed - no token provided');
      return res.redirect("/begin?error=no_token");
    }

    try {
      logAuth.attempt('GET /auth/verify', { hasGateSession: !!gateSessionId });

      await authenticateWithToken(req, token, gateSessionId);

      logAuth.success('Magic link verified via GET /auth/verify');

      // Session cookie is now set, redirect to questionnaire
      res.redirect("/questionnaire");
    } catch (error) {
      logAuth.failure('GET /auth/verify failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

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
  const sessionUserId = req.session.userId;

  if (!sessionUserId) {
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
  } catch (_error) {
    res.status(500).json({ message: "Failed to verify authentication" });
  }
};

export {};
