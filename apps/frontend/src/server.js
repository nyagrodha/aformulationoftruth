// /var/www/aformulationoftruth/backend/src/server.js
import express from "express";

const app = express();

// Security + body parsing
app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Debug: prove this exact file is running
app.get("/api/__whoami", (req, res) =>
  res.json({
    file: "src/server.js",
    bootedAt: new Date().toISOString(),
    hasInlineAuthStart: true,
  })
);

// --- Minimal inline auth handlers so POST /api/auth/start works immediately ---
const isEmail = (s) =>
  typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

app.post("/api/auth/start", (req, res) => {
  const email = (req.body?.email || "").trim();
  if (!isEmail(email)) return res.status(400).json({ error: "valid email required" });
  console.log("Auth start:", email);
  // TODO: wire real mailer; for now, return ok so UI can proceed.
  return res.json({ ok: true, email });
});

// Optional GET fallback for <a href="/api/auth/start?email=...">
app.get("/api/auth/start", (req, res) => {
  const email = (req.query?.email || "").trim();
  if (!isEmail(email)) return res.status(400).json({ error: "valid email required" });
  console.log("Auth start (GET):", email);
  return res.json({ ok: true, email });
});

// If routes/auth.js exists, mount it too (it can override/add routes)
try {
  const mod = await import("./routes/auth.js");
  const authRouter = mod.default || mod;
  app.use("/api/auth", authRouter);
  console.log("Mounted routes/auth.js");
} catch {
  console.log("routes/auth.js not found; using inline /api/auth/start only");
}

// Listen
const port = Number(process.env.PORT) || 5050;
const host = process.env.BIND_ADDR || "127.0.0.1";
app.listen(port, host, () => console.log("Server listening on", port));
