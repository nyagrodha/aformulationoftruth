import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Router } from 'express';
import { storage } from "./storage";
import { z } from "zod";
import { insertResponseSchema } from "./shared/schema";
import { emailService } from "./services/emailService";
import { pdfService } from "./services/pdfService";
import { questionService } from "./services/questionService";
import { quoteService } from "./services/quoteService";

// --- Auth Helper Functions ---
function pick(obj: Record<string, any>, keys: string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

function isSafeNext(next: any): next is string {
  // Allow only relative paths; block protocol/hosted redirects
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');
}

function sanitizeClaims(raw: Record<string, any>) {
  const base = pick(raw, ['sub', 'email', 'name', 'email_verified', 'picture', 'locale', 'hd']);
  const profile = pick(raw, ['sub', 'email', 'name', 'email_verified', 'picture', 'locale', 'given_name', 'family_name']);
  return { ...base, profile };
}

async function linkOrCreate(provider: string, sub: string, email: string | null, name: string | null) {
  // This function replaces the direct DB call in the example.
  // In a real app, you'd likely search by provider and sub.
  let user = await storage.getUser(email || sub); // Simplified lookup
  if (!user) {
    user = await storage.createUser({ id: sub, email: email!, name: name! });
  }
  return user.id;
}

async function markLogin(userId: string) {
    // TODO: Implement this in storage.ts to update a user's last_login timestamp
    console.log(`User ${userId} logged in.`);
}

async function finishLogin(
  { provider, claims }: { provider: string; claims: Record<string, any> },
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!claims?.sub) return res.status(400).json({ error: 'missing sub' });

    const { email = null, name = null } = sanitizeClaims(claims);

    const userId = await linkOrCreate(provider, claims.sub, email, name);
    await markLogin(userId);

    // @ts-ignore - Assuming express-session is used and configured
    req.session.user = { id: userId, email, name };

    const nextParam = req.query.next;
    const redirectTo = isSafeNext(nextParam) ? nextParam : '/';
    res.redirect(redirectTo);
  } catch (err) {
    next(err);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // --- Auth Router Setup ---
  const authRouter = Router();

  authRouter.get('/whoami', (req: Request, res: Response) => {
    // @ts-ignore
    res.json({ user: req.session.user ?? null });
  });

  authRouter.post('/google/callback', async (req: Request, res: Response, next: NextFunction) => {
    // TODO(prod): Verify id_token with Google before trusting claims
    const claims = req.body ?? {};
    await finishLogin({ provider: 'google', claims }, req, res, next);
  });

  authRouter.post('/apple/callback', async (req: Request, res: Response, next: NextFunction) => {
    // TODO(prod): Verify identityToken with Apple before trusting claims
    const claims = req.body ?? {};
    await finishLogin({ provider: 'apple', claims }, req, res, next);
  });

  app.use('/api/auth', authRouter);


  // --- Main App Routes ---
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore
    if (req.session.user) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // Get all quotes
  app.get("/api/quotes", async (req, res) => {
    try {
      const quotes = await quoteService.getQuotes();
      res.json(quotes);
    } catch (error) {
      console.error('Failed to get quotes:', error);
      res.status(500).json({ message: "Failed to retrieve quotes" });
    }
  });

  // Get or create questionnaire session
  app.get("/api/questionnaire/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id; // Use authenticated user ID
      
      let session = await storage.getSessionByUserId(userId);
      if (!session) {
        const questionOrder = questionService.generateQuestionOrder();
        session = await storage.createSession({
          userId,
          questionOrder
        });
      }

      res.json(session);
    } catch (error) {
      console.error('Session error:', error);
      res.status(500).json({ message: "Failed to get session" });
    }
  });

  // Submit answer
  app.post("/api/questionnaire/:sessionId/answer", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const { questionId, answer } = insertResponseSchema.omit({ sessionId: true }).parse(req.body);
      
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== req.session.user?.id) {
        return res.status(404).json({ message: "Session not found or access denied" });
      }

      const validationResult = questionService.validateAnswer(answer);
      if (!validationResult.isValid) {
        return res.status(400).json({ 
          message: "Invalid answer", 
          details: validationResult.errors 
        });
      }

      const existingResponse = await storage.getResponseBySessionAndQuestion(sessionId, questionId);
      let response;
      
      if (existingResponse) {
        response = await storage.updateResponse(sessionId, questionId, answer);
      } else {
        response = await storage.createResponse({ sessionId, questionId, answer });
      }

      res.json(response);
    } catch (error) {
      console.error('Submit answer error:', error);
      res.status(500).json({ message: "Failed to submit answer" });
    }
  });

  // Complete questionnaire
  app.post('/api/questionnaire/:sessionId/complete', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const { wantsReminder, wantsToShare } = req.body;

      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== req.session.user?.id) {
        return res.status(404).json({ message: 'Session not found or access denied' });
      }

      const responses = await storage.getResponsesBySessionId(sessionId);
      if (responses.length < 35) {
        return res.status(400).json({ message: 'Not all questions have been answered' });
      }

      const shareId = await storage.completeSession(sessionId, wantsReminder, wantsToShare);
      
      const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(responses, session.questionOrder as number[]);
      
      await emailService.sendCompletionEmail(req.session.user.email, pdfBuffer);

      const result: any = { message: 'Questionnaire completed successfully' };
      if (shareId) {
        result.shareLink = `${req.protocol}://${req.get('host')}/shared/${shareId}`;
      }

      res.json(result);
    } catch (error) {
      console.error('Error completing questionnaire:', error);
      res.status(500).json({ message: 'Failed to complete questionnaire' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

