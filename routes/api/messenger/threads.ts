/**
 * The caller's threads, and the messages in one of them.
 *
 * GET /api/messenger/threads              -> every thread, newest first
 * GET /api/messenger/threads?id=&after=   -> messages in one thread past a cursor
 *
 * `after` is the polling cursor. The client holds the highest id it has seen and
 * asks for what came after; an offset would re-send the thread every tick and
 * would skip anything inserted between two polls.
 *
 * Every response carries ciphertext. Nothing here can read a message, and the
 * public key of each correspondent rides along so the browser can open what it
 * receives without a second round trip per thread.
 */

import { Handlers } from '$fresh/server.ts';
import { increment } from '../../../lib/metrics.ts';
import { isRefusal, json, requireProvenCaller } from '../../../lib/api-auth.ts';
import { getProfilesFor, profileLabel } from '../../../lib/profiles.ts';
import { getPublicKeysFor, isParticipant, listMessages, listThreads, markRead } from '../../../lib/messenger.ts';

export const handler: Handlers = {
  async GET(req, _ctx) {
    increment('requests.api');

    const caller = await requireProvenCaller(req);
    if (isRefusal(caller)) return caller;

    const params = new URL(req.url).searchParams;
    const threadId = params.get('id');

    /* ------------------------------------------------ one thread's messages */
    if (threadId) {
      /*
       * Participation is checked before anything is read. Without it a thread id
       * -- a UUID, but one that appears in the other party's browser -- would be
       * a bearer token for someone else's conversation.
       */
      if (!await isParticipant(threadId, caller.emailHash)) {
        increment('messenger.denied.not_participant');
        return json({ error: 'No such conversation.' }, 404, caller);
      }

      const afterRaw = params.get('after');
      const after = afterRaw && /^\d+$/.test(afterRaw) ? Number(afterRaw) : 0;

      const messages = await listMessages(threadId, { after });

      /*
       * Mark read only on a full read, never on a poll. A poll that marks read
       * clears the other party's unread badge for messages nobody has looked at.
       */
      if (!afterRaw) await markRead(threadId, caller.emailHash);

      return json(
        {
          messages: messages.map((m) => ({
            id: m.id,
            mine: m.senderEmailHash === caller.emailHash,
            ciphertext: m.ciphertext,
            iv: m.iv,
            createdAt: m.createdAt.toISOString(),
          })),
        },
        200,
        caller,
      );
    }

    /* ----------------------------------------------------------- every thread */
    const threads = await listThreads(caller.emailHash);
    if (threads.length === 0) return json({ threads: [] }, 200, caller);

    const others = threads.map((t) => t.otherEmailHash);
    const [profiles, publicKeys] = await Promise.all([
      getProfilesFor(others),
      getPublicKeysFor(others),
    ]);

    /*
     * The correspondent's public key travels with the thread. Both halves of a
     * conversation are sealed under the one shared secret, so the browser needs
     * it to open their messages AND to re-open its own -- otherwise a sender
     * cannot read what they themselves sent.
     */
    const withKeys = threads.map((t) => {
      const profile = profiles.get(t.otherEmailHash);
      return {
        id: t.id,
        label: profileLabel(profile),
        handle: profile?.handle ?? null,
        unread: t.unread,
        lastMessageAt: t.lastMessageAt.toISOString(),
        publicKey: publicKeys.get(t.otherEmailHash) ?? null,
      };
    });

    return json({ threads: withKeys }, 200, caller);
  },
};
