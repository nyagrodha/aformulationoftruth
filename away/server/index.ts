import 'dotenv/config';
import express, { type Request, Response, NextFunction } from 'express';
import { setupAuth } from './auth';
import { registerRoutes } from './routes';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  const start = Date.now();
  const reqPath = req.path;

  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith('/api')) {
      console.log(`${req.method} ${reqPath} ${_res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  await setupAuth(app);
  await registerRoutes(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number; statusCode?: number })?.status
      || (err as { statusCode?: number })?.statusCode
      || 500;
    const message = (err as Error)?.message || 'Internal Server Error';
    res.status(status).json({ message });
  });

  // Serve static client build in production
  const publicDir = path.resolve(__dirname, '../dist/public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  const port = parseInt(process.env.PORT || '3001', 10);
  app.listen(port, '127.0.0.1', () => {
    console.log(`away server listening on port ${port}`);
  });
})();
