import { execFileSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const MAX_DIRTY_PATHS = 256;
const MAX_PATH_LENGTH = 512;

export function collectEngineeringBrief(root, options = {}) {
  const now = options.now ?? new Date();
  const git = options.git ?? ((args) => runGit(root, args));
  const packageMetadata = readJson(resolve(root, 'package.json'));
  const manifest = readJson(resolve(root, 'build/generated/agent/system-manifest.json'));
  const statusEntries = parseGitStatusZ(
    git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  );
  const branch = safeGit(git, ['branch', '--show-current']) || '(detached)';
  const head = safeGit(git, ['rev-parse', 'HEAD']);
  const tree = safeGit(git, ['rev-parse', 'HEAD^{tree}']);
  const upstream =
    safeGit(git, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) || null;
  const worktrees = parseWorktrees(safeGit(git, ['worktree', 'list', '--porcelain']), root);
  const affectedDomains = inferAffectedDomains(statusEntries.map((entry) => entry.path));
  const disk = statfsSync(root);
  const freeDiskBytes = Number(disk.bavail) * Number(disk.bsize);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    purpose:
      'Bounded engineering orientation without diffs, file contents, environment values, or credentials.',
    repository: {
      root,
      branch,
      head,
      tree,
      upstream,
      freeDiskBytes,
      freeDiskGiB: Number((freeDiskBytes / 1024 ** 3).toFixed(2)),
      worktrees,
      workingTree: {
        clean: statusEntries.length === 0,
        entryCount: statusEntries.length,
        truncated: statusEntries.length > MAX_DIRTY_PATHS,
        entries: statusEntries.slice(0, MAX_DIRTY_PATHS),
        affectedDomains,
      },
    },
    product: {
      name: String(packageMetadata.name),
      version: String(packageMetadata.version),
    },
    contract: {
      schemaVersion: Number(manifest.schemaVersion),
      sourceFingerprint: String(manifest.generation?.sourceFingerprint ?? 'missing'),
      domainCount: arrayLength(manifest.domains),
      invariantCount: arrayLength(manifest.invariants),
      entityCount: arrayLength(manifest.entities),
      capabilityCount: arrayLength(manifest.capabilities),
      queryPlane: manifest.queryPlane,
    },
    authority: {
      observationOnly: false,
      commandExecution: true,
      externalWrites: false,
      commit: false,
      push: false,
      deploy: false,
      reason:
        'The installed runtime exposes scoped simulation command execution behind preview, grant, and receipt. External writes, publication, and control of the repository require separate authorization.',
    },
    criticalPath: [
      'Run npm run agent:manifest before treating generated contract facts as current.',
      'Use window.__MILLOS_AGENT__.brief() for live operational state.',
      'Use window.__MILLOS_AGENT__.query(...) for one bounded domain, entity, relationship, or delta.',
      'Use window.__MILLOS_AGENT__.draft/preview/commit for simulation-scoped commands; external writes stay denied.',
    ],
    verification: {
      focused: ['npm run agent:typecheck', 'npm run agent:manifest:check'],
      aggregate: [
        'npm run typecheck',
        'npm run lint',
        'npm run format:check',
        'npm test',
        'npm run build',
      ],
    },
  };
}

/**
 * Render the authority line from the brief's own fields so the text can never
 * say "observation only" while the structured fields say otherwise.
 */
export function renderAuthorityLine(authority = {}) {
  const held = ['externalWrites', 'commit', 'push', 'deploy']
    .filter((key) => authority[key] !== true)
    .map((key) => ({ externalWrites: 'external writes' })[key] ?? key);
  const execution = authority.commandExecution
    ? 'scoped simulation command execution'
    : 'observation only';
  return `Authority: ${execution}. Held: ${held.length > 0 ? held.join(', ') : 'none'}.`;
}

