#!/usr/bin/env node
/**
 * Types.ts Guard
 *
 * Special friction hook for types.ts - the cascade epicenter.
 * Changes to core type definitions ripple through the entire codebase.
 *
 * This hook:
 * 1. Shows a prominent warning when types.ts is being modified
 * 2. Lists all files that depend on types.ts
 * 3. Highlights which interfaces/types are being changed
 * 4. Encourages planning all dependent updates first
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");

// Files that are known cascade epicenters
const GUARDED_FILES = [
  "types.ts",
  "types.tsx",
  "types/index.ts",
  "store.ts",  // Zustand store often has wide impact too
];

/**
 * Extract interface and type names from content
 */
function extractTypeDefinitions(content) {
  const definitions = [];

  // Interfaces
  const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    definitions.push({ kind: "interface", name: match[1] });
  }

  // Type aliases
  const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=/g;
  while ((match = typeRegex.exec(content)) !== null) {
    definitions.push({ kind: "type", name: match[1] });
  }

  // Enums
  const enumRegex = /(?:export\s+)?enum\s+(\w+)/g;
  while ((match = enumRegex.exec(content)) !== null) {
    definitions.push({ kind: "enum", name: match[1] });
  }

  return definitions;
}

/**
 * Find files that import from types.ts
 */
function findTypesImporters() {
  const importers = [];

  try {
    // Search for imports from types
    const result = execSync(
      `grep -rl --include="*.ts" --include="*.tsx" -E "from\\s+['\"].*types['\"]" "${path.join(projectRoot, 'src')}" 2>/dev/null || true`,
      { encoding: "utf8", cwd: projectRoot }
    );

    result.split("\n")
      .filter(line => line.trim())
      .filter(file => !file.endsWith("types.ts"))  // Exclude self
      .forEach(file => importers.push(file));

  } catch (e) {
    // Fallback if grep fails
  }

  return importers;
}

/**
 * Compare old and new type definitions
 */
function findTypeChanges(oldContent, newContent) {
  const oldDefs = extractTypeDefinitions(oldContent);
  const newDefs = extractTypeDefinitions(newContent);

  const oldNames = new Set(oldDefs.map(d => d.name));
  const newNames = new Set(newDefs.map(d => d.name));

  const removed = oldDefs.filter(d => !newNames.has(d.name));
  const added = newDefs.filter(d => !oldNames.has(d.name));

  // Check for modified definitions (same name, different content)
  // This is approximate - we look for definitions that exist in both
  // but the line content around them differs
  const modified = [];

  oldDefs.forEach(oldDef => {
    if (newNames.has(oldDef.name)) {
      // Extract the definition body (approximate)
      const oldDefRegex = new RegExp(
        `(interface|type|enum)\\s+${oldDef.name}[^}]*}`,
        "s"
      );
      const oldMatch = oldContent.match(oldDefRegex);
      const newMatch = newContent.match(oldDefRegex);

      if (oldMatch && newMatch && oldMatch[0] !== newMatch[0]) {
        modified.push(oldDef);
      }
    }
  });

  return { removed, added, modified };
}

/**
 * Get what each file imports from types
 */
function getTypesUsage(importerFile) {
  try {
    const content = fs.readFileSync(importerFile, "utf8");
    const imports = [];

    // Match: import { A, B, C } from '...types'
    const regex = /import\s*\{([^}]+)\}\s*from\s*['"].*types['"]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const names = match[1].split(",").map(s =>
        s.trim().split(/\s+as\s+/)[0].trim()
      );
      imports.push(...names.filter(n => n));
    }

    return imports;
  } catch (e) {
    return [];
  }
}

/**
 * Format the warning message
 */
