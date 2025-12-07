// Deno server for aformulationoftruth backend
import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

// Load environment variables
const env = await load();
const PORT = parseInt(env.PORT || "3000");
const JWT_SECRET = env.JWT_SECRET || "your-secret-key";

if (!env.JWT_SECRET) {
  console.warn("⚠️  WARNING: JWT_SECRET not set in environment variables.");
}

// Initialize Oak application
const app = new Application();
const router = new Router();

// Database configuration
const getDatabaseConfig = () => {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    return {
      hostname: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: decodeURIComponent(url.password),
    };
  }
  return {
    hostname: env.DB_HOST || "10.99.0.1",
    port: parseInt(env.DB_PORT || "5432"),
    database: env.DB_NAME || "a4m_db",
    user: env.DB_USER || "a4m_app",
    password: env.DB_PASSWORD || "",
  };
};

// Connect to PostgreSQL
const client = new Client(getDatabaseConfig());
await client.connect();
console.log("Connected to PostgreSQL database");

// Basic routes
router.get("/api/ping", (ctx) => {
  ctx.response.body = { pong: true };
});

router.get("/api/health", (ctx) => {
  ctx.response.body = {
    status: "ok",
    timestamp: new Date().toISOString(),
    database: "connected",
  };
});

// CORS middleware
app.use(oakCors({
  origin: ["https://aformulationoftruth.com", "http://localhost:5173"],
  credentials: true,
}));

// Logger middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

// Routes
app.use(router.routes());
app.use(router.allowedMethods());

// Error handler
app.addEventListener("error", (evt) => {
  console.error("Application error:", evt.error);
});

console.log(`Server running on port ${PORT}`);
console.log(`API available at http://localhost:${PORT}/api`);

await app.listen({ port: PORT });
