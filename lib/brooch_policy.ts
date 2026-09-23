/**
 * When a brooch encounter code is honoured. Pure.
 *
 * No look-ahead bound: the brooch mints a counter for every QR it shows, scanned
 * or not (~1,200/day when auto-cycling), so any fixed bound would eventually
 * lock out an unscanned brooch. Forgery is stopped by the MAC, not by a bound.
 */
export const GRACE_MS = 15 * 60 * 1000;

export type Decision = 'new' | 'grace' | 'reject';

export function decideEncounter(
  i: { counter: number; lastCounter: number; firstSeen: Date | null; now: Date },
): Decision {
  if (i.firstSeen) return i.now.getTime() - i.firstSeen.getTime() <= GRACE_MS ? 'grace' : 'reject';
  return i.counter > i.lastCounter ? 'new' : 'reject';
}

export type CodeState = 'fresh' | 'redeemed' | 'stale';

export function codeState(i: { counter: number; lastCounter: number; exists: boolean }): CodeState {
  if (i.exists) return 'redeemed';
  return i.counter > i.lastCounter ? 'fresh' : 'stale';
}
