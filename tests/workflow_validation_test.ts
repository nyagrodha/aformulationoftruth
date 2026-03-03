/**
 * GitHub Workflow Validation Tests
 *
 * Tests GitHub Actions workflow files to ensure they are valid:
 * 1. claude-code-review.yml - PR code review workflow
 * 2. claude-code.yml - Claude Code automation workflow
 * 3. claude.yml - Claude integration workflow
 *
 * Run with: deno task test
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parse as parseYaml } from "https://deno.land/std@0.208.0/yaml/mod.ts";

// ============================================================================
// Test Suite: claude-code-review.yml Validation
// ============================================================================

Deno.test({
  name: "Workflow - claude-code-review.yml should exist",
  async fn() {
    const fileInfo = await Deno.stat(".github/workflows/claude-code-review.yml");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should be valid YAML",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    assertExists(workflow, "Should parse as valid YAML");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should have name",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    assertExists(workflow.name, "Should have a name");
    assertEquals(workflow.name, "Claude Code Review");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should trigger on pull_request events",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    assertExists(workflow.on, "Should have 'on' trigger");
    const on = workflow.on as Record<string, unknown>;
    assertExists(on.pull_request, "Should trigger on pull_request");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should have correct PR event types",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const on = workflow.on as Record<string, unknown>;
    const pr = on.pull_request as Record<string, unknown>;

    assertExists(pr.types, "Should specify PR event types");
    const types = pr.types as string[];
    assert(types.includes("opened"), "Should trigger on 'opened'");
    assert(types.includes("synchronize"), "Should trigger on 'synchronize'");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should have jobs",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    assertExists(workflow.jobs, "Should have jobs");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should have claude-review job",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    assertExists(jobs["claude-review"], "Should have claude-review job");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should run on ubuntu-latest",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;

    assertEquals(claudeReview["runs-on"], "ubuntu-latest");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should have required permissions",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;
    const permissions = claudeReview.permissions as Record<string, string>;

    assertExists(permissions, "Should have permissions");
    assertEquals(permissions.contents, "read", "Should have read access to contents");
    assertEquals(permissions["pull-requests"], "read", "Should have read access to PRs");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should checkout repository",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;
    const steps = claudeReview.steps as Array<Record<string, unknown>>;

    const checkoutStep = steps.find(step => step.name === "Checkout repository");
    assertExists(checkoutStep, "Should have checkout step");
    assertEquals(checkoutStep.uses, "actions/checkout@v4");
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should use Claude Code action",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;
    const steps = claudeReview.steps as Array<Record<string, unknown>>;

    const claudeStep = steps.find(step => step.name === "Run Claude Code Review");
    assertExists(claudeStep, "Should have Claude Code Review step");
    assert(
      (claudeStep.uses as string).includes("anthropics/claude-code-action"),
      "Should use anthropics/claude-code-action"
    );
  },
});

Deno.test({
  name: "Workflow - claude-code-review.yml should use secrets for authentication",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code-review.yml");

    assert(
      content.includes("secrets.CLAUDE_CODE_OAUTH_TOKEN"),
      "Should use CLAUDE_CODE_OAUTH_TOKEN secret"
    );
  },
});

// ============================================================================
// Test Suite: claude-code.yml Validation
// ============================================================================

Deno.test({
  name: "Workflow - claude-code.yml should exist",
  async fn() {
    const fileInfo = await Deno.stat(".github/workflows/claude-code.yml");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should be valid YAML",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    assertExists(workflow, "Should parse as valid YAML");
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should trigger on issue_comment",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const on = workflow.on as Record<string, unknown>;
    assertExists(on.issue_comment, "Should trigger on issue_comment");
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should trigger on pull_request_review_comment",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const on = workflow.on as Record<string, unknown>;
    assertExists(on.pull_request_review_comment, "Should trigger on PR review comments");
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should have conditional execution",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claude = jobs.claude as Record<string, unknown>;

    assertExists(claude.if, "Should have conditional execution");
    const condition = claude.if as string;
    assert(condition.includes("@claude"), "Should check for @claude mention");
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should have required permissions for CI results",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claude = jobs.claude as Record<string, unknown>;
    const permissions = claude.permissions as Record<string, string>;

    assertEquals(permissions.actions, "read", "Should have read access to actions");
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should use anthropics/claude-code-action@v1",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claude = jobs.claude as Record<string, unknown>;
    const steps = claude.steps as Array<Record<string, unknown>>;

    const claudeStep = steps.find(step => step.id === "claude");
    assertExists(claudeStep, "Should have Claude Code step");
    assertEquals(claudeStep.uses, "anthropics/claude-code-action@v1");
  },
});

Deno.test({
  name: "Workflow - claude-code.yml should configure additional permissions",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude-code.yml");

    assert(
      content.includes("additional_permissions"),
      "Should configure additional_permissions"
    );
    assert(
      content.includes("actions: read"),
      "Should grant actions read permission"
    );
  },
});

// ============================================================================
// Test Suite: claude.yml Validation
// ============================================================================

Deno.test({
  name: "Workflow - claude.yml should exist",
  async fn() {
    const fileInfo = await Deno.stat(".github/workflows/claude.yml");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Workflow - claude.yml should be valid YAML",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    assertExists(workflow, "Should parse as valid YAML");
  },
});

Deno.test({
  name: "Workflow - claude.yml should trigger on multiple events",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const on = workflow.on as Record<string, unknown>;
    assertExists(on.pull_request, "Should trigger on pull_request");
    assertExists(on.issue_comment, "Should trigger on issue_comment");
  },
});

Deno.test({
  name: "Workflow - claude.yml should have write permissions",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const permissions = workflow.permissions as Record<string, string>;
    assertExists(permissions, "Should have permissions");
    assertEquals(permissions["pull-requests"], "write", "Should have write access to PRs");
    assertEquals(permissions.issues, "write", "Should have write access to issues");
  },
});

Deno.test({
  name: "Workflow - claude.yml should use Anthropic API key",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");

    assert(
      content.includes("secrets.ANTHROPIC_API_KEY"),
      "Should use ANTHROPIC_API_KEY secret"
    );
  },
});

Deno.test({
  name: "Workflow - claude.yml should use official Claude Code action",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;
    const steps = claudeReview.steps as Array<Record<string, unknown>>;

    const claudeStep = steps.find(step =>
      step.name === "Claude Code Action Official"
    );
    assertExists(claudeStep, "Should have Claude Code Action step");
    assert(
      (claudeStep.uses as string).includes("anthropics/claude-code-action"),
      "Should use anthropics/claude-code-action"
    );
  },
});

Deno.test({
  name: "Workflow - claude.yml should fetch full git history",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;
    const steps = claudeReview.steps as Array<Record<string, unknown>>;

    const checkoutStep = steps.find(step => step.name === "Checkout code");
    assertExists(checkoutStep, "Should have checkout step");

    const with_ = checkoutStep.with as Record<string, unknown>;
    assertEquals(with_["fetch-depth"], 0, "Should fetch full history");
  },
});

Deno.test({
  name: "Workflow - claude.yml should have conditional for @claude mentions",
  async fn() {
    const content = await Deno.readTextFile(".github/workflows/claude.yml");
    const workflow = parseYaml(content) as Record<string, unknown>;

    const jobs = workflow.jobs as Record<string, unknown>;
    const claudeReview = jobs["claude-review"] as Record<string, unknown>;

    assertExists(claudeReview.if, "Should have conditional execution");
    const condition = claudeReview.if as string;
    assert(condition.includes("@claude"), "Should check for @claude mention");
  },
});

// ============================================================================
// Test Suite: Common Workflow Validation
// ============================================================================

Deno.test({
  name: "Workflow - All workflows should use checkout@v4 or later",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);

      assert(
        content.includes("actions/checkout@v4"),
        `${workflowPath} should use checkout@v4`
      );
    }
  },
});

Deno.test({
  name: "Workflow - All workflows should have descriptive names",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);
      const workflow = parseYaml(content) as Record<string, unknown>;

      assertExists(workflow.name, `${workflowPath} should have a name`);
      assert(
        typeof workflow.name === "string" && workflow.name.length > 0,
        `${workflowPath} name should not be empty`
      );
    }
  },
});

Deno.test({
  name: "Workflow - All workflows should have at least one job",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);
      const workflow = parseYaml(content) as Record<string, unknown>;

      assertExists(workflow.jobs, `${workflowPath} should have jobs`);
      const jobs = workflow.jobs as Record<string, unknown>;
      assert(
        Object.keys(jobs).length > 0,
        `${workflowPath} should have at least one job`
      );
    }
  },
});

Deno.test({
  name: "Workflow - All workflows should not expose secrets in logs",
  async fn() {
    const workflows = [
      ".github/workflows/claude-code-review.yml",
      ".github/workflows/claude-code.yml",
      ".github/workflows/claude.yml",
    ];

    for (const workflowPath of workflows) {
      const content = await Deno.readTextFile(workflowPath);

      // Should not echo or print secrets
      assert(
        !content.match(/echo.*\$\{\{.*secret/i),
        `${workflowPath} should not echo secrets`
      );
    }
  },
});

console.log("\n===========================================");
console.log("GitHub Workflow Validation Test Suite");
console.log("===========================================");
console.log("Testing: claude-code-review.yml, claude-code.yml, claude.yml");
console.log("===========================================\n");