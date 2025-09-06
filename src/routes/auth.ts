import { Router } from "express";
const router = Router();
router.get("/dev-login", (req: any, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).end();
  req.session = req.session || {};
  req.session.user = { id: "dev_user", email: "dev@example.com" };
  res.json({ ok: true, user: req.session.user });
});
export default router;
