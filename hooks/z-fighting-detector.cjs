/**
 * Z-Fighting Detector Hook
 *
 * Catches hardcoded polygonOffset values before file writes.
 * Forces use of POLYGON_OFFSET constants from renderLayers.ts.
 */

const fs = require('fs');

function detectZFightingViolations(filePath, content) {
  const violations = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Detect hardcoded polygonOffsetFactor with raw numbers
    const factorMatch = line.match(/polygonOffsetFactor[=:]?\s*\{?\s*(-?\d+(?:\.\d+)?)\s*\}?/);
    if (factorMatch && !line.includes('POLYGON_OFFSET')) {
      violations.push({
        line: lineNum,
        issue: `Hardcoded polygonOffsetFactor={${factorMatch[1]}}`,
        fix: 'Use POLYGON_OFFSET.*.factor from renderLayers.ts',
      });
    }

    // Detect hardcoded polygonOffsetUnits with raw numbers
    const unitsMatch = line.match(/polygonOffsetUnits[=:]?\s*\{?\s*(-?\d+(?:\.\d+)?)\s*\}?/);
    if (unitsMatch && !line.includes('POLYGON_OFFSET')) {
      violations.push({
        line: lineNum,
        issue: `Hardcoded polygonOffsetUnits={${unitsMatch[1]}}`,
        fix: 'Use POLYGON_OFFSET.*.units from renderLayers.ts',
      });
    }

    // Detect floor overlays with Y < 0.03 (z-fighting risk)
    const yPosMatch = line.match(/position=\{\[.*?,\s*(0\.0[0-2]\d*)\s*,/);
    if (yPosMatch && !line.includes('FLOOR_LAYERS') && !line.includes('EXTERIOR_LAYERS')) {
      violations.push({
        line: lineNum,
        issue: `Floor overlay at y=${yPosMatch[1]} (z-fighting risk)`,
        fix: 'Use FLOOR_LAYERS.* constant or raise Y >= 0.03',
      });
    }
  });

  return violations;
}

// Main hook execution
function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.log('No file path provided');
    process.exit(0);
  }

  // Only check component files
  if (!filePath.includes('/components/') || !filePath.match(/\.(tsx?|jsx?)$/)) {
    process.exit(0);
  }

  // Skip archive files
  if (filePath.includes('/0.10 Archive/')) {
    process.exit(0);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const violations = detectZFightingViolations(filePath, content);

    if (violations.length > 0) {
      console.log('\n⚠️  Z-FIGHTING RISK DETECTED');
      console.log('─'.repeat(50));
      console.log(`File: ${filePath}\n`);

      violations.forEach((v, i) => {
        console.log(`${i + 1}. Line ${v.line}: ${v.issue}`);
        console.log(`   Fix: ${v.fix}\n`);
      });

      console.log('─'.repeat(50));
      console.log('Import: import { POLYGON_OFFSET } from \'../constants/renderLayers\';');
      console.log('Docs: See CLAUDE.md "Z-Fighting Decision Tree"\n');

      // Warning only, don't block (set exit 1 to block)
      process.exit(0);
    }
  } catch (err) {
    // File might not exist yet or other read error
    process.exit(0);
  }
}

main();
