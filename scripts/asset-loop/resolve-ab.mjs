/**
 * Resolve blind A/B results against the side key written by stage-ab.mjs, and
 * summarise candidate-judge verdicts. Writes the per-asset decision table.
 *
 * Usage: node scripts/asset-loop/resolve-ab.mjs <workflow output> <ab-key.json> <out.json>
 */
import fs from 'node:fs';

const [resultPath, keyPath, outPath] = process.argv.slice(2);
const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const results = Array.isArray(parsed) ? parsed : parsed.result;
const key = new Map(JSON.parse(fs.readFileSync(keyPath, 'utf8')).map((pair) => [pair.dir, pair]));
const rows = [];
for (const entry of results.filter((item) => item.dir)) {
  const pair = key.get(entry.dir);
  const { winner, confidence, regressionsInWinner, blockingDefectsInWinner, decisive } =
    entry.result;
  const pick = winner === 'tie' ? 'tie' : winner === pair.newSide ? 'last-round' : 'original';
  rows.push({
    id: pair.id,
    kind: 'ab',
    pick,
    confidence,
    decision: pick === 'last-round' ? 'keep' : pick === 'original' ? 'restore' : 'nell',
    blockingInWinner: blockingDefectsInWinner,
    regressionsInWinner,
    decisive,
    lastCandidateDir: pair.lastCandidateDir,
  });
}
const judged = new Map();
for (const entry of results.filter((item) => item.verdict)) {
  const list = judged.get(entry.id) ?? [];
  list.push(entry.verdict);
  judged.set(entry.id, list);
}
for (const [id, verdicts] of judged) {
  rows.push({
    id,
    kind: 'candidate',
    verdicts: verdicts.map((v) => `${v.verdict} min${Math.min(...Object.values(v.viewScores))}`),
    decision:
      verdicts.length === 2 && verdicts.every((v) => v.verdict === 'PASS') ? 'accept' : 'reject',
    summaries: verdicts.map((v) => v.summary),
  });
}
fs.writeFileSync(outPath, JSON.stringify(rows, null, 1));
for (const row of rows)
  console.log(
    row.kind === 'ab'
      ? `AB   ${row.decision.padEnd(8)} ${row.id.padEnd(34)} ${row.pick} (${row.confidence})${row.blockingInWinner.length ? ` BLOCKING: ${row.blockingInWinner.join('; ').slice(0, 120)}` : ''}`
      : `CAND ${row.decision.padEnd(8)} ${row.id.padEnd(34)} ${row.verdicts.join(', ')}`
  );
