import pg from 'pg';
const { Pool } = pg;

const internalIPs = ['10.99.0.1', '10.99.0.2', '10.99.0.4', '10.99.0.5'];

for (const host of internalIPs) {
  console.log(`\nTrying ${host}...`);
  const pool = new Pool({
    host: host,
    port: 5432,
    database: 'aformulationoftruth',
    user: 'a4m_app',
    password: 'jsT@sA2nd1nsd3cl2y0',
    connectionTimeoutMillis: 3000,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const result = await pool.query('SELECT version()');
    console.log(`✓ SUCCESS on ${host}!`);
    console.log('PostgreSQL version:', result.rows[0].version);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.log(`✗ Failed: ${error.message}`);
    await pool.end();
  }
}
console.log('\nNo PostgreSQL found on any VPN IP');
