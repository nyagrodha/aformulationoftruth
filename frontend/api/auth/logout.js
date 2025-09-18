// POST /api/auth/logout
import { clearSessionCookie } from '../_lib/cookies.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
