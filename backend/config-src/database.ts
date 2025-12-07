/**
 * Database Configuration and Initialization
 *
 * This module handles PostgreSQL connection setup and schema initialization
 */

import { Client, ClientConfig } from 'pg';
import { config } from './environment.js';

/**
 * Create a PostgreSQL client with configuration from environment
 */
export function createDatabaseClient(): Client {
  const dbConfig: ClientConfig = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  };

  if (config.database.ssl) {
    dbConfig.ssl = { rejectUnauthorized: false };
  }

  return new Client(dbConfig);
}

/**
 * Initialize database schema
 * Creates all necessary tables and indexes if they don't exist
 */
export async function initializeDatabase(client: Client): Promise<void> {
  try {
    console.log('🔄 Initializing database schema...');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        public_key TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        token TEXT,
        ip_address TEXT,
        is_admin BOOLEAN DEFAULT FALSE
      );
    `);

    // Create responses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        question TEXT,
        answer TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    // Create magic_link_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add auth_method column if it doesn't exist
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'password';
    `);

    // Create questionnaire_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS questionnaire_sessions (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        session_hash TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed BOOLEAN DEFAULT FALSE
      );
    `);

    // Add display_name column if it doesn't exist
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS display_name TEXT;
    `);

    // Create user_answers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_answers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        question_index INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better performance
    await createIndexes(client);

    // Create additional tables for IP geolocation and phone verification
    await createAuxiliaryTables(client);

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database schema:', error);
    throw error;
  }
}

/**
 * Create database indexes for better query performance
 */
async function createIndexes(client: Client): Promise<void> {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_email ON questionnaire_sessions(email)',
    'CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_hash ON questionnaire_sessions(session_hash)',
    'CREATE INDEX IF NOT EXISTS idx_user_answers_user_id ON user_answers(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON user_answers(question_id)',
  ];

  for (const indexQuery of indexes) {
    await client.query(indexQuery);
  }
}

/**
 * Create auxiliary tables for IP geolocation, phone verification, etc.
 */
async function createAuxiliaryTables(client: Client): Promise<void> {
  // IP Geolocation table
  await client.query(`
    CREATE TABLE IF NOT EXISTS ip_geolocation (
      id SERIAL PRIMARY KEY,
      ip_address TEXT UNIQUE NOT NULL,
      country TEXT,
      region TEXT,
      city TEXT,
      latitude NUMERIC,
      longitude NUMERIC,
      timezone TEXT,
      is_vpn BOOLEAN DEFAULT FALSE,
      is_tor BOOLEAN DEFAULT FALSE,
      is_proxy BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // User IP history table
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_ip_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL,
      geolocation_id INTEGER REFERENCES ip_geolocation(id),
      user_agent TEXT,
      accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Phone verifications table
  await client.query(`
    CREATE TABLE IF NOT EXISTS phone_verifications (
      id SERIAL PRIMARY KEY,
      phone_number TEXT NOT NULL,
      verification_code TEXT NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP
    );
  `);

  // Create indexes for auxiliary tables
  await client.query('CREATE INDEX IF NOT EXISTS idx_ip_geolocation_ip ON ip_geolocation(ip_address)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_user_ip_history_user_id ON user_ip_history(user_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_user_ip_history_ip ON user_ip_history(ip_address)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications(phone_number)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_phone_verifications_expires ON phone_verifications(expires_at)');
}

/**
 * Connect to database and initialize schema
 */
export async function connectAndInitialize(): Promise<Client> {
  const client = createDatabaseClient();

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    await initializeDatabase(client);

    return client;
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Gracefully close database connection
 */
export async function closeDatabaseConnection(client: Client): Promise<void> {
  try {
    await client.end();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
  }
}