function formatWarning(filePath, importers, changes) {
  const fileName = path.basename(filePath);

  let msg = "\n";
  msg += "!".repeat(65) + "\n";
  msg += "    CASCADE EPICENTER WARNING - " + fileName.toUpperCase() + "    \n";
  msg += "!".repeat(65) + "\n\n";

  msg += `You are modifying ${fileName} - the core type definitions file.\n`;
  msg += `This file is imported by ${importers.length} other files.\n`;
  msg += `Changes here commonly cause TypeScript cascade failures.\n\n`;

  // Show what's changing
  if (changes.removed.length > 0) {
    msg += "REMOVING (will break importers):\n";
    changes.removed.forEach(d => {
      msg += `  - ${d.kind} ${d.name}\n`;
    });
    msg += "\n";
  }

  if (changes.modified.length > 0) {
    msg += "MODIFYING (may break importers):\n";
    changes.modified.forEach(d => {
      msg += `  ~ ${d.kind} ${d.name}\n`;
    });
    msg += "\n";
  }

  if (changes.added.length > 0) {
    msg += "ADDING (safe):\n";
    changes.added.forEach(d => {
      msg += `  + ${d.kind} ${d.name}\n`;
    });
    msg += "\n";
  }

  // Show impacted files with their usage
  msg += "FILES THAT WILL BE AFFECTED:\n";
  msg += "-".repeat(40) + "\n";

  // Group by most impacted (uses removed/modified types)
  const changedNames = new Set([
    ...changes.removed.map(d => d.name),
    ...changes.modified.map(d => d.name)
  ]);

  const impacted = [];
  const safe = [];

  importers.forEach(importer => {
    const relativePath = path.relative(projectRoot, importer);
    const usage = getTypesUsage(importer);
    const usesChanged = usage.filter(u => changedNames.has(u));

    if (usesChanged.length > 0) {
      impacted.push({ path: relativePath, usage, usesChanged });
    } else {
      safe.push({ path: relativePath, usage });
    }
  });

  if (impacted.length > 0) {
    msg += "\nWILL BREAK (uses changed types):\n";
    impacted.slice(0, 10).forEach(f => {
      msg += `  ${f.path}\n`;
      msg += `    uses: ${f.usesChanged.join(", ")}\n`;
    });
    if (impacted.length > 10) {
      msg += `  ... and ${impacted.length - 10} more files\n`;
    }
  }

  if (safe.length > 0 && impacted.length < 5) {
    msg += "\nPROBABLY SAFE (doesn't use changed types):\n";
    safe.slice(0, 5).forEach(f => {
      msg += `  ${f.path}\n`;
    });
    if (safe.length > 5) {
      msg += `  ... and ${safe.length - 5} more files\n`;
    }
  }

  msg += "\n" + "-".repeat(40) + "\n";
  msg += "\nRECOMMENDED APPROACH:\n";
  msg += "1. List all files that use the changed types BEFORE editing\n";
  msg += "2. Plan updates for ALL affected files\n";
  msg += "3. Make types.ts change AND all dependent changes in one session\n";
  msg += "4. Run `npm run build` after EACH file, not at the end\n";
  msg += "\n" + "!".repeat(65) + "\n";

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

  // Check if this is a guarded file
  const fileName = path.basename(filePath);
  const isGuarded = GUARDED_FILES.some(gf => filePath.endsWith(gf));

  if (!isGuarded) {
    process.exit(0);
  }

  // Get old content
  let oldContent = "";
  try {
    if (fs.existsSync(filePath)) {
      oldContent = fs.readFileSync(filePath, "utf8");
    }
  } catch (e) {
    // New file
  }

  // If it's a new file or no content to compare, just show basic warning
  if (!oldContent || !newContent) {
    console.log(`\nWARNING: Creating/modifying ${fileName} - a cascade epicenter file.`);
    console.log("Changes here affect many other files. Proceed carefully.\n");
    process.exit(0);
  }

  // Find what's changing
  const changes = findTypeChanges(oldContent, newContent);

  // Get importers
  const importers = findTypesImporters();

  // Only show full warning if there are actual changes to types
  const hasImpactfulChanges =
    changes.removed.length > 0 ||
    changes.modified.length > 0;

  if (hasImpactfulChanges && importers.length > 0) {
    console.log(formatWarning(filePath, importers, changes));
  } else if (importers.length > 0) {
    // Just adding new types - lighter warning
    console.log(`\nNOTE: ${fileName} is imported by ${importers.length} files.`);
    if (changes.added.length > 0) {
      console.log(`Adding: ${changes.added.map(d => d.name).join(", ")}`);
    }
    console.log("New additions are safe. Modifications/removals cause cascades.\n");
  }

  // Don't block, just inform
  process.exit(0);
}

// Run
main();
