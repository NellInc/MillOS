// Write context cards into judge-facing asset directories as context.json.
// argv: <cards.json> <asset-loop dir> <run label>[,<run label>...]
import fs from 'node:fs';
import path from 'node:path';
const [cardsFile, base, labels] = process.argv.slice(2);
const cards = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
let written = 0;
for (const label of labels.split(',')) {
  for (const card of cards) {
    const dir = path.join(base, label, card.id);
    if (!fs.existsSync(dir)) continue;
    fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(card, null, 2));
    written += 1;
  }
}
console.log('context cards written:', written);
