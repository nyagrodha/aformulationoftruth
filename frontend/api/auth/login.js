// POST /api/auth/login
// Body: { didToken: string }
import { Magic } from '@magic-sdk/admin';
import { setSessionCookie } from '../_lib/cookies.js';
import { sign } from '../_lib/jwt.js';

const magic = new Magic(process.env.MAGIC_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { didToken } = req.body || {};
    if (!didToken) return res.status(400).json({ error: 'Missing didToken' });

    await magic.token.validate(didToken);
    const metadata = await magic.users.getMetadataByToken(didToken);

    const jwt = sign({ sub: metadata.issuer, email: metadata.email });
    setSessionCookie(res, jwt);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('login error', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
}
