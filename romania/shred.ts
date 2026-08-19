/**
 * Entry point for the shred timer. Keeps the policy in one place rather than
 * spelling it out in a systemd ExecStart, where nobody would find it.
 */

import { shredExpired } from './keystore.ts';

const KEY_DIR = Deno.env.get('KEYBOX_KEY_DIR') || '/home/liar/keybox';
const POLICY = {
  afterDelivery: parseInt(Deno.env.get('SHRED_AFTER_DELIVERY_DAYS') || '7', 10),
  absolute: parseInt(Deno.env.get('SHRED_ABSOLUTE_DAYS') || '30', 10),
};

const removed = await shredExpired(KEY_DIR, new Date(), POLICY);
// A count is safe to log; a session id would not be.
console.log(`[shred] removed ${removed} expired identit${removed === 1 ? 'y' : 'ies'}`);
