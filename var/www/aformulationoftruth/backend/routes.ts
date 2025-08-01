
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertResponseSchema } from "./shared/schema";
import { emailService } from "./services/emailService";
import { pdfService } from "./services/pdfService";
import { questionService } from "./services/questionService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Simple auth middleware (you'll need to implement proper auth)
  const isAuthenticated = (req: any, res: any, next: any) => {
    // Implement your authentication logic here
    // For now, just pass through
    next();
  };

  // Get or create questionnaire session
  app.get("/api/questionnaire/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || 'default-user'; // Implement proper user ID extraction
      
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
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
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

      res.json(response);
    } catch (error) {
      console.error('Submit answer error:', error);
      res.status(500).json({ message: "Failed to submit answer" });
    }
  });

  // Complete questionnaire
  app.post('/api/questionnaire/:sessionId/complete', isAuthenticated, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { wantsReminder, wantsToShare } = req.body;

      const session = await storage.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      const responses = await storage.getResponsesBySessionId(sessionId);
      if (responses.length < 35) {
        return res.status(400).json({ message: 'Not all questions have been answered' });
      }

      const shareId = await storage.completeSession(sessionId, wantsReminder, wantsToShare);

      // Generate PDF
      const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(responses, session.questionOrder as number[]);
      
      // Send email (implement user email retrieval)
      // await emailService.sendCompletionEmail(userEmail, pdfBuffer);

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

  const httpServer = createServer(app);
  return httpServer;
}
