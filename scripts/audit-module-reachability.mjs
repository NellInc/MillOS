#!/usr/bin/env node

/**
 * Module reachability gate: which files under `src/` actually ship.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Pass 4 converted 129 materials across five interior rooms in
 * `src/components/infrastructure/FactoryWalls.tsx` on strong evidence - the
 * meshes carried `castShadow` and `receiveShadow`, which an unlit material can
 * never honour, so the author's intent was recorded right beside the material
 * that made it impossible. Every one of those edits was correct and every one of
 * them changed nothing, because nothing imports that file.
 *
 * The repo already knew about two other dead trees: `machineSurfaces.ts` has
 * named `components/Machines.tsx` and the `Instanced*.tsx` tree at its top for
 * two passes. What it did not have was a LIST, or a way to notice a new one.
 *
 * ---------------------------------------------------------------------------
 * TWO INDEPENDENT SIGNALS, BECAUSE EITHER ALONE LIES
 * ---------------------------------------------------------------------------
 *
 * 1. THE IMPORT GRAPH says whether a path exists from the entry module. It is
 *    exact about edges and blind about tree-shaking: a barrel that re-exports a
 *    dead component still counts as an edge, so `infrastructure/index.ts`
 *    keeping `FactoryWalls` alive on the graph proves nothing about the build.
 *
 * 2. THE BUILD says what survived. A distinctive string literal from the file
 *    either appears in `dist/assets/` or it does not - which is exactly how pass
 *    4 finally established that `FactoryWalls.tsx` was dead ("SAFETY FIRST"
 *    appears nowhere in the build). It is blind in the other direction: a file
 *    whose only strings are shared with a dozen siblings cannot be tested this
 *    way, and a live file whose strings were all inlined into a caller reads as
 *    missing.
 *
 * Neither is sufficient. Agreement between them is the verdict; DISAGREEMENT IS
 * A FINDING - `shipped but unreachable` means this script's resolver missed an
 * edge and is lying about everything downstream of it, which is why that case
 * fails the gate rather than being filtered out.
 *
 * ---------------------------------------------------------------------------
 * WHAT A MARKER STRING HAS TO SURVIVE
 * ---------------------------------------------------------------------------
 * esbuild keeps string literals verbatim but is free to re-quote and re-escape
 * them, and JSX text becomes a string literal in the output. So a marker is only
 * usable if it cannot be rewritten: no quotes, no backslashes, no newlines, no
 * `${`. Markers are additionally required to be UNIQUE ACROSS `src/` - a
 * Tailwind class list or a two-word label that six components share says nothing
 * about which of them shipped.
 *
 * UNIQUENESS IS SUBSTRING UNIQUENESS, NOT EQUALITY, and the first build of this
 * script got that wrong in the direction that matters. The search against
 * `dist/` is a substring search, so a marker only identifies its file if no
 * OTHER source file CONTAINS it. `Machines.tsx` - a file this repo has known to
 * be dead for two passes - was reported as shipping on the strength of
 * `text-[10px] text-red-400`, which is a substring of a longer className in the
 * very-much-live `VotingPanel.tsx`; `MultiplayerLobby.tsx` on `The host has left
 * the session.`, a prefix of the longer sentence in `HostMigration.ts`. Four
 * dead files were reported alive that way. Markers are therefore counted across
 * the whole concatenated source corpus, and a marker that occurs anywhere
 * outside its own file is discarded.
 *
 * The one collision this cannot see is a string the file shares with a BUNDLED
 * DEPENDENCY - `src/test/setup.ts` matched a three.js warning it merely quotes.
 * That fails safe (a dead file reads as alive, never the reverse) and it is why
 * `src/test/` is excluded outright: it is test infrastructure that never ships.
 *
 * A file with no usable marker is reported as `unknown`, never as dead. That
 * honesty is the whole value of the tool: pass 4's mistake was acting on one
 * signal, and a tool that guesses when it cannot tell would reproduce it.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   node scripts/audit-module-reachability.mjs            # gate: exits 1 on drift
 *   node scripts/audit-module-reachability.mjs --list     # every module, with verdict
 *   node scripts/audit-module-reachability.mjs --json     # machine-readable
 *
 * The gate needs a CURRENT `dist/`. It refuses to run against a build older than
 * the newest source file rather than reporting a stale answer confidently.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const srcRoot = resolve(root, 'src');
const distRoot = resolve(root, 'dist');

const wantList = process.argv.includes('--list');
const wantJson = process.argv.includes('--json');
const allowStale = process.argv.includes('--allow-stale-dist');

/**
 * Modules known to be unreachable, with the reason each is kept rather than
 * deleted. An entry that becomes reachable again FAILS the gate, so this list
 * cannot rot into a permanent mute the way a bare ignore list would.
 */
