import { Router } from 'express';
const router = Router();

// Accept posted answers (auth-protect later)
router.post('/', (req, res) => {
  // TODO: persist to Postgres; associate with req.session.user if present
  res.status(201).json({ ok: true });
});

export default router;
