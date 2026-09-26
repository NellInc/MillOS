import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const ACTIVE_SOURCE = path.join(ROOT, 'src');
const CURRENT_PUBLIC = path.join(ROOT, 'public');
const DESIGN_FILES = [
  path.join(ROOT, 'scripts', 'blender', 'PROMPTS.md'),
  path.join(ROOT, 'scripts', 'blender', 'specs', 'forklift-vehicles.json'),
];

const forbiddenPathPatterns = [
  { label: 'worker asset directory', pattern: /(^|\/)assets\/workers(\/|$)/i },
  { label: 'portrait directory', pattern: /(^|\/)portraits(\/|$)/i },
  { label: 'character model directory', pattern: /(^|\/)models\/worker(\/|$)/i },
  {
    label: 'human-specific asset filename',
    pattern: /(^|[/_.-])(worker|personnel|human|avatar|character)([/_.-]|$)/i,
  },
];

const forbiddenRuntimePatterns = [
  { label: 'host speech synthesis', pattern: /speechSynthesis|SpeechSynthesisUtterance/ },
  {
    label: 'personnel runtime module',
    pattern:
      /WorkerSystemNew|WorkerDetailPanel|WorkforcePanel|WorkerModel|RemotePlayerAvatar|SeatedVehicleOperator|DockSpotter|WarehouseWorkerWithPalletJack/,
  },
  {
    label: 'human asset URL',
    pattern: /assets\/workers|models\/worker|worker-(masculine|feminine)/i,
  },
  { label: 'portrait asset URL', pattern: /portraitPath|[/\\]portraits[/\\]/i },
  {
    label: 'portrait roster',
    pattern: /marcus_chen|sarah_mitchell|james_rodriguez|emily_ronson|jennifer_lee/i,
  },
];

const forbiddenDesignPatterns = [
  { label: 'obsolete worker asset guidance', pattern: /only the forklift and three workers/i },
  {
    label: 'personnel geometry study',
    pattern: /"name"\s*:\s*"(?:operator|worker|driver|personnel|avatar|human)/i,
  },
  { label: 'worker geometry manifest', pattern: /worker-body\.json/i },
];

const isArchivedPath = (relative) =>
  relative.startsWith('0.10 Archive/') || /^v\d+\.\d+\//.test(relative);

const isTestSource = (relative) =>
  relative.includes('/__tests__/') || /(?:^|\.)test\.[cm]?[jt]sx?$/.test(relative);

async function collectFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(absolute, base);
      return [{ absolute, relative: path.relative(base, absolute).split(path.sep).join('/') }];
    })
  );
  return nested.flat();
}

async function main() {
  try {
    if (!(await stat(DIST)).isDirectory()) throw new Error('dist is not a directory');
  } catch {
    throw new Error('dist is missing. Run npm run build before validate:uncrewed.');
  }

  const files = await collectFiles(DIST);
  const failures = [];

  for (const file of files) {
    for (const rule of forbiddenPathPatterns) {
      if (rule.pattern.test(file.relative)) failures.push(`${rule.label}: ${file.relative}`);
    }

    if (!/\.(?:js|html|json|webmanifest)$/i.test(file.relative)) continue;
    const content = await readFile(file.absolute, 'utf8');
    for (const rule of forbiddenRuntimePatterns) {
      if (rule.pattern.test(content)) failures.push(`${rule.label}: ${file.relative}`);
    }
  }

  const sourceFiles = await collectFiles(ACTIVE_SOURCE);
  for (const file of sourceFiles) {
    if (isArchivedPath(file.relative) || isTestSource(file.relative)) continue;
    for (const rule of forbiddenPathPatterns) {
      if (rule.pattern.test(file.relative))
        failures.push(`active source ${rule.label}: ${file.relative}`);
    }
    if (!/\.[cm]?[jt]sx?$/i.test(file.relative)) continue;
    const content = await readFile(file.absolute, 'utf8');
    for (const rule of forbiddenRuntimePatterns) {
      if (rule.pattern.test(content))
        failures.push(`active source ${rule.label}: ${file.relative}`);
    }
  }

  const publicFiles = await collectFiles(CURRENT_PUBLIC);
  for (const file of publicFiles) {
    if (isArchivedPath(file.relative)) continue;
    for (const rule of forbiddenPathPatterns) {
      if (rule.pattern.test(file.relative))
        failures.push(`current public ${rule.label}: ${file.relative}`);
    }
  }

  for (const absolute of DESIGN_FILES) {
    const content = await readFile(absolute, 'utf8');
    for (const rule of forbiddenDesignPatterns) {
      if (rule.pattern.test(content)) {
        failures.push(`design ${rule.label}: ${path.relative(ROOT, absolute)}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Uncrewed delivery contract failed:\n${[...new Set(failures)].join('\n')}`);
  }

  console.log(
    `Uncrewed current-release contract passed: ${files.length} current delivery files and ${sourceFiles.length} active source files contain no human assets, portraits, host voices, personnel modules, or personnel design studies. Archived releases and source provenance remain outside this current-release gate.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
