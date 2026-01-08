import pg from 'pg';
const { Pool } = pg;

// Try without sslmode in connection string
const pool = new Pool({
  connectionString: 'postgres://a4m_app:jsT%40sA2nd1nsd3cl2y0@gimbal.fobdongle.com:5432/aformulationoftruth',
  max: 10,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  const result = await pool.query('SELECT version()');
  console.log('✓ Connection successful WITHOUT sslmode parameter!');
  console.log('PostgreSQL version:', result.rows[0].version);
  await pool.end();
} catch (error) {
  console.error('✗ Connection failed:', error.message);
  await pool.end();
}
