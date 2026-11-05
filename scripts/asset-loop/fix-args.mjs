/**
 * Emit Workflow args for output/asset-loop-<date>/workflows/fix.js from the ledger:
 * failing assets of the named disposition classes, grouped by owning script so
 * one builder at a time works each file.
 *
 * Usage: node scripts/asset-loop/fix-args.mjs <ledger.json> <triage run> <class[,class]> [id,id...]
 */
import fs from 'node:fs';

const [ledgerPath, triageRun, classList, idList] = process.argv.slice(2);
const classes = new Set(classList.split(','));
const only = idList ? new Set(idList.split(',')) : null;
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const groups = new Map();
for (const asset of Object.values(ledger.assets)) {
  if (!classes.has(asset.disposition?.class)) continue;
  if (only && !only.has(asset.id)) continue;
  const triage = asset.rounds.find((round) => round.run === triageRun) ?? asset.rounds[0];
  const key = asset.disposition.script ?? `new:${asset.id}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    id: asset.id,
    owner: asset.card?.owner?.script ?? 'unknown',
    cls: asset.disposition.class,
    // The builder reads the triage verdict from disk; the judge needs only the IDs.
    priorIds: triage.defects.map((defect) => defect.id),
  });
}
const manifest = JSON.parse(fs.readFileSync('public/models/asset-manifest.json', 'utf8'));
const files = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));
for (const group of groups.values()) for (const asset of group) asset.file = files.get(asset.id);
process.stdout.write(
  JSON.stringify({ root: process.cwd(), triageRun, maxRounds: 6, groups: [...groups.values()] })
);
