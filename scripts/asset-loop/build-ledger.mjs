// Build or extend the asset-loop ledger from a workflow journal.
// argv: <journal.jsonl> <run label> <ledger.json> <asset-loop dir> <round name> <judge model>
import fs from 'node:fs';
import path from 'node:path';

const [journalPath, runLabel, ledgerPath, loopDir, round, judgeModel] = process.argv.slice(2);
const lines = fs
  .readFileSync(journalPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const results = lines.filter((l) => l.type === 'result' && l.result);
const cards = {};
const verdicts = {};
for (const { result } of results) {
  if (Array.isArray(result.cards)) for (const card of result.cards) cards[card.id] = card;
  else if (result.verdict && result.id) verdicts[result.id] = result;
}
const ledger = fs.existsSync(ledgerPath)
  ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  : { version: 1, judgeContract: 'docs/ASSET_JUDGE.md', assets: {} };

const minOf = (o) => Math.min(...Object.values(o ?? {}).map(Number));
for (const [id, verdict] of Object.entries(verdicts)) {
  const dir = path.join(loopDir, runLabel, id);
  let review = null;
  try {
    review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'));
  } catch {
    review = null;
  }
  if (cards[id])
    fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(cards[id], null, 2));
  const entry = (ledger.assets[id] ??= { id, rounds: [], strikes: {}, status: 'triaged' });
  if (cards[id]) entry.card = cards[id];
  const probeFails = (review?.flags ?? []).filter((f) => f.severity === 'fail');
  const pass = verdict.verdict === 'PASS' && probeFails.length === 0;
  const defectIds = verdict.defects.map((d) => d.id);
  for (const key of Object.keys(entry.strikes))
    if (!defectIds.includes(key)) entry.strikes[key] = 0;
  for (const key of defectIds) entry.strikes[key] = (entry.strikes[key] ?? 0) + 1;
  entry.rounds.push({
    round,
    run: runLabel,
    sha256: review?.sha256 ?? null,
    judgeModel,
    verdict: verdict.verdict,
    pass,
    minView: minOf(verdict.viewScores),
    minAxis: minOf(verdict.axisScores),
    axisScores: verdict.axisScores,
    viewScores: verdict.viewScores,
    blocking: verdict.defects.filter((d) => d.severity === 'blocking').map((d) => d.id),
    defects: verdict.defects,
    probeFails: probeFails.map((f) => f.detail),
    summary: verdict.summary,
    rubricObjection: verdict.rubricObjection ?? null,
  });
  entry.status = pass ? 'pass-1' : 'fail';
  const prior = entry.rounds.at(-2);
  if (pass && prior?.pass && prior.sha256 === review?.sha256) entry.status = 'accepted';
}
fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));

const all = Object.values(ledger.assets);
const latest = all.map((a) => ({
  id: a.id,
  ...a.rounds.at(-1),
  owner: a.card?.owner?.script ?? null,
  pinned: a.card?.casterPinned ?? false,
}));
const failing = latest.filter((r) => !r.pass);
console.log(
  `ledger: ${all.length} assets; verdicts this pass ${Object.keys(verdicts).length}; cards ${Object.keys(cards).length}`
);
console.log(`pass ${latest.length - failing.length}, fail ${failing.length}`);
const owners = {};
for (const r of failing) (owners[r.owner ?? '(none)'] ??= []).push(r.id);
for (const [owner, ids] of Object.entries(owners).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${ids.length.toString().padStart(3)}  ${owner}`);
const hist = {};
for (const r of latest) hist[r.minView] = (hist[r.minView] ?? 0) + 1;
console.log('min view score histogram', hist);
