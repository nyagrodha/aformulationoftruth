import twilio from 'twilio';
import crypto from 'crypto';
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
let twilioClient = null;
if (accountSid && authToken) {
    twilioClient = twilio(accountSid, authToken);
    console.log('✅ Twilio SMS service initialized');
}
else {
    console.warn('⚠️  Twilio credentials not configured - SMS will run in TEST MODE');
}
// Generate 6-digit verification code
export function generateVerificationCode() {
    return crypto.randomInt(100000, 999999).toString();
}
// Send SMS verification code
export async function sendVerificationSMS(phoneNumber, code) {
    // TEST MODE: Log code when Twilio not configured
    if (!twilioClient) {
        console.log('');
        console.log('═══════════════════════════════════════════════');
        console.log('📱 SMS TEST MODE - Twilio Not Configured');
        console.log('═══════════════════════════════════════════════');
        console.log(`To: ${phoneNumber}`);
        console.log(`Code: ${code}`);
        console.log(`Expires: 10 minutes`);
        console.log('═══════════════════════════════════════════════');
        console.log('');
        return {
            success: true,
            messageId: 'test-' + Date.now(),
            testMode: true
        };
    }
    try {
        const message = await twilioClient.messages.create({
            body: `Your A Formulation of Truth verification code is: ${code}\n\nThis code expires in 10 minutes.`,
            from: twilioNumber,
            to: phoneNumber
        });
        console.log(`✅ SMS sent to ${phoneNumber}. SID: ${message.sid}`);
        return {
            success: true,
            messageId: message.sid,
            status: message.status
        };
    }
    catch (error) {
        console.error('❌ Error sending SMS:', error);
        throw new Error(`Failed to send SMS: ${error.message}`);
    }
}
// Send voice verification (alternative to SMS)
export async function sendVerificationCall(phoneNumber, code) {
    if (!twilioClient) {
        console.log('');
        console.log('═══════════════════════════════════════════════');
        console.log('📞 VOICE TEST MODE - Twilio Not Configured');
        console.log('═══════════════════════════════════════════════');
        console.log(`To: ${phoneNumber}`);
        console.log(`Code: ${code}`);
        console.log('═══════════════════════════════════════════════');
        console.log('');
        return { success: true, testMode: true };
    }
    try {
        const call = await twilioClient.calls.create({
            twiml: `<Response><Say>Your A Formulation of Truth verification code is: ${code.split('').join(', ')}</Say></Response>`,
            to: phoneNumber,
            from: twilioNumber
        });
        console.log(`✅ Voice call to ${phoneNumber}. SID: ${call.sid}`);
        return {
            success: true,
            callId: call.sid
        };
    }
    catch (error) {
        console.error('❌ Error making verification call:', error);
        throw new Error(`Failed to make call: ${error.message}`);
    }
}
// Validate phone number format (E.164)
export function validatePhoneNumber(phoneNumber) {
    // E.164 format: +[country code][number]
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
}
// Normalize phone number to E.164 format
export function normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.replace(/[^\d+]/g, '');
    // Add + if not present and looks like US number
    if (!normalized.startsWith('+')) {
        if (normalized.length === 10) {
            normalized = '+1' + normalized; // US country code
        }
        else if (normalized.length === 11 && normalized.startsWith('1')) {
            normalized = '+' + normalized;
        }
        else {
            throw new Error('Invalid phone number format. Please use international format (e.g., +1234567890)');
        }
    }
    if (!validatePhoneNumber(normalized)) {
        throw new Error('Invalid phone number format');
    }
    return normalized;
}
