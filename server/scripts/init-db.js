const fs = require('fs');
const path = require('path');
const { pool } = require('../postgres');

async function run() {
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying database schema from', schemaPath);

  try {
    await pool.query(sql);
    console.log('Database schema applied successfully.');
  } catch (error) {
    console.error('Failed to apply database schema:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
