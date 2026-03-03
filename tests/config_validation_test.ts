/**
 * Configuration File Validation Tests
 *
 * Tests configuration files to ensure they are valid and complete:
 * 1. .env.example - validates required environment variables
 * 2. Caddyfile - validates Caddy server configuration syntax
 * 3. .gitignore - validates patterns and structure
 *
 * Run with: deno task test
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// ============================================================================
// Test Suite: .env.example Validation
// ============================================================================

Deno.test({
  name: "Config - .env.example file should exist",
  async fn() {
    const fileInfo = await Deno.stat(".env.example");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Config - .env.example should contain required environment variables",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    const requiredVars = [
      "NODE_ENV",
      "PORT",
      "DATABASE_URL",
      "SESSION_SECRET",
      "COOKIE_NAME",
      "AUTH_MODE",
      "APP_BASE_URL",
    ];

    for (const varName of requiredVars) {
      assert(
        content.includes(varName),
        `Missing required variable: ${varName}`
      );
    }
  },
});

Deno.test({
  name: "Config - .env.example should have database configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assert(content.includes("DATABASE_URL="), "Missing DATABASE_URL");
    assert(content.includes("postgres://"), "DATABASE_URL should be PostgreSQL");
    assert(content.includes("sslmode=require"), "Database should require SSL");
  },
});

Deno.test({
  name: "Config - .env.example should have session configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assert(content.includes("SESSION_SECRET="), "Missing SESSION_SECRET");
    assert(content.includes("COOKIE_NAME="), "Missing COOKIE_NAME");
    assert(content.includes("SESSION_MAX_AGE_MS="), "Missing SESSION_MAX_AGE_MS");
  },
});

Deno.test({
  name: "Config - .env.example should have authentication configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assert(content.includes("AUTH_MODE="), "Missing AUTH_MODE");
    assert(content.includes("PASSWORD_RESET_TOKEN_TTL_MINUTES="), "Missing password reset TTL");
  },
});

Deno.test({
  name: "Config - .env.example should have Twilio Verify configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assert(content.includes("TWILIO_ACCOUNT_SID="), "Missing TWILIO_ACCOUNT_SID");
    assert(content.includes("TWILIO_AUTH_TOKEN="), "Missing TWILIO_AUTH_TOKEN");
    assert(content.includes("TWILIO_VERIFY_SERVICE_SID="), "Missing TWILIO_VERIFY_SERVICE_SID");
  },
});

Deno.test({
  name: "Config - .env.example should have rate limiting configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assert(content.includes("RATE_LIMIT_WINDOW_MS="), "Missing RATE_LIMIT_WINDOW_MS");
    assert(content.includes("RATE_LIMIT_MAX="), "Missing RATE_LIMIT_MAX");
  },
});

Deno.test({
  name: "Config - .env.example should not contain real secrets",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    // Check for placeholder values
    assert(content.includes("change-me"), "Should use placeholder secrets");
    assert(content.includes("your-account-sid"), "Should use placeholder for Twilio SID");
    assert(content.includes("admin@example.com"), "Should use example email");

    // Should not contain real-looking secrets
    assert(!content.match(/[A-Z0-9]{32}/), "Should not contain real API keys");
  },
});

Deno.test({
  name: "Config - .env.example should have proper format (KEY=VALUE)",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const lines = content.split("\n").filter(line =>
      line.trim() && !line.trim().startsWith("#")
    );

    for (const line of lines) {
      assert(
        line.includes("="),
        `Line should contain '=': ${line}`
      );
    }
  },
});

Deno.test({
  name: "Config - .env.example should have SSL configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assert(content.includes("DATABASE_SSL_REJECT_UNAUTHORIZED="), "Missing SSL reject config");
    assert(content.includes("DATABASE_CA_CERT_PATH="), "Missing CA cert path");
  },
});

// ============================================================================
// Test Suite: .gitignore Validation
// ============================================================================

Deno.test({
  name: "Config - .gitignore file should exist",
  async fn() {
    const fileInfo = await Deno.stat(".gitignore");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Config - .gitignore should ignore node_modules",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(
      content.includes("node_modules"),
      ".gitignore should ignore node_modules"
    );
  },
});

Deno.test({
  name: "Config - .gitignore should ignore environment files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes(".env"), "Should ignore .env files");
    assert(content.includes(".env.local"), "Should ignore .env.local");
  },
});

Deno.test({
  name: "Config - .gitignore should ignore build outputs",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes("dist"), "Should ignore dist directory");
    assert(content.includes("build"), "Should ignore build directory");
  },
});

Deno.test({
  name: "Config - .gitignore should ignore sensitive files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes("*.key"), "Should ignore key files");
    assert(content.includes("*.pem"), "Should ignore certificate files");
  },
});

Deno.test({
  name: "Config - .gitignore should ignore logs",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes("logs"), "Should ignore logs directory");
    assert(content.includes("*.log"), "Should ignore log files");
  },
});

Deno.test({
  name: "Config - .gitignore should ignore IDE files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes(".vscode/"), "Should ignore VS Code settings");
    assert(content.includes(".idea"), "Should ignore IntelliJ settings");
  },
});

Deno.test({
  name: "Config - .gitignore should ignore OS files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes(".DS_Store"), "Should ignore macOS .DS_Store");
    assert(content.includes("Thumbs.db"), "Should ignore Windows Thumbs.db");
  },
});

Deno.test({
  name: "Config - .gitignore should allow README.md and specific docs",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes("!README.md"), "Should explicitly allow README.md");
    assert(content.includes("!DATABASE_SETUP.md"), "Should allow DATABASE_SETUP.md");
  },
});

Deno.test({
  name: "Config - .gitignore patterns should be valid",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");
    const lines = content.split("\n").filter(line =>
      line.trim() && !line.trim().startsWith("#")
    );

    // Basic validation - no invalid characters
    for (const line of lines) {
      // Patterns should not contain invalid characters like null bytes
      assert(!line.includes("\0"), `Invalid pattern: ${line}`);
    }
  },
});

// ============================================================================
// Test Suite: Caddyfile Validation
// ============================================================================

Deno.test({
  name: "Config - Caddyfile should exist",
  async fn() {
    const fileInfo = await Deno.stat("Caddyfile");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Config - Caddyfile should have global configuration",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("email"), "Should have ACME email configuration");
  },
});

Deno.test({
  name: "Config - Caddyfile should configure security headers",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("Strict-Transport-Security"), "Should set HSTS header");
    assert(content.includes("X-Content-Type-Options"), "Should set X-Content-Type-Options");
    assert(content.includes("X-Frame-Options"), "Should set X-Frame-Options");
  },
});

Deno.test({
  name: "Config - Caddyfile should have main site configuration",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("aformulationoftruth.com"), "Should configure main domain");
    assert(content.includes("https://"), "Should use HTTPS");
  },
});

Deno.test({
  name: "Config - Caddyfile should proxy API requests",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("handle /api/*"), "Should handle API routes");
    assert(content.includes("reverse_proxy"), "Should use reverse_proxy");
  },
});

Deno.test({
  name: "Config - Caddyfile should handle authentication routes",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("handle /auth/*"), "Should handle auth routes");
  },
});

Deno.test({
  name: "Config - Caddyfile should serve static files",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("file_server"), "Should use file_server directive");
    assert(content.includes("root *"), "Should specify root directory");
  },
});

Deno.test({
  name: "Config - Caddyfile should handle uploads",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("/uploads/*"), "Should handle uploads path");
  },
});

Deno.test({
  name: "Config - Caddyfile should enable compression",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("encode"), "Should enable compression");
    assert(content.includes("gzip"), "Should enable gzip");
  },
});

Deno.test({
  name: "Config - Caddyfile should configure logging",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("log {"), "Should configure logging");
    assert(content.includes("output file"), "Should log to file");
  },
});

Deno.test({
  name: "Config - Caddyfile should have balanced braces",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;

    assertEquals(openBraces, closeBraces, "Braces should be balanced");
  },
});

Deno.test({
  name: "Config - Caddyfile should configure subdomain for proust",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("proust.aformulationoftruth.com"), "Should configure proust subdomain");
  },
});

Deno.test({
  name: "Config - Caddyfile should configure VPN management interface",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("vpn.aformulationoftruth.com"), "Should configure VPN subdomain");
  },
});

Deno.test({
  name: "Config - Caddyfile should use reusable snippets",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("(header_security)"), "Should define header_security snippet");
    assert(content.includes("(common)"), "Should define common snippet");
    assert(content.includes("import"), "Should import snippets");
  },
});

Deno.test({
  name: "Config - Caddyfile should configure proper bindings",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("bind"), "Should specify bind addresses");
  },
});

Deno.test({
  name: "Config - Caddyfile should handle SPA routing",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assert(content.includes("try_files"), "Should use try_files for SPA routing");
    assert(content.includes("/index.html"), "Should fallback to index.html");
  },
});

console.log("\n===========================================");
console.log("Configuration Validation Test Suite");
console.log("===========================================");
console.log("Testing: .env.example, .gitignore, Caddyfile");
console.log("===========================================\n");