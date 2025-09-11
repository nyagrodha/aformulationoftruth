// apps/backend/src/db.ts
import postgres from "postgres";

const { DATABASE_URL } = process.env;

export const sql = DATABASE_URL
  ? postgres(DATABASE_URL)
  : postgres({
      // For Unix socket, set host to the socket directory
      host: process.env.PGHOST || "/var/run/postgresql",
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER || "marcel",
      database: process.env.PGDATABASE || "a4m_db",
      // No password needed with peer auth on the socket
      ssl: false,
    });
