// apps/backend/src/routes/auth.ts
import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.js";
import { users } from "../shared/index.js";
import { eq } from "drizzle-orm";
import { sendMagicLink } from "../services/mailer.js";

const router = Router();

// GET /api/auth/session (unchanged)
router.get("/session", async (req, res) => {
  if (req.session.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
    return res.status(200).json(user || null);
  }
  return res.status(200).json(null);
});

// POST /api/auth/login (fast 202 + async email)
router.post(["/login", "/magic-link"], async (req, res) => {
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });

  res.status(202).json({ ok: true });

  const token = crypto.randomBytes(24).toString("base64url");
  const origin = process.env.APP_ORIGIN || "https://aformulationoftruth.com";
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("token", token);
  loginUrl.searchParams.set("email", email);

  setImmediate(async () => {
    try {
      await sendMagicLink(email, loginUrl.toString()); // <-- fix
      console.log("[auth] magic link sent to", email);
    } catch (err) {
      console.error("[auth] sendMagicLink failed:", err);
    }
  });
});

export default router;
