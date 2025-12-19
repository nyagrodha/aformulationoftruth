import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { reminderService } from "./services/reminderService";
import { setupSecurity, healthCheck } from "./middleware/security";

const app = express();

// Apply security middleware first
setupSecurity(app);

// Add health check endpoints
healthCheck(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const socketPath = process.env.SOCKET_PATH;

  if (socketPath) {
    // Clean up stale socket file
    try {
      const stat = fs.statSync(socketPath);
      if (stat.isSocket()) fs.unlinkSync(socketPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        log(`Socket cleanup warning: ${err.message}`);
      }
    }

    // Try to bind to Unix socket with fallback
    const tryUnix = () => {
      return new Promise<void>((resolve, reject) => {
        server
          .listen(socketPath, resolve)
          .once("error", reject);
      });
    };

    try {
      await tryUnix();
      log(`serving on unix socket ${socketPath}`);
      reminderService.start();
    } catch (err: any) {
      log(`Unix socket failed: ${err.message}`);
      server.listen({
        port,
        host: "127.0.0.1",
        reusePort: true,
      }, () => {
        log(`serving on localhost:${port} (fallback mode)`);
        reminderService.start();
      });
    }
  } else {
    // Bind to TCP port (backward compatibility)
    server.listen({
      port,
      host: "127.0.0.1",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);

      // Start the reminder service
      reminderService.start();
    });
  }
})();