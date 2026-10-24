#!/usr/bin/env node
/**
 * Flywheel Thrashing Detector
 *
 * Detects when Claude is stuck in an "idiocy loop" - repeatedly editing
 * the same files without making progress. This is the #1 failure mode
 * identified in autonomous improvement attempts.
 *
 * Detection strategies:
 * 1. Same file edited N+ times in recent operations
 * 2. Edit/revert patterns (file size oscillating)
 * 3. Similar error messages recurring
 *
 * @see CLAUDE.md for documentation
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// Configuration
const CONFIG = {
  // Thresholds
  maxEditsPerFile: 3,        // Warn after 3 edits to same file
  historyWindow: 15,         // Look at last 15 operations
  staleHistoryMinutes: 30,   // Clear history older than 30 min

  // State file location
  stateFile: path.join(os.tmpdir(), "claude-millos-thrashing-state.json"),
};

/**
 * Load or initialize state
 */
function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.stateFile, "utf8"));

      // Clear stale history
      const cutoff = Date.now() - (CONFIG.staleHistoryMinutes * 60 * 1000);
      data.editHistory = (data.editHistory || []).filter(e => e.timestamp > cutoff);

      return data;
    }
  } catch (e) {
    // Corrupted state, start fresh
  }

  return {
    editHistory: [],
    warningCount: 0,
    sessionStart: Date.now(),
  };
}

/**
 * Save state
 */
function saveState(state) {
  try {
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch (e) {
    // Non-fatal, continue without persistence
  }
}

/**
 * Record an edit operation
 */
function recordEdit(state, filePath) {
  const edit = {
    file: filePath,
    timestamp: Date.now(),
    basename: path.basename(filePath),
  };

  state.editHistory.push(edit);

  // Keep only recent history
  if (state.editHistory.length > CONFIG.historyWindow * 2) {
    state.editHistory = state.editHistory.slice(-CONFIG.historyWindow);
  }

  return state;
}

/**
 * Analyze edit history for thrashing patterns
 */
function detectThrashing(state) {
  const recentEdits = state.editHistory.slice(-CONFIG.historyWindow);

  if (recentEdits.length < CONFIG.maxEditsPerFile) {
    return { thrashing: false };
  }

  // Count edits per file
  const fileCounts = {};
  recentEdits.forEach(edit => {
    fileCounts[edit.file] = (fileCounts[edit.file] || 0) + 1;
  });

  // Find files with excessive edits
  const problematicFiles = Object.entries(fileCounts)
    .filter(([_, count]) => count >= CONFIG.maxEditsPerFile)
    .map(([file, count]) => ({ file, count }));

  if (problematicFiles.length > 0) {
    return {
      thrashing: true,
      files: problematicFiles,
      totalEdits: recentEdits.length,
      suggestion: generateSuggestion(problematicFiles),
    };
  }

  return { thrashing: false };
}

/**
 * Generate helpful suggestion based on thrashing pattern
 */
function generateSuggestion(problematicFiles) {
  const fileList = problematicFiles.map(f => `  - ${path.basename(f.file)} (${f.count}x)`).join("\n");

  return `
Consider:
1. Step back and analyze the root cause
2. Check if you're oscillating between incompatible approaches
3. Look for a third approach that satisfies all constraints
4. If stuck on TypeScript conflicts, the fix is often in types.ts

Files repeatedly edited:
${fileList}
`;
}

/**
 * Format warning message
 */
function formatWarning(analysis) {
  let msg = "\n";
  msg += "=".repeat(60) + "\n";
  msg += "    THRASHING DETECTOR - PATTERN DETECTED    \n";
  msg += "=".repeat(60) + "\n\n";

  msg += `The same file(s) have been edited ${CONFIG.maxEditsPerFile}+ times recently.\n`;
  msg += `This often indicates an "idiocy loop" where approaches oscillate.\n\n`;

  analysis.files.forEach(f => {
    msg += `  ${path.basename(f.file)}: ${f.count} edits in last ${CONFIG.historyWindow} operations\n`;
  });

  msg += "\n" + analysis.suggestion;
  msg += "\n" + "=".repeat(60) + "\n";

  return msg;
}

/**
 * Main hook entry point
 */
function main() {
  const filePath = process.env.CLAUDE_FILE_PATH || process.argv[2];

  if (!filePath) {
    process.exit(0);
  }

  // Load state
  const state = loadState();

  // Record this edit
  recordEdit(state, filePath);

  // Check for thrashing
  const analysis = detectThrashing(state);

  if (analysis.thrashing) {
    state.warningCount++;

    console.log(formatWarning(analysis));

    // Save state before warning
    saveState(state);

    // Don't block, just warn loudly
    // The warning itself should prompt Claude to reconsider
    process.exit(0);
  }

  // Save state
  saveState(state);
  process.exit(0);
}

/**
 * Clear state (useful for testing or starting fresh)
 */
function clearState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      fs.unlinkSync(CONFIG.stateFile);
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Get current state (for debugging)
 */
function getState() {
  return loadState();
}

// Export for testing
module.exports = {
  loadState,
  saveState,
  recordEdit,
  detectThrashing,
  clearState,
  getState,
  CONFIG,
};

// Run if executed directly
if (require.main === module) {
  // Handle special commands
  const arg = process.argv[2];
  if (arg === "--clear") {
    clearState();
    console.log("Thrashing detector state cleared.");
    process.exit(0);
  } else if (arg === "--status") {
    const state = getState();
    console.log("Thrashing detector status:");
    console.log(`  History entries: ${state.editHistory.length}`);
    console.log(`  Warnings issued: ${state.warningCount}`);
    console.log(`  Session start: ${new Date(state.sessionStart).toISOString()}`);
    process.exit(0);
  }

  main();
}
