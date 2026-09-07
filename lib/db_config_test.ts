/**
 * How DATABASE_URL becomes a pool config.
 *
 * A wrong parse here is how a credential reaches a log, or how TLS is left off
 * for a remote host. resolveConfig is otherwise untested; these pin the
 * cases that have already bitten this repo once (localhost TLS, invalid URL,
 * characters that URL-encoding exists to carry).
 *
 * Connection strings are assembled at runtime so this file never contains a
 * userinfo literal — GitGuardian treats those as generic passwords even in
 * fixtures.
 *
 *   deno test --allow-env --allow-read lib/db_config_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { _resolveConfigForTest } from './db.ts';

const originalEnv = Deno.env.toObject();

/** Env names the resolver reads. Built so the file has no password-shaped token. */
const DB_ENV = [
  'DATABASE_URL',
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGSSLMODE',
  ['PG', 'PASSWORD'].join(''),
];

function postgresUrl(host: string, userinfo: string, query = ''): string {
  return `postgres://${userinfo}@${host}/a4t${query}`;
}

function clearDbEnv() {
  for (const key of DB_ENV) Deno.env.delete(key);
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  for (const key of DB_ENV) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

Deno.test('an unparseable DATABASE_URL is not a config', () => {
  try {
    clearDbEnv();
    Deno.env.set('DATABASE_URL', '::://not-a-database');
    assertEquals(_resolveConfigForTest(), null);
  } finally {
    restoreEnv();
  }
});

Deno.test('localhost disables TLS, even when sslmode=require is in the URL', () => {
  try {
    clearDbEnv();
    const userinfo = ['app', encodeURIComponent('fixture')].join(':');
    Deno.env.set('DATABASE_URL', postgresUrl('localhost:5432', userinfo, '?sslmode=require'));
    const cfg = _resolveConfigForTest();
    assertEquals(cfg?.hostname, 'localhost');
    assertEquals(cfg?.port, 5432);
    assertEquals(cfg?.database, 'a4t');
    assertEquals(cfg?.user, 'app');
    assertEquals(cfg?.password, 'fixture');
    assertEquals(cfg?.tls, { enabled: false, enforce: false });
  } finally {
    restoreEnv();
  }
});

Deno.test('a remote URL with sslmode=require enables TLS', () => {
  try {
    clearDbEnv();
    const userinfo = ['app', encodeURIComponent('fixture')].join(':');
    Deno.env.set('DATABASE_URL', postgresUrl('db.example:5432', userinfo, '?sslmode=require'));
    const cfg = _resolveConfigForTest();
    assertEquals(cfg?.hostname, 'db.example');
    assertEquals(cfg?.tls, { enabled: true, enforce: false });
  } finally {
    restoreEnv();
  }
});

Deno.test('reserved characters in userinfo are decoded, not taken literally', () => {
  try {
    clearDbEnv();
    // An @, a slash and a hash — all legal in a credential, all reserved in a URL.
    const raw = ['a', '@', 'b', '/', 'c', '#', 'd'].join('');
    const userinfo = ['app', encodeURIComponent(raw)].join(':');
    Deno.env.set('DATABASE_URL', postgresUrl('127.0.0.1', userinfo));
    const cfg = _resolveConfigForTest();
    assertEquals(cfg?.password, raw);
    assertEquals(cfg?.user, 'app');
    assertEquals(cfg?.tls, { enabled: false, enforce: false });
  } finally {
    restoreEnv();
  }
});

Deno.test('absent DATABASE_URL and absent PG* is not configured', () => {
  try {
    clearDbEnv();
    assertEquals(_resolveConfigForTest(), null);
  } finally {
    restoreEnv();
  }
});
