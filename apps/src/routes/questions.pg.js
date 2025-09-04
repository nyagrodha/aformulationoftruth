// backend/src/routes/questions.js (fixed)
import { Router } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool as importedPool } from "../db.js"; // ⬅️ adjust if your real pool is in db_b.js

const { JWT_SECRET, COOKIE_NAME = "a4m_sesh" } = process.env;
if (!JWT_SECRET) throw new Error("JWT_SECRET missing");

// Resolve pool from req.app.locals or fallback import
function getPool(req) {
  return req?.app?.locals?.pool || importedPool || null;
}

// Auth (Bearer OR cookie)
function requireAuth(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : null;
    const token = bearer || req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

const router = Router();
router.use(requireAuth);

/* -------------------- Schema & helpers -------------------- */

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id       INT PRIMARY KEY,
      number   INT NOT NULL,
      text     TEXT NOT NULL,
      disabled BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS question_orders (
      user_id    TEXT PRIMARY KEY,
      ordering   INT[] NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      user_id     TEXT NOT NULL,
      question_id INT  NOT NULL,
      answer      TEXT,
      created_at  TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (user_id, question_id)
    );
  `);
}

function seededShuffle(userId) {
  const bytes = crypto.createHmac("sha256", "a4m:proust:v1")
    .update(String(userId)).digest();
  let i = 0;
  const nextByte = () => bytes[(i++) % bytes.length];
  const rand = () => (((nextByte() << 8) | nextByte()) / 65535);
  return (arr) => {
    const a = arr.slice();
    for (let j = a.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [a[j], a[k]] = [a[k], a[j]];
    }
    return a;
  };
}

// ⬇️ All helpers take `pool` explicitly
async function fetchAllQuestions(pool, { includeDisabled = true } = {}) {
  const sql = includeDisabled
    ? `SELECT id, number, text, disabled FROM questions ORDER BY number ASC`
    : `SELECT id, number, text, disabled FROM questions WHERE NOT disabled ORDER BY number ASC`;
  const { rows } = await pool.query(sql);
  return rows;
}

async function fetchQuestionById(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, number, text, disabled FROM questions WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getAnsweredSet(pool, userId) {
  const { rows } = await pool.query(
    `SELECT question_id FROM responses WHERE user_id = $1`,
    [userId]
  );
  return new Set(rows.map(r => r.question_id));
}

function buildOrderFromEnabled(enabledRows, userId) {
  const byId = new Map(enabledRows.map(r => [r.id, r]));
  const has = (id) => byId.has(id);
  const shuffle = seededShuffle(userId);
  const head = [1, 2].filter(has);
  const mids = Array.from({ length: 30 }, (_, k) => k + 3).filter(has); // 3..32
  const tail = [33, 34, 35].filter(has);
  return [...head, ...shuffle(mids), ...tail];
}

async function getOrCreateOrder(pool, userId, { excludeSet = new Set() } = {}) {
  const { rows } = await pool.query(
    `SELECT ordering FROM question_orders WHERE user_id = $1`,
    [userId]
  );

  const enabled = await fetchAllQuestions(pool, { includeDisabled: false });
  const enabledIds = new Set(enabled.map(q => q.id));

  if (!rows[0]?.ordering) {
    const ordering = buildOrderFromEnabled(enabled, userId).filter(id => !excludeSet.has(id));
    await pool.query(
      `INSERT INTO question_orders(user_id, ordering) VALUES ($1, $2)`,
      [userId, ordering]
    );
    return ordering;
  }

  const existing = rows[0].ordering;
  const filtered = existing.filter(id => enabledIds.has(id) && !excludeSet.has(id));

  if (filtered.length === 0) {
    const ordering = buildOrderFromEnabled(enabled, userId).filter(id => !excludeSet.has(id));
    await pool.query(
      `UPDATE question_orders SET ordering = $2 WHERE user_id = $1`,
      [userId, ordering]
    );
    return ordering;
  }

  await pool.query(
    `UPDATE question_orders SET ordering = $2 WHERE user_id = $1`,
    [userId, filtered]
  );
  return filtered;
}

/* -------------------- Validation helpers for answers -------------------- */
const isNumbersOnly = (s = "") => /^[0-9]+$/.test(s.trim());
const isSingleCharRepeat = (s = "") => s.trim().length >= 2 && /^([A-Za-z])\1+$/.test(s.trim());
const isBlank = (s = "") => s.trim().length === 0;
function validateAnswer(text) {
  if (isBlank(text)) return { ok: true };
  if (isNumbersOnly(text)) return { ok: false, reason: "numbers_only" };
  if (isSingleCharRepeat(text)) return { ok: false, reason: "single_char_repeat" };
  return { ok: true };
}

/* -------------------- Routes -------------------- */

router.get("/", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);
    const includeDisabled = req.query.includeDisabled === "true";
    const questions = await fetchAllQuestions(pool, { includeDisabled });
    res.json({ ok: true, count: questions.length, questions });
  } catch (e) {
    console.error("GET /api/questions", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
    const q = await fetchQuestionById(pool, id);
    if (!q) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, question: q });
  } catch (e) {
    console.error("GET /api/questions/:id", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// GET /api/questions/next?exclude=4,7,12
router.get("/next", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);
    const userId = String(req.user.id);
    const exclude = (req.query.exclude ?? "").toString();
    const excludeSet = new Set(
      exclude ? exclude.split(",").map(s => Number(s)).filter(Number.isFinite) : []
    );

    const ordering = await getOrCreateOrder(pool, userId, { excludeSet });
    const answered = await getAnsweredSet(pool, userId);
    const enabledIds = new Set((await fetchAllQuestions(pool, { includeDisabled: false })).map(q => q.id));

    let out = null;
    for (const qid of ordering) {
      if (!enabledIds.has(qid)) continue;
      if (answered.has(qid)) continue;
      const q = await fetchQuestionById(pool, qid);
      if (q) { out = q; break; }
    }

    if (!out) return res.status(204).send();

    res.json({
      ok: true,
      question: out,
      meta: {
        total: ordering.length,
        answered: answered.size,
        remaining: ordering.length - answered.size,
      },
    });
  } catch (e) {
    console.error("GET /api/questions/next", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// POST /api/questions/answer { id, answer }
router.post("/answer", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);
    const userId = String(req.user.id);
    const { id, answer } = req.body ?? {};
    const qid = Number(id);
    if (!Number.isFinite(qid)) return res.status(400).json({ ok: false, error: "invalid_id" });

    const q = await fetchQuestionById(pool, qid);
    if (!q) return res.status(404).json({ ok: false, error: "not_found" });
    if (q.disabled) return res.status(400).json({ ok: false, error: "question_disabled" });

    const v = validateAnswer(answer ?? "");
    if (!v.ok) return res.status(400).json({ ok: false, error: v.reason });

    await pool.query(
      `INSERT INTO responses(user_id, question_id, answer)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET answer = EXCLUDED.answer, created_at = now()`,
      [userId, qid, answer ?? ""]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/questions/answer", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// POST /api/questions/answers { answers: [{ id, answer }, ...] }
router.post("/answers", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);
    const userId = String(req.user.id);
    const batch = req.body?.answers;
    if (!Array.isArray(batch)) {
      return res.status(400).json({ ok: false, error: "answers_must_be_array" });
    }

    // validate all first
    for (const item of batch) {
      const qid = Number(item?.id);
      const ans = item?.answer ?? "";
      if (!Number.isFinite(qid)) {
        return res.status(400).json({ ok: false, error: "invalid_question_in_batch", at: item });
      }
      const q = await fetchQuestionById(pool, qid);
      if (!q)  return res.status(404).json({ ok: false, error: "not_found", at: item });
      if (q.disabled) return res.status(400).json({ ok: false, error: "question_disabled", at: item });
      const v = validateAnswer(ans);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.reason, at: item });
    }

    // bulk upsert
    const values = [];
    const params = [];
    let p = 1;
    for (const item of batch) {
      values.push(`($${p++}, $${p++}, $${p++})`);
      params.push(userId, Number(item.id), item.answer ?? "");
    }

    await pool.query(
      `INSERT INTO responses(user_id, question_id, answer)
       VALUES ${values.join(",")}
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET answer = EXCLUDED.answer, created_at = now()`,
      params
    );

    res.status(201).json({ ok: true, saved: batch.length });
  } catch (e) {
    console.error("POST /api/questions/answers", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

/* ---------- ADMIN: bulk upsert & edit/disable ---------- */

// POST /api/questions/upsert
router.post("/upsert", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);

    const list = req.body?.questions;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ ok: false, error: "questions_must_be_nonempty_array" });
    }

    const rows = [];
    for (const q of list) {
      const id = Number(q?.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid_id_in_batch", at: q });
      const text = String(q?.text ?? "").trim();
      if (!text) return res.status(400).json({ ok: false, error: "text_required", at: q });

      const existing = await fetchQuestionById(pool, id);
      const number = Number.isFinite(Number(q?.number)) ? Number(q.number) : (existing?.number ?? id);
      const disabled = typeof q?.disabled === "boolean" ? q.disabled : (existing?.disabled ?? false);

      rows.push({ id, number, text, disabled });
    }

    const values = [];
    const params = [];
    let p = 1;
    for (const r of rows) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(r.id, r.number, r.text, r.disabled);
    }

    await pool.query(
      `INSERT INTO questions(id, number, text, disabled)
       VALUES ${values.join(",")}
       ON CONFLICT (id)
       DO UPDATE SET
         number = EXCLUDED.number,
         text   = EXCLUDED.text,
         disabled = EXCLUDED.disabled`,
      params
    );

    res.status(201).json({ ok: true, upserted: rows.length });
  } catch (e) {
    console.error("POST /api/questions/upsert", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// PATCH /api/questions/:id
router.patch("/:id", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid_id" });

    const { text, number, disabled } = req.body ?? {};
    const sets = [];
    const vals = [];
    let p = 1;

    if (typeof text === "string") { sets.push(`text = $${p++}`); vals.push(text.trim()); }
    if (Number.isFinite(Number(number))) { sets.push(`number = $${p++}`); vals.push(Number(number)); }
    if (typeof disabled === "boolean") { sets.push(`disabled = $${p++}`); vals.push(disabled); }

    if (sets.length === 0) return res.status(400).json({ ok: false, error: "nothing_to_update" });

    vals.push(id);
    const { rowCount } = await pool.query(
      `UPDATE questions SET ${sets.join(", ")} WHERE id = $${p}`,
      vals
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "not_found" });

    if (typeof disabled === "boolean" && disabled === true) {
      await pool.query(`UPDATE question_orders SET ordering = array_remove(ordering, $1)`, [id]);
    }

    res.json({ ok: true, updated: id });
  } catch (e) {
    console.error("PATCH /api/questions/:id", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

export default router;
