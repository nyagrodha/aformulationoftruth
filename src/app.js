import "express-async-errors";
import express from "express";
import createError from "http-errors";
import crypto from "node:crypto";
import { logger } from "./lib/logger";
import { loadEnv } from "./lib/env";

loadEnv(); // throws early if env is bad

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Correlation ID for logs
app.use((req: any, res, next) => {
  req.reqId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.reqId);
  next();
});

// Health check
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Routes
import questions from "./routes/questions";
app.use("/questions", questions);

// 404
app.use((_req, _res, next) => next(createError(404, "Not Found")));

// Error handler (4xx -> warn, 5xx -> error) + HTML/JSON negotiation
app.use((err: any, req: any, res: any, _next: any) => {
  const status = err.status || err.statusCode || 500;

  const payload = {
    error: {
      code: status,
      message: err.message || "Internal Server Error",
      requestId: req.reqId
    }
  };

  if (status >= 500) {
    logger.error({ err, requestId: req.reqId }, "request failed");
  } else {
    logger.warn({ message: err.message, requestId: req.reqId }, "request failed");
  }

  if (req.accepts("html") && !req.accepts("json")) {
    res
      .status(status)
      .send(`<!doctype html><title>${status}</title><h1>${status}</h1><pre>${payload.error.message}</pre>`);
  } else {
    res.status(status).json(payload);
  }
});

export default app;
