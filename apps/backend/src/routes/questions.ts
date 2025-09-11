import { Router } from "express";
import { questionService } from "../services/questionService.js";

const router = Router();

function ensureSession(req: any) {
  if (!req.session.questionOrder) {
    req.session.questionOrder = questionService.generateQuestionOrder();
    req.session.currentQuestionIndex = 0;
  }
}

router.get("/next", (req, res) => {
  ensureSession(req);
  const q = questionService.getCurrentQuestion(req.session);
  if (!q) return res.status(404).json({ ok: false, error: "no question" });
  const displayOrder = questionService.getQuestionDisplayOrder(q.id);
  res.json({ ok: true, question: { id: q.id, text: q.text, displayOrder } });
});

router.post("/answer", (req, res) => {
  ensureSession(req);
  const { answer } = req.body ?? {};
  const q = questionService.getCurrentQuestion(req.session);
  if (!q) return res.status(404).json({ ok: false, error: "no question" });

  const { isValid, errors } = questionService.validateAnswer(String(answer ?? ""));
  if (!isValid) return res.status(422).json({ ok: false, errors });

  req.session.currentQuestionIndex! += 1;

  const next = questionService.getCurrentQuestion(req.session);
  if (!next) return res.json({ ok: true, done: true });

  const displayOrder = questionService.getQuestionDisplayOrder(next.id);
  res.json({ ok: true, question: { id: next.id, text: next.text, displayOrder } });
});

export default router;
