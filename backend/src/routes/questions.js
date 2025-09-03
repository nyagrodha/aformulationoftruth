// backend/src/routes/questions.js
import { Router } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool as importedPool } from "../db.js";

const { JWT_SECRET, COOKIE_NAME = "a4m_sesh" } = process.env;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from environment variables");
}

/**
 * Retrieves the database pool from request-local context or a direct import.
 * @param {import("express").Request} req - The Express request object.
 * @returns {import("pg").Pool | null} The PostgreSQL pool instance.
 */
function getPool(req) {
  return req?.app?.locals?.pool || importedPool || null;
}

/**
 * Middleware to require authentication via JWT from a Bearer token or a cookie.
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @param {import("express").NextFunction} next - The Express next middleware function.
 */
function requireAuth(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const token = bearer || req.cookies?.[COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

const router = Router();
router.use(requireAuth);

// --- Schema and Database Helpers ---

/**
 * Ensures all required database tables exist, creating them if necessary.
 * @param {import("pg").Pool} pool - The PostgreSQL pool instance.
 */
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      user_id     TEXT NOT NULL,
      question_id INT  NOT NULL,
      answer      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, question_id)
    );
  `);
}

/**
 * Creates a deterministic shuffle function seeded by the user's ID.
 * This ensures the question order is the same for a user across sessions.
 * @param {string} userId - The user's ID.
 * @returns {(arr: any[]) => any[]} A function that shuffles an array.
 */
function seededShuffle(userId) {
  const seed = crypto.createHmac("sha256", "a4m:proust:v1").update(String(userId)).digest();
  let i = 0;
  const nextByte = () => seed[(i++) % seed.length];
  const rand = () => (((nextByte() << 8) | nextByte()) / 65535);

  return (arr) => {
    const a = [...arr]; // Create a shallow copy to avoid modifying the original
    for (let j = a.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [a[j], a[k]] = [a[k], a[j]];
    }
    return a;
  };
}

/**
 * Fetches all questions from the database.
 * @param {import("pg").Pool} pool - The PostgreSQL pool instance.
 * @param {{includeDisabled?: boolean}} [options] - Options to include disabled questions.
 * @returns {Promise<any[]>} A list of questions.
 */
async function fetchAllQuestions(pool, { includeDisabled = false } = {}) {
  const sql = `
    SELECT id, number, text, disabled FROM questions
    ${includeDisabled ? "" : "WHERE NOT disabled"}
    ORDER BY number ASC
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

/**
 * Fetches a single question by its ID.
 * @param {import("pg").Pool} pool - The PostgreSQL pool instance.
 * @param {number} id - The question ID.
 * @returns {Promise<any|null>} The question object or null if not found.
 */
