#!/usr/bin/env node
/**
 * Pre-write hook for Claude Code
 * Automatically runs TypeScript and ESLint checking before any file write operation
 * Blocks writes if type checking or linting fails
 *
 * Adapted for React Three Fiber / TypeScript projects
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Get file path from Claude Code environment
const filePath = process.env.CLAUDE_FILE_PATH || process.argv[2];
const fileContent = process.env.CLAUDE_FILE_CONTENT || "";

if (!filePath) {
  console.log("No file path provided, skipping validation");
  process.exit(0);
}

const ext = path.extname(filePath).toLowerCase();
const fileName = path.basename(filePath);
const projectRoot = path.resolve(__dirname, "..");

console.log(`LINTING LAW: Checking ${fileName}...`);

try {
  // TypeScript/JavaScript/JSX/TSX files
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {

    // Step 1: TypeScript type checking
    console.log("Running TypeScript check...");
    try {
      execSync(`cd "${projectRoot}" && npx tsc --noEmit`, {
        stdio: "pipe",
        timeout: 60000
      });
      console.log("TypeScript check passed");
    } catch (error) {
      const errorOutput = error.stdout?.toString() || error.stderr?.toString() || error.message;

      // Count errors to detect cascades
      const errorLines = errorOutput.split('\n').filter(line => line.includes('error TS'));
      const errorCount = errorLines.length;

      if (errorCount > 10) {
        console.error(`\nCASCADE DETECTED: ${errorCount} TypeScript errors!`);
        console.error("This is likely caused by a single bad change. Review the root cause.\n");
        console.error("First few errors:");
        errorLines.slice(0, 5).forEach(e => console.error(`  ${e}`));
        console.error("\nRecovery Protocol:");
        console.error("1. STOP editing immediately");
        console.error("2. Identify the root cause (usually in types.ts or a core interface)");
        console.error("3. Fix that ONE issue first");
        console.error("4. Then re-run validation");
      } else {
        console.error(`TypeScript check failed for ${fileName}:`);
        console.error(errorOutput);
      }

      console.log("\nSuggested fix:");
      console.log("npm run typecheck (to see all errors)");

      process.exit(1);
    }

    // Step 2: ESLint (if file is in src/)
    if (filePath.includes('/src/')) {
      console.log("Running ESLint...");
      try {
        execSync(`cd "${projectRoot}" && npm run lint`, {
          stdio: "pipe",
          timeout: 30000
        });
        console.log("ESLint check passed");
      } catch (error) {
        const errorOutput = error.stdout?.toString() || error.stderr?.toString() || error.message;

        // Check if it's just warnings (exit code 0 with warnings)
        if (!errorOutput.includes('error') || errorOutput.includes('0 errors')) {
          console.log("ESLint passed (warnings only)");
        } else {
          console.error(`ESLint failed for ${fileName}:`);
          console.error(errorOutput);
          console.log("\nSuggested fix:");
          console.log("npm run lint (to see all errors)");
          process.exit(1);
        }
      }

      // Step 3: Prettier format check (if file is in src/)
      console.log("Running Prettier check...");
      try {
        execSync(`cd "${projectRoot}" && npm run format:check`, {
          stdio: "pipe",
          timeout: 30000
        });
        console.log("Prettier check passed");
      } catch (error) {
        const errorOutput = error.stdout?.toString() || error.stderr?.toString() || error.message;

        // Try to auto-fix
        console.log("Prettier found formatting issues. Auto-fixing...");
        try {
          execSync(`cd "${projectRoot}" && npm run format`, {
            stdio: "pipe",
            timeout: 30000
          });
          console.log("Prettier auto-fixed formatting");
        } catch (fixError) {
          console.error("Prettier auto-fix failed:");
          console.error(fixError.message);
          console.log("\nSuggested fix:");
          console.log("npm run format (to fix formatting)");
          process.exit(1);
        }
      }
    }
  }

  console.log("All checks passed! File write approved.");
  process.exit(0);
} catch (error) {
  console.error("Unexpected error in validation hook:", error.message);
  // Don't block on unexpected errors, but warn
  console.log("Proceeding with write despite error (check manually)");
  process.exit(0);
}