const MACHINES =
  'Superseded machine renderer. The live one is machines/CompactMachines.tsx, as machineSurfaces.ts records at its top.';
const SHELL =
  'Superseded factory shell. The live one is infrastructure/OptimizedFactoryInfrastructure.tsx. Pass 4 converted 129 materials in FactoryWalls.tsx before discovering this.';
const ENVIRONMENT =
  'Superseded environment and sky. The live ones are environment/OptimizedFactoryEnvironment.tsx and environment/OptimizedSkySystem.tsx; environmentRegistry has no importer but Environment.tsx.';
const EXTERIOR =
  'Superseded exterior. The live authored exterior is FactoryExterior.tsx with TruckBay.tsx.';
const CONVEYORS =
  'Superseded conveyors. MillScene lazily imports ConveyorSystem.tsx, which is the live owner of every belt in the mill.';
const SHADERS =
  'Standalone shader modules with no importer. The live shader work is injected from the components and machineSurfaces/worldSurface; shaderContracts.ts is the spec the validator reads.';
const HOOKS =
  'Hooks barrel and its unimported members. useKeyboardShortcuts is imported directly, so the barrel itself is dead.';
const MATERIALS = 'Materials barrel with no importer.';
const DEPTH_MATERIALS =
  'Material factory with no importer, though CLAUDE.md instructs future work to use it. Either wire it up or correct the doc.';
const METRICS =
  'Test-only: its suite is green and it renders nowhere. The live metrics UI is under ui-new/.';
const TREE = 'Superseded by scenery/InstancedFoliage.tsx, which FarmArea and VillageArea mount.';
const PHYSICS = 'Physics barrel and worker shim. PhysicsScene.tsx imports what it needs directly.';
const VILLAGE = 'Village barrel. VillageArea.tsx imports its parts directly.';
const BREAKDOWN = 'Breakdown VFX, authored and never mounted.';
const ZONE_LIGHTS = 'Zone accent lighting, authored and never mounted.';

