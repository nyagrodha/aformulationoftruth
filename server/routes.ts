import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertResponseSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./auth";

// Admin authentication middleware
const isAdmin = async (req: any, res: any, next: any) => {
  const sessionUserId = req.session?.userId;

  if (!sessionUserId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!req.user) {
    req.user = await storage.getUser(sessionUserId);
  }

  // Check if user is admin (you can customize this logic)
  const adminEmails = ['formitselfisemptiness@aformulationoftruth.com', 'eachmomenteverydayur@aformulationoftruth.com', 'thoughtlessness@aformulationoftruth.com'];
  const userEmail = req.user?.email;

  if (!userEmail || !adminEmails.includes(userEmail)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
};
import { emailService } from "./services/emailService";
import { pdfService } from "./services/pdfService";
import { questionService } from "./services/questionService";
import { vpsStorageService } from "./services/vpsStorageService";
import { encryptionService } from "./services/encryptionService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get or create questionnaire session for authenticated user
  app.get("/api/questionnaire/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get existing session or create new one
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

  // Get current question for a session
  app.get("/api/questionnaire/:sessionId/current", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }

      const currentQuestion = questionService.getCurrentQuestion(session);
      const responses = await storage.getResponsesBySessionId(sessionId);
      
      res.json({
        question: currentQuestion,
        progress: {
          current: session.currentQuestionIndex + 1,
          total: (session.questionOrder as number[]).length
        },
        responses: responses.map(r => ({
          questionId: r.questionId,
          answer: r.answer
        }))
      });
    } catch (error) {
      console.error('Get current question error:', error);
      res.status(500).json({ message: "Failed to get current question" });
    }
  });

  // Submit answer
  app.post("/api/questionnaire/:sessionId/answer", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { questionId, answer } = insertResponseSchema.omit({ sessionId: true }).parse(req.body);
      
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.completed) {
        return res.status(400).json({ message: "Session already completed" });
      }

      // Validate answer
      const validationResult = questionService.validateAnswer(answer);
      if (!validationResult.isValid) {
        return res.status(400).json({ 
          message: "Invalid answer", 
          details: validationResult.errors 
        });
      }

      // Save or update response
      const existingResponse = await storage.getResponseBySessionAndQuestion(sessionId, questionId);
      let response;
      
      if (existingResponse) {
        response = await storage.updateResponse(sessionId, questionId, answer);
      } else {
        response = await storage.createResponse({
          sessionId,
          questionId,
          answer
        });
      }

      // Update progress
      const questionOrder = session.questionOrder as number[];
      const currentQuestionIndex = questionOrder.indexOf(questionId);
      const nextQuestionIndex = currentQuestionIndex + 1;
      
      if (nextQuestionIndex < questionOrder.length) {
        await storage.updateSessionProgress(sessionId, nextQuestionIndex);
      } else {
        // Check if user has completed questionnaire in last 2 months
        const existingCompletions = await storage.getUserCompletedSessions(userId);
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        
        const recentCompletion = existingCompletions.find(session => 
          session.completedAt && new Date(session.completedAt) > twoMonthsAgo
        );

        if (recentCompletion) {
          return res.status(400).json({ 
            message: 'You may only complete the questionnaire once every 2 months',
            nextAvailable: new Date(new Date(recentCompletion.completedAt!).getTime() + (2 * 30 * 24 * 60 * 60 * 1000))
          });
        }

        // Complete session and generate PDF
        await storage.completeSession(sessionId, false);
        
        // Get user and all responses for PDF
        const user = await storage.getUser(userId);
        const allResponses = await storage.getResponsesBySessionId(sessionId);
        
        if (user?.email) {
          // Generate and send PDF
          const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(
            allResponses,
            session.questionOrder as number[]
          );
          
          await emailService.sendCompletionEmail(user.email, pdfBuffer);
        }
      }

      res.json(response);
    } catch (error) {
      console.error('Submit answer error:', error);
      res.status(500).json({ message: "Failed to submit answer" });
    }
  });

  // Get previous answers (for navigation)
  app.get("/api/questionnaire/:sessionId/responses", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }

      const responses = await storage.getResponsesBySessionId(sessionId);
      res.json(responses);
    } catch (error) {
      console.error('Get responses error:', error);
      res.status(500).json({ message: "Failed to get responses" });
    }
  });

  // Complete questionnaire with reminder preference
  app.post('/api/questionnaire/:sessionId/complete', isAuthenticated, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { wantsReminder, wantsToShare } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      // Check if user has completed questionnaire recently (silent enforcement)
      const existingCompletions = await storage.getUserCompletedSessions(userId);
      const restrictionPeriod = new Date();
      restrictionPeriod.setTime(restrictionPeriod.getTime() - (5688000 * 1000)); // 5,688,000 seconds ago
      
      const recentCompletion = existingCompletions.find(session => 
        session.completedAt && new Date(session.completedAt) > restrictionPeriod
      );

      if (recentCompletion) {
        // Return a generic error without revealing timing information
        return res.status(400).json({ 
          message: 'Unable to complete the inquiry at this time'
        });
      }

      // Verify session belongs to user
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: 'Session not found' });
      }

      if (session.completed) {
        return res.status(400).json({ message: 'Session already completed' });
      }

      // Check if all questions are answered
      const responses = await storage.getResponsesBySessionId(sessionId);
      if (responses.length < 35) {
        return res.status(400).json({ message: 'Not all questions have been answered' });
      }

      // Mark session as completed with reminder preference and sharing
      const shareId = await storage.completeSession(sessionId, wantsReminder, wantsToShare);

      // Increment user completion count
      const updatedUser = await storage.incrementUserCompletionCount(userId);

      // Generate and send PDF
      const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(responses, session.questionOrder as number[]);
      
      if (updatedUser?.email) {
        await emailService.sendCompletionEmail(updatedUser.email, pdfBuffer);
      }

      // Securely backup to VPS (non-blocking)
      vpsStorageService.backupQuestionnaire(sessionId).catch(error => 
        console.error('VPS backup failed:', error)
      );

      const result: any = { message: 'Questionnaire completed successfully' };
      if (shareId) {
        result.shareLink = `${req.protocol}://${req.hostname}/shared/${shareId}`;
      }

      res.json(result);
    } catch (error) {
      console.error('Error completing questionnaire:', error);
      res.status(500).json({ message: 'Failed to complete questionnaire' });
    }
  });

  // Get user's completed questionnaires
  app.get("/api/questionnaire/completed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const completedSessions = await storage.getUserCompletedSessions(userId);
      res.json(completedSessions);
    } catch (error) {
      console.error('Get completed sessions error:', error);
      res.status(500).json({ message: "Failed to get completed sessions" });
    }
  });

  // Download PDF (for completed sessions)
  app.get("/api/questionnaire/:sessionId/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId || !session.completed) {
        return res.status(404).json({ message: "Completed session not found" });
      }

      const responses = await storage.getResponsesBySessionId(sessionId);
      const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(
        responses,
        session.questionOrder as number[]
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="proust-questionnaire.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error('PDF download error:', error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Public route to view shared questionnaires (no authentication required)
  app.get("/api/shared/:shareId", async (req, res) => {
    try {
      const { shareId } = req.params;
      
      const session = await storage.getSessionByShareId(shareId);
      if (!session) {
        return res.status(404).json({ message: "Shared questionnaire not found" });
      }

      const responses = await storage.getResponsesBySessionId(session.id);
      
      res.json({
        session: {
          id: session.id,
          completedAt: session.completedAt,
          questionOrder: session.questionOrder
        },
        responses
      });
    } catch (error) {
      console.error('Shared questionnaire error:', error);
      res.status(500).json({ message: "Failed to get shared questionnaire" });
    }
  });

  // VPS Storage API endpoints
  app.post("/api/vps/backup/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Verify session belongs to user
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }

      const success = await vpsStorageService.backupQuestionnaire(sessionId);
      
      if (success) {
        res.json({ message: "Questionnaire backed up securely" });
      } else {
        res.status(500).json({ message: "Backup failed" });
      }
    } catch (error) {
      console.error('VPS backup error:', error);
      res.status(500).json({ message: "Backup failed" });
    }
  });

  app.get("/api/vps/health", isAuthenticated, async (req, res) => {
    try {
      const isHealthy = await vpsStorageService.healthCheck();
      res.json({ healthy: isHealthy });
    } catch (error) {
      res.json({ healthy: false });
    }
  });

  // Newsletter signup endpoint with encrypted storage
  app.post("/api/newsletter/signup", async (req, res) => {
    try {
      const emailSchema = z.object({
        email: z.string().email()
      });

      const { email } = emailSchema.parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      // Encrypt the email using AES-256-GCM
      const encryptedData = encryptionService.encrypt(normalizedEmail);

      // Check if email already exists (by checking encrypted value)
      const exists = await storage.checkNewsletterEmailExists(encryptedData.encrypted);

      if (exists) {
        return res.status(400).json({ message: "Email already subscribed to newsletter" });
      }

      // Store encrypted email in database
      await storage.createNewsletterEmail({
        encryptedEmail: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag
      });

      // Also send encrypted data through VPS tunnel for backup
      try {
        await vpsStorageService.storeResponse(
          'newsletter',
          0,
          JSON.stringify(encryptedData)
        );
      } catch (vpsError) {
        // VPS backup is optional, log but don't fail the request
        console.error('VPS backup for newsletter failed:', vpsError);
      }

      res.json({ message: "Successfully subscribed to newsletter" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid email address" });
        return;
      }

      console.error("Newsletter signup error:", error);
      res.status(500).json({ message: "Failed to subscribe to newsletter" });
    }
  });

  // Admin routes (temporarily disabled - storage methods need implementation)
  /*
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const { search, limit = 50 } = req.query;
      let users;
      
      if (search && typeof search === 'string') {
        users = await storage.searchUsers(search, parseInt(limit as string));
      } else {
        users = await storage.searchUsers('', parseInt(limit as string));
      }
      
      res.json(users);
    } catch (error) {
      console.error('Admin users search error:', error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  app.get("/api/admin/sessions", isAdmin, async (req, res) => {
    try {
      const { search, limit = 50, offset = 0 } = req.query;
      let sessions;
      
      if (search && typeof search === 'string') {
        sessions = await storage.searchSessions(search, parseInt(limit as string));
      } else {
        sessions = await storage.getAllSessions(parseInt(limit as string), parseInt(offset as string));
      }
      
      res.json(sessions);
    } catch (error) {
      console.error('Admin sessions search error:', error);
      res.status(500).json({ message: "Failed to search sessions" });
    }
  });

  app.get("/api/admin/responses", isAdmin, async (req, res) => {
    try {
      const { search, limit = 50 } = req.query;
      const responses = await storage.searchResponses(search as string || '', parseInt(limit as string));
      res.json(responses);
    } catch (error) {
      console.error('Admin responses search error:', error);
      res.status(500).json({ message: "Failed to search responses" });
    }
  });

  app.get("/api/admin/sessions-with-data", isAdmin, async (req, res) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const sessions = await storage.getSessionsWithResponses(parseInt(limit as string), parseInt(offset as string));
      res.json(sessions);
    } catch (error) {
      console.error('Admin sessions with data error:', error);
      res.status(500).json({ message: "Failed to get sessions with data" });
    }
  });
  */

  const httpServer = createServer(app);
  return httpServer;
}