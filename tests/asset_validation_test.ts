/**
 * Asset Validation Tests
 *
 * Tests asset files (images) to ensure they exist and are valid:
 * 1. .playwright-mcp/*.png - Screenshot images
 * 2. 543.PNG - Image file
 * 3. IMG_3274.jpg - Image file
 *
 * Run with: deno task test
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// ============================================================================
// Test Suite: Playwright MCP Screenshot Validation
// ============================================================================

const playwrightImages = [
  "desktop-scattered-check.png",
  "hero-section-check.png",
  "irendu-check.png",
  "mobile-column-check.png",
  "pink-spiral-check.png",
  "smaller-watermark.png",
  "tv-preview-2.png",
  "tv-preview-3.png",
  "tv-preview-4.png",
  "tv-preview.png",
  "tv-with-audio.png",
  "watermark-check.png",
  "watermark-left.png",
];

for (const imageName of playwrightImages) {
  Deno.test({
    name: `Asset - .playwright-mcp/${imageName} should exist`,
    async fn() {
      const path = `.playwright-mcp/${imageName}`;
      const fileInfo = await Deno.stat(path);
      assertEquals(fileInfo.isFile, true, `${path} should be a file`);
    },
  });
}

for (const imageName of playwrightImages) {
  Deno.test({
    name: `Asset - .playwright-mcp/${imageName} should be a valid PNG file`,
    async fn() {
      const path = `.playwright-mcp/${imageName}`;
      const file = await Deno.readFile(path);

      // PNG files start with magic bytes: 89 50 4E 47 0D 0A 1A 0A
      assertEquals(file[0], 0x89, "Should have PNG magic byte 1");
      assertEquals(file[1], 0x50, "Should have PNG magic byte 2 (P)");
      assertEquals(file[2], 0x4e, "Should have PNG magic byte 3 (N)");
      assertEquals(file[3], 0x47, "Should have PNG magic byte 4 (G)");
    },
  });
}

for (const imageName of playwrightImages) {
  Deno.test({
    name: `Asset - .playwright-mcp/${imageName} should have non-zero size`,
    async fn() {
      const path = `.playwright-mcp/${imageName}`;
      const fileInfo = await Deno.stat(path);
      assert(fileInfo.size > 0, `${path} should not be empty`);
    },
  });
}

for (const imageName of playwrightImages) {
  Deno.test({
    name: `Asset - .playwright-mcp/${imageName} should be a reasonable size`,
    async fn() {
      const path = `.playwright-mcp/${imageName}`;
      const fileInfo = await Deno.stat(path);

      // Images should be between 1KB and 50MB
      assert(fileInfo.size > 1024, `${path} should be larger than 1KB`);
      assert(
        fileInfo.size < 50 * 1024 * 1024,
        `${path} should be smaller than 50MB`
      );
    },
  });
}

// ============================================================================
// Test Suite: Root Level Image Files Validation
// ============================================================================

Deno.test({
  name: "Asset - 543.PNG should exist",
  async fn() {
    const fileInfo = await Deno.stat("543.PNG");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Asset - 543.PNG should be a valid PNG file",
  async fn() {
    const file = await Deno.readFile("543.PNG");

    // PNG magic bytes
    assertEquals(file[0], 0x89, "Should have PNG magic byte 1");
    assertEquals(file[1], 0x50, "Should have PNG magic byte 2");
    assertEquals(file[2], 0x4e, "Should have PNG magic byte 3");
    assertEquals(file[3], 0x47, "Should have PNG magic byte 4");
  },
});

Deno.test({
  name: "Asset - 543.PNG should have reasonable size",
  async fn() {
    const fileInfo = await Deno.stat("543.PNG");

    assert(fileInfo.size > 1024, "Should be larger than 1KB");
    assert(fileInfo.size < 50 * 1024 * 1024, "Should be smaller than 50MB");
  },
});

Deno.test({
  name: "Asset - IMG_3274.jpg should exist",
  async fn() {
    const fileInfo = await Deno.stat("IMG_3274.jpg");
    assertEquals(fileInfo.isFile, true);
  },
});

Deno.test({
  name: "Asset - IMG_3274.jpg should be a valid JPEG file",
  async fn() {
    const file = await Deno.readFile("IMG_3274.jpg");

    // JPEG files start with magic bytes: FF D8 FF
    assertEquals(file[0], 0xff, "Should have JPEG magic byte 1");
    assertEquals(file[1], 0xd8, "Should have JPEG magic byte 2");
    assertEquals(file[2], 0xff, "Should have JPEG magic byte 3");
  },
});

Deno.test({
  name: "Asset - IMG_3274.jpg should have reasonable size",
  async fn() {
    const fileInfo = await Deno.stat("IMG_3274.jpg");

    assert(fileInfo.size > 1024, "Should be larger than 1KB");
    assert(fileInfo.size < 50 * 1024 * 1024, "Should be smaller than 50MB");
  },
});

Deno.test({
  name: "Asset - IMG_3274.jpg should end with JPEG end marker",
  async fn() {
    const file = await Deno.readFile("IMG_3274.jpg");

    // JPEG files end with: FF D9
    const len = file.length;
    assertEquals(file[len - 2], 0xff, "Should have JPEG end marker byte 1");
    assertEquals(file[len - 1], 0xd9, "Should have JPEG end marker byte 2");
  },
});

// ============================================================================
// Test Suite: Playwright MCP Directory Validation
// ============================================================================

Deno.test({
  name: "Asset - .playwright-mcp directory should exist",
  async fn() {
    const dirInfo = await Deno.stat(".playwright-mcp");
    assertEquals(dirInfo.isDirectory, true);
  },
});

Deno.test({
  name: "Asset - .playwright-mcp should contain all expected files",
  async fn() {
    const entries = [];
    for await (const entry of Deno.readDir(".playwright-mcp")) {
      if (entry.isFile && entry.name.endsWith(".png")) {
        entries.push(entry.name);
      }
    }

    // Should have all the playwright images
    for (const expectedImage of playwrightImages) {
      assert(
        entries.includes(expectedImage),
        `Should contain ${expectedImage}`
      );
    }
  },
});

Deno.test({
  name: "Asset - .playwright-mcp files should all be PNG format",
  async fn() {
    for await (const entry of Deno.readDir(".playwright-mcp")) {
      if (entry.isFile && entry.name.endsWith(".png")) {
        const path = `.playwright-mcp/${entry.name}`;
        const file = await Deno.readFile(path);

        assertEquals(
          file[0],
          0x89,
          `${entry.name} should have valid PNG header`
        );
      }
    }
  },
});

// ============================================================================
// Test Suite: Image Naming Conventions
// ============================================================================

Deno.test({
  name: "Asset - Playwright screenshots should follow naming convention",
  async fn() {
    for (const imageName of playwrightImages) {
      // Should use kebab-case and end with descriptive suffix
      assert(
        imageName.match(/^[a-z0-9-]+\.png$/),
        `${imageName} should use lowercase kebab-case`
      );
    }
  },
});

Deno.test({
  name: "Asset - Playwright screenshots should have descriptive names",
  async fn() {
    for (const imageName of playwrightImages) {
      const nameWithoutExt = imageName.replace(".png", "");

      // Should be descriptive (more than just numbers)
      assert(
        nameWithoutExt.length >= 5,
        `${imageName} should have a descriptive name`
      );
      assert(
        nameWithoutExt.match(/[a-z]/),
        `${imageName} should contain letters`
      );
    }
  },
});

// ============================================================================
// Test Suite: PNG Structure Validation
// ============================================================================

Deno.test({
  name: "Asset - PNG files should have IHDR chunk",
  async fn() {
    const file = await Deno.readFile(".playwright-mcp/hero-section-check.png");
    const chunk = new TextDecoder().decode(file.slice(12, 16));

    assertEquals(chunk, "IHDR", "PNG should have IHDR chunk");
  },
});

Deno.test({
  name: "Asset - PNG files should have IEND chunk at end",
  async fn() {
    const file = await Deno.readFile(".playwright-mcp/hero-section-check.png");

    // Find IEND marker (49 45 4E 44 in hex, "IEND" in ASCII)
    let foundIEND = false;
    for (let i = file.length - 20; i < file.length - 4; i++) {
      if (
        file[i] === 0x49 &&
        file[i + 1] === 0x45 &&
        file[i + 2] === 0x4e &&
        file[i + 3] === 0x44
      ) {
        foundIEND = true;
        break;
      }
    }

    assert(foundIEND, "PNG should have IEND chunk");
  },
});

// ============================================================================
// Test Suite: JPEG Structure Validation
// ============================================================================

Deno.test({
  name: "Asset - JPEG file should have valid structure",
  async fn() {
    const file = await Deno.readFile("IMG_3274.jpg");

    // JPEG should start with SOI (Start of Image) marker: FF D8
    assertEquals(file[0], 0xff, "Should start with FF");
    assertEquals(file[1], 0xd8, "Should start with D8 (SOI)");

    // JPEG should end with EOI (End of Image) marker: FF D9
    const len = file.length;
    assertEquals(file[len - 2], 0xff, "Should end with FF");
    assertEquals(file[len - 1], 0xd9, "Should end with D9 (EOI)");
  },
});

// ============================================================================
// Test Suite: File Integrity Tests
// ============================================================================

Deno.test({
  name: "Asset - Image files should be readable",
  async fn() {
    const images = [
      "543.PNG",
      "IMG_3274.jpg",
      ...playwrightImages.map((name) => `.playwright-mcp/${name}`),
    ];

    for (const imagePath of images) {
      try {
        const file = await Deno.readFile(imagePath);
        assert(file.length > 0, `${imagePath} should be readable`);
      } catch (error) {
        throw new Error(`Failed to read ${imagePath}: ${error}`);
      }
    }
  },
});

Deno.test({
  name: "Asset - Image files should not be corrupted (basic check)",
  async fn() {
    // Check PNG files have both header and trailer
    for (const imageName of playwrightImages) {
      const path = `.playwright-mcp/${imageName}`;
      const file = await Deno.readFile(path);

      // Check PNG signature
      assert(file[0] === 0x89 && file[1] === 0x50, `${path} PNG header intact`);

      // File should be complete (have reasonable minimum size)
      assert(file.length > 100, `${path} should have minimum viable size`);
    }

    // Check JPEG integrity
    const jpegFile = await Deno.readFile("IMG_3274.jpg");
    assert(
      jpegFile[0] === 0xff && jpegFile[1] === 0xd8,
      "JPEG should have valid SOI"
    );
    assert(
      jpegFile[jpegFile.length - 2] === 0xff &&
        jpegFile[jpegFile.length - 1] === 0xd9,
      "JPEG should have valid EOI"
    );
  },
});

// ============================================================================
// Test Suite: Edge Cases and Security
// ============================================================================

Deno.test({
  name: "Asset - Image files should not be zero-byte files",
  async fn() {
    const images = [
      "543.PNG",
      "IMG_3274.jpg",
      ...playwrightImages.map((name) => `.playwright-mcp/${name}`),
    ];

    for (const imagePath of images) {
      const fileInfo = await Deno.stat(imagePath);
      assert(
        fileInfo.size > 0,
        `${imagePath} should not be a zero-byte file`
      );
    }
  },
});

Deno.test({
  name: "Asset - PNG files should not be suspiciously large",
  async fn() {
    const maxSize = 10 * 1024 * 1024; // 10MB threshold for screenshots

    for (const imageName of playwrightImages) {
      const path = `.playwright-mcp/${imageName}`;
      const fileInfo = await Deno.stat(path);

      assert(
        fileInfo.size < maxSize,
        `${path} should be under 10MB (found ${Math.round(fileInfo.size / 1024 / 1024)}MB)`
      );
    }
  },
});

Deno.test({
  name: "Asset - All image files should have correct file extensions",
  async fn() {
    // PNG files should start with PNG magic bytes
    const file543 = await Deno.readFile("543.PNG");
    assertEquals(
      file543[1],
      0x50,
      "543.PNG should have PNG signature matching extension"
    );

    // JPG should have JPEG magic bytes
    const jpegFile = await Deno.readFile("IMG_3274.jpg");
    assertEquals(
      jpegFile[1],
      0xd8,
      "IMG_3274.jpg should have JPEG signature matching extension"
    );
  },
});

console.log("\n===========================================");
console.log("Asset Validation Test Suite");
console.log("===========================================");
console.log("Testing: .playwright-mcp/*.png, 543.PNG, IMG_3274.jpg");
console.log("===========================================\n");