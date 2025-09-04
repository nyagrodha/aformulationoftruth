// backend/src/api/whoami.js
import { Router } from 'express';

const router = Router();

function whoamiHandler(req, res) {
  const user = req.session?.user ?? null;
  const sid  = req.sessionID ?? null;
  res.json({ user, seenAt: new Date().toISOString(), sid });
}

// Support both /api/whoami and /api/auth/whoami
router.get(['/whoami', '/auth/whoami'], whoamiHandler);

export default router;
