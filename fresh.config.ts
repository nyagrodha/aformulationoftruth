import { defineConfig } from '$fresh/server.ts';

// Parse and validate port from environment
const portEnv = Deno.env.get('PORT');
const parsed = parseInt(portEnv || '8000', 10);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;

export default defineConfig({
  // Serve static files from public directory
  staticDir: './public',
  // Server port - matches a4mula-port-guardian config
  server: {
    port,
  },
});
