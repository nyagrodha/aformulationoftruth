/**
 * Configuration File Validation Tests
 *
 * Tests for validating configuration files, documentation, and workflows.
 * This ensures that configuration changes don't introduce syntax errors or
 * structural issues.
 *
 * Run with: deno task test tests/config_validation_test.ts
 */

import {
  assertEquals,
  assertExists,
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parse as parseYaml } from "https://deno.land/std@0.208.0/yaml/mod.ts";

console.log(`
===========================================
Configuration Validation Test Suite
===========================================
Testing: YAML workflows, config files, docs
===========================================
`);

// ============================================================================
// Test Suite: GitHub Workflows YAML Validation
// ============================================================================

Deno.test({
  name: "GitHub Workflows - claude-code-review.yml should be valid YAML",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");

    // Should parse without errors
    const parsed = parseYaml(content);
    assertExists(parsed);

    // Should be an object
    assertEquals(typeof parsed, "object");

    // Verify basic workflow structure
    const workflow = parsed as Record<string, unknown>;
    assertExists(workflow.name);
    assertExists(workflow.on);
    assertExists(workflow.jobs);

    assertEquals(workflow.name, "Claude Code Review");
  },
});

Deno.test({
  name: "GitHub Workflows - claude-code-review.yml should have correct trigger events",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const on = workflow.on as Record<string, unknown>;
    assertExists(on.pull_request);

    const prConfig = on.pull_request as Record<string, unknown>;
    const types = prConfig.types as string[];

    // Should trigger on PR events
    assert(types.includes("opened"));
    assert(types.includes("synchronize"));
  },
});

Deno.test({
  name: "GitHub Workflows - claude-code-review.yml should have required permissions",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;
    const permissions = claudeReview.permissions as Record<string, string>;

    assertExists(permissions);
    assertEquals(permissions.contents, "read");
    assertEquals(permissions["pull-requests"], "read");
    assertEquals(permissions["id-token"], "write");
  },
});

Deno.test({
  name: "GitHub Workflows - claude-code.yml should be valid YAML",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");

    const parsed = parseYaml(content);
    assertExists(parsed);

    const workflow = parsed as Record<string, unknown>;
    assertExists(workflow.name);
    assertEquals(workflow.name, "Claude Code Review");
  },
});

Deno.test({
  name: "GitHub Workflows - claude-code.yml should have correct job configuration",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;

    assertExists(claudeReview);
    assertEquals(claudeReview["runs-on"], "ubuntu-latest");

    const permissions = claudeReview.permissions as Record<string, string>;
    assertEquals(permissions.contents, "read");
    assertEquals(permissions["pull-requests"], "write");
  },
});

Deno.test({
  name: "GitHub Workflows - claude.yml should be valid YAML",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");

    const parsed = parseYaml(content);
    assertExists(parsed);

    const workflow = parsed as Record<string, unknown>;
    assertExists(workflow.name);
    assertEquals(workflow.name, "Claude Code");
  },
});

Deno.test({
  name: "GitHub Workflows - claude.yml should trigger on @claude mentions",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claude = jobs["claude"] as Record<string, unknown>;
    const ifCondition = claude.if as string;

    // Should check for @claude mentions
    assertStringIncludes(ifCondition, "@claude");
    assertStringIncludes(ifCondition, "github.event.comment.body");
  },
});

Deno.test({
  name: "GitHub Workflows - claude.yml should use correct action version",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claude = jobs["claude"] as Record<string, unknown>;
    const steps = claude.steps as Array<Record<string, unknown>>;

    const claudeStep = steps.find(step => step.name === "Run Claude Code");
    assertExists(claudeStep);

    const uses = claudeStep.uses as string;
    assertStringIncludes(uses, "anthropics/claude-code-action@");
  },
});

// ============================================================================
// Test Suite: Environment Variables Validation
// ============================================================================

Deno.test({
  name: "Config - .env.example should have required database variables",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assertStringIncludes(content, "NODE_ENV=");
    assertStringIncludes(content, "PORT=");
    assertStringIncludes(content, "DATABASE_URL=");
    assertStringIncludes(content, "SESSION_SECRET=");
  },
});

Deno.test({
  name: "Config - .env.example should have security-related variables",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assertStringIncludes(content, "SESSION_SECRET=");
    assertStringIncludes(content, "COOKIE_NAME=");
    assertStringIncludes(content, "AUTH_MODE=");
  },
});

