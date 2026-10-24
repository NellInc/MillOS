# Claude Code Hooks - TypeScript Cascade Prevention

## Overview

These hooks automatically enforce code quality standards and prevent TypeScript cascades in this React Three Fiber project.

## Hooks

### flywheel-thrashing-detector.cjs

**Purpose**: Detects when Claude is stuck in an "idiocy loop" - repeatedly editing the same files without making progress.

**Blocks**: No (warns only)
**Always Active**: Yes

**Detection**:
- Tracks last 15 file operations
- Warns if same file edited 3+ times
- Clears history after 30 minutes of inactivity

**Commands**:
```bash
node hooks/flywheel-thrashing-detector.cjs --status  # Show current state
node hooks/flywheel-thrashing-detector.cjs --clear   # Clear state
```

### pre-write.js

**Purpose**: Runs TypeScript and ESLint checking before any file write operation
**Blocks**: Yes (prevents write if checks fail)

**Coverage**:
- TypeScript files: `npm run typecheck` (tsc --noEmit)
- ESLint: `npm run lint` (for files in src/)
- Prettier: `npm run format:check` (auto-fixes with `npm run format`)
- Cascade detection: Warns if 10+ TypeScript errors detected

## Configuration

Edit `hooks.json` to customize:
- Enable/disable specific hooks
- Adjust timeout settings
- Configure file patterns

## Bypass (Emergency Only)

If you absolutely must bypass (NOT recommended):
```bash
# Use --no-verify flag
# But this defeats the entire purpose!
```

## Philosophy

"TypeScript cascades waste context and time. Prevent them at the source."

- The pre-write hook catches errors before they multiply
- The thrashing detector catches edit loops before they waste hours
