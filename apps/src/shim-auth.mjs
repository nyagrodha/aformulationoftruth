import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";

const app = express();
app.set("trust proxy", 1);           // respect X-Forwarded-Proto from nginx
app.use(express.json());
app.use(cookieParser());

const SESS = new Map();              // in-memory session (for demo)

/* health */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* start magic link (shim: just set a cookie) */
app.post("/api/auth/start", (req, res) => {
  const email = String(req.body?.email || "").trim();
  if (!email) return res.status(400).json({ error: "email required" });

  const sid = crypto.randomUUID();
  SESS.set(sid, { email, createdAt: Date.now() });

  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,        // fine behind HTTPS (browser sees https)
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  });
  res.status(202).json({ ok: true });
});

/* who am i */
app.get("/api/auth/me", (req, res) => {
  const sid = req.cookies?.sid;
  res.json({ user: sid && SESS.get(sid) ? SESS.get(sid) : null });
});

/* questionnaire stubs */
const QUESTIONS = [
  { id: 1, text: "What is your idea of perfect happiness?" },
  { id: 2, text: "What is your greatest fear?" },
  { id: 3, text: "Which living person do you most admire?" },
  { id: 4, text: "What is your current state of mind?" },
  { id: 5, text: "What do you most value in your friends?" },
];
app.get("/api/questions", (_req, res) => res.json({ questions: QUESTIONS }));
app.post("/api/questions/answer", (_req, res) => res.json({ ok: true }));

const PORT = 5001;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[shim] listening on http://127.0.0.1:${PORT}`);
});