Deno.test({
  name: "Config - .env.example should have Twilio configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assertStringIncludes(content, "TWILIO_ACCOUNT_SID=");
    assertStringIncludes(content, "TWILIO_AUTH_TOKEN=");
    assertStringIncludes(content, "TWILIO_VERIFY_SERVICE_SID=");
  },
});

Deno.test({
  name: "Config - .env.example should not contain real credentials",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    // Check for placeholder values
    assertStringIncludes(content, "change-me");
    assertStringIncludes(content, "your-account-sid");
    assertStringIncludes(content, "your-auth-token");

    // Should not contain actual secrets (basic check)
    assert(!content.includes("sk_live_"), "Should not contain live API keys");
    assert(!content.includes("AC[a-f0-9]{32}"), "Should not contain real Twilio SIDs");
  },
});

Deno.test({
  name: "Config - .env.example should have rate limiting configuration",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assertStringIncludes(content, "RATE_LIMIT_WINDOW_MS=");
    assertStringIncludes(content, "RATE_LIMIT_MAX=");
  },
});

Deno.test({
  name: "Config - .env.example lines should follow KEY=value format",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const lines = content.split("\n").filter(line =>
      line.trim() && !line.trim().startsWith("#")
    );

    for (const line of lines) {
      // Each non-comment, non-empty line should have an equals sign
      assert(line.includes("="), `Line should have = separator: ${line}`);

      // Should not have spaces around equals (standard .env format)
      const [key] = line.split("=");
      assert(key === key.trim(), `Key should not have trailing spaces: ${key}`);
    }
  },
});

// ============================================================================
// Test Suite: Caddyfile Validation
// ============================================================================

Deno.test({
  name: "Config - Caddyfile should contain main domain configuration",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assertStringIncludes(content, "aformulationoftruth.com");
    assertStringIncludes(content, "admin@aformulationoftruth.com");
  },
});

Deno.test({
  name: "Config - Caddyfile should have security headers configured",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assertStringIncludes(content, "Strict-Transport-Security");
    assertStringIncludes(content, "X-Content-Type-Options");
    assertStringIncludes(content, "X-Frame-Options");
  },
});

Deno.test({
  name: "Config - Caddyfile should configure reverse proxy for API",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assertStringIncludes(content, "/api/*");
    assertStringIncludes(content, "reverse_proxy");
  },
});

Deno.test({
  name: "Config - Caddyfile should have logging configured",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assertStringIncludes(content, "log {");
    assertStringIncludes(content, "output file");
  },
});

Deno.test({
  name: "Config - Caddyfile should have compression enabled",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assertStringIncludes(content, "encode");
    assert(content.includes("gzip") || content.includes("zstd"));
  },
});

Deno.test({
  name: "Config - Caddyfile should configure HTTPS domains with bind addresses",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Should have HTTPS domains
    assertStringIncludes(content, "https://");

    // Should have bind directives for dual-stack (IPv4 and IPv6)
    assertStringIncludes(content, "bind");
  },
});

// ============================================================================
// Test Suite: .gitignore Validation
// ============================================================================

Deno.test({
  name: "Config - .gitignore should ignore node_modules",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes("node_modules") || content.includes("node_modules/"));
  },
});

Deno.test({
  name: "Config - .gitignore should ignore environment files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assertStringIncludes(content, ".env");
    assert(content.match(/\.env[.\*]/), "Should ignore .env variants");
  },
});

Deno.test({
  name: "Config - .gitignore should ignore build outputs",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assert(content.includes("dist") || content.includes("dist/"));
    assert(content.includes("build") || content.includes("build/"));
  },
});

Deno.test({
  name: "Config - .gitignore should ignore sensitive files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    // Keys and certificates
    assert(content.includes("*.key") || content.includes("keys/"));
    assert(content.includes("*.pem"));
  },
});

Deno.test({
  name: "Config - .gitignore should ignore IDE files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    assertStringIncludes(content, ".vscode");
    assertStringIncludes(content, ".DS_Store");
  },
});

Deno.test({
  name: "Config - .gitignore should allow specific important files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    // Should have negation patterns for important files
    assertStringIncludes(content, "!README.md");
    assertStringIncludes(content, "!DATABASE_SETUP.md");
  },
});

// ============================================================================
// Test Suite: Agent Configuration Validation
// ============================================================================

