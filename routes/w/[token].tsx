/**
 * Wearable invitation page
 *
 * GET /w/:token
 *
 * The QR on a wearable (or coffee-table) object points here. The page
 * greets the scanner in the owner's chosen voice (display_name, or the
 * site's own voice when NULL), states the reciprocity enticement when the
 * owner has elected it, and leads into the site's normal entry ritual
 * (the gate). The wearable token is planted as an HttpOnly cookie;
 * gate-submit records the encounter when the scanner leaves their email.
 *
 * Privacy: unknown tokens 404 like any other page (no oracle); the URL
 * names no one; nothing is collected here.
 *
 * Spec: docs/superpowers/specs/2026-07-25-wearable-encounters-design.md
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { withConnection } from '../../lib/db.ts';

interface WearableData {
  displayName: string | null;
  shareOwnerResponses: boolean;
}

export const handler: Handlers<WearableData> = {
  async GET(_req, ctx) {
    const token = ctx.params.token;
    // Opaque tokens are URL-safe random; anything else is a fast 404.
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      return ctx.renderNotFound();
    }

    const row = await withConnection(async (client) => {
      const result = await client.queryObject<
        { display_name: string | null; share_owner_responses: boolean }
      >(
        `SELECT display_name, share_owner_responses
           FROM fresh_wearables WHERE token = $1`,
        [token],
      );
      return result.rows[0] ?? null;
    });
    if (!row) return ctx.renderNotFound();

    const resp = await ctx.render({
      displayName: row.display_name,
      shareOwnerResponses: row.share_owner_responses,
    });
    // 24h window to complete the gate; HttpOnly -- nothing client-side
    // reads it, gate-submit consumes it server-side.
    resp.headers.append(
      'Set-Cookie',
      `wearable_token=${token}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
    );
    return resp;
  },
};

export default function WearablePage({ data }: PageProps<WearableData>) {
  const greeting = data.displayName
    ? `You have encountered ${data.displayName}.`
    : 'You have encountered a bearer of this questionnaire.';

  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta
          name='description'
          content='An apparatus for attention. Self-inquiry through the Proust Questionnaire.'
        />
        <link rel='stylesheet' href='/css/main.css' />
      </head>
      <body>
        <nav>
          <a href='/' class='logo'>A4T</a>
        </nav>

        <main>
          <section
            class='section gate-section'
            style='min-height: 100vh; display: flex; align-items: center;'
          >
            <div class='gate-content'>
              <div class='gate-icon'>&#10041;</div>

              <h2 class='gate-title'>{greeting}</h2>

              <p class='gate-description'>
                This object carries an invitation: the Proust Questionnaire, a sequence of prompts for self-inquiry.
                What you answer is yours; you choose, at the end, what to divulge &mdash; all, some, or none of it.
              </p>

              {data.shareOwnerResponses && (
                <p class='gate-description'>
                  Its bearer has chosen reciprocity: complete the questionnaire and their own responses will be opened
                  to you.
                </p>
              )}

              <a href='/' class='button button-primary'>begin</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