const KNOWN_DEAD = new Map([
  ['src/components/Machines.tsx', MACHINES],
  ['src/components/machines/HoloLabel.tsx', MACHINES],
  ['src/components/machines/index.tsx', MACHINES],
  ['src/components/machines/InstancedPackers.tsx', MACHINES],
  ['src/components/machines/InstancedPlansifters.tsx', MACHINES],
  ['src/components/machines/InstancedRollerMills.tsx', MACHINES],
  ['src/components/machines/InstancedSilos.tsx', MACHINES],
  ['src/components/machines/MachineAnimationManager.tsx', MACHINES],
  ['src/components/machines/MachineLOD.ts', MACHINES],
  ['src/components/machines/shared.ts', MACHINES],
  ['src/components/machines/SiloComponents.tsx', MACHINES],
  ['src/components/machines/StatusRing.tsx', MACHINES],
  ['src/components/machines/TexturesAndMaterials.tsx', MACHINES],
  ['src/components/machines/UIComponents.tsx', MACHINES],
  ['src/components/machines/UtilityComponents.tsx', MACHINES],
  ['src/components/machines/VisualEffects.tsx', MACHINES],

  ['src/components/FactoryInfrastructure.tsx', SHELL],
  ['src/components/infrastructure/DockForklift.tsx', SHELL],
  ['src/components/infrastructure/FactoryFloor.tsx', SHELL],
  ['src/components/infrastructure/FactoryLighting.tsx', SHELL],
  ['src/components/infrastructure/FactoryRoof.tsx', SHELL],
  ['src/components/infrastructure/FactoryWalls.tsx', SHELL],
  ['src/components/infrastructure/index.ts', SHELL],
  ['src/components/infrastructure/ReflectiveFloor.tsx', SHELL],
  ['src/components/infrastructure/SafetyEquipment.tsx', SHELL],
  ['src/components/infrastructure/UtilityConduits.tsx', SHELL],

  ['src/components/SkySystem.tsx', ENVIRONMENT],
  ['src/utils/environmentRegistry.ts', ENVIRONMENT],

  ['src/components/exterior/OptimizedExterior.tsx', EXTERIOR],

  ['src/components/conveyors/CompactConveyorSystem.tsx', CONVEYORS],

  ['src/shaders/edgeHighlight.ts', SHADERS],
  ['src/shaders/fresnelRim.ts', SHADERS],
  ['src/shaders/groundPlane.ts', SHADERS],
  ['src/shaders/index.ts', SHADERS],
  ['src/shaders/panelGrid.ts', SHADERS],
  ['src/shaders/proceduralSurface.ts', SHADERS],
  ['src/shaders/statusPulse.ts', SHADERS],

  ['src/hooks/index.ts', HOOKS],
  ['src/hooks/useDisposable.ts', HOOKS],
  ['src/hooks/useGPUResource.ts', HOOKS],
  ['src/hooks/useProceduralTextures.ts', HOOKS],

  ['src/materials/generativeMaterials.ts', MATERIALS],
  ['src/materials/index.ts', MATERIALS],

  ['src/utils/depthMaterials.ts', DEPTH_MATERIALS],

  ['src/components/ProductionMetrics.tsx', METRICS],

  ['src/components/scenery/Tree.tsx', TREE],

  ['src/components/physics/index.ts', PHYSICS],

  ['src/components/village/index.ts', VILLAGE],

  ['src/components/breakdown/BreakdownEffects.tsx', BREAKDOWN],

  ['src/components/ZoneAccentLights.tsx', ZONE_LIGHTS],

  [
    'src/hooks/useSafetySimulation.ts',
    'Uncrewed safety simulation hook with no importer; the current simulation does not mount random personnel-era incident generation.',
  ],
  [
    'src/utils/sanitize.ts',
    'Legacy multiplayer sanitizers with no production or test importer after the uncrewed release.',
  ],
  [
    'src/utils/typeGuards.ts',
    'Test-only utility collection with no production importer; its geometry helpers are documented as future-facing rather than live.',
  ],
  [
    'src/agent/client/executeAgentCommand.ts',
    'One-shot draft/preview/approve/commit adapter for programmatic callers of window.__MILLOS_AGENT__. AgentCockpit drives preview and commit as two separate user actions and does not import it; no other caller exists yet.',
  ],
]);

// ---------------------------------------------------------------------------
// Source inventory
// ---------------------------------------------------------------------------

/**
 * `src/0.10 Archive/` is a vendored snapshot of a previous version INCLUDING its
 * node_modules - 2,700 files, none of them built. Walking it would swamp the
 * report and its duplicate strings would poison every uniqueness test.
 */
const EXCLUDED_DIRS = new Set(['0.10 Archive', 'node_modules']);

const isTestPath = (path) =>
  path.includes('/__tests__/') ||
  path.includes('/__mocks__/') ||
  path.includes('/src/test/') ||
  /\.(test|spec|bench)\.[tj]sx?$/.test(path);

const collectSources = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectSources(resolve(dir, entry.name), out);
      continue;
    }
    if (!/\.[tj]sx?$/.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    out.push(resolve(dir, entry.name));
  }
  return out;
};

const allSources = collectSources(srcRoot);
const productionSources = allSources.filter((file) => !isTestPath(file));
const rel = (file) => relative(root, file);

/** Each source is read once; three passes want the same text. */
const readCache = new Map();
const fileTextOf = (file) => {
  let text = readCache.get(file);
  if (text === undefined) {
    text = readFileSync(file, 'utf8');
    readCache.set(file, text);
  }
  return text;
};

// ---------------------------------------------------------------------------
// Signal 1: the import graph
// ---------------------------------------------------------------------------

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

/**
 * Resolve a specifier the way Vite will. Only project-local specifiers matter;
 * a bare package name is somebody else's graph.
 */
