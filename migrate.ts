#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Database Migration Runner
 * Runs SQL migrations from db/migrations/ directory
 */

import { Pool } from 'postgres';

// Load environment
const envFiles = ['.env.fresh', '.env'];
for (const envFile of envFiles) {
  try {
    const content = await Deno.readTextFile(envFile);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          Deno.env.set(key, value);
        }
      }
    }
    console.log(`[migrate] Loaded ${envFile}`);
    break;
  } catch {
    continue;
  }
}

// Get database URL
const databaseUrl = Deno.env.get('DATABASE_URL');
if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL not set');
  Deno.exit(1);
}

// Parse connection string
const url = new URL(databaseUrl);
const pool = new Pool({
  hostname: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: decodeURIComponent(url.password),
}, 1);

async function runMigrations() {
  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.queryObject(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Get applied migrations
    const { rows: applied } = await client.queryObject<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY id'
    );
    const appliedNames = new Set(applied.map((r) => r.name));

    // Find migration files
    const migrationsDir = './db/migrations';
    const migrations: string[] = [];

    for await (const entry of Deno.readDir(migrationsDir)) {
      if (entry.isFile && entry.name.endsWith('.sql')) {
        migrations.push(entry.name);
      }
    }

    migrations.sort();

    // Run pending migrations
    let count = 0;
    for (const migration of migrations) {
      if (appliedNames.has(migration)) {
        console.log(`[migrate] Skip: ${migration} (already applied)`);
        continue;
      }

      console.log(`[migrate] Applying: ${migration}`);
      const sql = await Deno.readTextFile(`${migrationsDir}/${migration}`);

      await client.queryObject('BEGIN');
      try {
        await client.queryObject(sql);
        await client.queryObject(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [migration]
        );
        await client.queryObject('COMMIT');
        console.log(`[migrate] Applied: ${migration}`);
        count++;
      } catch (error) {
        await client.queryObject('ROLLBACK');
        console.error(`[migrate] Failed: ${migration}`, error);
        throw error;
      }
    }

    console.log(`[migrate] Complete. Applied ${count} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

await runMigrations();
