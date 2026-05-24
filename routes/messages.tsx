/**
 * Authenticated Messaging Page
 *
 * GET /messages
 *
 * Requires the jwt cookie set by /auth/verify. Renders a server-side form
 * that posts to /api/messages. The user's identity is derived from the JWT
 * on submission, so the form does not collect an email.
 *
 * This page is the groundwork for user-to-user encrypted messaging. Today
 * every message routes to the operator's age recipient; the recipient
 * column already exists and will be surfaced once per-user keypairs ship.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { verifyQuestionnaireJWT } from '../lib/jwt.ts';
import { increment } from '../lib/metrics.ts';

interface MessagesData {
  authenticated: true;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<MessagesData> = {
  async GET(req, ctx) {
    increment('requests.api');

    const jwtToken = getCookie(req.headers.get('Cookie'), 'jwt');
    if (!jwtToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const payload = await verifyQuestionnaireJWT(jwtToken);
    if (!payload) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    return ctx.render({ authenticated: true });
  },
};

export default function MessagesPage(_props: PageProps<MessagesData>) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>messages · a formulation of truth</title>
        <meta name='description' content='Send an age-encrypted message.' />
        <link rel='stylesheet' href='/css/main.css' />
      </head>
      <body>
        <nav>
          <a href='/' class='logo'>A4T</a>
          <div class='nav-links'>
            <a href='/about.html'>About</a>
            <a href='/contact.html'>Contact</a>
          </div>
        </nav>

        <main>
          <section
            class='section gate-section'
            style='min-height: 100vh; display: flex; align-items: center;'
          >
            <div class='gate-content'>
              <div class='gate-icon'>✉</div>

              <h2 class='gate-title'>send a message</h2>

              <p class='gate-description'>
                Your message is age-encrypted on the server before storage. Only the offline
                operator with the matching private key can read it.
              </p>

              <div id='messages-status'></div>

              <form id='message-form' class='gate-form'>
                <div class='form-group'>
                  <label for='message-name'>
                    Your name <span style='opacity: 0.6;'>(optional)</span>
                  </label>
                  <input
                    type='text'
                    id='message-name'
                    name='name'
                    maxlength={200}
                    autocomplete='name'
                  />
                </div>

                <div class='form-group'>
                  <label for='message-body'>Message</label>
                  <textarea
                    id='message-body'
                    name='body'
                    rows={8}
                    maxlength={20000}
                    required
                  />
                </div>

                <button type='submit' class='cta cta-primary' style='width: 100%;'>
                  Send Encrypted
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about.html'>About</a>
              <a href='/contact.html'>Contact</a>
              <a href='/privacy.html'>Privacy</a>
            </div>
            <p class='footer-copy'>
              🔐 Encrypted with age (x25519) before storage
            </p>
          </div>
        </footer>

        <script>
          {`
            const form = document.getElementById('message-form');
            const status = document.getElementById('messages-status');
            const nameInput = document.getElementById('message-name');
            const bodyInput = document.getElementById('message-body');
            const button = form.querySelector('button');

            function setStatus(text, kind) {
              status.innerHTML = '<div class="message message-' + kind + '">' + text + '</div>';
              if (kind === 'success') {
                setTimeout(() => { status.innerHTML = ''; }, 6000);
              }
            }

            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              const body = bodyInput.value.trim();
              if (!body) { setStatus('Please enter a message.', 'error'); return; }

              const payload = { body };
              const name = nameInput.value.trim();
              if (name) payload.name = name;

              button.disabled = true;
              button.textContent = 'sending...';

              try {
                const res = await fetch('/api/messages', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (res.status === 401) {
                  window.location.href = '/login';
                  return;
                }
                if (res.ok && data.success) {
                  setStatus('Message received. Thank you.', 'success');
                  form.reset();
                } else {
                  setStatus(data.error || 'Message could not be sent.', 'error');
                }
              } catch (err) {
                setStatus('Network error. Please try again.', 'error');
              } finally {
                button.disabled = false;
                button.textContent = 'Send Encrypted';
              }
            });
          `}
        </script>
      </body>
    </html>
  );
}
