const { Pool } = require('pg');
const dotenv = require('dotenv');

// Support loading environment variables before this module is imported.
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL environment variable not set. The server will not be able to connect to PostgreSQL.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL client error', error);
});

module.exports = { pool };
