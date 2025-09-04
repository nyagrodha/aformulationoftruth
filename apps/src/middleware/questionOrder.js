export default function ensureQuestionOrder(req, _res, next) {
  const questions = req.app.get('questions') || [];
  // normalize & sort once here in case source changed
  const normalized = questions
    .map(q => ({ ...q, id: Number(q.id) }))
    .filter(q => Number.isFinite(q.id))
    .sort((a, b) => a.id - b.id);

  req.questions = normalized;
  next();
}
