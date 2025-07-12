import express from 'express';
import { generateToken, saveMagicLinkToken, findMagicLinkToken, deleteMagicLinkToken } from '../utils/db.js';
import { sendMagicLinkEmail } from '../utils/mailer.js';

const router = express.Router();

router.post('/magic-link', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  // 1. Generate token
  const token = generateToken(); // e.g. random string

  // 2. Save token + email + expiry (10min) in DB
  await saveMagicLinkToken(email, token);

  // 3. Send email
  await sendMagicLinkEmail(email, token);

  res.json({ ok: true });
});

router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  const record = await findMagicLinkToken(token);
  if (!record) return res.status(400).send('Invalid or expired token.');

  // Token valid – create session
  req.session.user = { email: record.email };
  await deleteMagicLinkToken(token); // One-time use

  res.redirect('/'); // or send JSON/session info
});

export default router;
