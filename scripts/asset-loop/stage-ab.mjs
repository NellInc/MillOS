/**
 * Stage blind A/B pairs for at-cap assets: the triage original against the last
 * round's candidate, alternating which side is A. Judges get neutral directories
 * (ab-<n>/{A,B}/sheet-*.jpg + context.json); the side key is written outside
 * test-results so no judge can open it.
 *
 * Usage: node scripts/asset-loop/stage-ab.mjs <ledger.json> <triage run> <key-out.json> [ids,csv] [baseline-overrides.json]
 * Overrides map an asset id to the directory of the version to compare against (default: triage).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [ledgerPath, triageRun, keyPath, idCsv, overridePath] = process.argv.slice(2);
const onlyIds = idCsv ? new Set(idCsv.split(',')) : null;
const baselineOverride = overridePath ? JSON.parse(fs.readFileSync(overridePath, 'utf8')) : {};
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const base = 'test-results/asset-loop';
const pairs = [];
const atCap = Object.values(ledger.assets)
  .filter((asset) => asset.status === 'at-cap' && (!onlyIds || onlyIds.has(asset.id)))
  .sort((a, b) => a.id.localeCompare(b.id));
atCap.forEach((asset, index) => {
  const last = asset.fixes?.at(-1)?.lastCandidateDir;
  const original = baselineOverride[asset.id] ?? path.join(base, triageRun, asset.id);
  if (!last || !fs.existsSync(path.join(last, 'sheet-colour.jpg'))) {
    pairs.push({ id: asset.id, error: `no last-round sheets (${last})` });
    return;
  }
  const label = `ab-${createHash('sha256').update(`${asset.id}:${index}:abq:${keyPath}`).digest('hex').slice(0, 8)}`;
  const dir = path.join(base, label);
  const newIsA = index % 2 === 0;
  for (const [side, from] of [
    ['A', newIsA ? last : original],
    ['B', newIsA ? original : last],
  ]) {
    fs.mkdirSync(path.join(dir, side), { recursive: true });
    for (const sheet of ['sheet-colour.jpg', 'sheet-clay.jpg'])
      fs.copyFileSync(path.join(from, sheet), path.join(dir, side, sheet));
  }
  fs.copyFileSync(
    path.join(base, triageRun, asset.id, 'context.json'),
    path.join(dir, 'context.json')
  );
  pairs.push({
    id: asset.id,
    dir,
    newSide: newIsA ? 'A' : 'B',
    lastCandidateDir: last,
    baselineDir: original,
  });
});
fs.writeFileSync(keyPath, JSON.stringify(pairs, null, 1));
console.log(
  `${pairs.filter((p) => p.dir).length} pairs staged, ${pairs.filter((p) => p.error).length} errors`
);
for (const pair of pairs.filter((p) => p.error)) console.log(pair.id, pair.error);
