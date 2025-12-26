#!/usr/bin/env node
/**
 * Antipattern Detector Hook (Template)
 *
 * Prevents duty-shirking patterns from being committed:
 * 1. Stub implementations (TODO + pass/return placeholder)
 * 2. CI weakening (continue-on-error: true additions)
 * 3. Shell error hiding (|| true, || echo, 2>/dev/null)
 * 4. Test weakening (assert True, always-passing tests)
 * 5. Coverage threshold reductions
 * 6. Suppression abuse (adding ignores to avoid fixing)
 *
 * Copy this to your project's hooks/ directory and register in hooks.json
 *
 * Created after incident where Claude hid 3000+ defects with suppressions
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// ANTIPATTERN DEFINITIONS
// ============================================================================

const ANTIPATTERNS = {
  stubImplementation: {
    patterns: [
      /^\+.*#\s*TODO.*\n\+\s*pass\s*$/gm,
      /^\+.*#\s*TODO.*\n\+\s*return\s+(None|True|False|\[\]|\{\}|""|'')\s*$/gm,
    ],
    severity: 'warning',
    message: 'Stub implementation detected. Either implement or use explicit NotImplementedError.',
  },

  ciWeakening: {
    patterns: [
      /^\+\s*continue-on-error:\s*true\s*(?!#.*(?:optional|upload|artifact))/gim,
    ],
    filePatterns: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
    severity: 'error',
    message: 'CI weakening detected. Security gates must block, not warn.',
  },

  testWeakening: {
    patterns: [
      /^\+\s*assert\s+True\s*(?:#.*)?$/gm,
      /^\+\s*assert\s+1\s*(?:#.*)?$/gm,
      /^\+.*@pytest\.mark\.skip\s*\(\s*\)/gm,
      /^\+.*expect\s*\(\s*true\s*\)/gim,
    ],
    filePatterns: ['tests/**/*.py', '**/*.test.ts', '**/*.spec.ts'],
    severity: 'error',
    message: 'Test weakening detected. Tests must verify behavior.',
  },

  suppressionAbuse: {
    patterns: [
      /^\+.*#\s*noqa\s*$/gm,
      /^\+.*#\s*type:\s*ignore\s*$/gm,
      /^\+.*\/\/\s*eslint-disable-next-line\s*$/gm,
      /^\+.*\/\/\s*@ts-ignore\s*$/gm,
    ],
    severity: 'warning',
    message: 'Suppression without justification. Add reason or fix the issue.',
  },

  shellErrorHiding: {
    patterns: [
      /^\+.*\|\|\s*true\s*$/gm,
      /^\+.*2>\s*\/dev\/null.*(?:curl|wget|health|check)/gim,
    ],
    filePatterns: ['*.sh', 'scripts/**/*.sh'],
    severity: 'warning',
    message: 'Shell error hiding detected. Critical commands should fail loudly.',
  },
};

// ============================================================================
// DETECTION LOGIC
// ============================================================================

function detectAntipatterns(diff, filename) {
  const issues = [];

  for (const [name, config] of Object.entries(ANTIPATTERNS)) {
    // Check if file pattern matches
    if (config.filePatterns) {
      const matches = config.filePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
      if (!matches) continue;
    }

    // Check patterns
    for (const pattern of config.patterns) {
      if (pattern.test(diff)) {
        issues.push({
          type: name,
          severity: config.severity,
          message: config.message,
        });
        break; // One match per category is enough
      }
    }
  }

  return issues;
}

// ============================================================================
// MAIN
// ============================================================================

const diff = process.argv[2] || '';
const filename = process.argv[3] || '';

if (diff) {
  const issues = detectAntipatterns(diff, filename);

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  for (const warning of warnings) {
    console.warn(`⚠️  ${warning.type}: ${warning.message}`);
  }

  for (const error of errors) {
    console.error(`🛑 ${error.type}: ${error.message}`);
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} antipattern error(s) detected. Fix before proceeding.\n`);
    process.exit(1);
  }
}

process.exit(0);