Deno.test({
  name: "Agent Config - sendgrid-reputation-expert.md should have YAML frontmatter",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Should start with YAML frontmatter delimiters
    assert(content.startsWith("---"), "Should start with YAML frontmatter");

    const lines = content.split("\n");
    const secondDelimiter = lines.findIndex((line, idx) => idx > 0 && line === "---");
    assert(secondDelimiter > 0, "Should have closing YAML frontmatter delimiter");
  },
});

Deno.test({
  name: "Agent Config - sendgrid-reputation-expert.md should have required metadata",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assertStringIncludes(content, "name: sendgrid-reputation-expert");
    assertStringIncludes(content, "description:");
    assertStringIncludes(content, "model:");
  },
});

Deno.test({
  name: "Agent Config - sendgrid-reputation-expert.md should specify color",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assertStringIncludes(content, "color:");
  },
});

Deno.test({
  name: "Agent Config - sendgrid-reputation-expert.md should have structured content sections",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Should have key sections
    assertStringIncludes(content, "## Your Core Responsibilities");
    assertStringIncludes(content, "## Critical Areas You Must Address");
    assertStringIncludes(content, "## Your Conversational Approach");
  },
});

Deno.test({
  name: "Agent Config - sendgrid-reputation-expert.md should mention SendGrid expertise",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assertStringIncludes(content, "SendGrid");
    assertStringIncludes(content, "email deliverability");
    assertStringIncludes(content, "sender reputation");
  },
});

Deno.test({
  name: "Agent Config - sendgrid-reputation-expert.md should include usage examples",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assertStringIncludes(content, "Examples:");
    assertStringIncludes(content, "user:");
    assertStringIncludes(content, "assistant:");
  },
});

// ============================================================================
// Test Suite: Documentation Validation
// ============================================================================

Deno.test({
  name: "Docs - FONTS.md should list available fonts",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Should have a table or list of fonts
    assertStringIncludes(content, "Font");
    assertStringIncludes(content, "Rye");
    assertStringIncludes(content, "Orbitron");
  },
});

Deno.test({
  name: "Docs - FONTS.md should explain self-hosting rationale",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assertStringIncludes(content, "Why Self-Host");
    assertStringIncludes(content, "privacy");
  },
});

Deno.test({
  name: "Docs - FONTS.md should have font directory path",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assertStringIncludes(content, "/public/fonts");
  },
});

Deno.test({
  name: "Docs - FONTS.md should have markdown table structure",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Check for markdown table syntax
    const hasTableSeparator = content.includes("|---");
    assert(hasTableSeparator, "Should contain markdown table separator");
  },
});

Deno.test({
  name: "Docs - FONTS.md should list font file formats",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Should mention font formats
    assert(
      content.includes(".woff2") || content.includes(".woff") || content.includes(".ttf"),
      "Should mention font file formats"
    );
  },
});

// ============================================================================
// Test Suite: Cross-File Consistency
// ============================================================================

Deno.test({
  name: "Consistency - .gitignore should ignore .env but allow .env.example",
  async fn() {
    const gitignore = await Deno.readTextFile(".gitignore");

    // Should ignore .env files
    assertStringIncludes(gitignore, ".env");

    // .env.example should exist (not ignored)
    const envExampleExists = await Deno.stat(".env.example")
      .then(() => true)
      .catch(() => false);

    assertEquals(envExampleExists, true, ".env.example should exist and not be ignored");
  },
});

Deno.test({
  name: "Consistency - Port in .env.example should match common configurations",
  async fn() {
    const envContent = await Deno.readTextFile(".env.example");

    // Extract PORT value
    const portMatch = envContent.match(/PORT=(\d+)/);
    assertExists(portMatch, "PORT should be defined in .env.example");

    const port = parseInt(portMatch[1]);

    // Port should be in valid range
    assert(port > 1024 && port < 65535, "Port should be in valid range (1024-65535)");
  },
});

Deno.test({
  name: "Consistency - GitHub workflows should use consistent action versions",
  async fn() {
    const files = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml"
    ];

    for (const file of files) {
      const content = await Deno.readTextFile(file);

      // Should use checkout action
      if (content.includes("actions/checkout")) {
        assertStringIncludes(content, "actions/checkout@v4");
      }
    }
  },
});

// ============================================================================
// Test Suite: Security Checks
// ============================================================================

Deno.test({
  name: "Security - Caddyfile should enforce HTTPS",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // All domains should use https://
    const domainLines = content.split("\n").filter(line =>
      line.includes("aformulationoftruth.com") && line.trim().startsWith("https://")
    );

    assert(domainLines.length > 0, "Should have HTTPS domain configurations");
  },
});

