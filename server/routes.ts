import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, insertResponseSchema } from "@shared/schema";
import { emailService } from "./services/emailService";
import { pdfService } from "./services/pdfService";
import { questionService } from "./services/questionService";
import crypto from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {

  // Send magic link
  app.post("/api/auth/magic-link", async (req, res) => {
    try {
      const { email } = insertUserSchema.parse(req.body);

      // Create or get user
      let user = await storage.getUserByEmail(email);
      if (!user) {
        user = await storage.createUser({ email });
      }

      // Generate magic link token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createMagicLink({
        email,
        token,
        expiresAt
      });

      // Send magic link email
      await emailService.sendMagicLink(email, token);

      res.json({ success: true });
    } catch (error) {
      console.error('Magic link error:', error);
      res.status(500).json({ message: "Failed to send magic link" });
    }
  });

  // Verify magic link and start session
  app.get("/api/auth/verify/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const magicLink = await storage.getMagicLink(token);
      if (!magicLink) {
        return res.status(400).json({ message: "Invalid or expired link" });
      }

      // Mark link as used
      await storage.markMagicLinkUsed(token);

      // Get or create user
      let user = await storage.getUserByEmail(magicLink.email);
      if (!user) {
        user = await storage.createUser({ email: magicLink.email });
      }

      // Get or create session
      let session = await storage.getSessionByUserId(user.id);
      if (!session) {
        const questionOrder = questionService.generateQuestionOrder();
        session = await storage.createSession({
          userId: user.id,
          questionOrder
        });
      }

      res.json({ 
        success: true, 
        userId: user.id,
        sessionId: session.id,
        currentQuestionIndex: session.currentQuestionIndex,
        completed: session.completed
      });
    } catch (error) {
      console.error('Verify token error:', error);
      res.status(500).json({ message: "Failed to verify token" });
    }
  });

  // Get current question
  app.get("/api/questionnaire/:sessionId/current", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getSessionById(sessionId);

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.completed) {
        return res.json({ completed: true });
      }

      const questionOrder = session.questionOrder as number[];
      // Get current question and response
      const currentQuestionId = questionOrder[session.currentQuestionIndex];
      const question = questionService.getQuestion(currentQuestionId);
      const existingResponse = await storage.getResponseBySessionAndQuestion(sessionId, currentQuestionId);

      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      const progress = Math.round(((session.currentQuestionIndex + 1) / questionOrder.length) * 100);

      res.json({
        question: {
          id: question.id,
          text: question.text,
          position: question.position
        },
        questionNumber: session.currentQuestionIndex + 1,
        totalQuestions: questionOrder.length,
        existingAnswer: existingResponse?.answer || "",
        declined: existingResponse?.declined || false,
        reviewingDeclined: session.reviewingDeclined,
        progress
      });
    } catch (error) {
      console.error('Get current question error:', error);
      res.status(500).json({ message: "Failed to get current question" });
    }
  });

  // Save response
  app.post("/api/questionnaire/:sessionId/response", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const responseSchema = z.object({
        questionId: z.number(),
        answer: z.string().min(10, "Response must be at least 10 characters")
          .refine(val => !/^\d+$/.test(val.trim()), "Response cannot be purely numerical")
          .refine(val => !/^[^a-zA-Z]*$/.test(val.trim()), "Response must contain meaningful text")
      });

      const { questionId, answer } = responseSchema.parse(req.body);

      // Check if response already exists
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

      res.json({ success: true, response });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: error.errors[0]?.message || "Invalid response" 
        });
      }
      console.error('Save response error:', error);
      res.status(500).json({ message: "Failed to save response" });
    }
  });

  // Navigate to next/previous question
  app.post("/api/questionnaire/:sessionId/navigate", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { direction } = z.object({ 
        direction: z.enum(['next', 'previous']) 
      }).parse(req.body);

      const session = await storage.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const questionOrder = session.questionOrder as number[];
      let newIndex = session.currentQuestionIndex;

      if (direction === 'next') {
        newIndex = Math.min(session.currentQuestionIndex + 1, questionOrder.length - 1);

        // Check if completed
        if (newIndex === questionOrder.length - 1) {
          // Get the last question's response to check if questionnaire is complete
          const lastQuestionId = questionOrder[newIndex];
          const lastResponse = await storage.getResponseBySessionAndQuestion(sessionId, lastQuestionId);

          if (lastResponse) {
            await storage.completeSession(sessionId);
            return res.json({ completed: true });
          }
        }
      } else {
        newIndex = Math.max(session.currentQuestionIndex - 1, 0);
      }

      await storage.updateSessionProgress(sessionId, newIndex);
      res.json({ success: true, newIndex });
    } catch (error) {
      console.error('Navigate error:', error);
      res.status(500).json({ message: "Failed to navigate" });
    }
  });

  // Complete questionnaire
  app.post("/api/questionnaire/:sessionId/complete", async (req, res) => {
    try {
      const { sessionId } = req.params;

      await storage.completeSession(sessionId);
      const responses = await storage.getResponsesBySessionId(sessionId);

      // Generate PDF
      const pdfBuffer = await pdfService.generateQuestionnairePDF(responses);

      // Get user email for sending results
      const session = await storage.getSessionById(sessionId);
      if (session) {
        const user = await storage.getUser(session.userId);
        if (user) {
          await emailService.sendResults(user.email, responses, pdfBuffer);
        }
      }

      res.json({ 
        success: true,
        totalResponses: responses.length,
        totalWords: responses.reduce((acc, r) => acc + r.answer.split(' ').length, 0)
      });
    } catch (error) {
      console.error('Complete questionnaire error:', error);
      res.status(500).json({ message: "Failed to complete questionnaire" });
    }
  });

  // Download PDF
  app.get("/api/questionnaire/:sessionId/pdf", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const responses = await storage.getResponsesBySessionId(sessionId);

      const pdfBuffer = await pdfService.generateQuestionnairePDF(responses);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="proust-questionnaire.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Download PDF error:', error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}