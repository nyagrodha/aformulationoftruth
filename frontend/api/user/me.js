// GET /api/user/me
import { verify } from '../_lib/jwt.js';

export default async function handler(req, res) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verify(decodeURIComponent(match[1]));
    res.status(200).json({ user: { sub: payload.sub, email: payload.email } });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}
