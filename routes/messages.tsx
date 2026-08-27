/**
 * The messenger.
 *
 * Server-rendered shell, hydrated by /js/messages.js. It renders nothing that
 * depends on a key, because the key is not the server's to have -- the thread
 * list, the conversation and the composer all fill in after the browser unlocks
 * an identity.
 *
 * The page is gated on a proven address (via === 'link'). Someone who typed an
 * address at the gate but never opened what was mailed to it can reach the site
 * but not this: messaging attributes what you write to an identity, in front of
 * another person, and a merely-typed address proves nobody.
 */

import { Head } from '$fresh/runtime.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
import { authenticateRequest, isAuthenticated, jwtCookie } from '../lib/session-auth.ts';
import { increment } from '../lib/metrics.ts';
import { getIdentity } from '../lib/messenger.ts';

interface Data {
  /** Whether a keystore row exists, so the page opens on the right step. */
  hasIdentity: boolean;
}

export const handler: Handlers<Data> = {
  async GET(req, ctx) {
    const proof = await authenticateRequest(req);

    if (!isAuthenticated(proof)) {
      increment('messenger.page.unauthenticated');
      return new Response(null, { status: 302, headers: { Location: '/#begin' } });
    }

    if (proof.via !== 'link') {
      increment('messenger.page.unproven');
      return new Response(null, { status: 302, headers: { Location: '/check-email' } });
    }

    const identity = await getIdentity(proof.session.emailHash);
    const res = await ctx.render({ hasIdentity: Boolean(identity) });

    // authenticateRequest mints this when only the resume token was presented.
    // Unset here and the next request pays the same round trip again.
    if (proof.refreshedJwt) res.headers.append('Set-Cookie', jwtCookie(proof.refreshedJwt));
    return res;
  },
};

export default function MessagesPage({ data }: PageProps<Data>) {
  return (
    <>
      <Head>
        <title>messages · a formulation of truth</title>
        <meta name='description' content='Sealed messages between profiles.' />
        <link rel='stylesheet' href='/css/tool.css' />
      </Head>
      <main class='wide' data-has-identity={data.hasIdentity ? 'true' : 'false'}>
        <a class='pill' href='/people'>← people</a>
        <p class='eyebrow'>client side · ECDH P-256 · no server plaintext</p>
        <h1>messages</h1>

        {/* ---------------------------------------------------- first run */}
        <section class='panel' id='setup' hidden={data.hasIdentity}>
          <h2>set up messaging</h2>
          <p class='lede'>
            Choose a passphrase. It never leaves this browser: your private key is encrypted with it before
            anything is stored, so nobody here can read your messages — and nobody here can recover them if
            you forget it.
          </p>
          <label for='new-passphrase'>passphrase</label>
          <input id='new-passphrase' type='password' autocomplete='new-password' />
          <label for='confirm-passphrase'>passphrase again</label>
          <input id='confirm-passphrase' type='password' autocomplete='new-password' />
          <button id='create' type='button'>create my identity</button>
          <p class='status' id='setup-status' role='status' aria-live='polite'></p>
        </section>

        {/* ------------------------------------------------------- unlock */}
        <section class='panel' id='unlock' hidden={!data.hasIdentity}>
          <h2>unlock</h2>
          <p class='lede'>
            Your key is unwrapped here and held in memory for this tab only. Closing it locks again.
          </p>
          <label for='unlock-passphrase'>passphrase</label>
          <input id='unlock-passphrase' type='password' autocomplete='current-password' />
          <button id='unlock-btn' type='button'>unlock</button>
          <p class='status' id='unlock-status' role='status' aria-live='polite'></p>
        </section>

        {/* --------------------------------------------------- the app */}
        <div class='messenger' id='app' hidden>
          <section class='panel thread-list' id='threads' aria-label='Conversations'>
            <p class='empty' id='threads-empty'>No conversations yet.</p>
          </section>

          <section class='panel convo' id='convo' aria-label='Conversation'>
            <p class='empty' id='convo-empty'>Choose a conversation.</p>

            <div class='log' id='log' role='log' aria-live='polite' aria-label='Messages' hidden></div>

            <div class='composer' id='composer' hidden>
              <label for='reply'>reply</label>
              <textarea id='reply' placeholder='sealed before it leaves this page'></textarea>
              <button id='send-reply' type='button'>send</button>
              <p class='status' id='convo-status' role='status' aria-live='polite'></p>
            </div>
          </section>
        </div>
      </main>
      <script type='module' src='/js/messages.js'></script>
    </>
  );
}
