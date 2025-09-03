import 'dotenv/config';              // so DATABASE_URL / VPS_ENCRYPTION_KEY load from .env if present
import storage from './storage.js';  // default export is the instance

(async () => {
  const ok = await storage.encryptionHealthCheck();
  console.log('encryptionHealthCheck:', ok);
  process.exit(ok ? 0 : 1);
})();
