#!/usr/bin/env node
/**
 * Analyze useMillStore usage patterns and categorize by store domain
 */

const fs = require('fs');
const path = require('path');

// Store domain definitions based on state properties
const STORE_DOMAINS = {
  graphics: [
    'graphics',
    'quality',
    'enableSSAO',
    'enableBloom',
    'enableVignette',
    'enableChromaticAberration',
    'enableFilmGrain',
    'enableDepthOfField',
    'enableContactShadows',
    'enableHighResShadows',
    'shadowMapSize',
    'setGraphicsQuality',
    'setGraphicsSetting',
    'enableLightShafts',
    'enableAtmosphericHaze',
    'dustParticleCount',
    'enableDustParticles',
    'enableGrainFlow',
  ],

  gameSimulation: [
    'gameTime',
    'tickGameTime',
    'weather',
    'setWeather',
    'currentShift',
    'triggerShiftChange',
    'shiftChangeActive',
    'gameSpeed',
    'setGameSpeed',
    'time',
    'shift',
  ],

  production: [
    'machines',
    'workers',
    'metrics',
    'totalBagsProduced',
    'productionSpeed',
    'setMachines',
    'updateMachineMetrics',
    'updateMachineStatus',
    'incrementBagsProduced',
    'dockStatus',
    'updateDockStatus',
    'scadaLive',
    'productionEfficiency',
    'productionTarget',
    'workerLeaderboard',
    'updateWorkerScore',
    'workerSatisfaction',
  ],

  safety: [
    'safetyMetrics',
    'safetyIncidents',
    'clearSafetyIncidents',
    'addSafetyIncident',
    'forkliftMetrics',
    'resetForkliftMetrics',
    'recordSafetyStop',
    'recordWorkerEvasion',
    'incidentHeatMap',
    'showIncidentHeatMap',
    'setShowIncidentHeatMap',
    'clearIncidentHeatMap',
    'forkliftEmergencyStop',
    'setForkliftEmergencyStop',
    'safetyConfig',
    'setSafetyConfig',
    'speedZones',
    'addSpeedZone',
    'removeSpeedZone',
    'daysSinceIncident',
    'emergencyActive',
    'emergencyDrillMode',
    'startEmergencyDrill',
    'endEmergencyDrill',
  ],

  ui: [
    'alerts',
    'addAIDecision',
    'aiDecisions',
    'theme',
    'showHeatMap',
    'setShowHeatMap',
    'clearHeatMap',
    'heatMapData',
    'announcements',
    'addAnnouncement',
    'dismissAnnouncement',
    'clearOldAnnouncements',
    'achievements',
    'showMiniMap',
    'legendPosition',
    'setLegendPosition',
    'showGamificationBar',
    'setShowGamificationBar',
    'panelMinimized',
    'setPanelMinimized',
    'showShortcuts',
    'setShowShortcuts',
    'fpsMode',
    'setFpsMode',
  ],
};

function categorizeProperty(prop) {
  for (const [store, props] of Object.entries(STORE_DOMAINS)) {
    if (props.includes(prop)) {
      return store;
    }
  }
  return 'unknown';
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const usages = [];

  // Pattern: useMillStore((state) => state.XXX)
  const hookPattern = /useMillStore\(\s*\(state[^)]*\)\s*=>\s*([^)]+)\)/g;

  // Pattern: useMillStore.getState()
  const getStatePattern = /useMillStore\.getState\(\)/g;

  let match;
  while ((match = hookPattern.exec(content)) !== null) {
    const expression = match[1].trim();
    usages.push({ type: 'hook', expression, line: match.index });
  }

  while ((match = getStatePattern.exec(content)) !== null) {
    usages.push({ type: 'getState', expression: 'getState()', line: match.index });
  }

  // Analyze what properties are accessed
  const storeAccesses = new Set();

  usages.forEach((usage) => {
    const expr = usage.expression;

    // Extract property accesses: state.XXX or state.graphics.XXX
    const stateProps = expr.match(/state\.(\w+)/g);
    if (stateProps) {
      stateProps.forEach((prop) => {
        const propName = prop.replace('state.', '');
        storeAccesses.add(propName);
      });
    }

    // Also check for nested properties like state.graphics.quality
    const nestedProps = expr.match(/state\.\w+\.(\w+)/g);
    if (nestedProps) {
      nestedProps.forEach((prop) => {
        const parts = prop.split('.');
        if (parts.length >= 3) {
          storeAccesses.add(parts[2]);
        }
      });
    }
  });

  // Categorize by store
  const storeCounts = {};
  storeAccesses.forEach((prop) => {
    const store = categorizeProperty(prop);
    storeCounts[store] = (storeCounts[store] || 0) + 1;
  });

  return {
    path: filePath,
    usageCount: usages.length,
    properties: Array.from(storeAccesses),
    storeCounts,
    usages,
  };
}

