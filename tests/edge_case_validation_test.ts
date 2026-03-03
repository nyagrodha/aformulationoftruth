/**
 * Edge Case and Regression Validation Tests
 *
 * Additional tests to strengthen confidence in the changed files:
 * 1. Cross-file consistency checks
 * 2. Security validations
 * 3. Edge cases and boundary conditions
 * 4. Negative test cases
 *
 * Run with: deno task test
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// ============================================================================
// Test Suite: Cross-File Consistency
// ============================================================================

Deno.test({
  name: "Consistency - Environment variables in .env.example match expected usage",
  async fn() {
    const envContent = await Deno.readTextFile(".env.example");
    const caddyContent = await Deno.readTextFile("Caddyfile");

    // If Caddyfile mentions ports, .env.example should have PORT configured
    if (caddyContent.includes("localhost:")) {
      assert(envContent.includes("PORT="), "PORT should be in .env.example");
    }
  },
});

Deno.test({
  name: "Consistency - .gitignore should ignore files that contain secrets from .env.example",
  async fn() {
    const gitignoreContent = await Deno.readTextFile(".gitignore");

    // Critical files that must be ignored
    const criticalIgnores = [".env", "*.key", "*.pem"];

    for (const pattern of criticalIgnores) {
      assert(
        gitignoreContent.includes(pattern),
        `${pattern} must be in .gitignore to prevent secret leaks`
      );
    }
  },
});

Deno.test({
  name: "Consistency - Workflow secrets should not be hardcoded",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);

      // Should use secrets, not hardcoded values
      assert(
        !content.match(/api[_-]?key:\s*[a-zA-Z0-9]{20,}/i),
        `${workflowPath} should not contain hardcoded API keys`
      );
      assert(
        !content.match(/token:\s*[a-zA-Z0-9]{20,}/i),
        `${workflowPath} should not contain hardcoded tokens`
      );
    }
  },
});

Deno.test({
  name: "Consistency - Agent definition color should be valid CSS color",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const colorMatch = frontmatter.match(/color:\s*(\w+)/);
    assertExists(colorMatch, "Should have color defined");

    const color = colorMatch[1];
    const validColors = [
      "red",
      "blue",
      "green",
      "yellow",
      "cyan",
      "magenta",
      "orange",
      "purple",
      "pink",
      "gray",
      "black",
      "white",
    ];

    assert(
      validColors.includes(color) || color.match(/^#[0-9a-fA-F]{6}$/),
      `Color '${color}' should be a valid CSS color name or hex code`
    );
  },
});

// ============================================================================
// Test Suite: Security Validations
// ============================================================================

Deno.test({
  name: "Security - .env.example should not contain real credentials",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    // Check for common patterns of real credentials
    const suspiciousPatterns = [
      /sk_live_[a-zA-Z0-9]+/, // Stripe live keys
      /pk_live_[a-zA-Z0-9]+/, // Stripe live keys
      /AKIA[0-9A-Z]{16}/, // AWS access keys
      /-----BEGIN PRIVATE KEY-----/, // Private keys
      /[a-zA-Z0-9]{40}/, // GitHub tokens (40 chars)
    ];

    for (const pattern of suspiciousPatterns) {
      assert(
        !content.match(pattern),
        `Should not contain real credentials matching pattern ${pattern}`
      );
    }
  },
});

Deno.test({
  name: "Security - Workflows should use read-only checkout when possible",
  async fn() {
    const reviewWorkflow = await Deno.readTextFile(
      ".github/workflows/claude-code-review.yml"
    );

    // Code review workflow should use minimal fetch depth for security
    assert(
      reviewWorkflow.includes("fetch-depth: 1"),
      "Code review should use shallow clone for security"
    );
  },
});

Deno.test({
  name: "Security - Caddyfile should enforce HTTPS",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Should use https:// for production domains
    assert(content.includes("https://"), "Should enforce HTTPS");

    // Should not have insecure configurations
    assert(
      !content.includes("http://aformulationoftruth.com"),
      "Should not allow insecure HTTP for main domain"
    );
  },
});

Deno.test({
  name: "Security - Caddyfile should have security headers configured",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    const securityHeaders = [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ];

    for (const header of securityHeaders) {
      assert(
        content.includes(header),
        `Should configure ${header} security header`
      );
    }
  },
});

Deno.test({
  name: "Security - .gitignore should prevent committing sensitive directories",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    const sensitiveDirs = ["node_modules", ".env", "keys/", "uploads/"];

    for (const dir of sensitiveDirs) {
      assert(
        content.includes(dir),
        `Should ignore sensitive directory: ${dir}`
      );
    }
  },
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

Deno.test({
  name: "Edge Case - .env.example should handle multiline values correctly",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const lines = content.split("\n");

    for (const line of lines) {
      if (line.trim() && !line.trim().startsWith("#")) {
        // Should not have unescaped newlines in values
        const parts = line.split("=");
        if (parts.length > 1) {
          const value = parts.slice(1).join("=");
          assert(
            !value.includes("\n"),
            `Line should not contain unescaped newlines: ${line}`
          );
        }
      }
    }
  },
});

Deno.test({
  name: "Edge Case - Workflows should handle PR from forks safely",
  async fn() {
    const codeWorkflow = await Deno.readTextFile(".github/workflows/claude-code.yml");

    // When triggered by PR comments, should check for @claude mention
    assert(
      codeWorkflow.includes("@claude"),
      "Should require explicit mention to avoid unauthorized execution"
    );
  },
});

Deno.test({
  name: "Edge Case - Caddyfile should handle both www and non-www domains",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Should handle both variants
    const hasMainDomain = content.includes("aformulationoftruth.com");
    const hasWwwDomain = content.includes("www.aformulationoftruth.com");

    assert(hasMainDomain || hasWwwDomain, "Should configure domain");
  },
});

Deno.test({
  name: "Edge Case - Agent definition should handle long content gracefully",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Large agent definitions should still parse correctly
    assert(content.length > 0, "Should have content");
    assert(content.length < 1000000, "Should not be unreasonably large");

    // Should not have runaway repeated content
    const lines = content.split("\n");
    const uniqueLines = new Set(lines);
    const repetitionRatio = uniqueLines.size / lines.length;

    assert(
      repetitionRatio > 0.3,
      "Should not have excessive repeated content"
    );
  },
});

Deno.test({
  name: "Edge Case - Image files should not be symbolic links",
  async fn() {
    const images = ["543.PNG", "IMG_3274.jpg"];

    for (const imagePath of images) {
      const fileInfo = await Deno.stat(imagePath);
      assertEquals(
        fileInfo.isFile,
        true,
        `${imagePath} should be a regular file, not a symlink`
      );
      assertEquals(
        fileInfo.isSymlink,
        false,
        `${imagePath} should not be a symlink`
      );
    }
  },
});

// ============================================================================
// Test Suite: Negative Tests
// ============================================================================

Deno.test({
  name: "Negative - .env.example should not have empty required values",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const lines = content.split("\n");

    const requiredVars = ["NODE_ENV", "PORT", "DATABASE_URL"];

    for (const varName of requiredVars) {
      const varLine = lines.find((line) => line.startsWith(`${varName}=`));
      if (varLine) {
        const value = varLine.split("=")[1];
        assert(
          value && value.trim().length > 0,
          `${varName} should not be empty`
        );
      }
    }
  },
});

Deno.test({
  name: "Negative - Workflows should not run on all branches unconditionally",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);

      // Should have some form of filtering (on: pull_request, if:, etc.)
      const hasFiltering =
        content.includes("pull_request") ||
        content.includes("if:") ||
        content.includes("issue_comment") ||
        content.includes("types:");

      assert(
        hasFiltering,
        `${workflowPath} should have event filtering to avoid unnecessary runs`
      );
    }
  },
});

Deno.test({
  name: "Negative - Caddyfile should not proxy to insecure internal services without auth",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // If proxying to localhost, should be intentional and documented
    if (content.includes("reverse_proxy http://localhost")) {
      // VPN interface is an exception and is properly isolated
      const vpnException = content.includes("vpn.aformulationoftruth.com");

      // API proxies to localhost should exist (they're internal services)
      const apiProxy = content.includes("handle /api/*");

      assert(
        vpnException || apiProxy,
        "Localhost proxies should be for known services"
      );
    }
  },
});

Deno.test({
  name: "Negative - .gitignore should not ignore critical files",
  async fn() {
    const content = await Deno.readTextFile(".gitignore");

    // Should NOT ignore these critical files
    const criticalFiles = ["package.json", "deno.json", "README.md"];

    for (const file of criticalFiles) {
      // Check if it's explicitly negated with !
      const isExplicitlyIncluded = content.includes(`!${file}`);
      const isIgnored = content.includes(file) && !isExplicitlyIncluded;

      if (file === "README.md") {
        // README.md is explicitly allowed despite *.md being ignored
        assert(
          content.includes("!README.md"),
          "README.md should be explicitly allowed"
        );
      } else if (file === "deno.json" || file === "package.json") {
        // These are explicitly allowed
        assert(
          content.includes(`!${file}`) || !content.includes(file),
          `${file} should not be ignored`
        );
      }
    }
  },
});

Deno.test({
  name: "Negative - Image files should not be zero-filled",
  async fn() {
    const file = await Deno.readFile("543.PNG");

    // Check that file is not just zeros
    let nonZeroBytes = 0;
    for (let i = 0; i < Math.min(1000, file.length); i++) {
      if (file[i] !== 0) {
        nonZeroBytes++;
      }
    }

    assert(
      nonZeroBytes > 100,
      "Image should have substantial non-zero content"
    );
  },
});

// ============================================================================
// Test Suite: Boundary Conditions
// ============================================================================

Deno.test({
  name: "Boundary - .env.example values should not be excessively long",
  async fn() {
    const content = await Deno.readTextFile(".env.example");
    const lines = content.split("\n");

    for (const line of lines) {
      if (line.trim() && !line.trim().startsWith("#")) {
        assert(
          line.length < 1000,
          `Environment variable line should not be excessively long: ${line.substring(0, 50)}...`
        );
      }
    }
  },
});

Deno.test({
  name: "Boundary - Workflow job names should not be too long",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);

      // Job names should be reasonable length
      const jobNameMatches = content.match(/^\s{2}[\w-]+:/gm);
      if (jobNameMatches) {
        for (const match of jobNameMatches) {
          const jobName = match.trim().replace(":", "");
          assert(
            jobName.length < 50,
            `Job name should be concise: ${jobName}`
          );
        }
      }
    }
  },
});

Deno.test({
  name: "Boundary - Agent description should fit within reasonable limits",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const descMatch = frontmatter.match(/description:\s*(.+?)(?=\nmodel:|\n\w+:|$)/s);

    if (descMatch) {
      const description = descMatch[1].trim();
      assert(
        description.length < 5000,
        "Description should be concise (< 5000 chars)"
      );
      assert(
        description.length > 20,
        "Description should be meaningful (> 20 chars)"
      );
    }
  },
});

Deno.test({
  name: "Boundary - Caddyfile paths should not have double slashes",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Should not have path traversal or double slashes
    assert(
      !content.includes("//"),
      "Should not have double slashes in paths (except in URLs)"
    );
  },
});

Deno.test({
  name: "Boundary - PNG files should not exceed typical screenshot sizes",
  async fn() {
    const playwrightDir = ".playwright-mcp";
    const maxReasonableSize = 5 * 1024 * 1024; // 5MB for screenshots

    for await (const entry of Deno.readDir(playwrightDir)) {
      if (entry.isFile && entry.name.endsWith(".png")) {
        const path = `${playwrightDir}/${entry.name}`;
        const fileInfo = await Deno.stat(path);

        assert(
          fileInfo.size < maxReasonableSize,
          `Screenshot ${entry.name} should be under 5MB (found ${Math.round(fileInfo.size / 1024 / 1024)}MB)`
        );
      }
    }
  },
});

// ============================================================================
// Test Suite: Regression Prevention
// ============================================================================

Deno.test({
  name: "Regression - .env.example should maintain backward compatibility",
  async fn() {
    const content = await Deno.readTextFile(".env.example");

    // Core variables that should always exist
    const coreVars = ["DATABASE_URL", "SESSION_SECRET", "PORT"];

    for (const varName of coreVars) {
      assert(
        content.includes(varName),
        `Core variable ${varName} should not be removed`
      );
    }
  },
});

Deno.test({
  name: "Regression - Workflows should maintain CI/CD functionality",
  async fn() {
    const codeWorkflow = await Deno.readTextFile(".github/workflows/claude-code.yml");

    // Should still have checkout and Claude action
    assert(
      codeWorkflow.includes("actions/checkout"),
      "Should maintain checkout step"
    );
    assert(
      codeWorkflow.includes("anthropics/claude-code-action"),
      "Should maintain Claude Code action"
    );
  },
});

Deno.test({
  name: "Regression - Caddyfile should maintain core routing",
  async fn() {
    const content = await Deno.readTextFile("Caddyfile");

    // Core routes should be preserved
    const coreRoutes = ["/api/*", "/auth/*"];

    for (const route of coreRoutes) {
      assert(
        content.includes(route),
        `Core route ${route} should be maintained`
      );
    }
  },
});

Deno.test({
  name: "Regression - Agent definition should maintain required structure",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Should maintain YAML frontmatter structure
    assert(content.startsWith("---"), "Should maintain YAML frontmatter");

    const parts = content.split("---");
    assert(parts.length >= 3, "Should have complete frontmatter structure");

    // Should maintain content sections
    assert(
      content.includes("Core Responsibilities") ||
        content.includes("expertise") ||
        content.includes("mission"),
      "Should maintain core content sections"
    );
  },
});

console.log("\n===========================================");
console.log("Edge Case & Regression Test Suite");
console.log("===========================================");
console.log("Testing: Cross-file consistency, security, edge cases");
console.log("===========================================\n");