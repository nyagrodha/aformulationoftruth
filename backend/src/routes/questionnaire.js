import { Router } from "express";
import requireAuth from "../middleware/requireAuth.js";

const router = Router();

// protect everything under /api/questionnaire
router.use(requireAuth);

// session endpoint used by the frontend
router.get("/session", (req, res) => {
  // expose a stable session id (cookie-based) or your auth user id
  res.json({ id: req.cookies?.sid || "anon" });
});

// example: list questions
router.get("/", (req, res) => {
  const QUESTIONS = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, text: `Question ${i + 1}` }));
  res.json({ ok: true, count: QUESTIONS.length, questions: QUESTIONS });
});

export default router;