async function fetchQuestionById(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, number, text, disabled FROM questions WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Gets the set of question IDs a user has already answered.
 * @param {import("pg").Pool} pool - The PostgreSQL pool instance.
 * @param {string} userId - The user's ID.
 * @returns {Promise<Set<number>>} A set of answered question IDs.
 */
async function getAnsweredSet(pool, userId) {
  const { rows } = await pool.query(
    `SELECT question_id FROM responses WHERE user_id = $1`,
    [userId]
  );
  return new Set(rows.map(r => r.question_id));
}

/**
 * Generates a new, shuffled question order for a user.
 * @param {any[]} enabledRows - Array of enabled question objects.
 * @param {string} userId - The user's ID.
 * @returns {number[]} An array of question IDs in a specific order.
 */
function buildOrderFromEnabled(enabledRows, userId) {
  const byId = new Map(enabledRows.map(r => [r.id, r]));
  const has = (id) => byId.has(id);
  const shuffle = seededShuffle(userId);
  
  // Define fixed start/end questions and shuffle the middle ones
  const head = [1, 2].filter(has);
  const mids = Array.from({ length: 30 }, (_, k) => k + 3).filter(has); // IDs 3 to 32
  const tail = [33, 34, 35].filter(has);
  
  return [...head, ...shuffle(mids), ...tail];
}

/**
 * Retrieves a user's question order, creating it if it doesn't exist.
 * @param {import("pg").Pool} pool - The PostgreSQL pool instance.
 * @param {string} userId - The user's ID.
 * @returns {Promise<number[]>} An array of question IDs.
 */
async function getOrCreateOrder(pool, userId) {
  const { rows } = await pool.query(
    `SELECT ordering FROM question_orders WHERE user_id = $1`,
    [userId]
  );

  const enabled = await fetchAllQuestions(pool, { includeDisabled: false });
  
  if (rows[0]?.ordering) {
    const enabledIds = new Set(enabled.map(q => q.id));
    const filtered = rows[0].ordering.filter(id => enabledIds.has(id));
    return filtered;
  }
  
  const newOrdering = buildOrderFromEnabled(enabled, userId);
  await pool.query(
    `INSERT INTO question_orders(user_id, ordering) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET ordering = $2`,
    [userId, newOrdering]
  );
  return newOrdering;
}

// --- Answer Validation Helpers ---

const isBlank = (s = "") => s.trim().length === 0;
const isNumbersOnly = (s = "") => /^[0-9]+$/.test(s.trim());
const isSingleCharRepeat = (s = "") => s.trim().length >= 2 && /^([A-Za-z0-9])\1+$/.test(s.trim());

function validateAnswer(text) {
  if (isBlank(text)) return { ok: true }; // Blank answers are allowed
  if (isNumbersOnly(text)) return { ok: false, reason: "numbers_only" };
  if (isSingleCharRepeat(text)) return { ok: false, reason: "single_char_repeat" };
  return { ok: true };
}


// --- Routes ---

/**
 * GET /api/questions/next
 * Fetches the next unanswered question for the authenticated user.
 */
router.get("/next", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    await ensureSchema(pool);
    const userId = String(req.user.id);

    const [ordering, answered] = await Promise.all([
      getOrCreateOrder(pool, userId),
      getAnsweredSet(pool, userId),
    ]);
    
    let nextQuestion = null;
    for (const qid of ordering) {
      if (!answered.has(qid)) {
        const q = await fetchQuestionById(pool, qid);
        if (q && !q.disabled) {
          nextQuestion = q;
          break;
        }
      }
    }

    if (!nextQuestion) {
      return res.status(204).send(); // No content, questionnaire is complete
    }

    res.json({
      ok: true,
      question: nextQuestion,
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

/**
 * POST /api/questions/answer
 * Submits or updates an answer for a single question.
 */
router.post("/answer", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });

    const userId = String(req.user.id);
    const { id, answer } = req.body ?? {};
    const qid = Number(id);

    if (!Number.isFinite(qid)) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    const q = await fetchQuestionById(pool, qid);
    if (!q) return res.status(404).json({ ok: false, error: "not_found" });
    if (q.disabled) return res.status(400).json({ ok: false, error: "question_disabled" });

    const validation = validateAnswer(answer ?? "");
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.reason });
    }

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


// --- Admin Routes (Assumed admin check happens in a higher-level router) ---

/**
 * POST /api/questions/upsert
 * Admin route to bulk insert or update questions.
 */
router.post("/upsert", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });
    await ensureSchema(pool);
    const list = req.body?.questions;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ ok: false, error: "questions_must_be_nonempty_array" });
    }

    // Begin a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const queryText = `
        INSERT INTO questions(id, number, text, disabled)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          number = EXCLUDED.number,
          text = EXCLUDED.text,
          disabled = EXCLUDED.disabled`;

      for (const q of list) {
        const id = Number(q?.id);
        const number = Number(q?.number ?? id);
        const text = String(q?.text ?? "").trim();
        const disabled = typeof q?.disabled === "boolean" ? q.disabled : false;
        
        if (!Number.isFinite(id) || !text) {
            throw new Error('invalid_item_in_batch');
        }
        await client.query(queryText, [id, number, text, disabled]);
      }
      await client.query('COMMIT');
      res.status(201).json({ ok: true, upserted: list.length });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.message === 'invalid_item_in_batch') {
        return res.status(400).json({ ok: false, error: 'invalid_item_in_batch' });
      }
      throw e; // Re-throw for outer catch block
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("POST /api/questions/upsert", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

/**
 * PATCH /api/questions/:id
 * Admin route to partially update a single question.
 */
router.patch("/:id", async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: "DB not initialized" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    const { text, number, disabled } = req.body ?? {};
    const sets = [];
    const vals = [];
    let p = 1;

    if (typeof text === "string" && text.trim()) { sets.push(`text = $${p++}`); vals.push(text.trim()); }
    if (Number.isFinite(Number(number))) { sets.push(`number = $${p++}`); vals.push(Number(number)); }
    if (typeof disabled === "boolean") { sets.push(`disabled = $${p++}`); vals.push(disabled); }
    if (sets.length === 0) {
      return res.status(400).json({ ok: false, error: "nothing_to_update" });
    }

    vals.push(id);
    const { rowCount } = await pool.query(
      `UPDATE questions SET ${sets.join(", ")} WHERE id = $${p}`,
      vals
    );

    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    res.json({ ok: true, updated: id });
  } catch (e) {
    console.error("PATCH /api/questions/:id", e?.stack || e);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

export default router;
