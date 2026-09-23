import { defineConfig } from '$fresh/server.ts';

// Parse and validate port from environment
const portEnv = Deno.env.get('PORT');
const parsed = parseInt(portEnv || '8000', 10);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;

export default defineConfig({
  // Serve static files from public directory
  staticDir: './public',
  server: {
    // Server port - matches a4mula-port-guardian config
    port,
    // Loopback only (task 5b / audit F2): production puts Caddy in front of
    // this on :7268. Binding 0.0.0.0 let anyone who could reach that port
    // directly set their own X-Forwarded-For and mint unlimited "visitors"
    // when TRUST_PROXY is on -- see lib/client-ip.ts's header comment.
    // Loopback closes that path structurally instead of relying on a
    // firewall rule staying correct forever.
    hostname: '127.0.0.1',
  },
});
