/**
 * Login Page
 *
 * GET /login
 *
 * Magic link request form - shown after gate questions.
 * Passes gate_token to link gate responses with authenticated session.
 */

import { Handlers, PageProps } from '$fresh/server.ts';

interface LoginData {
  sent?: boolean;
  error?: string;
  gateToken?: string;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<LoginData> = {
  GET(req, ctx) {
    const cookies = req.headers.get('Cookie');
    const gateToken = getCookie(cookies, 'gate_token') || '';

    return ctx.render({ gateToken });
  },
};

export default function LoginPage({ data }: PageProps<LoginData>) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>a formulation of truth</title>
        <meta name="description" content="An apparatus for attention. Self-inquiry through the Proust Questionnaire." />
        <link rel="stylesheet" href="/css/main.css" />
      </head>
      <body>
        <nav>
          <a href="/" class="logo">A4T</a>
          <div class="nav-links">
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
          </div>
        </nav>

        <main>
          <section class="section gate-section" style="min-height: 100vh; display: flex; align-items: center;">
            <div class="gate-content">
              <div class="gate-icon">@</div>

              <h2 class="gate-title">so here we are, at a new beginning</h2>

              <p class="gate-description">
                Enter your email to receive an authenticated link.
                We'll notify you when it's time to return.
              </p>

              {data.sent ? (
                <div class="message message-success">
                  <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">check your email</p>
                  <p style="font-size: 0.85rem;">We've sent an authentication link. Click it to continue.</p>
                </div>
              ) : (
                <>
                  {data.error && <div class="message message-error">{data.error}</div>}

                  <form id="login-form" class="gate-form">
                    <input type="hidden" name="gate_token" value={data.gateToken || ''} />

                    <div class="form-group">
                      <label for="email">Your email</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        placeholder="you@example.com"
                        required
                        autocomplete="email"
                      />
                    </div>

                    <button type="submit" class="cta cta-primary" style="width: 100%;">
                      Send Magic Link
                    </button>
                  </form>
                </>
              )}
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
              Encrypted database hosted in Iceland by <a href="https://fobdongle.com" target="_blank" rel="noopener" style="color: var(--neon-emerald); text-decoration: none;">FlokiNET</a>
            </p>
          </div>
        </footer>

        <script>{`
          document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const gateToken = document.querySelector('input[name="gate_token"]').value;
            const button = e.target.querySelector('button');

            button.disabled = true;
            button.textContent = 'sending...';

            try {
              const res = await fetch('/api/auth/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, gateToken }),
              });

              if (res.ok) {
                document.querySelector('.gate-content').innerHTML = \`
                  <div class="gate-icon">@</div>
                  <h2 class="gate-title">check your email</h2>
                  <div class="message message-success">
                    <p>We've sent an authentication link to <strong>\${email}</strong>.</p>
                    <p style="margin-top: 0.5rem; font-size: 0.85rem;">Click it to continue your inquiry.</p>
                  </div>
                \`;
              } else {
                const data = await res.json();
                alert(data.error || 'Failed to send magic link');
                button.disabled = false;
                button.textContent = 'Send Magic Link';
              }
            } catch (err) {
              alert('Network error. Please try again.');
              button.disabled = false;
              button.textContent = 'Send Magic Link';
            }
          });
        `}</script>
      </body>
    </html>
  );
}
