/**
 * Session identities on the key box.
 *
 * Session ids arrive over the network and become filenames, so they are
 * validated before touching the filesystem: '../escape' would otherwise write
 * outside the key directory.
 *
 * Two clocks decide when a key dies, and which applies depends on whether the
 * session ever delivered. See shredExpired.
 */

const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

function keyPath(dir: string, sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id');
  return `${dir}/${sessionId}.key`;
}

function markerPath(dir: string, sessionId: string, kind: 'delivered' | 'seen'): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id');
  return `${dir}/${sessionId}.${kind}`;
}

export async function storeIdentity(dir: string, sessionId: string, identity: string): Promise<void> {
  const path = keyPath(dir, sessionId);
  await Deno.writeTextFile(path, identity, { mode: 0o600 });
  // umask can weaken the create mode; be explicit.
  await Deno.chmod(path, 0o600);
}

export async function loadIdentity(dir: string, sessionId: string): Promise<string> {
  return (await Deno.readTextFile(keyPath(dir, sessionId))).trim();
}

/**
 * Unlink an identity.
 *
 * This is NOT secure erasure. Deno.remove unlinks; on a journaling filesystem
 * or an SSD with wear levelling the bytes can survive in ways no userspace
 * call reaches. The guarantee comes from WHERE the keys live -- a tmpfs mount,
 * per the deployment notes -- so the pages are freed to RAM and never written
 * to persistent storage. If anyone moves the key directory off tmpfs, this
 * call quietly stops meaning what the design claims.
 */
export async function shredIdentity(dir: string, sessionId: string): Promise<void> {
  await Deno.remove(keyPath(dir, sessionId)).catch(() => {});
  for (const kind of ['delivered', 'seen'] as const) {
    await Deno.remove(markerPath(dir, sessionId, kind)).catch(() => {});
  }
}

/**
 * Record the first successful delivery.
 *
 * Write-once: the post-delivery clock runs from the FIRST send and must not
 * extend, or a respondent re-sending every few days keeps a private key alive
 * indefinitely -- the long-lived-key risk per-session keys exist to avoid.
 */
export async function markDelivered(dir: string, sessionId: string, at: Date): Promise<void> {
  try {
    await Deno.writeTextFile(markerPath(dir, sessionId, 'delivered'), at.toISOString(), {
      mode: 0o600,
      createNew: true,
    });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}

/**
 * Record that the respondent is still working on this questionnaire.
 *
 * Unlike markDelivered, this is deliberately rewritten on every visit. Someone
 * who answers a few questions, closes the tab and returns three weeks later is
 * not abandoning anything, and their key must not be collected out from under
 * them mid-questionnaire. The absolute ceiling therefore runs from LAST
 * ACTIVITY, not from when the key was minted.
 */
export async function touchActivity(dir: string, sessionId: string, at: Date): Promise<void> {
  await Deno.writeTextFile(markerPath(dir, sessionId, 'seen'), at.toISOString(), { mode: 0o600 });
}

export interface ShredPolicy {
  /** Days after first successful delivery. */
  afterDelivery: number;
  /** Days after last activity, for a session that never delivered. */
  absolute: number;
}

async function readStamp(path: string): Promise<number | null> {
  try {
    const t = new Date((await Deno.readTextFile(path)).trim()).getTime();
    // An unparseable stamp yields NaN, and every comparison against NaN is
    // false -- a key would then never expire. Treat it as absent instead.
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Destroy identities past their deadline. Returns how many were removed.
 *
 * Delivered keys die `afterDelivery` days after the delivery marker.
 * Undelivered keys die `absolute` days after the last sign of life -- the
 * activity marker if there is one, otherwise the key file's own mtime.
 */
export async function shredExpired(dir: string, now: Date, policy: ShredPolicy): Promise<number> {
  const DAY = 86_400_000;
  let removed = 0;

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith('.key')) continue;
    const sessionId = entry.name.slice(0, -'.key'.length);
    if (!SESSION_ID.test(sessionId)) continue;

    const info = await Deno.stat(`${dir}/${entry.name}`);
    const lastSeen = await readStamp(markerPath(dir, sessionId, 'seen'));
    const born = info.mtime?.getTime() ?? 0;

    // The ceiling always applies, measured from the most recent sign of life.
    let deadline = (lastSeen ?? born) + policy.absolute * DAY;

    const delivered = await readStamp(markerPath(dir, sessionId, 'delivered'));
    if (delivered !== null) {
      // Whichever comes first: delivery starts a shorter, fixed clock.
      deadline = Math.min(deadline, delivered + policy.afterDelivery * DAY);
    }

    if (now.getTime() >= deadline) {
      await shredIdentity(dir, sessionId);
      removed++;
    }
  }
  return removed;
}
