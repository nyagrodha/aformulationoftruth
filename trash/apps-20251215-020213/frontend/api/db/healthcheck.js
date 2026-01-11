// GET /api/db/healthcheck
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    const sql = getDb();
    const rows = await sql`select 1 as ok`;
    res.status(200).json({ ok: rows[0].ok === 1 });
  } catch (e) {
    console.error('db healthcheck error', e);
    res.status(500).json({ ok: false });
  }
}
