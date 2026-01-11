# Email Service Migration Guide

## Current Implementation

Currently, the application uses **nodemailer** with a custom SMTP configuration to send magic link emails. This is defined in:
- `apps/backend/auth/magic-link.js`

### Issues with Current Setup
1. **Deliverability concerns**: Self-hosted SMTP often lands in spam
2. **Maintenance overhead**: Requires monitoring SMTP server health
3. **Limited analytics**: No tracking of open rates, delivery status, etc.
4. **Scalability**: May not handle high volume efficiently

## Recommended Migration: Resend

**Resend** is the recommended email service for this application.

### Why Resend?

✅ **Modern & Developer-Friendly**
- Simple API designed for developers
- Built-in React Email support (if you want branded templates)
- Excellent documentation

✅ **Pricing**
- **Free tier**: 3,000 emails/month, 100 emails/day
- Paid plans start at $20/month for 50k emails
- Perfect for small-to-medium traffic

✅ **Deliverability**
- Industry-leading inbox placement
- Automatic SPF/DKIM setup
- Real-time webhook notifications

✅ **Features**
- Email tracking and analytics
- Domain verification
- Template management
- Bounce and complaint handling

### Migration Steps

#### 1. Sign Up & Get API Key

```bash
# Visit https://resend.com/signup
# Create account and verify your email
# Get your API key from the dashboard
```

#### 2. Install Resend SDK

```bash
cd apps/backend
npm install resend
```

#### 3. Update Environment Variables

Add to `.env`:
```env
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=noreply@aformulationoftruth.com
```

#### 4. Update `magic-link.js`

Replace the current implementation:

```javascript
// apps/backend/auth/magic-link.js
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');

const JWT_SECRET = process.env.MAGIC_LINK_SECRET || process.env.JWT_SECRET || 'your-secret-key';
const MAGIC_LINK_EXPIRATION = process.env.MAGIC_LINK_EXPIRATION || '15m';
const resend = new Resend(process.env.RESEND_API_KEY);

function createToken(email) {
    return jwt.sign({ email }, JWT_SECRET, { expiresIn: MAGIC_LINK_EXPIRATION });
}

async function sendMagicLink(email, token) {
    const url = `https://www.aformulationoftruth.com/auth/verify?token=${token}`;

    try {
        const { data, error } = await resend.emails.send({
            from: 'Marcel Proust <noreply@aformulationoftruth.com>',
            to: [email],
            subject: 'Your Magic Login Link - A Formulation of Truth',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: 'EB Garamond', Georgia, serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            padding: 40px 20px;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            background: rgba(255, 255, 255, 0.95);
                            border-radius: 20px;
                            padding: 40px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        }
                        h1 {
                            color: #4a00e0;
                            text-align: center;
                            font-size: 2rem;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #333;
                            line-height: 1.6;
                            font-size: 1.1rem;
                        }
                        .button {
                            display: inline-block;
                            background: #00ffff;
                            color: #0f0c29;
                            padding: 15px 40px;
                            text-decoration: none;
                            border-radius: 50px;
                            font-weight: bold;
                            margin: 30px auto;
                            text-align: center;
                            display: block;
                            width: fit-content;
                        }
                        .footer {
                            text-align: center;
                            color: #666;
                            font-size: 0.9rem;
                            margin-top: 30px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>✧ Begin Your Journey ✧</h1>
                        <p>Click the button below to access your personalized questionnaire:</p>
                        <a href="${url}" class="button">Begin Questionnaire</a>
                        <p class="footer">
                            This link will expire in ${MAGIC_LINK_EXPIRATION}.<br>
                            If you didn't request this, you can safely ignore this email.
                        </p>
                    </div>
                </body>
                </html>
            `,
        });

        if (error) {
            throw error;
        }

        console.log('✅ Email sent via Resend:', data);
        return data;
    } catch (error) {
        console.error('❌ Failed to send email via Resend:', error);
        throw error;
    }
}

module.exports = { createToken, sendMagicLink };
```

#### 5. Domain Verification (Optional but Recommended)

For production use with your own domain:

1. Go to Resend dashboard → Domains
2. Add `aformulationoftruth.com`
3. Add the provided DNS records (SPF, DKIM, DMARC)
4. Wait for verification (usually < 1 hour)
5. Update `FROM_EMAIL` to use your domain

#### 6. Testing

```bash
# Test the magic link flow
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com"}'

# Check Resend dashboard for delivery status
```

## Alternative: SendGrid

If you prefer SendGrid (more established, enterprise-ready):

### Installation

```bash
npm install @sendgrid/mail
```

### Configuration

```javascript
// apps/backend/auth/magic-link.js
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendMagicLink(email, token) {
    const url = `https://www.aformulationoftruth.com/auth/verify?token=${token}`;

    const msg = {
        to: email,
        from: 'noreply@aformulationoftruth.com',
        subject: 'Your Magic Login Link',
        html: `<strong>Click here to login:</strong> <a href="${url}">${url}</a>`,
    };

    try {
        await sgMail.send(msg);
        console.log('✅ Email sent via SendGrid');
    } catch (error) {
        console.error('❌ SendGrid error:', error);
        throw error;
    }
}
```

### SendGrid Pricing
- Free tier: 100 emails/day
- Essentials: $19.95/month for 50k emails
- More expensive than Resend at scale

## Comparison Table

| Feature | Current (Nodemailer) | Resend | SendGrid |
|---------|---------------------|---------|----------|
| **Setup Complexity** | Medium | Easy | Medium |
| **Free Tier** | N/A | 3k/month | 100/day |
| **Deliverability** | Poor | Excellent | Excellent |
| **Developer Experience** | Good | Excellent | Good |
| **Analytics** | None | Built-in | Advanced |
| **Price (50k emails)** | Free (self-host) | $20/month | $19.95/month |
| **Recommendation** | ❌ Migrate away | ✅ **Best choice** | ⚠️ Good alternative |

## Next Steps

1. **Immediate**: Continue using nodemailer (works for development)
2. **Before production launch**: Migrate to Resend
3. **Optional**: Set up email templates with React Email for branded experience

## Email Template Enhancement (Future)

Consider using **React Email** with Resend for beautiful, responsive templates:

```bash
npm install react-email @react-email/components
```

This allows you to write email templates as React components, which compile to production-ready HTML.

## Support

- **Resend Docs**: https://resend.com/docs
- **SendGrid Docs**: https://docs.sendgrid.com
- **React Email**: https://react.email

---

**Recommendation**: Start with Resend's free tier, monitor deliverability for 2 weeks, then decide if you need to scale up or switch providers.
