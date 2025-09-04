// scripts/seed-questions.mjs
// Usage:
//   node scripts/seed-questions.mjs --file data/Questions.json
//   node scripts/seed-questions.mjs --file scripts/Questions.json   (JSONC OK)
//   node scripts/seed-questions.mjs --file scripts/questions.mjs    (export default [...])

import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

function argVal(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const fileArg = argVal('--file');
const defaultUrl = new URL('../data/Questions.json', import.meta.url);
const inputPath = fileArg ?? defaultUrl;

const pool = new Pool(); // uses DATABASE_URL or PG* vars (+ PGPASSFILE)

async function loadQuestions(p) {
  const ext = extname(String(p)).toLowerCase();
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const mod = await import(pathToFileURL(resolve(String(p))).href);
    const data = mod.default ?? mod.questions ?? mod.data ?? mod;
    if (!Array.isArray(data)) throw new Error('Module did not export an array');
    return data;
  }
  let s = await readFile(p, 'utf8');

  // Strip /* block */ and // line comments (tries not to nuke "http://")
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');

  // Remove trailing commas before ] or }
  s = s.replace(/,\s*([\]}])/g, '$1');

  const data = JSON.parse(s);
  if (!Array.isArray(data)) throw new Error('Questions JSON must be an array');
  return data;
}

const DDL = `
CREATE TABLE IF NOT EXISTS public.questions (
  id   integer PRIMARY KEY,
  text text NOT NULL
);
`;

async function main() {
  const data = await loadQuestions(inputPath);
  for (const [i, q] of data.entries()) {
    if (typeof q?.id !== 'number' || typeof q?.text !== 'string') {
      throw new Error(`Bad item at index ${i}: expected { id:number, text:string }`);
    }
  }

  await pool.query(DDL);
  await pool.query('BEGIN');
  try {
    for (const q of data) {
      await pool.query(
        `INSERT INTO public.questions (id, text)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text`,
        [q.id, q.text]
      );
    }
    await pool.query('COMMIT');
    console.log(`Seeded ${data.length} question(s) from ${basename(String(inputPath))}`);
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

main()
  .catch((err) => {
    console.error('[seed-questions] ERROR:', err.stack || err);
    process.exit(1);
  })
  .finally(() => pool.end());
