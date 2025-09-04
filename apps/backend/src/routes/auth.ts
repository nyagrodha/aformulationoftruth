import { Router } from 'express';
import { db } from '../db.js';
import { users } from '../../shared/dist/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// NEW: GET /api/auth/session
router.get('/session', async (req, res) => {
  if (req.session.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
    return res.status(200).json(user || null);
  }
  return res.status(200).json(null);
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  // ... (existing login code)
});

export default router;
