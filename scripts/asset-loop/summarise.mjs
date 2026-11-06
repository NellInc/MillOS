import fs from 'node:fs';
const L = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).assets;
const rows = Object.values(L).map((a) => ({ id: a.id, r: a.rounds.at(-1), card: a.card }));
const f = rows.filter((x) => !x.r.pass);
const cat = {};
for (const x of f)
  for (const d of x.r.defects)
    if (d.severity === 'blocking') cat[d.id.split(':')[0]] = (cat[d.id.split(':')[0]] ?? 0) + 1;
console.log('blocking by axis', cat);
console.log(
  'fails with blocking',
  f.filter((x) => x.r.blocking.length).length,
  '| with probe fail',
  f.filter((x) => x.r.probeFails.length).length,
  '| no blocking & no probe fail (sub-8 scores only)',
  f.filter((x) => !x.r.blocking.length && !x.r.probeFails.length).length
);
const fam = {};
for (const x of f) fam[x.card?.styleFamily] = (fam[x.card?.styleFamily] ?? 0) + 1;
console.log('fails by family', fam, '| kit units failing', f.filter((x) => x.card?.kitUnit).length);
console.log(
  'casterPinned failing:',
  f
    .filter((x) => x.card?.casterPinned)
    .map((x) => x.id)
    .join(', ') || 'none'
);
console.log(
  'casterPinned passing:',
  rows
    .filter((x) => x.r.pass && x.card?.casterPinned)
    .map((x) => x.id)
    .join(', ') || 'none'
);
console.log('--- failing, worst first ---');
for (const x of f.sort((a, b) => a.r.minView - b.r.minView || a.r.minAxis - b.r.minAxis)) {
  console.log(
    `${x.r.minView} ${x.id.padEnd(38)} ${(x.r.blocking.join(',') || '-').slice(0, 70).padEnd(70)} | ${x.r.summary.slice(0, 120)}`
  );
}
