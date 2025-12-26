#!/usr/bin/env node
/**
 * Bash Protection Hook (Template)
 *
 * Prevents catastrophic commands like `rm -rf ~/` from being executed.
 * This is a CRITICAL safety hook that should NEVER be disabled.
 *
 * Copy this to your project's hooks/ directory and register in hooks.json
 *
 * Inspired by: Reddit incident where Claude CLI deleted home directory
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// BLOCKED COMMANDS - These will ALWAYS be blocked, no exceptions
// ============================================================================
const ALWAYS_BLOCKED = [
  // Home directory attacks
  /rm\s+.*~\//,                        // rm anything with ~/
  /rm\s+.*\$HOME/,                     // rm anything with $HOME
  /rm\s+.*\/Users\/[^\/]+\/?$/,        // rm /Users/username
  /rm\s+.*\/home\/[^\/]+\/?$/,         // rm /home/username

  // Root filesystem attacks
  /rm\s+(-[rfivd]+\s+)*\/\s*$/,        // rm -rf /
  /rm\s+(-[rfivd]+\s+)*\/\*/,          // rm -rf /*
  /rm\s+.*--no-preserve-root/,         // rm --no-preserve-root

  // System directories
  /rm\s+(-[rfivd]+\s+)*\/etc/,
  /rm\s+(-[rfivd]+\s+)*\/var/,
  /rm\s+(-[rfivd]+\s+)*\/usr/,
  /rm\s+(-[rfivd]+\s+)*\/bin/,
  /rm\s+(-[rfivd]+\s+)*\/sbin/,
  /rm\s+(-[rfivd]+\s+)*\/lib/,
  /rm\s+(-[rfivd]+\s+)*\/opt/,
  /rm\s+(-[rfivd]+\s+)*\/boot/,
  /rm\s+(-[rfivd]+\s+)*\/root/,

  // macOS specific
  /rm\s+(-[rfivd]+\s+)*\/System/,
  /rm\s+(-[rfivd]+\s+)*\/Library/,
  /rm\s+(-[rfivd]+\s+)*\/Applications/,
  /rm\s+(-[rfivd]+\s+)*~\/Desktop/,
  /rm\s+(-[rfivd]+\s+)*~\/Documents/,
  /rm\s+(-[rfivd]+\s+)*~\/Downloads/,
  /rm\s+(-[rfivd]+\s+)*~\/Library/,

  // Destructive git commands
  /git\s+push\s+.*--force.*main/,
  /git\s+push\s+.*--force.*master/,
  /git\s+push\s+-f\s+.*main/,
  /git\s+push\s+-f\s+.*master/,

  // Database destruction
  /DROP\s+DATABASE/i,
  /DROP\s+TABLE/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*;?\s*$/i,     // DELETE without WHERE

  // Disk operations
  /mkfs\./,
  /dd\s+.*of=\/dev\//,
  /wipefs/,
  /shred\s+/,

  // SSH manipulation
  /rm\s+.*\.ssh/,
  />\s*~\/\.ssh/,

  // Environment destruction
  /unset\s+PATH/,
];

// ============================================================================
// WARNING PATTERNS - These will warn but allow (use for awareness)
// ============================================================================
const WARN_PATTERNS = [
  { pattern: /rm\s+-rf\s+/, message: "Recursive force delete - verify target" },
  { pattern: /git\s+reset\s+--hard/, message: "Hard reset - uncommitted changes will be lost" },
  { pattern: /sudo\s+/, message: "Running with elevated privileges" },
];

// ============================================================================
// MAIN LOGIC
// ============================================================================

function checkCommand(command) {
  // Check blocked patterns
  for (const pattern of ALWAYS_BLOCKED) {
    if (pattern.test(command)) {
      return {
        blocked: true,
        reason: `Command matches blocked pattern: ${pattern}`,
      };
    }
  }

  // Check warning patterns
  const warnings = [];
  for (const { pattern, message } of WARN_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(message);
    }
  }

  return { blocked: false, warnings };
}

// Read from stdin or argv
const input = process.argv[2] || "";

if (input) {
  const result = checkCommand(input);

  if (result.blocked) {
    console.error(`\n🛑 BLOCKED: ${result.reason}\n`);
    console.error("This command has been blocked for safety.");
    console.error("If you believe this is a mistake, review the command carefully.\n");
    process.exit(1);
  }

  if (result.warnings?.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`⚠️  WARNING: ${warning}`);
    }
  }
}

process.exit(0);
