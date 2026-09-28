/** Inhabited-world delivery gate. Historical filename keeps existing CI callers working. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const APPROVED_PERSONNEL = Object.freeze([
  {
    id: 'worker-masculine',
    file: 'worker/worker-masculine.glb',
    sha256: '69a13ca722de26dea1e6cc6cf2241ec95dd46d27989a1f103f823616a17196db',
  },
  {
    id: 'worker-feminine',
    file: 'worker/worker-feminine.glb',
    sha256: '9b4d0b4475919fbd05b72dd9a22eab6c840b8f5094dff0c757e6c42267cd2448',
  },
]);
const approvedPaths = new Set([
  ...APPROVED_PERSONNEL.map(({ file }) => `models/${file}`),
  'models/worker/LICENSE-QUATERNIUS.txt',
]);
const personnelToken =
  /(^|[/_. -])(worker|personnel|human|avatar|character|portrait|scarecrow|operator|driver)([/_. -]|$)/i;

export function forbiddenPersonnelPath(relative) {
  if (approvedPaths.has(relative)) return false;
  return (
    /(^|\/)portraits(\/|$)|(^|\/)assets\/workers(\/|$)|(^|\/)models\/worker(\/|$)/i.test(
      relative
    ) || personnelToken.test(relative)
  );
}

export function validatePersonnelManifest(manifest) {
  const failures = [];
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  for (const approved of APPROVED_PERSONNEL) {
    const matches = assets.filter(({ id }) => id === approved.id);
    if (
      matches.length !== 1 ||
      matches[0].file !== approved.file ||
      matches[0].license !== 'CC0-1.0' ||
      matches[0].role !== 'animated-personnel-character'
    ) {
      failures.push(`missing or invalid approved CC0 personnel: ${approved.id}`);
    }
  }
  for (const asset of assets) {
    // Animation aliases on animals may contain worker-idle; only asset identity denotes a person.
    if (
      personnelToken.test(`${asset.id} ${asset.file} ${asset.role}`) &&
      !APPROVED_PERSONNEL.some(({ id, file }) => asset.id === id && asset.file === file)
    ) {
      failures.push(`unapproved personnel asset: ${asset.id}`);
    }
  }
  return failures;
}

const forbiddenRuntimePatterns = [
  ['host speech synthesis', /speechSynthesis|SpeechSynthesisUtterance/],
  [
    'retired workforce or remote avatar',
    /WorkerSystemNew|WorkerDetailPanel|WorkforcePanel|WorkerPersonalityLayer|RemotePlayerAvatar|OperationalRemotePlayers/,
  ],
  ['vehicle operator', /SeatedVehicleOperator|DockSpotter|WarehouseWorkerWithPalletJack/],
  [
    'retired human chatter',
    /startWorkerVoices|startRadioChatter|playRadioDispatch|speakAnnouncement|ttsEnabled/,
  ],
  ['portrait asset', /portraitPath|[/\\]portraits[/\\]/i],
  [
    'retired portrait roster',
    /marcus_chen|sarah_mitchell|james_rodriguez|emily_ronson|jennifer_lee/i,
  ],
];
export function forbiddenPersonnelRuntime(content) {
  return forbiddenRuntimePatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([label]) => label);
}

export function validateCommunitySource({ policy, scene, community }) {
  const failures = [];
  if (!/personnelModels\s*:\s*true/.test(policy)) failures.push('personnelModels must be enabled');
  for (const flag of ['vehicleOperators', 'remoteAvatars', 'humanVoiceAudio', 'workforceUI']) {
    if (!new RegExp(`${flag}\\s*:\\s*false`).test(policy))
      failures.push(`${flag} must remain disabled`);
  }
  if (
    !/import\s+(?:[^;]*?from\s*)?['"][^'"]*CommunityLife['"]|import\(['"][^'"]*CommunityLife['"]\)/.test(
      scene
    ) ||
    !/<CommunityLife\b/.test(scene)
  )
    failures.push('MillScene must import and mount CommunityLife');
  if (!/<WorkerModel\b/.test(community) || !/COMMUNITY_ROSTER/.test(community))
    failures.push('CommunityLife must render the authored roster');
  for (const marker of ['world-personnel', 'world-community-details']) {
    if (!community.includes(marker) && !scene.includes(marker))
      failures.push(`missing live group: ${marker}`);
  }
  return failures;
}

const isArchivedPath = (relative) =>
  relative.startsWith('0.10 Archive/') || /^v\d+\.\d+\//.test(relative);
const isTestSource = (relative) =>
  relative.includes('/__tests__/') || /(?:^|\.)(?:test|spec)\.[cm]?[jt]sx?$/.test(relative);
async function collectFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(base, absolute).split(path.sep).join('/');
      if (entry.name === 'node_modules' || isArchivedPath(`${relative}/`)) return [];
      return entry.isDirectory() ? collectFiles(absolute, base) : [{ absolute, relative }];
    })
  );
  return nested.flat();
}

export async function validateCommunityBuild(root = process.cwd()) {
  const failures = [];
  const source = (relative) => readFile(path.join(root, relative), 'utf8');
  const dist = path.join(root, 'dist');
  if (!(await stat(dist).catch(() => null))?.isDirectory())
    throw new Error('dist is missing. Run npm run build before validate:community.');
  const [files, publicFiles, sourceFiles, policy, scene, community] = await Promise.all([
    collectFiles(dist),
    collectFiles(path.join(root, 'public')),
    collectFiles(path.join(root, 'src')),
    source('src/config/featureFlags.ts'),
    source('src/components/MillScene.tsx'),
    source('src/components/CommunityLife.tsx'),
  ]);
  failures.push(...validateCommunitySource({ policy, scene, community }));
  let deliveredJavaScript = '';
  for (const [label, entries] of [
    ['delivery', files],
    ['public', publicFiles],
  ]) {
    for (const file of entries) {
      if (forbiddenPersonnelPath(file.relative))
        failures.push(`${label} unapproved personnel path: ${file.relative}`);
      if (label !== 'delivery' || !/\.(?:js|html|json|webmanifest)$/.test(file.relative)) continue;
      const content = await readFile(file.absolute, 'utf8');
      failures.push(
        ...forbiddenPersonnelRuntime(content).map(
          (reason) => `${label} ${reason}: ${file.relative}`
        )
      );
      if (file.relative.endsWith('.js')) deliveredJavaScript += content;
    }
  }
  for (const file of sourceFiles) {
    if (isTestSource(file.relative) || !/\.[cm]?[jt]sx?$/.test(file.relative)) continue;
    failures.push(
      ...forbiddenPersonnelRuntime(await readFile(file.absolute, 'utf8')).map(
        (reason) => `active source ${reason}: ${file.relative}`
      )
    );
  }
  for (const marker of [
    'world-personnel',
    'world-community-details',
    'worker-masculine.glb',
    'worker-feminine.glb',
  ]) {
    if (!deliveredJavaScript.includes(marker))
      failures.push(`compiled community missing: ${marker}`);
  }
  for (const directory of ['public', 'dist']) {
    try {
      const manifest = JSON.parse(await source(`${directory}/models/asset-manifest.json`));
      failures.push(
        ...validatePersonnelManifest(manifest).map((reason) => `${directory} ${reason}`)
      );
      const licence = await source(`${directory}/models/worker/LICENSE-QUATERNIUS.txt`);
      if (!/CC0|public domain/i.test(licence))
        failures.push(`${directory} missing CC0 licence statement`);
      for (const asset of APPROVED_PERSONNEL) {
        const bytes = await readFile(path.join(root, directory, 'models', asset.file));
        if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
          failures.push(`${directory} unapproved personnel bytes: ${asset.id}`);
      }
    } catch (error) {
      failures.push(`${directory} personnel delivery incomplete: ${error.message}`);
    }
  }
  if (failures.length)
    throw new Error(
      `Inhabited-world delivery contract failed:\n${[...new Set(failures)].join('\n')}`
    );
  return `Inhabited-world contract passed: approved CC0 personnel and community groups ship; autonomous vehicles, no portraits, remote avatars or human voices. Checked ${files.length} delivery and ${sourceFiles.length} source files.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  validateCommunityBuild()
    .then(console.log)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
