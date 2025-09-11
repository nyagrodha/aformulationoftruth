import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const sql = postgres({
  host: process.env.PGHOST || "/var/run/postgresql",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || "marcel",
  database: process.env.PGDATABASE || "a4m_db",
  ssl: false,
});

export const db = drizzle(sql);