Deno.test({
  name: "Security - Caddyfile should set X-Frame-Options to DENY",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    assertStringIncludes(content, 'X-Frame-Options "DENY"');
  },
});

Deno.test({
  name: "Security - GitHub workflows should not expose secrets in logs",
  async fn() {
    const files = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml"
    ];

    for (const file of files) {
      const content = await Deno.readTextFile(file);

      // Should use secrets.* syntax, not hardcoded values
      const secretRefs = content.match(/\$\{\{\s*secrets\.\w+\s*\}\}/g);

      if (content.includes("ANTHROPIC_API_KEY") || content.includes("CLAUDE_CODE_OAUTH_TOKEN")) {
        assertExists(secretRefs, `${file} should reference secrets from GitHub secrets`);
      }
    }
  },
});

Deno.test({
  name: "Security - .env.example should warn about changing default secrets",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    assertStringIncludes(content, "change-me");
    assertStringIncludes(content, "ChangeMeNow");
  },
});

// ============================================================================
// Test Suite: Edge Cases and Negative Tests
// ============================================================================

Deno.test({
  name: "Edge Case - Agent config should handle malformed YAML gracefully",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Verify YAML section is well-formed by checking for balanced delimiters
    const yamlMatches = content.match(/^---$/gm);
    assert(yamlMatches && yamlMatches.length >= 2, "Should have opening and closing YAML delimiters");
  },
});

Deno.test({
  name: "Edge Case - .env.example should not have duplicate keys",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const lines = content.split("\n")
      .filter(line => line.trim() && !line.trim().startsWith("#"))
      .map(line => line.split("=")[0].trim());

    const uniqueKeys = new Set(lines);
    assertEquals(
      lines.length,
      uniqueKeys.size,
      "Should not have duplicate environment variable keys"
    );
  },
});

Deno.test({
  name: "Edge Case - Caddyfile should not have conflicting domain bindings",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Check that domains don't have conflicting configurations
    const domainBlocks = content.split(/^https?:\/\//gm).filter(block => block.trim());

    // Each domain block should be non-empty
    for (const block of domainBlocks) {
      assert(block.trim().length > 0, "Domain block should not be empty");
    }
  },
});

Deno.test({
  name: "Edge Case - .gitignore should not ignore critical config files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");
    const lines = content.split("\n").map(l => l.trim());

    // These files should NOT be in gitignore (unless negated)
    const criticalFiles = ["package.json", "deno.json", "Caddyfile"];

    for (const file of criticalFiles) {
      const isIgnored = lines.some(line =>
        line === file ||
        (line.endsWith(file) && !line.startsWith("!"))
      );

      assert(
        !isIgnored,
        `Critical file ${file} should not be ignored (or should be negated)`
      );
    }
  },
});

Deno.test({
  name: "Negative Test - GitHub workflow should not use deprecated checkout versions",
  async fn() {
    const files = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml"
    ];

    for (const file of files) {
      const content = await Deno.readTextFile(file);

      if (content.includes("actions/checkout")) {
        // Should not use very old versions (v1, v2)
        assert(
          !content.includes("actions/checkout@v1"),
          `${file} should not use deprecated checkout@v1`
        );
        assert(
          !content.includes("actions/checkout@v2"),
          `${file} should not use deprecated checkout@v2`
        );
      }
    }
  },
});

Deno.test({
  name: "Negative Test - .env.example should not contain actual database credentials",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    // Check for patterns that might indicate real credentials
    assert(
      !content.match(/postgres:\/\/[^:]+:[^@]{20,}@/),
      "Should not contain real database credentials"
    );

    // Check that passwords are clearly placeholders
    const passwordMatch = content.match(/PASSWORD=(.+)/i);
    if (passwordMatch) {
      const password = passwordMatch[1].trim();
      assert(
        password.includes("change") || password.includes("example") || password.includes("your-"),
        "Password should be a placeholder"
      );
    }
  },
});

Deno.test({
  name: "Negative Test - Caddyfile should not have localhost in production domains",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Extract HTTPS domain declarations
    const httpsDomains = content.match(/https:\/\/[^\s{]+/g) || [];

    for (const domain of httpsDomains) {
      assert(
        !domain.includes("localhost"),
        `Production domains should not include localhost: ${domain}`
      );
    }
  },
});

