import express from "express";
import session from "express-session";
import { Redis } from "ioredis";
// NOTE: Keep the import style below consistent with your installed connect-redis version.
// If you later get "RedisStore is not a constructor", switch to:
//   import connectRedis from "connect-redis";
//   const RedisStore = connectRedis(session);
import { RedisStore } from "connect-redis";

import authRouter from "./routes/auth.js";
import questionsRouter from "./routes/questions.js";

const {
  NODE_ENV = "development",
  SESSION_SECRET = "change_this",
  SESSION_NAME = "sid",
  REDIS_PASSWORD = "",
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = "6379",
  REDIS_SOCKET = "/var/run/redis/redis.sock",
  PORT = "5000",
  HOST = "127.0.0.1",
} = process.env;

// 1) Create app
const app = express();

// 2) Core middleware (must precede routes)
app.set("trust proxy", 1);
app.use(express.json());

// 3) Redis client (socket preferred), include password only if provided
const useSocket = !!REDIS_SOCKET;
const redis = useSocket
  ? new Redis({
      path: REDIS_SOCKET,
      ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => Math.min(1000 * times, 5000),
    })
  : new Redis({
      host: REDIS_HOST,
      port: Number(REDIS_PORT),
      ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => Math.min(1000 * times, 5000),
    });

redis.on("connect", () => {
  console.log(
    useSocket
      ? `Redis connected via socket ${REDIS_SOCKET}`
      : `Redis connected on ${REDIS_HOST}:${REDIS_PORT}`
  );
});
redis.on("error", (err) => console.error("Redis error:", err));

// 4) Sessions (after json, before routers)
const store = new RedisStore({ client: redis as any });
app.use(
  session({
    store,
    secret: SESSION_SECRET,
    name: SESSION_NAME,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// 5) Health endpoints
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/ping", (_req, res) => res.json({ ok: true, ping: "pong" }));

// 6) Routers (once each)
app.use("/api/auth", authRouter);
app.use("/api/questions", questionsRouter);

// 7) Start server
app.listen(Number(PORT), HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});

// 8) Graceful shutdown
const shutdown = async () => {
  try {
    await redis.quit();
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
