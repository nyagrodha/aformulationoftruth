import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env.local from project root
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
class MailerConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MailerConfigError';
    }
}
// Parse admin emails list
function getAdminEmails() {
    const adminEmailsStr = process.env.ADMIN_EMAILS || 'root@aformulationoftruth.com,admin@aformulationoftruth.com';
    return adminEmailsStr.split(',').map(email => email.trim().toLowerCase());
}
// Check if an email is an admin/root email
function isAdminEmail(email) {
    const adminEmails = getAdminEmails();
    return adminEmails.includes(email.toLowerCase());
}
// Validate SendGrid configuration
function validateSendGridConfig() {
    if (!process.env.SENDGRID_API_KEY) {
        throw new MailerConfigError('SENDGRID_API_KEY is required for user emails');
    }
    if (!process.env.SENDGRID_FROM_EMAIL) {
        throw new MailerConfigError('SENDGRID_FROM_EMAIL is required');
    }
}
// Validate SMTP configuration
function validateSMTPConfig() {
    const requiredVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        throw new MailerConfigError(`Missing required SMTP environment variables: ${missing.join(', ')}`);
    }
}
// Configure SendGrid
let sendGridConfigured = false;
try {
    validateSendGridConfig();
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    sendGridConfigured = true;
    console.log('✓ SendGrid configured for user emails');
}
catch (error) {
    console.error('⚠ SendGrid configuration failed:', error.message);
    console.error('  User emails will not be sent via SendGrid');
}
// Configure SMTP transporter for admin emails
let smtpTransporter;
let smtpConfigured = false;
try {
    validateSMTPConfig();
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const secure = process.env.SMTP_SECURE === 'true';
    smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        connectionTimeout: parseInt(process.env.SMTP_TIMEOUT, 10) || 60000,
        greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT, 10) || 30000,
        socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT, 10) || 60000,
    });
    smtpConfigured = true;
    console.log(`✓ Apple SMTP configured for admin emails: ${process.env.SMTP_HOST}:${port}`);
}
catch (error) {
    console.error('⚠ SMTP configuration failed:', error.message);
    console.error('  Admin emails will not be sent via Apple SMTP');
}
// Verify SMTP connection
async function verifySMTPConnection() {
    if (!smtpConfigured || !smtpTransporter) {
        throw new MailerConfigError('SMTP transporter not configured');
    }
    try {
        await smtpTransporter.verify();
        console.log('✓ SMTP transporter ready and verified');
        return true;
    }
    catch (error) {
        console.error('✗ SMTP transporter verification failed:', error.message);
        throw new MailerConfigError(`SMTP verification failed: ${error.message}`);
    }
}
// Initialize SMTP verification (but don't block startup)
if (smtpConfigured) {
    verifySMTPConnection().catch(error => {
        console.error('Mail service verification failed during startup:', error.message);
    });
}
function getEmailConfig() {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new MailerConfigError('BASE_URL must be defined');
    }
    return {
        sendgrid: {
            fromName: process.env.SENDGRID_FROM_NAME || 'A Formulation of Truth',
            fromEmail: process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL,
        },
        smtp: {
            fromName: process.env.FROM_NAME || 'A Formulation of Truth',
            fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER,
        },
        baseUrl,
        tokenExpiry: process.env.TOKEN_EXPIRY_MINUTES || '15'
    };
}
function validateEmailAddress(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error(`Invalid email address: ${email}`);
    }
}
// Send email via SendGrid
async function sendViaSendGrid(email, subject, html, text) {
    if (!sendGridConfigured) {
        throw new MailerConfigError('SendGrid is not configured');
    }
    const config = getEmailConfig();
    const msg = {
        to: email,
        from: {
            email: config.sendgrid.fromEmail,
            name: config.sendgrid.fromName
        },
        subject: subject,
        text: text,
        html: html,
    };
    console.log(`📧 Sending email via SendGrid to: ${email}`);
    try {
        const response = await sgMail.send(msg);
        console.log(`✓ Email sent via SendGrid. MessageID: ${response[0].headers['x-message-id']}`);
        return {
            success: true,
            messageId: response[0].headers['x-message-id'],
            recipient: email,
            timestamp: new Date().toISOString(),
            provider: 'sendgrid'
        };
    }
    catch (error) {
        console.error('✗ SendGrid send error:', error.response?.body || error.message);
        throw new Error(`SendGrid send failed: ${error.message}`);
    }
}
// Send email via SMTP
async function viaSMTP(email, subject, html, text) {
    if (!smtpConfigured || !smtpTransporter) {
        throw new MailerConfigError('SMTP is not configured');
    }
    const config = getEmailConfig();
    const mailOptions = {
        from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
        to: email,
        subject: subject,
        html: html,
        text: text,
        headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            'X-Mailer': 'A Formulation of Truth Mail Service'
        }
    };
    console.log(`📧 Sending email via Apple SMTP to: ${email}`);
    try {
        const info = await smtpTransporter.sendMail(mailOptions);
        console.log(`✓ Email sent via SMTP. MessageID: ${info.messageId}`);
        return {
            success: true,
            messageId: info.messageId,
            recipient: email,
            timestamp: new Date().toISOString(),
            provider: 'smtp'
        };
    }
    catch (error) {
        console.error('✗ SMTP send error:', error.message);
        throw new Error(`SMTP send failed: ${error.message}`);
    }
}
// Main function to send magic link email
export async function sendMagicLinkEmail(email, token) {
    try {
        // Validate inputs
        if (!email || !token) {
            throw new Error('Email and token are required');
        }
        validateEmailAddress(email);
        const config = getEmailConfig();
        const magicLink = `${config.baseUrl}/auth/verify?token=${token}`;
        // TESTING MODE: Log magic link when neither service is configured
        if (!sendGridConfigured && !smtpConfigured) {
            console.log('⚠️  TESTING MODE - Email not sent (No email service configured)');
            console.log(`📧 To: ${email}`);
            console.log(`🔗 Magic Link: ${magicLink}`);
            console.log(`⏱️  Expires in: ${config.tokenExpiry} minutes`);
            return {
                success: true,
                messageId: 'test-' + Date.now(),
                recipient: email,
                timestamp: new Date().toISOString(),
                testMode: true,
                magicLink
            };
        }
        const subject = process.env.EMAIL_SUBJECT || 'Your Magic Sign-In Link';
        const html = `
      <div style="font-family: 'Orbitron', monospace; background: #000; color: #0ff; padding: 20px; text-align: center;">
        <h1 style="color: #0ff; text-shadow: 0 0 10px #0ff;">Karuppacami Kelvittaal</h1>
        <h2 style="color: #f0f;">A Formulation of Truth</h2>

        <p style="margin: 30px 0;">Click the link below to sign in:</p>

        <a href="${magicLink}"
           style="display: inline-block; padding: 15px 30px; background: linear-gradient(90deg,#0ff,#f0f,#cf0); color: #000; text-decoration: none; font-weight: bold; border-radius: 8px; margin: 20px 0;">
          Sign In to A Formulation of Truth
        </a>

        <p style="margin-top: 30px; font-size: 12px; color: #888;">
          This link will expire in ${config.tokenExpiry} minutes.<br>
          If you didn't request this, please ignore this email.
        </p>
      </div>
    `;
        const text = `
      Karuppacami Kelvittaal - A Formulation of Truth

      Click this link to sign in: ${magicLink}

      This link will expire in ${config.tokenExpiry} minutes.
      If you didn't request this, please ignore this email.
    `;
        // Route email based on recipient
        const isAdmin = isAdminEmail(email);
        console.log(`\n📬 Email Routing Decision:`);
        console.log(`   Recipient: ${email}`);
        console.log(`   Is Admin: ${isAdmin ? 'Yes' : 'No'}`);
        console.log(`   Provider: ${isAdmin ? 'Apple SMTP' : 'SendGrid'}\n`);
        if (isAdmin) {
            // Send admin emails via Apple SMTP
            return await viaSMTP(email, subject, html, text);
        }
        else {
            // Send user emails via SendGrid
            return await sendViaSendGrid(email, subject, html, text);
        }
    }
    catch (error) {
        console.error('Error sending magic link email:', {
            error: error.message,
            email: email,
            timestamp: new Date().toISOString()
        });
        // Re-throw with more specific error types
        if (error instanceof MailerConfigError) {
            throw error;
        }
        else if (error.message.includes('Invalid email')) {
            throw new Error(`Email validation failed: ${error.message}`);
        }
        else {
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }
}
// Health check function for mail services
export async function healthCheck() {
    const results = {
        timestamp: new Date().toISOString(),
        sendgrid: {
            configured: sendGridConfigured,
            status: sendGridConfigured ? 'ready' : 'not configured'
        },
        smtp: {
            configured: smtpConfigured,
            status: 'unknown'
        },
        adminEmails: getAdminEmails()
    };
    if (smtpConfigured) {
        try {
            await verifySMTPConnection();
            results.smtp.status = 'healthy';
            results.smtp.config = {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: process.env.SMTP_SECURE
            };
        }
        catch (error) {
            results.smtp.status = 'unhealthy';
            results.smtp.error = error.message;
        }
    }
    else {
        results.smtp.status = 'not configured';
    }
    const overallHealthy = sendGridConfigured || (smtpConfigured && results.smtp.status === 'healthy');
    return {
        status: overallHealthy ? 'healthy' : 'unhealthy',
        ...results
    };
}
// Export utility functions for testing
export { isAdminEmail, getAdminEmails };
