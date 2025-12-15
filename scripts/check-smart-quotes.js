#!/usr/bin/env node

/**
 * Script to check for smart quotes in JavaScript/TypeScript files
 * Smart quotes can cause syntax errors and should be replaced with regular quotes
 *
 * Usage: node scripts/check-smart-quotes.js [directory]
 */

const fs = require('fs');
const path = require('path');

// Unicode smart quotes that cause issues
const SMART_QUOTES = {
  '\u2018': "'",  // Left single quotation mark
  '\u2019': "'",  // Right single quotation mark (apostrophe)
  '\u201C': '"',  // Left double quotation mark
  '\u201D': '"',  // Right double quotation mark
  '\u201A': "'",  // Single low-9 quotation mark
  '\u201B': "'",  // Single high-reversed-9 quotation mark
  '\u201E': '"',  // Double low-9 quotation mark
  '\u201F': '"',  // Double high-reversed-9 quotation mark
  '\u2039': "'",  // Single left-pointing angle quotation mark
  '\u203A': "'",  // Single right-pointing angle quotation mark
  '\u00AB': '"',  // Left-pointing double angle quotation mark
  '\u00BB': '"'   // Right-pointing double angle quotation mark
};

const SMART_QUOTE_REGEX = new RegExp(`[${Object.keys(SMART_QUOTES).join('')}]`, 'g');

// File extensions to check
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

// Directories to skip
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next'];

let filesChecked = 0;
let issuesFound = 0;
const filesWithIssues = [];

/**
 * Check a single file for smart quotes
 */
function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const issues = [];

    lines.forEach((line, index) => {
      const matches = line.match(SMART_QUOTE_REGEX);
      if (matches) {
        matches.forEach(match => {
          const column = line.indexOf(match) + 1;
          issues.push({
            line: index + 1,
            column,
            char: match,
            replacement: SMART_QUOTES[match],
            content: line.trim()
          });
        });
      }
    });

    filesChecked++;

    if (issues.length > 0) {
      issuesFound += issues.length;
      filesWithIssues.push({ filePath, issues });

      console.log(`\n❌ ${filePath}`);
      issues.forEach(issue => {
        const char = issue.char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
        console.log(`   Line ${issue.line}:${issue.column} - Found smart quote U+${char} '${issue.char}' → '${issue.replacement}'`);
        if (issue.content.length < 100) {
          console.log(`   > ${issue.content}`);
        }
      });
    }

  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
  }
}

/**
 * Recursively check directory for files with smart quotes
 */
function checkDirectory(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.includes(entry.name)) {
          checkDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (EXTENSIONS.includes(ext)) {
          checkFile(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}: ${error.message}`);
  }
}

/**
 * Main function
 */
function main() {
  const targetPath = process.argv[2] || '.';
  const resolvedPath = path.resolve(targetPath);

  console.log('🔍 Checking for smart quotes in JavaScript/TypeScript files...');
  console.log(`   Directory: ${resolvedPath}`);
  console.log(`   Extensions: ${EXTENSIONS.join(', ')}`);
  console.log('');

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Path does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isDirectory()) {
    checkDirectory(resolvedPath);
  } else if (stats.isFile()) {
    checkFile(resolvedPath);
  } else {
    console.error(`❌ Invalid path: ${resolvedPath}`);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files checked: ${filesChecked}`);
  console.log(`   Issues found: ${issuesFound}`);
  console.log(`   Files with issues: ${filesWithIssues.length}`);

  if (issuesFound === 0) {
    console.log('\n✅ No smart quotes found! Your code is clean.');
  } else {
    console.log('\n⚠️  Smart quotes detected! These can cause syntax errors.');
    console.log('   Please replace them with regular quotes.');

    // Offer to fix automatically
    if (process.argv.includes('--fix')) {
      console.log('\n🔧 Auto-fixing smart quotes...');
      fixSmartQuotes();
    } else {
      console.log('\n💡 Tip: Run with --fix flag to automatically replace smart quotes');
      console.log('   Example: node scripts/check-smart-quotes.js . --fix');
    }
  }

  process.exit(issuesFound > 0 ? 1 : 0);
}

/**
 * Fix smart quotes in files
 */
function fixSmartQuotes() {
  let fixedFiles = 0;

  filesWithIssues.forEach(({ filePath, issues }) => {
    try {
      let content = fs.readFileSync(filePath, 'utf8');

      // Replace all smart quotes
      Object.entries(SMART_QUOTES).forEach(([smart, regular]) => {
        const before = content.length;
        content = content.replace(new RegExp(smart, 'g'), regular);
        if (content.length !== before) {
          console.log(`   Fixed: ${filePath}`);
        }
      });

      fs.writeFileSync(filePath, content, 'utf8');
      fixedFiles++;
    } catch (error) {
      console.error(`   Failed to fix ${filePath}: ${error.message}`);
    }
  });

  console.log(`\n✅ Fixed ${fixedFiles} files`);
}

// Run the script
main();