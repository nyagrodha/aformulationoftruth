/**
 * Mesh ⇄ Proust bridge — the pure rules.
 *
 * The bridge (ddwaterfall on logwood) asks one Proust question a day on the
 * Meshtastic LongFast channel and posts back what it hears. Everything here
 * is decided without the database, so it is tested without one: which
 * question comes next, what an acceptable answer looks like, and whether a
 * caller holds the bridge token.
 *
 * Mesh answers are PUBLIC BY DESIGN — they were broadcast in plaintext over
 * the air and are shown on /mesh. They never touch gate_encrypted_answers.
 *
 * Spec: ddwaterfall/docs/superpowers/specs/2026-09-25-mesh-proust-bridge-design.md
 */

import { timingSafeEqual } from '$std/crypto/timing_safe_equal.ts';
import { getQuestionById } from './questions_dakshinaparvanuvadam.ts';

/** Q0-1 are the site's gate questions; the mesh cycle skips them. */
export const FIRST_INDEX = 2;
export const LAST_INDEX = 34;
export const MAX_TEXT_BYTES = 240;
export const MAX_SHORT_NAME = 8;
export const MAX_PER_NODE_PER_QUESTION = 3;
export const MAX_PER_DAY = 60;
export const FROM_ID = /^![0-9a-f]{8}$/;

export function nextIndex(last: number | null): number {
  if (last === null || last < FIRST_INDEX || last >= LAST_INDEX) return FIRST_INDEX;
  return last + 1;
}

export function questionText(index: number): string | null {
  if (!Number.isInteger(index) || index < FIRST_INDEX || index > LAST_INDEX) return null;
  return getQuestionById(index)?.english ?? null;
}

// C0, DEL and C1 controls become spaces. Bidi embeddings/overrides/isolates and
// directional marks are removed outright: on a public page one of them can
// visually reorder the answers around it.
// deno-lint-ignore no-control-regex -- matching control characters is the point
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

export function cleanText(raw: string, maxBytes: number): string {
  const tidy = raw.replace(BIDI, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
  const enc = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const ch of tidy) { // iterates code points, so a cut never splits one
    const n = enc.encode(ch).length;
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return out.trimEnd();
}

export function cleanShortName(raw: string): string {
  return [...cleanText(raw, 64)].slice(0, MAX_SHORT_NAME).join('').trim();
}

export interface AnswerInput {
  question_index: number;
  packet_id: number;
  from_id: string;
  short_name: string;
  text: string;
  via: 'reply' | 'dm';
  rx_at: Date;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function meshIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= FIRST_INDEX && v <= LAST_INDEX;
}

/** Meshtastic packet ids are nonzero uint32. */
function packetId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0xffffffff;
}

export function validateAnswer(body: unknown): Checked<AnswerInput> {
  if (!isRecord(body)) return { ok: false, error: 'body' };
  const { question_index, packet_id, from_id, short_name, text, via, rx_time } = body;
  if (!meshIndex(question_index)) return { ok: false, error: 'question_index' };
  if (!packetId(packet_id)) return { ok: false, error: 'packet_id' };
  if (typeof from_id !== 'string' || !FROM_ID.test(from_id)) return { ok: false, error: 'from_id' };
  const name = typeof short_name === 'string' ? cleanShortName(short_name) : '';
  if (!name) return { ok: false, error: 'short_name' };
  const clean = typeof text === 'string' ? cleanText(text, MAX_TEXT_BYTES) : '';
  if (!clean) return { ok: false, error: 'text' };
  if (via !== 'reply' && via !== 'dm') return { ok: false, error: 'via' };
  if (typeof rx_time !== 'number' || !Number.isFinite(rx_time) || rx_time <= 0) {
    return { ok: false, error: 'rx_time' };
  }
  return {
    ok: true,
    value: { question_index, packet_id, from_id, short_name: name, text: clean, via, rx_at: new Date(rx_time * 1000) },
  };
}

export function validateSent(body: unknown): Checked<{ question_index: number; packet_id: number }> {
  if (!isRecord(body)) return { ok: false, error: 'body' };
  const { question_index, packet_id } = body;
  if (!meshIndex(question_index)) return { ok: false, error: 'question_index' };
  if (!packetId(packet_id)) return { ok: false, error: 'packet_id' };
  return { ok: true, value: { question_index, packet_id } };
}

export function validateForget(body: unknown): Checked<{ from_id: string }> {
  if (!isRecord(body) || typeof body.from_id !== 'string' || !FROM_ID.test(body.from_id)) {
    return { ok: false, error: 'from_id' };
  }
  return { ok: true, value: { from_id: body.from_id } };
}

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

/** Constant-time and length-safe, as in routes/api/responses/delivered.ts. */
function tokenMatches(presented: string, configured: string): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(configured);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/** null = allowed. An unset token fails closed: it must not mean "anyone may write". */
export function bridgeAuth(req: Request, configured: string | undefined): Response | null {
  if (!configured) {
    console.error('[mesh] MESH_BRIDGE_TOKEN not set; refusing');
    return json({ ok: false }, 503);
  }
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || !tokenMatches(header.slice(7), configured)) {
    return json({ ok: false }, 401);
  }
  return null;
}
