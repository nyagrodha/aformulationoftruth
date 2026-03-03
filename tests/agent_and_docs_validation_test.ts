/**
 * Agent Definition and Documentation Validation Tests
 *
 * Tests agent definitions and documentation files:
 * 1. sendgrid-reputation-expert.md - Agent configuration
 * 2. FONTS.md - Font documentation
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
// Test Suite: sendgrid-reputation-expert.md Validation
// ============================================================================

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should exist",
  async fn() {
    const fileInfo = await Deno.stat(".claude/agents/sendgrid-reputation-expert.md");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have YAML frontmatter",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.startsWith("---"), "Should start with YAML frontmatter delimiter");
    const parts = content.split("---");
    assert(parts.length >= 3, "Should have proper frontmatter structure");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have valid YAML frontmatter",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const yaml = parseYaml(frontmatter) as Record<string, unknown>;
    assertExists(yaml, "Frontmatter should be valid YAML");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have required frontmatter fields",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const yaml = parseYaml(frontmatter) as Record<string, unknown>;

    assertExists(yaml.name, "Should have name field");
    assertExists(yaml.description, "Should have description field");
    assertExists(yaml.model, "Should have model field");
    assertExists(yaml.color, "Should have color field");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have correct name",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const yaml = parseYaml(frontmatter) as Record<string, unknown>;

    assertEquals(yaml.name, "sendgrid-reputation-expert");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should specify opus model",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const yaml = parseYaml(frontmatter) as Record<string, unknown>;

    assertEquals(yaml.model, "opus", "Should use opus model for expert agent");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have descriptive description",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const frontmatter = parts[1];

    const yaml = parseYaml(frontmatter) as Record<string, unknown>;
    const description = yaml.description as string;

    assertExists(description, "Should have description");
    assert(description.length > 50, "Description should be detailed");
    assert(description.includes("email"), "Should mention email");
    assert(description.includes("SendGrid"), "Should mention SendGrid");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have markdown content",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");
    const markdownContent = parts.slice(2).join("---");

    assert(markdownContent.length > 0, "Should have markdown content");
    assert(markdownContent.includes("#"), "Should have markdown headers");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should cover authentication topics",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("SPF"), "Should mention SPF authentication");
    assert(content.includes("DKIM"), "Should mention DKIM authentication");
    assert(content.includes("DMARC"), "Should mention DMARC authentication");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should cover reputation management",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("reputation"), "Should discuss sender reputation");
    assert(content.includes("deliverability"), "Should discuss deliverability");
    assert(content.includes("bounce"), "Should discuss bounce management");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should cover security topics",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("API key"), "Should discuss API key security");
    assert(content.includes("security"), "Should discuss security");
    assert(content.includes("validation"), "Should discuss input validation");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have error handling guidance",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("error"), "Should discuss error handling");
    assert(content.includes("retry"), "Should discuss retry logic");
    assert(content.includes("logging"), "Should discuss logging");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have usage examples",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("Examples:"), "Should have usage examples");
    assert(content.includes("user:"), "Should have user examples");
    assert(content.includes("assistant:"), "Should have assistant examples");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should define expertise areas",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("Core Responsibilities"), "Should define core responsibilities");
    assert(content.includes("Critical Areas"), "Should define critical areas");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have conversational approach",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("Conversational Approach"), "Should define conversational approach");
    assert(content.includes("question"), "Should encourage asking questions");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should list red flags",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(content.includes("Red Flags"), "Should list red flags to catch");
    assert(content.includes("Hardcoded"), "Should warn about hardcoded values");
  },
});

// ============================================================================
// Test Suite: FONTS.md Validation
// ============================================================================

Deno.test({
  name: "Docs - FONTS.md should exist",
  async fn() {
    const fileInfo = await Deno.stat("FONTS.md");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Docs - FONTS.md should have a title",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(content.includes("# Fonts"), "Should have a main title");
  },
});

Deno.test({
  name: "Docs - FONTS.md should document font files",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(content.includes(".woff2") || content.includes(".ttf"), "Should mention font formats");
  },
});

Deno.test({
  name: "Docs - FONTS.md should list available fonts",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(content.includes("Available Fonts") || content.includes("Font"), "Should list fonts");
  },
});

Deno.test({
  name: "Docs - FONTS.md should have table format",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(content.includes("|"), "Should use markdown table format");
  },
});

Deno.test({
  name: "Docs - FONTS.md should mention font weights",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(
      content.includes("400") || content.includes("700") || content.includes("Weights"),
      "Should mention font weights"
    );
  },
});

Deno.test({
  name: "Docs - FONTS.md should mention self-hosting",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(content.includes("self-host") || content.includes("Self-Host"), "Should explain self-hosting");
  },
});

Deno.test({
  name: "Docs - FONTS.md should explain why self-hosting",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(
      content.includes("privacy") || content.includes("Privacy") || content.includes("tracking"),
      "Should explain privacy benefits"
    );
  },
});

Deno.test({
  name: "Docs - FONTS.md should mention font directory",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(content.includes("/public/fonts/") || content.includes("fonts/"), "Should mention fonts directory");
  },
});

Deno.test({
  name: "Docs - FONTS.md should list specific fonts used",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Should mention at least some fonts
    const fontCount = (content.match(/\|\s*\w+\s*\|/g) || []).length;
    assert(fontCount > 5, "Should list multiple fonts");
  },
});

Deno.test({
  name: "Docs - FONTS.md should have instructions for adding fonts",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(
      content.includes("Adding") || content.includes("add"),
      "Should have instructions for adding fonts"
    );
  },
});

Deno.test({
  name: "Docs - FONTS.md should be valid markdown",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Basic markdown validation - should have headers
    assert(content.includes("#"), "Should have markdown headers");

    // Should not have unclosed brackets
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    assert(
      Math.abs(openBrackets - closeBrackets) <= 1,
      "Markdown links should be properly closed"
    );
  },
});

Deno.test({
  name: "Docs - FONTS.md should mention Google Fonts",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(
      content.includes("Google Fonts") || content.includes("Google"),
      "Should mention Google Fonts as context"
    );
  },
});

Deno.test({
  name: "Docs - FONTS.md should have last updated information",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    assert(
      content.includes("Last updated") || content.includes("updated") || content.includes("202"),
      "Should have last updated date"
    );
  },
});

Deno.test({
  name: "Docs - FONTS.md should explain benefits of self-hosting",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    const benefits = ["tracking", "load", "offline", "privacy"];
    const mentionedBenefits = benefits.filter(benefit =>
      content.toLowerCase().includes(benefit)
    );

    assert(
      mentionedBenefits.length >= 2,
      `Should mention at least 2 benefits of self-hosting (found: ${mentionedBenefits.join(", ")})`
    );
  },
});

// ============================================================================
// Test Suite: Edge Cases and Additional Validations
// ============================================================================

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should not have malformed YAML",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");
    const parts = content.split("---");

    assert(parts.length >= 3, "Should have proper frontmatter structure");

    // Try to parse and ensure it doesn't throw
    try {
      const frontmatter = parts[1];
      const yaml = parseYaml(frontmatter);
      assertExists(yaml, "YAML should parse successfully");
    } catch (error) {
      throw new Error(`YAML parsing failed: ${error}`);
    }
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should have sufficient content",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    // Agent definition should be comprehensive
    assert(content.length > 3000, "Agent definition should be detailed (>3000 chars)");
  },
});

Deno.test({
  name: "Docs - FONTS.md should have proper markdown structure",
  async fn() {
    const content = await Deno.readTextFile("FONTS.md");

    // Should have multiple sections
    const headerCount = (content.match(/^#{1,3}\s/gm) || []).length;
    assert(headerCount >= 3, "Should have multiple sections with headers");
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should mention aformulationoftruth.com",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(
      content.includes("aformulationoftruth.com"),
      "Should mention the project domain"
    );
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should define quality standards",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(
      content.includes("Quality Standards") || content.includes("Standards"),
      "Should define quality standards"
    );
    assert(
      content.includes("Production-Ready") || content.includes("production"),
      "Should emphasize production readiness"
    );
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should mention unsubscribe handling",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(
      content.includes("unsubscribe") || content.includes("Unsubscribe"),
      "Should mention unsubscribe mechanism"
    );
  },
});

Deno.test({
  name: "Agent - sendgrid-reputation-expert.md should discuss rate limiting",
  async fn() {
    const content = await Deno.readTextFile(".claude/agents/sendgrid-reputation-expert.md");

    assert(
      content.includes("rate limit") || content.includes("Rate Limiting"),
      "Should discuss rate limiting"
    );
  },
});

console.log("\n===========================================");
console.log("Agent & Documentation Validation Test Suite");
console.log("===========================================");
console.log("Testing: sendgrid-reputation-expert.md, FONTS.md");
console.log("===========================================\n");