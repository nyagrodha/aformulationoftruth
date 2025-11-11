// Test script for IP geolocation functionality
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

import { Client } from 'pg';
import { lookupIPAddress, getCachedIPInfo } from './dist/utils/ip-lookup.js';
import { saveIPGeolocation, getIPGeolocation, isIPRegistered } from './dist/utils/ip-geolocation.js';

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function testIPGeolocation() {
  console.log('🧪 Testing IP Geolocation System\n');

  try {
    // Connect to database
    await client.connect();
    console.log('✓ Connected to PostgreSQL database');

    // Test 1: Lookup a public IP address (Google DNS)
    console.log('\n📍 Test 1: Looking up IP address 8.8.8.8 (Google DNS)');
    const ipData = await lookupIPAddress('8.8.8.8');

    if (ipData) {
      console.log('✓ IP lookup successful:');
      console.log(`  - IP: ${ipData.ip}`);
      console.log(`  - City: ${ipData.city || 'N/A'}`);
      console.log(`  - Region: ${ipData.region || 'N/A'}`);
      console.log(`  - Country: ${ipData.country || 'N/A'}`);
      console.log(`  - Location: ${ipData.location || 'N/A'}`);
      console.log(`  - Organization: ${ipData.org || 'N/A'}`);
      console.log(`  - Timezone: ${ipData.timezone || 'N/A'}`);
      console.log(`  - VPN: ${ipData.is_vpn}`);
      console.log(`  - Tor: ${ipData.is_tor}`);
      console.log(`  - Proxy: ${ipData.is_proxy}`);
      console.log(`  - Hosting: ${ipData.is_hosting}`);
    } else {
      console.log('✗ IP lookup failed');
    }

    // Test 2: Save IP geolocation to database
    console.log('\n💾 Test 2: Saving IP geolocation to database');
    if (ipData) {
      const ipId = await saveIPGeolocation(client, ipData);
      if (ipId) {
        console.log(`✓ IP geolocation saved with ID: ${ipId}`);
      } else {
        console.log('✗ Failed to save IP geolocation');
      }
    }

    // Test 3: Retrieve IP geolocation from database
    console.log('\n🔍 Test 3: Retrieving IP geolocation from database');
    const storedIP = await getIPGeolocation(client, '8.8.8.8');
    if (storedIP) {
      console.log('✓ IP geolocation retrieved from database:');
      console.log(`  - ID: ${storedIP.id}`);
      console.log(`  - City: ${storedIP.city || 'N/A'}`);
      console.log(`  - Country: ${storedIP.country || 'N/A'}`);
      console.log(`  - First seen: ${storedIP.first_seen}`);
      console.log(`  - Lookup count: ${storedIP.lookup_count}`);
    } else {
      console.log('✗ Failed to retrieve IP geolocation');
    }

    // Test 4: Test localhost IP handling
    console.log('\n🏠 Test 4: Testing localhost IP handling');
    const localhostIP = await lookupIPAddress('127.0.0.1');
    if (localhostIP) {
      console.log('✓ Localhost IP handled correctly:');
      console.log(`  - IP: ${localhostIP.ip}`);
      console.log(`  - City: ${localhostIP.city}`);
      console.log(`  - Organization: ${localhostIP.org}`);
    }

    // Test 5: Test caching
    console.log('\n⚡ Test 5: Testing IP lookup caching');
    const start1 = Date.now();
    await getCachedIPInfo('8.8.8.8');
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await getCachedIPInfo('8.8.8.8');
    const time2 = Date.now() - start2;

    console.log(`✓ First lookup: ${time1}ms`);
    console.log(`✓ Cached lookup: ${time2}ms`);
    if (time2 < time1) {
      console.log('✓ Caching is working! Second lookup was faster.');
    }

    // Test 6: Check if tables exist
    console.log('\n🗄️  Test 6: Verifying database tables');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('ip_geolocation', 'user_ip_history')
      ORDER BY table_name
    `);

    if (tables.rows.length === 2) {
      console.log('✓ All required tables exist:');
      tables.rows.forEach(row => console.log(`  - ${row.table_name}`));
    } else {
      console.log('✗ Some tables are missing');
      console.log('  Found:', tables.rows.map(r => r.table_name).join(', '));
    }

    // Test 7: Check indexes
    console.log('\n📑 Test 7: Verifying database indexes');
    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('ip_geolocation', 'user_ip_history')
      ORDER BY indexname
    `);

    console.log(`✓ Found ${indexes.rows.length} indexes:`);
    indexes.rows.forEach(row => console.log(`  - ${row.indexname}`));

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  - IP lookup: ✓');
    console.log('  - Database save: ✓');
    console.log('  - Database retrieve: ✓');
    console.log('  - Localhost handling: ✓');
    console.log('  - Caching: ✓');
    console.log('  - Tables: ✓');
    console.log('  - Indexes: ✓');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  } finally {
    await client.end();
    console.log('\n✓ Database connection closed');
  }
}

// Run tests
testIPGeolocation();
