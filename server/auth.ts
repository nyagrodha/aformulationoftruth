import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";

import { storage } from "./storage";
import { emailService } from "./services/emailService";

const PgStore = connectPg(session);

const emailRequestSchema = z.object({
  email: z.string().email(),
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

  return session({
    secret: process.env.SESSION_SECRET!,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

async function createMagicLink(email: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await storage.createMagicLink({
    email,
    token,
    expiresAt,
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

  // Link gate responses if session ID provided
  if (gateSessionId) {
    try {
      await storage.linkGateResponsesToUser(gateSessionId, user.id);
      console.log(`Linked gate responses for session ${gateSessionId} to user ${user.id}`);
    } catch (error) {
      console.error('Error linking gate responses:', error);
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
      const { email } = emailRequestSchema.parse(req.body);
      await createMagicLink(email.toLowerCase());
      res.json({ message: "Magic link sent" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid email address" });
        return;
      }

      console.error("Error creating magic link:", error);
      res.status(500).json({ message: "Failed to send magic link" });
    }
  });

  app.post("/api/auth/magic-link/verify", async (req, res) => {
    try {
      const { token, gateSessionId } = req.body;
      const user = await authenticateWithToken(req, token, gateSessionId);
      res.json({ user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid token" });
        return;
      }

      if (error instanceof Error && error.message === "Invalid or expired token") {
        res.status(400).json({ message: error.message });
        return;
      }

      console.error("Error verifying magic link:", error);
      res.status(500).json({ message: "Failed to verify magic link" });
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
  } catch (error) {
    console.error("Error checking authentication:", error);
    res.status(500).json({ message: "Failed to verify authentication" });
  }
};

export {};
