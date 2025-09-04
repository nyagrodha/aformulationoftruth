// scripts/init-db.js
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '../db/schema.sql');
const dbPath = path.join(__dirname, '../data.db');

const schema = fs.readFileSync(schemaPath, 'utf-8');
const db = new sqlite3.Database(dbPath);

console.log('⏳ Initializing database...');

db.exec(schema, (err) => {
  if (err) {
    console.error('❌ Failed to initialize schema:', err.message);
    process.exit(1);
  } else {
    console.log(`✅ Schema applied to ${dbPath}`);
    process.exit(0);
  }
});
