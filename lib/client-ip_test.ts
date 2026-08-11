import { assertEquals } from '$std/assert/mod.ts';
import { getClientIp } from './client-ip.ts';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/', { headers });
}

function withTrustProxy<T>(value: string | null, fn: () => T): T {
  const prev = Deno.env.get('TRUST_PROXY');
  if (value === null) Deno.env.delete('TRUST_PROXY');
  else Deno.env.set('TRUST_PROXY', value);
  try {
    return fn();
  } finally {
    if (prev === undefined) Deno.env.delete('TRUST_PROXY');
    else Deno.env.set('TRUST_PROXY', prev);
  }
}

Deno.test('trusted proxy: takes the first X-Forwarded-For entry', () => {
  withTrustProxy('true', () => {
    const ip = getClientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), '10.0.0.1');
    assertEquals(ip, '203.0.113.7');
  });
});

Deno.test('trusted proxy: trims whitespace around the entry', () => {
  withTrustProxy('true', () => {
    const ip = getClientIp(req({ 'x-forwarded-for': '  203.0.113.7  , 10.0.0.1' }), '10.0.0.1');
    assertEquals(ip, '203.0.113.7');
  });
});

Deno.test('trusted proxy: falls back to the socket when the header is absent', () => {
  withTrustProxy('true', () => {
    assertEquals(getClientIp(req(), '198.51.100.4'), '198.51.100.4');
  });
});

// The spoofing guard. Without TRUST_PROXY set, a client-supplied header must
// be ignored outright -- honouring it would let anyone inflate or split the
// scan count at will just by sending a header.
Deno.test('untrusted proxy: ignores X-Forwarded-For entirely', () => {
  withTrustProxy(null, () => {
    const ip = getClientIp(req({ 'x-forwarded-for': '203.0.113.7' }), '198.51.100.4');
    assertEquals(ip, '198.51.100.4');
  });
});

Deno.test('untrusted proxy: only the literal string "true" enables trust', () => {
  withTrustProxy('1', () => {
    const ip = getClientIp(req({ 'x-forwarded-for': '203.0.113.7' }), '198.51.100.4');
    assertEquals(ip, '198.51.100.4');
  });
});

Deno.test('an empty X-Forwarded-For does not shadow the socket address', () => {
  withTrustProxy('true', () => {
    assertEquals(getClientIp(req({ 'x-forwarded-for': '' }), '198.51.100.4'), '198.51.100.4');
  });
});

Deno.test('no socket address and no header yields the unknown sentinel', () => {
  withTrustProxy(null, () => {
    assertEquals(getClientIp(req(), undefined), 'unknown');
  });
});