const resolveSpecifier = (specifier, fromFile) => {
  let base;
  if (specifier.startsWith('.')) {
    base = resolve(fromFile, '..', specifier);
  } else if (specifier.startsWith('@/')) {
    // vite.config.ts: '@' -> the project root, not src.
    base = resolve(root, specifier.slice(2));
  } else {
    return null;
  }
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // `./foo.js` written against a `./foo.ts` source.
  const swapped = base.replace(/\.jsx?$/, '');
  for (const suffix of ['.ts', '.tsx']) {
    if (existsSync(swapped + suffix)) return swapped + suffix;
  }
  return null;
};

/**
 * Every edge a bundler follows, not just the static ones:
 *   - `import x from '...'` / `export * from '...'`
 *   - `import('...')`, which is how every lazily-mounted panel is reached
 *   - `new URL('./worker.ts', import.meta.url)`, which is how the two web
 *     workers are reached and which no import statement records
 */
const edgesOf = (file) => {
  const source = ts.createSourceFile(
    file,
    fileTextOf(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      // `import type` / `export type` are erased by the compiler, so they are
      // not edges. Excluding them is the direction that matters: counting one
      // as an edge would make a dead file read as reachable, which is exactly
      // the blindness this tool exists to remove.
      const typeOnly = /^(import|export)\s+type\b/.test(node.getText(source).trimStart());
      if (!typeOnly) specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'URL' &&
      node.arguments?.length === 2 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers
    .map((specifier) => resolveSpecifier(specifier, file))
    .filter((resolved) => resolved !== null);
};

const graph = new Map();
for (const file of allSources) graph.set(file, edgesOf(file));

/**
 * A module that declares only types has no runtime footprint BY CONSTRUCTION.
 * Every import of it is erased, so it is unreachable on the runtime graph and
 * absent from the build while being entirely alive - `scada/HistorianInterface.ts`
 * has four importers and ships nothing. Calling that dead would be false.
 */
const RUNTIME_STATEMENTS = new Set([
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ExpressionStatement,
]);

const isTypesOnly = (file) => {
  // A re-export barrel is runtime code even though it declares nothing: it
  // emits an import and an export. `hooks/index.ts` is a barrel, not a types
  // module, and calling it types-only would quietly excuse a dead barrel.
  const source = ts.createSourceFile(
    file,
    fileTextOf(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  return !source.statements.some(
    (statement) =>
      RUNTIME_STATEMENTS.has(statement.kind) ||
      (ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        !/^export\s+type\b/.test(statement.getText(source).trimStart()))
  );
};

const ENTRY = resolve(srcRoot, 'main.tsx');
if (!existsSync(ENTRY)) {
  console.error(`Entry ${rel(ENTRY)} not found; index.html loads /src/main.tsx.`);
  process.exit(1);
}

const closureFrom = (entries, seen = new Set()) => {
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of graph.get(file) ?? []) queue.push(edge);
  }
  return seen;
};

const reachable = closureFrom([ENTRY]);

/**
 * A module can be out of the runtime bundle and still be load-bearing.
 *
 * `src/constants/depthRegistry.ts` and `src/shaders/shaderContracts.ts` are
 * SPECIFICATIONS that `validate-depth-policy.mjs` and `validate-shaders.mjs`
 * read at gate time; `src/test/fixtures/*` exist for the suite. Calling those
 * dead would be false, and a gate that cries wolf on twenty of them is a gate
 * nobody runs. They are reported as `tooling` instead - alive, just not to the
 * browser.
 */
const testFiles = allSources.filter(isTestPath);
const scriptText = (() => {
  const scriptsDir = resolve(root, 'scripts');
  let text = '';
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      // Skip this file: its own KNOWN_DEAD list names the dead modules, and
      // reading itself would classify every one of them as tooling.
      else if (path === import.meta.filename) continue;
      else if (/\.(mjs|js|cjs|ts)$/.test(entry.name)) text += readFileSync(path, 'utf8');
    }
  };
  if (existsSync(scriptsDir)) walk(scriptsDir);
  return text;
})();

const testReachable = closureFrom(testFiles);
const isTestOnly = (file) => testReachable.has(file);
const isScriptRead = (file) => scriptText.includes(rel(file));

