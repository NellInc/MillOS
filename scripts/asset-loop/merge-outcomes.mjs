/**
 * Merge fix-run outcomes (from fix-outcomes.mjs) into the ledger, so the ledger
 * carries each asset's fix trail, accepted hash and status, not only its triage.
 *
 * Usage: node scripts/asset-loop/merge-outcomes.mjs <ledger.json> <outcomes.json> <run-id>
 */
import fs from 'node:fs';

const [ledgerPath, outcomesPath, runId] = process.argv.slice(2);
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const outcomes = JSON.parse(fs.readFileSync(outcomesPath, 'utf8'));
const STATUS = { accepted: 'turntable-accepted', 'round-cap': 'at-cap', blocked: 'blocked' };
for (const row of outcomes) {
  const asset = ledger.assets[row.id];
  if (!asset) throw new Error(`No ledger entry for ${row.id}`);
  asset.fixes ??= [];
  asset.fixes = asset.fixes.filter((fix) => fix.run !== runId);
  asset.fixes.push({ run: runId, ...row });
  asset.status = STATUS[row.outcome] ?? row.outcome;
}
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
const counts = {};
for (const asset of Object.values(ledger.assets))
  counts[asset.status] = (counts[asset.status] ?? 0) + 1;
console.log(counts);
