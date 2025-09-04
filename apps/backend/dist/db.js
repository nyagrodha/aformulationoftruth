import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
}
// This creates the connection pool to your PostgreSQL database.
const client = postgres(connectionString);
// This wraps the connection with Drizzle ORM and attaches your database schema.
export const db = drizzle(client, { schema });
//# sourceMappingURL=db.js.map