/** `--why=<path>`: the shortest import chain that keeps a module alive. */
const whyTarget = process.argv.find((value) => value.startsWith('--why='))?.slice(6);
if (whyTarget) {
  const target = resolve(root, whyTarget);
  const roots = [ENTRY, ...testFiles];
  const parent = new Map(roots.map((file) => [file, null]));
  const frontier = [...roots];
  while (frontier.length > 0) {
    const file = frontier.shift();
    if (file === target) break;
    for (const edge of graph.get(file) ?? []) {
      if (parent.has(edge)) continue;
      parent.set(edge, file);
      frontier.push(edge);
    }
  }
  if (!parent.has(target)) {
    console.log(`${rel(target)}: no import chain from src/main.tsx or any test file.`);
    if (isScriptRead(target)) console.log('  It IS read by a script under scripts/ - a spec file.');
  } else {
    const chain = [];
    for (let node = target; node; node = parent.get(node)) chain.unshift(rel(node));
    console.log(chain.join('\n  -> '));
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Signal 2: the build
// ---------------------------------------------------------------------------

const collectDistText = (dir) => {
  let text = '';
  if (!existsSync(dir)) return text;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      text += collectDistText(path);
      continue;
    }
    if (!/\.(js|mjs|css|html)$/.test(entry.name)) continue;
    text += readFileSync(path, 'utf8');
  }
  return text;
};

if (!existsSync(resolve(distRoot, 'index.html'))) {
  console.error('dist/index.html is missing. Run `npm run build` first.');
  process.exit(1);
}

const distText = collectDistText(distRoot);

const newestSource = productionSources.reduce(
  (newest, file) => Math.max(newest, statSync(file).mtimeMs),
  0
);
const distBuiltAt = statSync(resolve(distRoot, 'index.html')).mtimeMs;
if (distBuiltAt < newestSource && !allowStale) {
  console.error(
    'dist/ is older than the newest file under src/. A stale build reports ' +
      'live code as dead. Run `npm run build`, or pass --allow-stale-dist.'
  );
  process.exit(1);
}

/**
 * Candidate markers: string literals, template heads with no substitution, and
 * JSX text. Anything a minifier could re-escape is rejected outright.
 */
const MIN_MARKER_LENGTH = 14;

