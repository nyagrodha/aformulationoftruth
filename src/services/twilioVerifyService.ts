import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ServiceError } from '../utils/errors.js';

type TwilioClient = ReturnType<typeof twilio>;

export type OTPChannel = 'sms' | 'whatsapp' | 'email';

export interface SendOTPResult {
  status: string;
  to: string;
  channel: OTPChannel;
  valid: boolean;
}

export interface VerifyOTPResult {
  status: string;
  to: string;
  channel: OTPChannel;
  valid: boolean;
}

let twilioClient: TwilioClient | null = null;

function getTwilioClient(): TwilioClient {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new ServiceError('OTP_NOT_CONFIGURED', 'Twilio credentials not configured', 500);
  }

  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
}

function getVerifyServiceSid(): string {
  if (!env.TWILIO_VERIFY_SERVICE_SID) {
    throw new ServiceError('OTP_NOT_CONFIGURED', 'Twilio Verify Service SID not configured', 500);
  }
  return env.TWILIO_VERIFY_SERVICE_SID;
}

/**
 * Validates the destination based on the channel type
 */
function validateDestination(to: string, channel: OTPChannel): void {
  if (channel === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new ServiceError('OTP_INVALID_EMAIL', 'Invalid email address format', 400);
    }
  } else {
    // SMS and WhatsApp require E.164 phone format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to)) {
      throw new ServiceError('OTP_INVALID_PHONE', 'Phone number must be in E.164 format (e.g., +15551234567)', 400);
    }
  }
}

/**
 * Sends an OTP to the specified destination via the chosen channel
 * @param to - Phone number (E.164) or email address
 * @param channel - Delivery channel: 'sms', 'whatsapp', or 'email'
 */
export async function sendOTP(to: string, channel: OTPChannel): Promise<SendOTPResult> {
  validateDestination(to, channel);

  const client = getTwilioClient();
  const serviceSid = getVerifyServiceSid();

  try {
    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({
        to,
        channel
      });

    logger.info({ to: maskDestination(to), channel, status: verification.status }, 'OTP sent successfully');

    return {
      status: verification.status,
      to: verification.to,
      channel: channel,
      valid: verification.status === 'pending'
    };
  } catch (error) {
    logger.error({ error, to: maskDestination(to), channel }, 'Failed to send OTP');

    if (error instanceof Error && 'code' in error) {
      const twilioError = error as { code: number; message: string };

      // Handle common Twilio error codes
      if (twilioError.code === 60200) {
        throw new ServiceError('OTP_INVALID_PHONE', 'Invalid phone number', 400);
      }
      if (twilioError.code === 60203 || twilioError.code === 60212) {
        throw new ServiceError('OTP_RATE_LIMITED', 'Too many requests. Please wait before requesting another code.', 429);
      }
    }

    throw new ServiceError('OTP_SEND_FAILED', 'Failed to send verification code. Please try again.', 500);
  }
}

/**
 * Verifies an OTP code entered by the user
 * @param to - Phone number (E.164) or email address that received the OTP
 * @param code - The OTP code entered by the user
 */
export async function verifyOTP(to: string, code: string): Promise<VerifyOTPResult> {
  if (!code || code.length < 4 || code.length > 10) {
    throw new ServiceError('OTP_INVALID_CODE', 'Invalid verification code format', 400);
  }

  const client = getTwilioClient();
  const serviceSid = getVerifyServiceSid();

  try {
    const verificationCheck = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to,
        code
      });

    const isApproved = verificationCheck.status === 'approved';

    logger.info(
      { to: maskDestination(to), status: verificationCheck.status, valid: isApproved },
      'OTP verification attempt'
    );

    return {
      status: verificationCheck.status,
      to: verificationCheck.to,
      channel: verificationCheck.channel as OTPChannel,
      valid: isApproved
    };
  } catch (error) {
    logger.error({ error, to: maskDestination(to) }, 'Failed to verify OTP');

    if (error instanceof Error && 'code' in error) {
      const twilioError = error as { code: number; message: string };

      // Handle common Twilio verification error codes
      if (twilioError.code === 20404) {
        throw new ServiceError('OTP_EXPIRED', 'Verification code expired or not found. Please request a new code.', 400);
      }
      if (twilioError.code === 60202) {
        throw new ServiceError('OTP_RATE_LIMITED', 'Maximum check attempts reached. Please request a new code.', 429);
      }
    }

    throw new ServiceError('OTP_VERIFY_FAILED', 'Failed to verify code. Please try again.', 500);
  }
}

/**
 * Checks if Twilio OTP service is properly configured
 */
export function isOTPServiceConfigured(): boolean {
  return !!(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_VERIFY_SERVICE_SID
  );
}

/**
 * Masks destination for logging (privacy)
 */
function maskDestination(destination: string): string {
  if (destination.includes('@')) {
    // Email: show first 2 chars and domain
    const [local, domain] = destination.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  // Phone: show last 4 digits
  return `***${destination.slice(-4)}`;
}
