import pg from 'pg';
const { Pool } = pg;

// Try with NODE_TLS_REJECT_UNAUTHORIZED
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: 'postgres://a4m_app:jsT%40sA2nd1nsd3cl2y0@gimbal.fobdongle.com:5432/aformulationoftruth?sslmode=require',
  max: 10
});

try {
  const result = await pool.query('SELECT version()');
  console.log('✓ Connection successful with NODE_TLS_REJECT_UNAUTHORIZED=0!');
  console.log('PostgreSQL version:', result.rows[0].version);
  await pool.end();
} catch (error) {
  console.error('✗ Connection failed:', error.message);
  await pool.end();
}
