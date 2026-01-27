import { defineConfig } from '$fresh/server.ts';

export default defineConfig({
  // Serve static files from public directory
  staticDir: './public',
  // Server port - matches a4mula-port-guardian config
  server: {
    port: parseInt(Deno.env.get('PORT') || '8000'),
  },
});
