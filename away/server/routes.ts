import type { Express } from 'express';
import { submitThankYouSchema } from '../shared/schema';
import { storage } from './storage';
import { emailService } from './services/emailService';
import { isAuthenticated } from './auth';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: 'Too many thank-you messages sent, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function registerRoutes(app: Express) {
  // ── Send a thank-you (public — no auth required) ──────────────────────────
  app.post('/api/thanks', sendLimiter, async (req, res) => {
    try {
      const data = submitThankYouSchema.parse(req.body);

      // Create the message record
      const message = await storage.createThankYouMessage({
        userId: req.session?.userId ?? null,
        senderName: data.senderName ?? null,
        senderEmail: data.senderEmail,
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        message: data.message,
        subject: data.subject ?? null,
      });

      // Deliver the email
      await emailService.sendThankYou({
        senderName: data.senderName,
        senderEmail: data.senderEmail,
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        message: data.message,
        subject: data.subject,
      });

      await storage.markMessageDelivered(message.id);

      res.status(201).json({ id: message.id, message: 'Thank you sent!' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid request', errors: error.errors });
        return;
      }
      console.error('Error sending thank-you:', error);
      res.status(500).json({ message: 'Failed to send thank-you message' });
    }
  });

  // ── List messages sent by the authenticated user ───────────────────────────
  app.get('/api/thanks', isAuthenticated, async (req, res) => {
    try {
      const messages = await storage.getMessagesByUser(req.user!.id);
      res.json({ messages });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  });
}