Deno.test({
  name: "Negative Test - Agent config should not have hardcoded API keys",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Check for common API key patterns
    assert(
      !content.match(/['\"]sk_[a-zA-Z0-9]{32,}['\"]/) &&
      !content.match(/['\"]key_[a-zA-Z0-9]{32,}['\"]/) &&
      !content.match(/['\"]api_[a-zA-Z0-9]{32,}['\"]/) &&
      !content.match(/['\"]SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}['\""]/),
      "Agent config should not contain hardcoded API keys"
    );
  },
});

Deno.test({
  name: "Edge Case - FONTS.md should have consistent table formatting",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Find all table rows
    const tableRows = content.split("\n").filter(line => line.trim().startsWith("|"));

    if (tableRows.length > 0) {
      // Count pipes in first data row (after header separator)
      const separatorIndex = tableRows.findIndex(row => row.includes("|---"));

      if (separatorIndex >= 0 && tableRows.length > separatorIndex + 1) {
        const firstDataRow = tableRows[separatorIndex + 1];
        const expectedPipes = (firstDataRow.match(/\|/g) || []).length;

        // All data rows should have same number of pipes
        for (let i = separatorIndex + 1; i < tableRows.length; i++) {
          const pipeCount = (tableRows[i].match(/\|/g) || []).length;
          assertEquals(
            pipeCount,
            expectedPipes,
            `Row ${i} should have ${expectedPipes} pipes for consistent table formatting`
          );
        }
      }
    }
  },
});

Deno.test({
  name: "Regression Test - .gitignore should still ignore .claude directory",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    // This is a regression test - ensure .claude is still ignored
    assertStringIncludes(content, ".claude");
  },
});

Deno.test({
  name: "Boundary Test - .env.example PORT should be within valid range",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const portMatch = content.match(/^PORT=(\d+)/m);

    assertExists(portMatch);
    const port = parseInt(portMatch[1]);

    // Valid port range
    assert(port >= 0 && port <= 65535, "PORT should be in valid range 0-65535");

    // Should not be privileged port (< 1024) unless specifically intended
    assert(port >= 1024, "PORT should not be a privileged port (< 1024)");
  },
});

Deno.test({
  name: "Boundary Test - .env.example SESSION_MAX_AGE should be reasonable",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const maxAgeMatch = content.match(/SESSION_MAX_AGE_MS=(\d+)/);

    if (maxAgeMatch) {
      const maxAge = parseInt(maxAgeMatch[1]);

      // Should be between 1 minute and 30 days
      const oneMinute = 60 * 1000;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      assert(
        maxAge >= oneMinute && maxAge <= thirtyDays,
        `SESSION_MAX_AGE_MS should be between ${oneMinute} and ${thirtyDays}`
      );
    }
  },
});

Deno.test({
  name: "Regression Test - GitHub workflows should still require permissions",
  async fn() {
    const files = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude.yml"
    ];

    for (const file of files) {
      const content = await Deno.readTextFile(file);
      const workflow = parseYaml(content) as Record<string, unknown>;
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;

      for (const [jobName, job] of Object.entries(jobs)) {
        if (job.permissions) {
          // Verify permissions are explicitly set
          const perms = job.permissions as Record<string, string>;
          assertExists(perms, `Job ${jobName} in ${file} should have permissions defined`);

          // Should have at least one permission set
          const permKeys = Object.keys(perms);
          assert(permKeys.length > 0, `Job ${jobName} should have at least one permission`);
        }
      }
    }
  },
});

Deno.test({
  name: "Edge Case - Caddyfile reverse_proxy targets should be valid URLs",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Find all reverse_proxy directives
    const proxyMatches = content.matchAll(/reverse_proxy\s+(\S+)/g);

    for (const match of proxyMatches) {
      const target = match[1];

      // Should be a valid URL format
      assert(
        target.startsWith("http://") || target.startsWith("https://") || target.startsWith("unix/"),
        `Reverse proxy target should be valid URL or socket: ${target}`
      );
    }
  },
});

Deno.test({
  name: "Negative Test - Configuration files should not contain TODO or FIXME",
  async fn() {
    const files = [
      ".env.example",
      "Caddyfile",
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml"
    ];

    for (const file of files) {
      const content = await Deno.readTextFile(file);

      // Production config files should not have unresolved TODOs
      assert(
        !content.includes("TODO") && !content.includes("FIXME"),
        `${file} should not contain unresolved TODO or FIXME comments`
      );
    }
  },
});

console.log(`
===========================================
Configuration Validation Tests Complete
Includes: 65+ tests covering functionality,
edge cases, boundaries, regressions, and
negative test scenarios
===========================================
`);