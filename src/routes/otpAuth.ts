import express, { type Request, type Response, type NextFunction, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sendOTP, verifyOTP, isOTPServiceConfigured, type OTPChannel } from '../services/twilioVerifyService.js';
import { strictAuthRateLimiter } from '../middleware/rateLimiters.js';
import { auditLog } from '../utils/audit.js';

const router: ExpressRouter = express.Router();

const sendOTPSchema = z.object({
  to: z.string().min(1, 'Destination is required'),
  channel: z.enum(['sms', 'whatsapp', 'email'])
});

const verifyOTPSchema = z.object({
  to: z.string().min(1, 'Destination is required'),
  code: z.string().min(4).max(10)
});

/**
 * POST /auth/otp/send
 * Sends an OTP to the specified destination via SMS, WhatsApp, or Email
 */
router.post('/send', strictAuthRateLimiter(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOTPServiceConfigured()) {
      res.status(503).json({
        ok: false,
        error: 'OTP service is not configured'
      });
      return;
    }

    const payload = sendOTPSchema.parse(req.body);
    const { to, channel } = payload;

    const result = await sendOTP(to, channel as OTPChannel);

    auditLog(req, 'otp_send_requested', {
      channel,
      destination: maskDestination(to)
    });

    res.json({
      ok: true,
      message: `Verification code sent via ${channel}`,
      status: result.status
    });
  } catch (error) {
    auditLog(req, 'otp_send_failed');
    next(error);
  }
});

/**
 * POST /auth/otp/verify
 * Verifies the OTP code and creates a session
 */
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOTPServiceConfigured()) {
      res.status(503).json({
        ok: false,
        error: 'OTP service is not configured'
      });
      return;
    }

    const payload = verifyOTPSchema.parse(req.body);
    const { to, code } = payload;

    const result = await verifyOTP(to, code);

    if (!result.valid) {
      auditLog(req, 'otp_verify_failed', { destination: maskDestination(to) });
      res.status(401).json({
        ok: false,
        error: 'Invalid or expired verification code'
      });
      return;
    }

    // Create session on successful verification
    req.session.regenerate((err) => {
      if (err) {
        next(err);
        return;
      }

      // Store user identifier based on channel
      if (to.includes('@')) {
        req.session.userEmail = to;
      } else {
        req.session.userPhone = to;
      }
      req.session.authenticatedAt = new Date().toISOString();
      req.session.authMethod = 'otp';

      req.session.save((saveErr) => {
        if (saveErr) {
          next(saveErr);
          return;
        }

        auditLog(req, 'otp_verify_success', {
          destination: maskDestination(to),
          channel: result.channel
        });

        res.json({
          ok: true,
          message: 'Verification successful',
          user: {
            identifier: to,
            authenticatedAt: req.session.authenticatedAt
          }
        });
      });
    });
  } catch (error) {
    auditLog(req, 'otp_verify_error');
    next(error);
  }
});

/**
 * GET /auth/otp/status
 * Returns whether OTP authentication is available
 */
router.get('/status', (_req: Request, res: Response) => {
  const configured = isOTPServiceConfigured();

  res.json({
    ok: true,
    otpEnabled: configured,
    channels: configured ? ['sms', 'whatsapp', 'email'] : []
  });
});

function maskDestination(destination: string): string {
  if (destination.includes('@')) {
    const [local, domain] = destination.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `***${destination.slice(-4)}`;
}

export default router;
