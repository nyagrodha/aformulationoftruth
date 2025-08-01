import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data.db');
const schemaPath = path.join(__dirname, './schema.sql');

const db = new sqlite3.Database(dbPath);

export function initDatabase() {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('❌ Failed to initialize schema:', err.message);
    } else {
      console.log('✅ Database schema applied from schema.sql.');
    }
  });
}

export default db;
