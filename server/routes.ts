import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertResponseSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { emailService } from "./services/emailService";
import { pdfService } from "./services/pdfService";
import { questionService } from "./services/questionService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      
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
      const userId = req.user.claims.sub;
      
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
          total: session.questionOrder.length
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
      const userId = req.user.claims.sub;
      const { questionId, answer } = insertResponseSchema.parse(req.body);
      
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
      const currentQuestionIndex = session.questionOrder.indexOf(questionId);
      const nextQuestionIndex = currentQuestionIndex + 1;
      
      if (nextQuestionIndex < session.questionOrder.length) {
        await storage.updateSessionProgress(sessionId, nextQuestionIndex);
      } else {
        // Complete session and generate PDF
        await storage.completeSession(sessionId);
        
        // Get user and all responses for PDF
        const user = await storage.getUser(userId);
        const allResponses = await storage.getResponsesBySessionId(sessionId);
        
        if (user?.email) {
          // Generate and send PDF
          const pdfBuffer = await pdfService.generateProustQuestionnairePDF(
            allResponses,
            session.questionOrder
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
      const userId = req.user.claims.sub;
      
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

  // Download PDF (for completed sessions)
  app.get("/api/questionnaire/:sessionId/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.claims.sub;
      
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== userId || !session.completed) {
        return res.status(404).json({ message: "Completed session not found" });
      }

      const responses = await storage.getResponsesBySessionId(sessionId);
      const pdfBuffer = await pdfService.generateProustQuestionnairePDF(
        responses,
        session.questionOrder
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="proust-questionnaire.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error('PDF download error:', error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}