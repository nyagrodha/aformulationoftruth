const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET;
const MAGIC_LINK_EXPIRATION = process.env.MAGIC_LINK_EXPIRATION || '15m';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
});

function createToken(email) {
    return jwt.sign({email }, JWT_SECRET, { expiresIn: MAGIC_LINK_EXPIRATION });
}

function sendMagicLink(email, token) {
    const url = `https://www.aformulationoftruth.com/auth/verify?token=${token}`;

    const mailOptions = {
      from: `"Marcel Proust" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Your Magic Login Link',
      html: `<p>Click the link below to begin your questionnaire:</p><p><a href="${url}">${url}</a></p><p>This link will expire in ${MAGIC_LINK_EXPIRATION}.</p>`,
  };
    
  return transporter.sendMail(mailOptions);
}

module.exports = { createToken, sendMagicLink };
