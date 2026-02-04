/**
 * Newsletter Unsubscribe Endpoint
 *
 * GET /api/newsletter/unsubscribe?token=xxx
 * - Unsubscribes from the newsletter
 * - No login required (one-click unsubscribe)
 * - Returns JSON for API clients, HTML for browsers
 *
 * gupta-vidya compliance:
 * - Token is permanent and unique per subscriber
 * - No email or identity revealed
 * - Returns 200 for invalid tokens (prevents enumeration attacks)
 */

import { Handlers } from '$fresh/server.ts';
import { unsubscribeEmail } from '../../../lib/newsletter.ts';
import { increment } from '../../../lib/metrics.ts';

function wantsJson(req: Request): boolean {
  const accept = req.headers.get('Accept') || '';
  return accept.includes('application/json') || !accept.includes('text/html');
}

export const handler: Handlers = {
  async GET(req, _ctx) {
    increment('requests.api');

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const json = wantsJson(req);

    if (!token) {
      if (json) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing unsubscribe token' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(renderPage('error', 'Missing unsubscribe token.'), {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    try {
      const result = await unsubscribeEmail(token);

      if (result.status === 'unsubscribed') {
        increment('newsletter.unsubscribed');
        if (json) {
          return new Response(
            JSON.stringify({ success: true, status: 'unsubscribed', message: 'Successfully unsubscribed' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          renderPage('success', "You have been unsubscribed from the newsletter. We're sorry to see you go."),
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (result.status === 'already_unsubscribed') {
        if (json) {
          return new Response(
            JSON.stringify({ success: true, status: 'already_unsubscribed', message: 'Already unsubscribed' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          renderPage('info', 'You were already unsubscribed from the newsletter.'),
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Invalid token - return 200 to prevent enumeration attacks
      if (json) {
        return new Response(
          JSON.stringify({ success: false, status: 'invalid', message: 'Invalid unsubscribe link' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        renderPage('error', 'Invalid unsubscribe link.'),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    } catch (error) {
      console.error('[newsletter] Unsubscribe failed:', error);
      increment('errors.5xx');

      if (json) {
        return new Response(
          JSON.stringify({ success: false, error: 'Internal server error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        renderPage('error', 'Something went wrong. Please try again.'),
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }
  },
};

function renderPage(type: 'success' | 'error' | 'info', message: string): string {
  const colors = {
    success: { bg: '#00ff88', text: '#000' },
    error: { bg: '#ff69b4', text: '#000' },
    info: { bg: '#0af', text: '#000' },
  };
  const color = colors[type];
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - a formulation of truth</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      color: #ccc;
      font-family: 'Georgia', serif;
      padding: 20px;
    }
    .container {
      max-width: 480px;
      text-align: center;
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${color.bg};
      color: ${color.text};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      margin: 0 auto 30px;
    }
    h1 {
      font-size: 1.5rem;
      color: #fff;
      margin-bottom: 20px;
      font-weight: normal;
    }
    p {
      line-height: 1.7;
      margin-bottom: 30px;
      color: #999;
    }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #ff69b4, #ff8c42);
      color: #000;
      text-decoration: none;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 12px;
      border-radius: 4px;
    }
    .tamil {
      font-family: 'Noto Serif Tamil', serif;
      color: ${color.bg};
      margin-top: 40px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>a formulation of truth</h1>
    <p>${message}</p>
    <a href="/" class="btn">Return Home</a>
    <p class="tamil">உண்மை — truth</p>
  </div>
</body>
</html>`;
}
