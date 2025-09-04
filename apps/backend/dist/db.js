// backend/src/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is required");
}
export const pool = new Pool({ connectionString });
export const db = drizzle(pool);
//# sourceMappingURL=db.js.map