/**
 * What /w/:token and /e/:code share: the wearable lookup and the cookies that
 * carry an arrival through to gate-submit.
 */
import { withConnection as realWithConnection } from './db.ts';

export interface WearableData {
  displayName: string | null;
  shareOwnerResponses: boolean;
}

export const dbForTesting: { withConnection?: typeof realWithConnection } = {};
const withConnection: typeof realWithConnection = (h) => (dbForTesting.withConnection ?? realWithConnection)(h);

export async function loadWearable(token: string): Promise<WearableData | null> {
  return await withConnection(async (client) => {
    const result = await client.queryObject<{ display_name: string | null; share_owner_responses: boolean }>(
      `SELECT display_name, share_owner_responses FROM fresh_wearables WHERE token = $1`,
      [token],
    );
    const row = result.rows[0];
    return row ? { displayName: row.display_name, shareOwnerResponses: row.share_owner_responses } : null;
  });
}

/** 24h window to complete the gate; HttpOnly -- only gate-submit reads it. Unchanged from /w/. */
export function wearableCookie(token: string): string {
  return `wearable_token=${token}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`;
}

/** The encounter ID (SHA-256 hex of the code). Secure except on a plain-HTTP dev server. */
export function encounterCookie(codeHash: string): string {
  const secure = (Deno.env.get('BASE_URL') ?? '').startsWith('https:') ? '; Secure' : '';
  return `encounter=${codeHash}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${secure}`;
}

export function encounterFromCookie(header: string | null): string | null {
  const m = (header ?? '').match(/(?:^|;\s*)encounter=([0-9a-f]{64})(?:;|$)/);
  return m ? m[1] : null;
}