const markersOf = (file) => {
  const source = ts.createSourceFile(
    file,
    fileTextOf(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found = new Set();
  const consider = (raw) => {
    const value = raw.trim();
    if (value.length < MIN_MARKER_LENGTH) return;
    if (!/[A-Za-z]/.test(value)) return;
    if (/["'`\\\n\r]/.test(value)) return;
    if (value.includes('${')) return;
    // Module specifiers and asset URLs are rewritten by the bundler.
    if (value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) return;
    if (value.startsWith('http')) return;
    found.add(value);
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) consider(node.text);
    else if (ts.isJsxText(node)) consider(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** How many marker candidates per file are checked against the whole corpus. */
const MARKERS_PER_FILE = 8;

const fileText = new Map(productionSources.map((file) => [file, readFileSync(file, 'utf8')]));
const corpus = productionSources.map((file) => fileText.get(file)).join('\n \n');

const occurrences = (haystack, needle) => {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + 1);
  }
  return count;
};

/**
 * The longest candidates first: a long string is both less likely to collide
 * and more likely to be the file's own subject matter rather than boilerplate.
 * Uniqueness is then confirmed against the concatenated corpus - the marker must
 * occur exactly as many times in the whole of `src/` as it does in its own file.
 */
const distinctiveMarkers = new Map();
for (const file of productionSources) {
  const own = fileTextOf(file);
  const candidates = [...markersOf(file)]
    .sort((a, b) => b.length - a.length)
    .slice(0, MARKERS_PER_FILE);
  distinctiveMarkers.set(
    file,
    candidates.filter((marker) => occurrences(corpus, marker) === occurrences(own, marker))
  );
}

const shipStatusOf = (file) => {
  const distinctive = distinctiveMarkers.get(file) ?? [];
  if (distinctive.length === 0) return { status: 'unknown', evidence: null, tested: 0 };
  const hit = distinctive.find((marker) => distText.includes(marker));
  return hit
    ? { status: 'shipped', evidence: hit, tested: distinctive.length }
    : { status: 'absent', evidence: distinctive[0], tested: distinctive.length };
};

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

const modules = productionSources
  .map((file) => {
    const ship = shipStatusOf(file);
    const isReachable = reachable.has(file);
    let verdict;
    if (isReachable && ship.status !== 'absent') verdict = 'alive';
    else if (isReachable && ship.status === 'absent') verdict = 'tree-shaken';
    else if (ship.status === 'shipped') verdict = 'graph-miss';
    else if (isScriptRead(file)) verdict = 'tooling';
    else if (isTypesOnly(file)) verdict = 'types-only';
    else verdict = 'dead';
    return {
      file: rel(file),
      verdict,
      reachable: isReachable,
      // A component whose only importer is its own unit test does not ship. The
      // test still passes, which is the whole hazard: `ProductionMetrics.tsx`
      // has a green 300-line suite and renders nowhere.
      testOnly: !isReachable && isTestOnly(file),
      ship: ship.status,
      markersTested: ship.tested,
      evidence: ship.evidence,
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

const byVerdict = (name) => modules.filter((entry) => entry.verdict === name);
const dead = byVerdict('dead');
const treeShaken = byVerdict('tree-shaken');
const graphMiss = byVerdict('graph-miss');

if (wantJson) {
  console.log(JSON.stringify({ modules }, null, 2));
  process.exit(0);
}

console.log('MODULE REACHABILITY');
console.log('='.repeat(78));
console.log(
  `${modules.length} production modules under src/  ` +
    `(${allSources.length - productionSources.length} test files excluded)`
);
console.log(
  `alive ${byVerdict('alive').length}   tooling ${byVerdict('tooling').length}   ` +
    `types-only ${byVerdict('types-only').length}   dead ${dead.length}   ` +
    `tree-shaken ${treeShaken.length}   graph-miss ${graphMiss.length}`
);
const unknown = modules.filter((entry) => entry.ship === 'unknown').length;
console.log(`${unknown} modules have no distinctive string; the graph alone decides those.`);

if (wantList) {
  console.log('');
  for (const entry of modules) {
    console.log(
      `  ${entry.verdict.padEnd(12)} ${entry.ship.padEnd(8)} ${entry.file}` +
        (entry.evidence ? `   "${entry.evidence.slice(0, 40)}"` : '')
    );
  }
}

const failures = [];

if (dead.length > 0) {
  console.log('');
  console.log(`UNREACHABLE (${dead.length})`);
  for (const entry of dead) {
    const known = KNOWN_DEAD.get(entry.file);
    console.log(`  ${known ? 'known ' : 'NEW   '}${entry.file}`);
    if (known) console.log(`         ${known}`);
    if (!known) {
      failures.push(
        `${entry.file} is unreachable from src/main.tsx and its strings are not in dist/. ` +
          'Delete it, wire it up, or add it to KNOWN_DEAD with a reason.'
      );
    }
  }
}

for (const [file, reason] of KNOWN_DEAD) {
  if (!existsSync(resolve(root, file))) {
    failures.push(`KNOWN_DEAD lists ${file}, which no longer exists. Remove the entry.`);
    continue;
  }
  const entry = modules.find((candidate) => candidate.file === file);
  if (entry && entry.verdict !== 'dead') {
    failures.push(
      `KNOWN_DEAD lists ${file} (${reason}) but it is now ${entry.verdict}. ` +
        'Remove the entry - a stale allow-list is a permanent mute.'
    );
  }
}

if (graphMiss.length > 0) {
  console.log('');
  console.log(`SHIPPED BUT UNREACHABLE ON THE GRAPH (${graphMiss.length})`);
  console.log('  This script missed an edge. Its dead list cannot be trusted until fixed.');
  for (const entry of graphMiss) {
    console.log(`  ${entry.file}   found in dist as "${entry.evidence?.slice(0, 40)}"`);
    failures.push(`${entry.file}: shipped but not reachable on the import graph.`);
  }
}

if (treeShaken.length > 0) {
  console.log('');
  console.log(`REACHABLE BUT NOT IN THE BUILD (${treeShaken.length})`);
  console.log('  Imported somewhere, but no distinctive string survived. Either the');
  console.log('  bundler pruned the export, or the strings are only in dead branches.');
  for (const entry of treeShaken) {
    console.log(`  ${entry.file}   (${entry.markersTested} markers tested)`);
  }
}

console.log('');
if (failures.length > 0) {
  console.log(`FAIL (${failures.length})`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PASS - no new dead modules, no stale allow-list entries, no graph misses.');
}
