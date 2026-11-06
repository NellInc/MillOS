/**
 * Summarise a fix.js workflow result file: outcome per asset, verdict trail,
 * accepted sha256 and the delivered bytes on disk now, and why any asset blocked.
 *
 * Usage: node scripts/asset-loop/fix-outcomes.mjs <workflow-output.json> [out.json]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const [resultPath, outPath] = process.argv.slice(2);
const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
// A task output file wraps the workflow's return value in { summary, result, ... }.
const results = Array.isArray(parsed) ? parsed : parsed.result;
const manifest = JSON.parse(fs.readFileSync('public/models/asset-manifest.json', 'utf8'));
const files = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));
const rows = [];
for (const result of results) {
  const file = files.get(result.id);
  const bytes = file ? fs.readFileSync(`public/models/${file}`) : null;
  const delivered = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
  const trail = result.rounds
    .map((round) => {
      if (!round.verdict) return round.build?.status === 'blocked' ? 'B' : '?';
      const min = Math.min(...Object.values(round.verdict.viewScores ?? {}));
      return `${round.verdict.verdict[0]}${min}`;
    })
    .join(' ');
  const last = result.rounds.at(-1);
  rows.push({
    id: result.id,
    outcome: result.outcome,
    trail,
    acceptedSha256: result.sha256 ?? null,
    deliveredSha256: delivered,
    deliveredMatchesAccepted: result.sha256 ? result.sha256 === delivered : null,
    lastCandidateDir:
      [...result.rounds].reverse().find((round) => round.build?.candidateDir)?.build.candidateDir ??
      null,
    blockedReason: result.outcome === 'blocked' ? (last?.build?.blockedReason ?? null) : null,
    lastSummary:
      [...result.rounds].reverse().find((round) => round.verdict)?.verdict.summary ?? null,
  });
}
const counts = {};
for (const row of rows) counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;
console.log(counts);
for (const row of rows)
  console.log(
    `${row.outcome.padEnd(9)} ${row.id.padEnd(34)} ${row.trail.padEnd(22)} ${
      row.deliveredMatchesAccepted === false ? 'DELIVERED != ACCEPTED' : ''
    }${row.blockedReason ? `blocked: ${row.blockedReason.slice(0, 160)}` : ''}`
  );
if (outPath) fs.writeFileSync(outPath, JSON.stringify(rows, null, 1));