function findAllFiles(
  dir,
  pattern = /\.(ts|tsx)$/,
  excludePatterns = [/node_modules/, /0\.10 Archive/]
) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      // Skip excluded patterns
      if (excludePatterns.some((p) => p.test(fullPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// Main analysis
const srcDir = path.join(__dirname, 'src');
const files = findAllFiles(srcDir);

const results = files
  .map(analyzeFile)
  .filter((r) => r.usageCount > 0)
  .sort((a, b) => b.usageCount - a.usageCount);

// Generate report
console.log('# useMillStore Migration Analysis\n');
console.log(`Total files using useMillStore: ${results.length}\n`);

// Summary by store
const storeTotals = {};
results.forEach((r) => {
  Object.entries(r.storeCounts).forEach(([store, count]) => {
    storeTotals[store] = (storeTotals[store] || 0) + count;
  });
});

console.log('## Property Access by Store Domain\n');
Object.entries(storeTotals)
  .sort((a, b) => b[1] - a[1])
  .forEach(([store, count]) => {
    console.log(`- **${store}**: ${count} property accesses`);
  });

console.log('\n## Files by Primary Store Domain\n');

// Group files by their primary store (most accessed)
const filesByStore = {
  graphics: [],
  gameSimulation: [],
  production: [],
  safety: [],
  ui: [],
  mixed: [],
};

results.forEach((r) => {
  const stores = Object.keys(r.storeCounts);

  if (stores.length === 1) {
    const store = stores[0];
    if (filesByStore[store]) {
      filesByStore[store].push(r);
    }
  } else if (stores.length > 1) {
    filesByStore.mixed.push(r);
  }
});

// Single-store files (easy migrations)
console.log('### Single-Store Files (Easy Migration)\n');
Object.entries(filesByStore).forEach(([store, files]) => {
  if (store !== 'mixed' && files.length > 0) {
    console.log(`#### ${store} (${files.length} files)\n`);
    files.forEach((f) => {
      const relPath = f.path.replace(srcDir + '/', '');
      console.log(`- \`${relPath}\` (${f.usageCount} usages)`);
      console.log(`  - Properties: ${f.properties.join(', ')}`);
      console.log(
        `  - Migration: Replace \`useMillStore\` with \`use${store.charAt(0).toUpperCase() + store.slice(1)}Store\``
      );
      console.log('');
    });
  }
});

// Multi-store files (complex migrations)
console.log('### Multi-Store Files (Complex Migration)\n');
filesByStore.mixed.forEach((f) => {
  const relPath = f.path.replace(srcDir + '/', '');
  console.log(`#### ${relPath} (${f.usageCount} usages)\n`);
  console.log('Accesses multiple stores:');
  Object.entries(f.storeCounts).forEach(([store, count]) => {
    console.log(`- **${store}**: ${count} properties`);
  });
  console.log('\nProperties by store:');
  f.properties.forEach((prop) => {
    const store = categorizeProperty(prop);
    console.log(`- \`${prop}\` → ${store}`);
  });
  console.log('');
});

// Migration priority
console.log('\n## Migration Priority\n');
console.log('### Phase 1: Single-Store Files (Low Risk)\n');
let phase1Count = 0;
Object.entries(filesByStore).forEach(([store, files]) => {
  if (store !== 'mixed' && files.length > 0) {
    phase1Count += files.length;
    console.log(`- ${store}: ${files.length} files`);
  }
});
console.log(`\nTotal Phase 1: **${phase1Count} files**\n`);

console.log('### Phase 2: Multi-Store Files (Higher Risk)\n');
console.log(`Total Phase 2: **${filesByStore.mixed.length} files**\n`);

console.log('### Phase 3: Test Files\n');
const testFiles = results.filter((r) => r.path.includes('__tests__'));
console.log(`Total Phase 3: **${testFiles.length} files**\n`);

// Detailed file list
console.log('\n## Detailed File Analysis\n');
results.forEach((r) => {
  const relPath = r.path.replace(srcDir + '/', '');
  console.log(`### ${relPath}\n`);
  console.log(`- Total usages: ${r.usageCount}`);
  console.log(`- Stores accessed: ${Object.keys(r.storeCounts).join(', ')}`);
  console.log(`- Properties: ${r.properties.join(', ')}`);
  console.log('');
});
