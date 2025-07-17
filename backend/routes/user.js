// routes/user.js
import express from 'express';
const router = express.Router();

// Dummy user for now
router.get('/', (req, res) => {
  res.json({ id: 'user_123', name: 'Anonymous Reader' });
});

export default router;
