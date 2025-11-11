#!/usr/bin/env node
// Database Test Script - Validates PostgreSQL connectivity and CRUD operations
// Run with: node test-database.js

const { Client } = require('pg');
require('dotenv').config();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'cyan');
}

function section(message) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(message, 'blue');
  log('='.repeat(60), 'blue');
}

async function runTests() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  let testUserId = null;
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Database Connection
    section('Test 1: Database Connection');
    info('Attempting to connect to PostgreSQL...');
    await client.connect();
    success('Successfully connected to PostgreSQL database');
    testsRun++;
    testsPassed++;

    // Test 2: Get Database Version
    section('Test 2: Database Version Check');
    const versionResult = await client.query('SELECT version();');
    info(`PostgreSQL Version: ${versionResult.rows[0].version}`);
    success('Version query successful');
    testsRun++;
    testsPassed++;

    // Test 3: List Tables
    section('Test 3: Schema Verification');
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    info(`Found ${tablesResult.rows.length} tables in the database:`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    success('Schema verification successful');
    testsRun++;
    testsPassed++;

    // Test 4: Check Critical Tables Exist
    section('Test 4: Critical Tables Check');
    const requiredTables = ['users', 'responses', 'magic_tokens'];
    const existingTables = tablesResult.rows.map(r => r.table_name);

    let allTablesExist = true;
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        success(`Table '${table}' exists`);
      } else {
        error(`Table '${table}' is missing!`);
        allTablesExist = false;
      }
    }
    testsRun++;
    if (allTablesExist) {
      testsPassed++;
    } else {
      testsFailed++;
    }

    // Test 5: Count Existing Users
    section('Test 5: Read Existing Data');
    const countResult = await client.query('SELECT COUNT(*) as count FROM users;');
    const userCount = parseInt(countResult.rows[0].count);
    info(`Current user count: ${userCount}`);
    success('Data read successful');
    testsRun++;
    testsPassed++;

    // Test 6: Insert Test User
    section('Test 6: Insert Test Data');
    const testEmail = `test_${Date.now()}@example.com`;
    info(`Creating test user with email: ${testEmail}`);

    const insertResult = await client.query(`
      INSERT INTO users (email, display_name, profile_visibility)
      VALUES ($1, $2, $3)
      RETURNING id, email, display_name;
    `, [testEmail, 'Test User', 'private']);

    testUserId = insertResult.rows[0].id;
    info(`Created user with ID: ${testUserId}`);
    success('Data insert successful');
    testsRun++;
    testsPassed++;

    // Test 7: Read Test User
    section('Test 7: Read Inserted Data');
    const selectResult = await client.query(`
      SELECT id, email, display_name, created_at, is_active
      FROM users
      WHERE id = $1;
    `, [testUserId]);

    if (selectResult.rows.length === 1) {
      const user = selectResult.rows[0];
      info(`Retrieved user: ${user.email} (${user.display_name})`);
      info(`Created at: ${user.created_at}`);
      info(`Active: ${user.is_active}`);
      success('Data read successful');
      testsRun++;
      testsPassed++;
    } else {
      error('Failed to retrieve inserted user');
      testsRun++;
      testsFailed++;
    }

    // Test 8: Update Test User
    section('Test 8: Update Data');
    const newDisplayName = 'Updated Test User';
    await client.query(`
      UPDATE users
      SET display_name = $1
      WHERE id = $2;
    `, [newDisplayName, testUserId]);

    const verifyUpdate = await client.query(`
      SELECT display_name
      FROM users
      WHERE id = $1;
    `, [testUserId]);

    if (verifyUpdate.rows[0].display_name === newDisplayName) {
      info(`Display name updated to: ${newDisplayName}`);
      success('Data update successful');
      testsRun++;
      testsPassed++;
    } else {
      error('Failed to update user data');
      testsRun++;
      testsFailed++;
    }

    // Test 9: Insert Response Data
    section('Test 9: Insert Response Data');
    const testQuestionId = 1;
    const testQuestionIndex = 0;
    const testAnswer = 'This is a test answer for the Proust questionnaire.';

    info(`Inserting answer for user ${testUserId}, question ${testQuestionId}`);
    await client.query(`
      INSERT INTO user_answers (user_id, question_id, question_index, answer_text)
      VALUES ($1, $2, $3, $4);
    `, [testUserId, testQuestionId, testQuestionIndex, testAnswer]);

    const responseVerify = await client.query(`
      SELECT * FROM user_answers
      WHERE user_id = $1 AND question_id = $2;
    `, [testUserId, testQuestionId]);

    if (responseVerify.rows.length === 1) {
      info(`Answer stored: "${responseVerify.rows[0].answer_text.substring(0, 50)}..."`);
      success('Answer insert successful');
      testsRun++;
      testsPassed++;
    } else {
      error('Failed to insert answer');
      testsRun++;
      testsFailed++;
    }

    // Test 10: Transaction Test
    section('Test 10: Transaction Support');
    try {
      await client.query('BEGIN');
      info('Transaction started');

      await client.query(`
        UPDATE users
        SET display_name = 'Transaction Test'
        WHERE id = $1;
      `, [testUserId]);

      await client.query('ROLLBACK');
      info('Transaction rolled back');

      const checkRollback = await client.query(`
        SELECT display_name
        FROM users
        WHERE id = $1;
      `, [testUserId]);

      if (checkRollback.rows[0].display_name !== 'Transaction Test') {
        success('Transaction rollback successful');
        testsRun++;
        testsPassed++;
      } else {
        error('Transaction rollback failed');
        testsRun++;
        testsFailed++;
      }
    } catch (e) {
      error(`Transaction test failed: ${e.message}`);
      testsRun++;
      testsFailed++;
    }

    // Test 11: Cleanup - Delete Test Data
    section('Test 11: Delete Test Data');
    info('Cleaning up test data...');

    await client.query('DELETE FROM user_answers WHERE user_id = $1;', [testUserId]);
    info('Deleted test answer');

    await client.query('DELETE FROM users WHERE id = $1;', [testUserId]);
    info('Deleted test user');

    const verifyDelete = await client.query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE id = $1;
    `, [testUserId]);

    if (parseInt(verifyDelete.rows[0].count) === 0) {
      success('Data cleanup successful');
      testsRun++;
      testsPassed++;
    } else {
      error('Failed to delete test data');
      testsRun++;
      testsFailed++;
    }

    // Test 12: Write Performance Test
    section('Test 12: Write Performance Test');
    info('Testing write performance with a4m_write_probe table...');

    const startTime = Date.now();
    await client.query(`
      INSERT INTO a4m_write_probe (note, created_at) VALUES ($1, NOW());
    `, ['Test write probe entry']);
    const endTime = Date.now();

    const writeTime = endTime - startTime;
    info(`Write operation completed in ${writeTime}ms`);

    if (writeTime < 1000) {
      success('Write performance acceptable');
      testsRun++;
      testsPassed++;
    } else {
      log(`⚠ Write operation took ${writeTime}ms (>1000ms)`, 'yellow');
      testsRun++;
      testsPassed++;
    }

  } catch (err) {
    error(`Test failed with error: ${err.message}`);
    console.error(err);
    testsFailed++;
  } finally {
    await client.end();
    info('Database connection closed');
  }

  // Final Summary
  section('Test Summary');
  log(`Total Tests: ${testsRun}`, 'cyan');
  log(`Passed: ${testsPassed}`, 'green');
  log(`Failed: ${testsFailed}`, 'red');

  if (testsFailed === 0) {
    log('\n🎉 ALL TESTS PASSED! Database is fully functional.', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  SOME TESTS FAILED. Please review the errors above.', 'yellow');
    process.exit(1);
  }
}

// Run the tests
log('Starting PostgreSQL Database Tests...', 'blue');
log(`Using DATABASE_URL: ${process.env.DATABASE_URL ? 'Set ✓' : 'Not set ✗'}`, 'cyan');
runTests();
