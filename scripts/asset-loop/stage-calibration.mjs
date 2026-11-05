// Stage blind calibration copies of the planted candidate: one with probe flags, one without.
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv[2];
for (const [dir, strip] of [
  ['calib-k4', false],
  ['calib-m7', true],
]) {
  const target = path.join(base, dir, 'world-bus-shelter');
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(base, 'smoke-planted', 'world-bus-shelter'), target, { recursive: true });
  const file = path.join(target, 'review.json');
  const review = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete review.input;
  delete review.candidate;
  delete review.provenance;
  if (strip) {
    review.flags = [];
    review.probeFails = 0;
    if (review.probe) {
      review.probe.floating = [];
      review.probe.floatingComponents = 0;
    }
  }
  fs.writeFileSync(file, JSON.stringify(review, null, 2));
  console.log(
    dir,
    review.flags.map((f) => `${f.severity}:${f.code} ${f.detail.slice(0, 80)}`)
  );
  const leaks = fs
    .readdirSync(target)
    .filter((name) => /planted|smoke/i.test(fs.readFileSync(path.join(target, name), 'latin1')));
  console.log('  leak-check:', leaks.length ? leaks : 'clean');
}
