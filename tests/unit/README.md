# PostgreSQL Database Tests

Comprehensive test suite to ensure the PostgreSQL database remains operational and healthy.

## Test Files

### 1. `db.connection.test.ts`
Tests database connection functionality and pool configuration.

**Coverage:**
- Connection pool configuration validation
- Basic database connectivity
- Connection pool health metrics
- Error handling and recovery
- Transaction support
- Connection timeout behavior

**Key Tests:**
- Pool configuration (max: 20, idle: 30s, timeout: 2s)
- Simple query execution
- Multiple concurrent connections
- Connection reuse
- Transaction commit/rollback

### 2. `db.schema.test.ts`
Validates database schema structure and integrity.

**Coverage:**
- Table existence verification
- Column structure validation
- Primary key constraints
- Foreign key relationships
- Index validation
- Data type verification

**Key Tests:**
- All core tables exist (users, sessions, magic_links, questionnaire_sessions, responses)
- Correct column names and types
- Foreign key constraints to parent tables
- Required indexes (e.g., sessions.expire index)
- JSONB usage for structured data

### 3. `db.crud.test.ts`
Tests CRUD operations on all database tables.

**Coverage:**
- Insert operations
- Read/select operations
- Update operations
- Delete operations
- Foreign key constraint enforcement
- Batch operations

**Key Tests:**
- User creation with default values
- Email uniqueness enforcement
- Magic link token management
- Questionnaire session lifecycle
- Response storage and retrieval
- Foreign key violation handling
- Cascade delete behavior

### 4. `db.pool-health.test.ts`
Advanced connection pool health and stress tests.

**Coverage:**
- Pool exhaustion handling
- Connection queuing
- Idle timeout behavior
- Connection recovery after errors
- Concurrent operation handling
- Long-running query support

**Key Tests:**
- Maximum connection limit (20)
- Request queuing when pool exhausted
- Recovery after errors
- High concurrent load (50+ operations)
- Transaction isolation
- Pool statistics tracking

### 5. `db.integrity.test.ts`
Database integrity, monitoring, and health checks.

**Coverage:**
- Schema consistency
- Data integrity validation
- Performance monitoring
- Security checks
- Transaction integrity
- Backup readiness

**Key Tests:**
- No orphaned records
- Consistent completion counts
- Valid email formats
- Cache hit ratio tracking
- Active connection monitoring
- SQL injection protection
- ACID property verification

## Running Tests

### Run all database tests
```bash
npm test
```

### Run specific test file
```bash
npm test db.connection.test
npm test db.schema.test
npm test db.crud.test
npm test db.pool-health.test
npm test db.integrity.test
```

### Run with coverage
```bash
npm run test:coverage
```

### Watch mode
```bash
npm run test:watch
```

## Environment Setup

Tests require the following environment variables:

```bash
DATABASE_URL=postgresql://user:pass@host:port/database
```

Test environment is automatically configured in `tests/setup.ts`.

## Test Database

Tests run against the actual database specified in `DATABASE_URL`. 

**Important:** 
- Tests create test data with prefixes like `test-*`
- Test data is cleaned up after test completion
- Some tests may temporarily affect database performance
- Run tests in a test/staging environment, not production

## Test Categories

### Functional Tests
- Connection establishment
- CRUD operations
- Schema validation

### Performance Tests
- Connection pool behavior
- Concurrent operations
- Long-running queries

### Integrity Tests
- Data consistency
- Foreign key constraints
- Orphaned record detection

### Monitoring Tests
- Database size tracking
- Connection monitoring
- Query performance

## Expected Test Results

All tests should pass with a properly configured PostgreSQL database:

```
Database Connection Tests: ~15 tests
Database Schema Validation: ~20 tests
Database CRUD Operations: ~25 tests
Database Pool Health: ~20 tests
Database Integrity: ~20 tests

Total: ~100 tests
```

## Troubleshooting

### Connection Errors
- Verify `DATABASE_URL` is correct
- Check database is running
- Verify network connectivity
- Check firewall rules

### Schema Errors
- Run migrations: `npm run db:push`
- Verify all tables exist
- Check for schema changes

### Timeout Errors
- Increase test timeout in jest.config.ts
- Check database performance
- Verify connection pool settings

### Data Integrity Errors
- Check for orphaned records
- Verify foreign key constraints
- Run data cleanup scripts

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
- name: Run Database Tests
  run: npm test
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Monitoring in Production

Key metrics to monitor (from integrity tests):

1. **Connection Pool Health**
   - Active connections < 20
   - Idle connections > 0
   - Waiting count = 0

2. **Data Integrity**
   - No orphaned sessions
   - No orphaned responses
   - Consistent completion counts

3. **Performance**
   - Cache hit ratio > 90%
   - No missing indexes
   - Query execution times

4. **Database Health**
   - Connection success rate
   - Table/index counts
   - Database size growth

## Maintenance

### Test Data Cleanup
```sql
DELETE FROM responses WHERE answer LIKE 'test-answer-%';
DELETE FROM questionnaire_sessions WHERE id LIKE 'test-%';
DELETE FROM magic_links WHERE email LIKE 'test-%';
DELETE FROM users WHERE email LIKE 'test-%';
```

### Update Tests
When schema changes:
1. Update schema validation tests
2. Update CRUD tests if new tables added
3. Update integrity tests for new relationships
4. Run full test suite to verify

## Best Practices

1. **Isolate test data** - Use clear prefixes (test-*)
2. **Clean up after tests** - Remove test data in afterAll/afterEach
3. **Use transactions** - Wrap tests in transactions when possible
4. **Mock when appropriate** - But prefer real DB for integration tests
5. **Monitor performance** - Track test execution time
6. **Document failures** - Add context to test failure messages

## Contributing

When adding new database features:

1. Add corresponding tests to appropriate file
2. Follow existing test patterns
3. Ensure cleanup in afterAll/afterEach
4. Update this README with new test coverage
5. Verify all tests pass before committing
