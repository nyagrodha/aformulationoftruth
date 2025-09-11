import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in your environment variables.");
}

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle", // It's common practice to name the output folder 'drizzle'
  schema: "./apps/shared/src/schema.ts", // <-- The corrected path
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
});
