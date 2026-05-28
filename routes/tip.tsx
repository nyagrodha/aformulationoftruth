/**
 * /tip — Monero tip jar.
 *
 * On GET:
 *   1. Look up the visitor's `xmr_tip_id` cookie. If a row already exists
 *      in `xmr_tip_assignments`, return that subaddress (so refreshes do
 *      NOT burn fresh addresses).
 *   2. Otherwise, call monero-wallet-rpc.create_address through Tor, store
 *      the result keyed by a fresh opaque cookie, and render it.
 *
 * Form-encoded only. No JS required to display or copy.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { withConnection } from '../lib/db.ts';
import { createSubaddress } from '../lib/monero-rpc.ts';

interface TipData {
  address: string;
  addressIndex: number;
  isFresh: boolean;
  error?: string;
}

function getCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function newCookieId(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const handler: Handlers<TipData> = {
  async GET(req, ctx) {
    const cookieHeader = req.headers.get('cookie');
    let cookieId = getCookie(cookieHeader, 'xmr_tip_id');
    const setCookieHeaders = new Headers();

    // 1. Existing assignment? Touch last_seen_at and return.
    if (cookieId) {
      const existing = await withConnection(async (client) => {
        const { rows } = await client.queryObject<{
          address: string;
          address_index: number;
        }>(
          `UPDATE xmr_tip_assignments
              SET last_seen_at = NOW()
            WHERE cookie_id = $1
        RETURNING address, address_index`,
          [cookieId],
        );
        return rows[0];
      });
      if (existing) {
        return ctx.render({
          address: existing.address,
          addressIndex: existing.address_index,
          isFresh: false,
        });
      }
      // Stale cookie pointing at no row — fall through and re-mint.
      cookieId = null;
    }

    // 2. Mint a fresh cookie + subaddress.
    cookieId = newCookieId();
    let address: string;
    let addressIndex: number;
    try {
      const minted = await createSubaddress(
        `a4t-tip-${new Date().toISOString().slice(0, 10)}-${cookieId.slice(0, 8)}`,
      );
      address = minted.address;
      addressIndex = minted.address_index;
    } catch (err) {
      console.error('[tip] create_address failed:', err);
      return ctx.render({
        address: '',
        addressIndex: 0,
        isFresh: false,
        error: 'Tip jar is temporarily offline. Please try again in a few minutes.',
      });
    }

    const accountIndex = Number(Deno.env.get('MONERO_ACCOUNT_INDEX') || '0');
    await withConnection(async (client) => {
      await client.queryObject(
        `INSERT INTO xmr_tip_assignments
            (cookie_id, address, address_index, account_index, label)
         VALUES ($1, $2, $3, $4, $5)`,
        [cookieId, address, addressIndex, accountIndex, `a4t-tip-${cookieId!.slice(0, 8)}`],
      );
    });

    // 90-day sticky cookie
    setCookieHeaders.append(
      'Set-Cookie',
      `xmr_tip_id=${cookieId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 90}; Secure`,
    );

    return ctx.render(
      { address, addressIndex, isFresh: true },
      { headers: setCookieHeaders },
    );
  },
};

export default function Tip({ data }: PageProps<TipData>) {
  const { address, addressIndex, isFresh, error } = data;
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
        <title>tip jar — a formulation of truth</title>
        <link rel="stylesheet" href="/css/main.css" />
        <link rel="stylesheet" href="/css/landing.css" />
        <link rel="stylesheet" href="/css/tip.css" />
      </head>
      <body class="landing">
        <nav>
          <a href="/" class="logo">A4T</a>
          <div class="nav-links">
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
          </div>
        </nav>

        <main>
          <section class="hero landing-hero">
            <div class="hero-content">
              <div class="at-symbol" aria-hidden="true">@</div>
              <h1 class="title">
                tip jar
                <span class="title-truth">XMR</span>
              </h1>
              <p class="icelandic-subtitle">
                A fresh Monero subaddress, just for you.
              </p>
            </div>
          </section>

          <section class="section">
            <div class="section-inner tip-card">
              {error
                ? (
                  <div class="status-message error show" role="alert">
                    {error}
                  </div>
                )
                : (
                  <>
                    <p class="tip-helper">
                      Send any amount of XMR to the address below. Each
                      visitor gets their own subaddress so tips are
                      unlinkable on-chain. The address is sticky for 90
                      days — refresh away.
                    </p>
                    <p class="tip-addr-wrap">
                      <code class="tip-addr" tabIndex={0}>{address}</code>
                    </p>
                    <p class="tip-meta">
                      Account {Deno.env.get('MONERO_ACCOUNT_INDEX') || '0'},{' '}
                      subaddress index {addressIndex}
                      {isFresh ? ' (newly minted)' : ' (resumed)'}
                    </p>
                    <p class="tip-helper" style="opacity:0.7;">
                      Tap-hold or triple-click the address to select it,
                      then copy. The address is bound to a wallet running
                      on the operator's own node — no third-party
                      processor in the path.
                    </p>
                  </>
                )}
              <p style="margin-top:2rem;">
                <a href="/" class="cta">Back</a>
              </p>
            </div>
          </section>
        </main>

        <footer>
          <div class="footer-inner">
            <div class="footer-links">
              <a href="/about.html">About</a>
              <a href="/contact.html">Contact</a>
              <a href="/privacy.html">Privacy</a>
            </div>
            <p class="footer-copy">
              Encrypted database hosted in Iceland by{' '}
              <a
                href="https://fobdongle.com"
                target="_blank"
                rel="noopener noreferrer"
                style="color: var(--neon-emerald); text-decoration: none;"
              >
                FlokiNET
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
