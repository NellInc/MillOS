/**
 * Emit Workflow args for output/asset-loop-<date>/workflows/fix2.js (2026-11-06 run):
 * candidate-mode builders for new authoring (one file per asset), Cupid and the
 * three pin-blocked candidates; in-place builders for the register and the five
 * civic-lamp-pinned village assets, each with the integrated hashes of the kept
 * assets that share its script as a per-round regression check.
 *
 * Usage: node scripts/asset-loop/fix2-args.mjs <ledger.json> <triage run> > args.json
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const [ledgerPath, triageRun] = process.argv.slice(2);
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync('public/models/asset-manifest.json', 'utf8'));
const fileOf = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));
const sha = (id) =>
  createHash('sha256')
    .update(fs.readFileSync(`public/models/${fileOf.get(id)}`))
    .digest('hex');
const kept = (ids) => Object.fromEntries(ids.map((id) => [id, sha(id)]));

const base = (id, extra) => {
  const asset = ledger.assets[id];
  if (!asset) throw new Error(`No ledger entry for ${id}`);
  const triage = asset.rounds.find((round) => round.run === triageRun) ?? asset.rounds[0];
  return {
    id,
    file: fileOf.get(id),
    owner: asset.card?.owner?.script ?? 'unknown',
    priorIds: triage.defects.map((defect) => defect.id),
    ...extra,
  };
};

const villageKept = kept([
  'village-church',
  'world-canal-boat',
  'village-forge',
  'village-cottage',
]);
const civicKept = kept(['world-park-bench', 'farm-haybale', 'farm-watertrough']);
const PINNED =
  'This GLB is pinned by hash in public/textures/civic-square-lamp-depth.json (casterPins): the lead re-bakes the civic lamp shadows after this batch. Never touch the bake files. Keep the footprint, doors, entrances and every runtime anchor (signs, lamps, glazing) where they are.';

const groups = [
  ['village-shop', 'village-townhall', 'village-pub'].map((id) =>
    base(id, { mode: 'in-place', keptRegression: villageKept, notes: PINNED })
  ),
  ['village-fountain', 'village-wishingwell'].map((id) =>
    base(id, {
      mode: 'in-place',
      keptRegression: civicKept,
      notes: `${PINNED} refine_civic_props.py is known to produce non-deterministic bytes for farm-gardenbed and village-duckpond (also at HEAD); do not try to fix that here.`,
    })
  ),
  [
    base('world-station-register', {
      mode: 'in-place',
      keptRegression: kept(['world-station-coffee-machine']),
      notes:
        'maxRenderVertices is now 72 (D-032, was 36): use the extra 36 indices for a real chamfer on the customer-facing ridge and the front vertical corners. src/components/GasStationInstanced.test.ts (lines ~556-595) must still hold: the sloped deck under the runtime keys keeps its plane (placed y = 1.2825 + 0.27x at x = -0.14, -0.09, -0.04), and a ray at y 1.235 from +x still hits the body until the screen rotates into place.',
    }),
  ],
];

const BLOCKED_PRIOR = {
  'farm-coop':
    'Your owning script is scripts/craft-precise-coop.mjs; its CLI refuses public/ and assets/ paths, so build with it straight to the candidate path. The rejected 2026-11-05 attempt is in output/asset-loop-20261104/rejected/craft-precise-coop.diff (judges: FAIL 7, PASS 8); you may start from it.',
  'farm-windmill':
    'Your owning script is scripts/craft-precise-windmill.mjs (build to the candidate path, never into public/). The rejected attempt is output/asset-loop-20261104/rejected/craft-precise-windmill.diff (judges: FAIL 6, FAIL 7).',
  'world-yard-truck-wash-body':
    'Your owning script is scripts/refine-truck-wash-body.mjs (build to the candidate path). The rejected attempt is output/asset-loop-20261104/rejected/refine-truck-wash-body.diff (judges: FAIL 6, FAIL 6).',
};
for (const [id, notes] of Object.entries(BLOCKED_PRIOR)) {
  const owner = notes.match(/scripts\/[\w./-]+\.mjs/)[0];
  groups.push([base(id, { mode: 'candidate', authorFile: owner, extraNotes: notes })]);
}
const newAuthoring = Object.values(ledger.assets)
  .filter((asset) => asset.disposition?.class === 'new-authoring')
  .map((asset) => asset.id);
for (const id of [...newAuthoring, 'world-cupid-authored-body']) {
  const slug = fileOf
    .get(id)
    .split('/')
    .pop()
    .replace(/\.glb$/, '');
  groups.push([
    base(id, {
      mode: 'candidate',
      authorFile: `scripts/blender/authored/${slug}.py`,
      extraNotes:
        id === 'world-cupid-authored-body'
          ? 'Rebuild the cherub figure as real authored geometry (D-034): profiled torso, head and limbs with joints, shaped wings; keep the pedestal, the figure seated on it at its current seat height, the envelope and every budget.'
          : '',
    }),
  ]);
}
process.stdout.write(JSON.stringify({ root: process.cwd(), triageRun, maxRounds: 6, groups }));
