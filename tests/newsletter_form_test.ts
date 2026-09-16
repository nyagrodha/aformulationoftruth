/**
 * Newsletter handler integration coverage.
 *
 * Run with: npm --prefix tests run test:newsletter
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

type SubscribeResult = {
  success: boolean;
  status: 'new' | 'pending' | 'already_confirmed' | 'resubscribed';
  confirmationToken?: string;
  unsubscribeToken?: string;
};

const subscribeEmail = jest.fn<() => Promise<SubscribeResult>>();
const sendNewsletterConfirmationEmail = jest.fn<() => Promise<{ success: boolean }>>();

Object.defineProperty(globalThis, 'Deno', {
  configurable: true,
  value: { env: { get: () => undefined } },
});

jest.unstable_mockModule('../lib/newsletter.ts', () => ({ subscribeEmail }));
jest.unstable_mockModule('../lib/email.ts', () => ({ sendNewsletterConfirmationEmail }));
jest.unstable_mockModule('../lib/metrics.ts', () => ({ increment: jest.fn() }));
jest.unstable_mockModule('../components/PageShell.tsx', () => ({ PageShell: jest.fn() }));

const { handler: subscribeHandler } = await import('../routes/api/newsletter/subscribe.ts');
const { handler: newsletterHandler, NEWSLETTER_MESSAGES } = await import('../routes/newsletter.tsx');

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function formRequest(email: string): Request {
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }),
  });
}

async function post(request: Request): Promise<Response> {
  return await subscribeHandler.POST!(request, {} as never);
}

async function expectRedirect(request: Request, status: keyof typeof NEWSLETTER_MESSAGES): Promise<void> {
  const response = await post(request);
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe(`/newsletter?status=${status}`);
  await expect(response.text()).resolves.toBe('');
}

beforeEach(() => {
  jest.clearAllMocks();
  subscribeEmail.mockResolvedValue({
    success: true,
    status: 'new',
    confirmationToken: 'confirmation-token',
    unsubscribeToken: 'unsubscribe-token',
  });
  sendNewsletterConfirmationEmail.mockResolvedValue({ success: true });
});

describe('POST /api/newsletter/subscribe', () => {
  test('returns the existing JSON success body', async () => {
    const response = await post(jsonRequest({ email: 'reader@example.com' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Please check your email to confirm your subscription.',
      status: 'new',
    });
  });

  test('returns the existing JSON body for an already subscribed address', async () => {
    subscribeEmail.mockResolvedValue({ success: true, status: 'already_confirmed' });

    const response = await post(jsonRequest({ email: 'reader@example.com' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'You are already subscribed to the newsletter.',
      status: 'already_confirmed',
    });
  });

  test.each([
    ['malformed JSON', '{', 'Invalid JSON body'],
    ['missing email', {}, 'Email required'],
    ['invalid email', { email: 'not-an-email' }, 'Please use a valid email address'],
  ])('returns the JSON validation body for %s', async (_name, body, error) => {
    const response = await post(jsonRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error });
  });

  test('returns the JSON mail failure body', async () => {
    sendNewsletterConfirmationEmail.mockResolvedValue({ success: false });

    const response = await post(jsonRequest({ email: 'reader@example.com' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Failed to send confirmation email. Please try again.',
    });
  });

  test('returns the JSON processing failure body', async () => {
    subscribeEmail.mockRejectedValue(new Error('database unavailable'));

    const response = await post(jsonRequest({ email: 'reader@example.com' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Failed to process subscription' });
  });

  test('redirects a successful URL-encoded request to check', async () => {
    await expectRedirect(formRequest('reader@example.com'), 'check');
  });

  test('redirects an already subscribed URL-encoded request to subscribed', async () => {
    subscribeEmail.mockResolvedValue({ success: true, status: 'already_confirmed' });
    await expectRedirect(formRequest('reader@example.com'), 'subscribed');
  });

  test('redirects an invalid URL-encoded request to invalid', async () => {
    await expectRedirect(formRequest('not-an-email'), 'invalid');
  });

  test('redirects a failed URL-encoded request to error', async () => {
    subscribeEmail.mockRejectedValue(new Error('database unavailable'));
    await expectRedirect(formRequest('reader@example.com'), 'error');
  });
});

describe('GET /newsletter', () => {
  test.each(Object.entries(NEWSLETTER_MESSAGES))('renders the configured %s status', (status, message) => {
    const render = jest.fn(() => new Response(message));
    const request = new Request(`http://localhost/newsletter?status=${status}`);

    const response = newsletterHandler.GET!(request, { render } as never);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith({ message });
  });

  test.each(['unknown', 'toString', 'constructor', ''])('redirects the unrecognized %s status', async (status) => {
    const render = jest.fn();
    const request = new Request(`http://localhost/newsletter?status=${status}`);

    const response = newsletterHandler.GET!(request, { render } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/contact.html#newsletter');
    await expect(response.text()).resolves.toBe('');
    expect(render).not.toHaveBeenCalled();
  });
});

test('the contact page form posts itself when scripting is off', () => {
  const html = readFileSync(new URL('../public/contact.html', import.meta.url), 'utf8');
  const form = html.slice(html.indexOf('<form id="newsletter-form"'));
  const tag = form.slice(0, form.indexOf('>'));

  expect(tag).toContain('method="post"');
  expect(tag).toContain('action="/api/newsletter/subscribe"');
  expect(form.slice(0, form.indexOf('</form>'))).toContain('name="email"');
  expect(html).toContain('id="newsletter"');
});
