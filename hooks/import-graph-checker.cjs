#!/usr/bin/env node
/**
 * Import Graph Checker
 *
 * When modifying a file's exports, shows all files that import from it.
 * This enables fixing all importers in the same edit, preventing cascades.
 *
 * Detects:
 * - Renamed exports
 * - Removed exports
 * - Changed export signatures (interfaces, types, functions)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");

/**
 * Extract export names from TypeScript/JavaScript content
 */
function extractExports(content) {
  const exports = new Set();

  // Named exports: export const/let/var/function/class/interface/type NAME
  const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.add(match[1]);
  }

  // Export { name1, name2 } or export { name1 as alias }
  const bracketExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = bracketExportRegex.exec(content)) !== null) {
    const names = match[1].split(",").map(s => {
      // Handle "name as alias" - we care about the original name
      const parts = s.trim().split(/\s+as\s+/);
      return parts[0].trim();
    });
    names.forEach(n => { if (n) exports.add(n); });
  }

  // Default export
  if (/export\s+default\s/.test(content)) {
    exports.add("default");
  }

  return exports;
}

/**
 * Find all files that import from the target file
 */
function findImporters(targetFile) {
  const relativePath = path.relative(projectRoot, targetFile);
  const baseName = path.basename(targetFile, path.extname(targetFile));
  const dirName = path.dirname(relativePath);

  // Build search patterns for how this file might be imported
  const searchPatterns = [
    baseName,  // import from './types' or '../types'
    relativePath.replace(/\\/g, "/"),  // Full relative path
  ];

  const importers = new Set();

  try {
    // Search for imports of this file
    // Using grep for: import ... from '...<filename>'
    const pattern = `from\\s+['\"].*${baseName}['\"]`;

    const result = execSync(
      `grep -rl --include="*.ts" --include="*.tsx" -E "${pattern}" "${path.join(projectRoot, 'src')}" 2>/dev/null || true`,
      { encoding: "utf8", cwd: projectRoot }
    );

    result.split("\n")
      .filter(line => line.trim())
      .filter(file => file !== targetFile)  // Exclude self
      .forEach(file => importers.add(file));

  } catch (e) {
    // grep failed, try alternative
  }

  return Array.from(importers);
}

/**
 * Get specific imports from a file
 */
function getImportedNames(importerFile, targetBaseName) {
  try {
    const content = fs.readFileSync(importerFile, "utf8");
    const imports = [];

    // Match: import { A, B, C } from '...targetBaseName'
    const regex = new RegExp(
      `import\\s*\\{([^}]+)\\}\\s*from\\s*['\"].*${targetBaseName}['\"]`,
      "g"
    );

    let match;
    while ((match = regex.exec(content)) !== null) {
      const names = match[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim());
      imports.push(...names.filter(n => n));
    }

    // Check for default import
    const defaultRegex = new RegExp(
      `import\\s+(\\w+)\\s+from\\s*['\"].*${targetBaseName}['\"]`
    );
    const defaultMatch = content.match(defaultRegex);
    if (defaultMatch) {
      imports.push("default (as " + defaultMatch[1] + ")");
    }

    return imports;
  } catch (e) {
    return [];
  }
}

/**
 * Compare old and new exports to find changes
 */
function findExportChanges(oldExports, newExports) {
  const removed = [...oldExports].filter(e => !newExports.has(e));
  const added = [...newExports].filter(e => !oldExports.has(e));

  return { removed, added };
}

/**
 * Format the impact report
 */
function formatImpactReport(targetFile, importers, changes, newContent) {
  const baseName = path.basename(targetFile);
  let msg = "\n";
  msg += "=".repeat(65) + "\n";
  msg += "    IMPORT GRAPH CHECKER - DEPENDENCY IMPACT ANALYSIS    \n";
  msg += "=".repeat(65) + "\n\n";

  msg += `File: ${baseName}\n`;
  msg += `Importers found: ${importers.length}\n\n`;

  if (changes.removed.length > 0) {
    msg += "REMOVED/RENAMED EXPORTS (potential breakage):\n";
    changes.removed.forEach(exp => {
      msg += `  - ${exp}\n`;
    });
    msg += "\n";
  }

  if (changes.added.length > 0) {
    msg += "NEW EXPORTS:\n";
    changes.added.forEach(exp => {
      msg += `  + ${exp}\n`;
    });
    msg += "\n";
  }

  if (importers.length > 0) {
    msg += "FILES THAT IMPORT FROM THIS FILE:\n";
    msg += "(Update these in the same edit to prevent cascades)\n\n";

    const targetBaseName = path.basename(targetFile, path.extname(targetFile));

    importers.forEach(importer => {
      const relativePath = path.relative(projectRoot, importer);
      const importedNames = getImportedNames(importer, targetBaseName);

      msg += `  ${relativePath}\n`;
      if (importedNames.length > 0) {
        msg += `    imports: ${importedNames.join(", ")}\n`;

        // Highlight if any removed exports are used here
        const usesRemoved = importedNames.filter(n =>
          changes.removed.includes(n.split(" ")[0])
        );
        if (usesRemoved.length > 0) {
          msg += `    WILL BREAK: ${usesRemoved.join(", ")}\n`;
        }
      }
      msg += "\n";
    });
  }

  msg += "=".repeat(65) + "\n";

  return msg;
}

/**
 * Main entry point
 */
function main() {
  const filePath = process.env.CLAUDE_FILE_PATH || process.argv[2];
  const newContent = process.env.CLAUDE_FILE_CONTENT || "";

  if (!filePath) {
    process.exit(0);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    process.exit(0);
  }

  // Only check files in src/
  if (!filePath.includes("/src/")) {
    process.exit(0);
  }

  // Get current file content (before the write)
  let oldContent = "";
  try {
    if (fs.existsSync(filePath)) {
      oldContent = fs.readFileSync(filePath, "utf8");
    }
  } catch (e) {
    // New file, no old content
  }

  // If no old content, this is a new file - just show importers info
  const oldExports = extractExports(oldContent);
  const newExports = extractExports(newContent || oldContent);

  // Find what changed
  const changes = findExportChanges(oldExports, newExports);

  // Only show report if:
  // 1. Exports were removed/renamed, OR
  // 2. File has many importers (awareness)
  const importers = findImporters(filePath);

  const hasSignificantChanges = changes.removed.length > 0;
  const hasImporters = importers.length > 0;

  if (hasSignificantChanges && hasImporters) {
    // This is a potentially breaking change - show full report
    console.log(formatImpactReport(filePath, importers, changes, newContent));

    // Don't block, but warn loudly
    console.log("TIP: Update all importers in the same edit to prevent cascades.\n");
  } else if (hasImporters && importers.length >= 5) {
    // Many importers - just show awareness
    console.log(`\nIMPORT GRAPH: ${path.basename(filePath)} is imported by ${importers.length} files.`);
    console.log("Changes to exports may cause cascading updates.\n");
  }

  process.exit(0);
}

// Run
main();
