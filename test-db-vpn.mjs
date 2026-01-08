import pg from 'pg';
const { Pool } = pg;

// Try connecting to database via VPN internal IP
const pool = new Pool({
  host: '10.99.0.1',
  port: 5432,
  database: 'aformulationoftruth',
  user: 'a4m_app',
  password: 'jsT@sA2nd1nsd3cl2y0',
  max: 10,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  const result = await pool.query('SELECT version()');
  console.log('✓ Connection successful via VPN IP!');
  console.log('PostgreSQL version:', result.rows[0].version);
  await pool.end();
} catch (error) {
  console.error('✗ Connection failed:', error.message);
  await pool.end();
}
