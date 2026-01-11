import pg from 'pg';
const { Pool } = pg;

const sslConfig = {
  rejectUnauthorized: false
};

console.log('Testing database connection with SSL config:', sslConfig);

const pool = new Pool({
  connectionString: 'postgres://a4m_app:jsT%40sA2nd1nsd3cl2y0@gimbal.fobdongle.com:5432/aformulationoftruth?sslmode=require',
  max: 10,
  ssl: sslConfig
});

try {
  const result = await pool.query('SELECT version()');
  console.log('✓ Connection successful!');
  console.log('PostgreSQL version:', result.rows[0].version);
  await pool.end();
} catch (error) {
  console.error('✗ Connection failed:', error.message);
  console.error('Error code:', error.code);
  await pool.end();
  process.exit(1);
}