export function renderEngineeringBrief(brief) {
  const dirty = brief.repository.workingTree;
  const query = brief.contract.queryPlane;
  const lines = [
    'MillOS Agent Engineering Brief v1',
    `Generated: ${brief.generatedAt}`,
    '',
    `Repository: ${brief.repository.root}`,
    `Branch: ${brief.repository.branch}`,
    `HEAD: ${brief.repository.head}`,
    `Tree: ${brief.repository.tree}`,
    `Upstream: ${brief.repository.upstream ?? 'none'}`,
    `Free disk: ${brief.repository.freeDiskGiB} GiB`,
    `Worktrees: ${brief.repository.worktrees.length}`,
    '',
    `Working tree: ${dirty.clean ? 'clean' : `${dirty.entryCount} entries`}${dirty.truncated ? ' (path list truncated)' : ''}`,
    `Affected domains: ${dirty.affectedDomains.length > 0 ? dirty.affectedDomains.join(', ') : 'none inferred'}`,
    ...dirty.entries.slice(0, 20).map((entry) => `  ${entry.xy} ${entry.path}`),
    ...(dirty.entries.length > 20
      ? [`  ... ${dirty.entries.length - 20} more paths available in JSON output`]
      : []),
    '',
    `Product: ${brief.product.name} ${brief.product.version}`,
    `Contract fingerprint: ${brief.contract.sourceFingerprint}`,
    `Contracts: ${brief.contract.domainCount} domains, ${brief.contract.invariantCount} invariants, ${brief.contract.entityCount} entities, ${brief.contract.capabilityCount} capabilities`,
    `Query budgets: L0 ${query.level0MaximumBytes} bytes, L1 ${query.level1MaximumBytes} bytes, page ${query.maximumPageSize}, history ${query.snapshotHistorySize}`,
    '',
    renderAuthorityLine(brief.authority),
    '',
    'Critical path:',
    ...brief.criticalPath.map((item, index) => `  ${index + 1}. ${item}`),
    '',
    'Focused verification:',
    ...brief.verification.focused.map((command) => `  ${command}`),
    '',
    'Live driver entry point:',
    '  window.__MILLOS_AGENT__.brief()',
  ];
  return `${lines.join('\n')}\n`;
}

export function parseGitStatusZ(output) {
  const parts = output.split('\0');
  const entries = [];
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index];
    if (!record) continue;
    const xy = record.slice(0, 2);
    const firstPath = sanitizePath(record.slice(3));
    if (xy.includes('R') || xy.includes('C')) {
      const secondPath = sanitizePath(parts[index + 1] ?? '');
      index += 1;
      entries.push({ xy, path: secondPath, from: firstPath });
    } else {
      entries.push({ xy, path: firstPath });
    }
  }
  return entries;
}

export function inferAffectedDomains(paths) {
  const domains = new Set();
  for (const path of paths) {
    if (path.startsWith('src/stores/gameSimulation') || path.startsWith('src/systems/'))
      domains.add('simulation');
    if (path.startsWith('src/stores/production') || path.startsWith('src/components/'))
      domains.add('production');
    if (path.startsWith('src/stores/materialFlow')) domains.add('material');
    if (path.startsWith('src/stores/qcLab')) domains.add('quality');
    if (path.startsWith('src/stores/breakdown')) domains.add('maintenance');
    if (path.startsWith('src/stores/operationsCampaign')) domains.add('campaign');
    if (path.startsWith('src/stores/truckSchedule')) domains.add('logistics');
    if (path.startsWith('src/stores/safety')) domains.add('safety');
    if (path.startsWith('src/scada/')) domains.add('scada');
    if (path.startsWith('src/agent/') || path.startsWith('scripts/') || path.startsWith('docs/'))
      domains.add('evidence');
  }
  return [...domains].sort();
}

function runGit(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function safeGit(git, args) {
  try {
    return git(args).trim();
  } catch {
    return '';
  }
}

function parseWorktrees(output, root) {
  return output
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const fields = Object.fromEntries(
        block
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const separator = line.indexOf(' ');
            return separator < 0
              ? [line, true]
              : [line.slice(0, separator), line.slice(separator + 1)];
          })
      );
      return {
        path: sanitizePath(relative(root, String(fields.worktree ?? '')) || '.'),
        head: String(fields.HEAD ?? ''),
        branch:
          typeof fields.branch === 'string' ? fields.branch.replace(/^refs\/heads\//, '') : null,
        detached: fields.detached === true,
        prunable: fields.prunable === true || typeof fields.prunable === 'string',
      };
    });
}

function sanitizePath(value) {
  // Control characters are exactly what this strips from untrusted paths.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, MAX_PATH_LENGTH);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}
