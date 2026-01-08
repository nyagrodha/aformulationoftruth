process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-change-me';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/aformulationoftruth_test';
process.env.PORT = process.env.PORT || '0';
process.env.AUTH_MODE = process.env.AUTH_MODE || 'password';
