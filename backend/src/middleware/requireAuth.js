// backend/src/middleware/requireAuth.js
export default function requireAuth(req, res, next) {
  const sid = req.cookies?.sid;
  if (!sid) return res.status(401).json({ ok: false, error: "unauthorized" });
  req.sessionID = sid;
  return next();
}
