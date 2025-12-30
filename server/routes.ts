import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertResponseSchema, insertGateResponseSchema } from "@shared/schema";
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
import { responseEncryptionService } from "./services/responseEncryptionService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Gate questions endpoint - no authentication required
  app.get('/api/gate/questions', async (req, res) => {
    try {
      // Gate questions (hardcoded for now)
      const gateQuestions = [
        {
          id: 1,
          question_text: "What pattern have you been chasing that might not exist?",
          question_order: 1,
          required: true
        },
        {
          id: 2,
          question_text: "Where in your life do you feel the second law of thermodynamics most?\n(total disorder increases in any spontaneous process)",
          question_order: 2,
          required: true
        },
        {
          id: 3,
          question_text: "Which lie do you tell most convincingly?",
          question_order: 3,
          required: true
        },
        {
          id: 4,
          question_text: "Where were you when you first suspected that coincidence might not be coincidental?",
          question_order: 4,
          required: false
        }
      ];

      res.json({
        success: true,
        questions: gateQuestions
      });
    } catch (error: any) {
      console.error('Error fetching gate questions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch gate questions'
      });
    }
  });

  // Gate response endpoint - no authentication required (anonymous)
  app.post('/api/gate/response', async (req, res) => {
    try {
      const { sessionId, questionText, questionIndex, answer, skipped } = req.body;

      // Validate required fields
      if (!sessionId || !questionText || questionIndex === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Encrypt the answer before storing (unless skipped)
      let encryptedData;
      if (skipped || !answer || answer.trim() === '') {
        // For skipped questions, encrypt empty string
        encryptedData = encryptionService.encrypt('');
      } else {
        encryptedData = encryptionService.encrypt(answer);
      }

      // Store gate response
      const gateResponse = await storage.createGateResponse({
        sessionId,
        questionText,
        questionIndex,
        answer: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        salt: encryptedData.salt,
        skipped: skipped || false,
        userId: null, // Will be linked later when user logs in
      });

      res.json({ success: true, id: gateResponse.id });
    } catch (error: any) {
      console.error('Error saving gate response:', error);
      res.status(500).json({ message: error.message || "Failed to save response" });
    }
  });

  // Gate submit endpoint (alias for /api/gate/response with request_id in response)
  app.post('/api/gate/submit', async (req, res) => {
    try {
      const { sessionId, questionText, questionIndex, answer, skipped } = req.body;

      // Validate required fields
      if (!sessionId || !questionText || questionIndex === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Encrypt the answer before storing (unless skipped)
      let encryptedData;
      if (skipped || !answer || answer.trim() === '') {
        // For skipped questions, encrypt empty string
        encryptedData = encryptionService.encrypt('');
      } else {
        encryptedData = encryptionService.encrypt(answer);
      }

      // Store gate response
      const gateResponse = await storage.createGateResponse({
        sessionId,
        questionText,
        questionIndex,
        answer: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        salt: encryptedData.salt,
        skipped: skipped || false,
        userId: null, // Will be linked later when user logs in
      });

      res.json({ success: true, request_id: gateResponse.id });
    } catch (error: any) {
      console.error('Error saving gate response:', error);
      res.status(500).json({ message: error.message || "Failed to save response" });
    }
  });

  // Gate submit endpoint without /api prefix (for gate.js compatibility)
  app.post('/gate/submit', async (req, res) => {
    try {
      const { sessionId, questionText, questionIndex, answer, skipped } = req.body;

      // Validate required fields
      if (!sessionId || !questionText || questionIndex === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Encrypt the answer before storing (unless skipped)
      let encryptedData;
      if (skipped || !answer || answer.trim() === '') {
        // For skipped questions, encrypt empty string
        encryptedData = encryptionService.encrypt('');
      } else {
        encryptedData = encryptionService.encrypt(answer);
      }

      // Store gate response
      const gateResponse = await storage.createGateResponse({
        sessionId,
        questionText,
        questionIndex,
        answer: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        salt: encryptedData.salt,
        skipped: skipped || false,
        userId: null, // Will be linked later when user logs in
      });

      res.json({ success: true, request_id: gateResponse.id });
    } catch (error: any) {
      console.error('Error saving gate response:', error);
      res.status(500).json({ message: error.message || "Failed to save response" });
    }
  });

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

  // Get next question for authenticated user (for Fresh questionnaire)
  app.get("/api/questions/next", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get or create session
      let session = await storage.getSessionByUserId(userId);
      if (!session) {
        const questionOrder = questionService.generateQuestionOrder();
        session = await storage.createSession({
          userId,
          questionOrder,
          currentQuestionIndex: 0,
          completedAt: null
        });
      }

      // Check if user has gate responses
      const gateResponses = await storage.getGateResponsesByUserId(userId);
      const hasGateResponses = gateResponses.length >= 2;

      // Calculate starting index based on gate responses
      let currentIndex = session.currentQuestionIndex;

      // Skip questions 0 and 1 (ids 1 and 2) if user answered them at gate
      if (hasGateResponses && currentIndex < 2) {
        currentIndex = 2; // Start at question index 2 (third question)
        await storage.updateSessionProgress(session.id, currentIndex);
      }

      const questionOrder = session.questionOrder as number[];

      // Check if completed
      if (currentIndex >= questionOrder.length) {
        return res.json({
          completed: true,
          message: "All questions have been answered!"
        });
      }

      const questionId = questionOrder[currentIndex];
      const question = questionService.getQuestion(questionId);

      if (!question) {
        return res.status(500).json({ message: "Question not found" });
      }

      // Calculate progress - adjust total if gate questions answered
      const totalQuestions = questionOrder.length;
      const answeredGateQuestions = hasGateResponses ? 2 : 0;
      // For users with gate responses: show as 2/34 when at index 2
      // For users without: show as 1/35 when at index 0
      const effectivePosition = hasGateResponses ? currentIndex : currentIndex + 1;
      const effectiveTotal = hasGateResponses ? totalQuestions - 1 : totalQuestions;

      res.json({
        id: questionId,
        text: question.text,
        position: effectivePosition,
        total: effectiveTotal,
        sessionId: session.id
      });
    } catch (error) {
      console.error('Get next question error:', error);
      res.status(500).json({ message: "Failed to get next question" });
    }
  });

  // Submit answer for current question (for Fresh questionnaire)
  app.post("/api/answers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { questionId, answer } = req.body;

      if (!questionId || !answer) {
        return res.status(400).json({ error: "Missing questionId or answer" });
      }

      // Get session
      const session = await storage.getSessionByUserId(userId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate answer
      const validationResult = questionService.validateAnswer(answer);
      if (!validationResult.isValid) {
        return res.status(400).json({
          error: "Invalid answer",
          details: validationResult.errors
        });
      }

      // Encrypt and save response
      const encryptedData = responseEncryptionService.prepareForStorage(answer);

      const existingResponse = await storage.getResponseBySessionAndQuestion(session.id, questionId);
      if (existingResponse) {
        await storage.updateResponse(session.id, questionId, encryptedData);
      } else {
        await storage.createResponse({
          sessionId: session.id,
          questionId,
          answer: encryptedData.answer,
          iv: encryptedData.iv,
          tag: encryptedData.tag,
          salt: encryptedData.salt,
          encryptionType: encryptedData.encryptionType
        });
      }

      // Update progress
      const questionOrder = session.questionOrder as number[];
      const currentIndex = questionOrder.indexOf(questionId);
      const nextIndex = currentIndex + 1;

      if (nextIndex < questionOrder.length) {
        await storage.updateSessionProgress(session.id, nextIndex);
      } else {
        // Complete session
        await storage.completeSession(session.id, false);

        // Generate and send PDF
        const encryptedResponses = await storage.getResponsesBySessionId(session.id);
        const responses = responseEncryptionService.decryptResponses(encryptedResponses);
        const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(responses, questionOrder);

        if (req.user?.email) {
          await emailService.sendCompletionEmail(req.user.email, pdfBuffer);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Submit answer error:', error);
      res.status(500).json({ error: "Failed to save answer" });
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
      const encryptedResponses = await storage.getResponsesBySessionId(sessionId);
      // Decrypt responses before returning to client
      const responses = responseEncryptionService.decryptResponses(encryptedResponses);

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

      // If session is completed, check if this question is already answered
      if (session.completed) {
        const existingResponse = await storage.getResponseBySessionAndQuestion(sessionId, questionId);
        if (existingResponse) {
          // Question already answered, return the existing response (idempotent)
          return res.json(existingResponse);
        }
        // Session complete but question not answered - shouldn't happen, but block it
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

      // Encrypt the answer before storage (per-response encryption)
      const encryptedData = responseEncryptionService.prepareForStorage(answer);

      // Save or update response with encrypted data
      const existingResponse = await storage.getResponseBySessionAndQuestion(sessionId, questionId);
      let response;

      if (existingResponse) {
        response = await storage.updateResponse(sessionId, questionId, encryptedData);
      } else {
        response = await storage.createResponse({
          sessionId,
          questionId,
          answer: encryptedData.answer,
          iv: encryptedData.iv,
          tag: encryptedData.tag,
          salt: encryptedData.salt,
          encryptionType: encryptedData.encryptionType
        });
      }

      // Update progress
      const questionOrder = session.questionOrder as number[];
      const currentQuestionIndex = questionOrder.indexOf(questionId);
      const nextQuestionIndex = currentQuestionIndex + 1;
      
      if (nextQuestionIndex < questionOrder.length) {
        await storage.updateSessionProgress(sessionId, nextQuestionIndex);
      } else {
        // Get user to check admin status
        const user = await storage.getUser(userId);

        // Check if user has completed questionnaire in last 2 months (skip for admin users)
        if (!user?.isAdmin) {
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
        }

        // Complete session and generate PDF
        await storage.completeSession(sessionId, false);

        // Get all responses for PDF (decrypt before PDF generation)
        const encryptedAllResponses = await storage.getResponsesBySessionId(sessionId);
        const allResponses = responseEncryptionService.decryptResponses(encryptedAllResponses);

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

      const encryptedResponses = await storage.getResponsesBySessionId(sessionId);
      // Decrypt responses before returning to client
      const responses = responseEncryptionService.decryptResponses(encryptedResponses);
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

      // Get user to check admin status
      const user = await storage.getUser(userId);

      // Check if user has completed questionnaire recently (silent enforcement)
      // Skip this check for admin users
      if (!user?.isAdmin) {
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
      const encryptedResponses = await storage.getResponsesBySessionId(sessionId);
      if (encryptedResponses.length < 35) {
        return res.status(400).json({ message: 'Not all questions have been answered' });
      }

      // Mark session as completed with reminder preference and sharing
      const shareId = await storage.completeSession(sessionId, wantsReminder, wantsToShare);

      // Increment user completion count
      const updatedUser = await storage.incrementUserCompletionCount(userId);

      // Decrypt responses for PDF generation
      const responses = responseEncryptionService.decryptResponses(encryptedResponses);

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

      const encryptedResponses = await storage.getResponsesBySessionId(sessionId);
      // Decrypt responses for PDF generation
      const responses = responseEncryptionService.decryptResponses(encryptedResponses);
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

      const encryptedResponses = await storage.getResponsesBySessionId(session.id);
      // Decrypt responses for public viewing
      const responses = responseEncryptionService.decryptResponses(encryptedResponses);

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
  const handleNewsletterSignup = async (req: any, res: any) => {
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
        return res.status(200).json({
          success: true,
          message: "Email already subscribed to newsletter",
          alreadySubscribed: true
        });
      }

      // Generate secure unsubscribe token
      const crypto = await import('crypto');
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');

      // Store encrypted email in database with unsubscribe token
      await storage.createNewsletterEmail({
        encryptedEmail: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        salt: encryptedData.salt,
        unsubscribeToken
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

      res.status(201).json({
        success: true,
        message: "Successfully subscribed to newsletter",
        alreadySubscribed: false
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid email address"
        });
        return;
      }

      console.error("Newsletter signup error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to subscribe to newsletter"
      });
    }
  };

  app.post("/api/newsletter/signup", handleNewsletterSignup);
  app.post("/api/newsletter/subscribe", handleNewsletterSignup);

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