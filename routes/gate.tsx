/**
 * Gate Route - First two questions before authentication
 *
 * GET /gate - Show current gate question (0 or 1)
 * POST /gate - Submit answer, advance to next question or auth
 *
 * Questions presented one at a time.
 * After both questions, redirects to email authentication.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { randomToken } from '../lib/crypto.ts';
import { increment } from '../lib/metrics.ts';

// Gate questions (questions 0-1 from Proust Questionnaire)
const GATE_QUESTIONS = [
  'What is your idea of perfect happiness?',
  'What is your greatest fear?',
];

interface GateData {
  questionIndex: number;
  questionText: string;
  gateToken: string;
  error?: string;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<GateData> = {
  GET(req, ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    let gateToken = getCookie(cookies, 'gate_token');
    let questionIndex = parseInt(getCookie(cookies, 'gate_q') || '0', 10);

    // Validate question index
    if (isNaN(questionIndex) || questionIndex < 0) {
      questionIndex = 0;
    }

    // If already past gate questions, redirect to login
    if (questionIndex >= GATE_QUESTIONS.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/login' },
      });
    }

    // Generate gate token if not exists
    if (!gateToken) {
      gateToken = `gate_${randomToken(16)}`;
    }

    // Set cookies
    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      `gate_token=${gateToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`
    );
    headers.append(
      'Set-Cookie',
      `gate_q=${questionIndex}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`
    );

    return ctx.render({
      questionIndex,
      questionText: GATE_QUESTIONS[questionIndex],
      gateToken,
    }, { headers });
  },

  async POST(req, ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    const gateToken = getCookie(cookies, 'gate_token');
    let questionIndex = parseInt(getCookie(cookies, 'gate_q') || '0', 10);

    if (!gateToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/gate' },
      });
    }

    // Parse form data
    const formData = await req.formData();
    const answer = formData.get('answer')?.toString() || '';
    const action = formData.get('action')?.toString() || 'continue';

    // Store the answer (will be handled by API)
    const skipped = action === 'skip' || answer.trim() === '';

    try {
      // Store gate response via internal fetch
      const storeRes = await fetch(new URL('/api/gate', req.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateToken,
          questionIndex,
          answer: skipped ? '' : answer,
          skipped,
        }),
      });

      if (!storeRes.ok) {
        console.error('[gate] Failed to store response');
      }
    } catch (error) {
      console.error('[gate] Error storing response:', error);
    }

    // Advance to next question
    const nextIndex = questionIndex + 1;

    if (nextIndex >= GATE_QUESTIONS.length) {
      // All gate questions done, redirect to login with gate token
      const headers = new Headers();
      headers.set('Location', '/login');
      headers.append(
        'Set-Cookie',
        `gate_q=${nextIndex}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`
      );
      return new Response(null, { status: 302, headers });
    }

    // Show next question
    const headers = new Headers();
    headers.set('Location', '/gate');
    headers.append(
      'Set-Cookie',
      `gate_q=${nextIndex}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`
    );
    return new Response(null, { status: 302, headers });
  },
};

export default function GatePage({ data }: PageProps<GateData>) {
  const { questionIndex, questionText, gateToken, error } = data;

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
              <div class="gate-icon">?</div>

              <p class="gate-progress">
                question {questionIndex + 1} of {GATE_QUESTIONS.length}
              </p>

              <h2 class="gate-title">{questionText}</h2>

              <p class="gate-description">
                These are not polite questions. They are holes in the ice.
                If you answer them honestly, something cold touches your feet.
              </p>

              {error && <div class="message message-error">{error}</div>}

              <form method="POST" action="/gate" class="gate-form">
                <input type="hidden" name="gate_token" value={gateToken} />
                <input type="hidden" name="question_index" value={questionIndex} />

                <div class="form-group">
                  <label for="answer">Your reflection</label>
                  <div class="textarea-wrapper">
                    <div class="watermark">truth</div>
                    <textarea
                      id="answer"
                      name="answer"
                      placeholder="Take your time..."
                      aria-describedby="accessibility-hint"
                    ></textarea>
                  </div>
                  <p class="accessibility-note" id="accessibility-hint">
                    For voice input, use <a href="https://github.com/cjpais/Handy" target="_blank" rel="noopener">Handy</a> - free offline speech-to-text
                  </p>
                </div>

                <div class="form-actions">
                  <button type="submit" name="action" value="continue" class="cta cta-primary">
                    Continue
                  </button>
                  <button type="submit" name="action" value="skip" class="cta cta-secondary">
                    Skip
                  </button>
                </div>
              </form>
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
      </body>
    </html>
  );
}
