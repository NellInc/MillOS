/**
 * Record a deliberately changed delivery in its area's PROVENANCE.json: the
 * runtime derivative's and prepared source's sha256 and bytes are read from the
 * files on disk, so provenance tracks what actually ships. Nothing else in the
 * entry changes; the provider original's hash is never touched.
 *
 * Usage: node scripts/asset-loop/record-provenance.mjs <asset-id> [<asset-id>...]
 * Working if normalize-model-assets.test.mjs's provenance check passes for the
 * named assets and `git diff` shows only their hash and byte fields changing.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const ids = process.argv.slice(2);
if (!ids.length) throw new Error('Name at least one asset id.');
const fileFacts = (file) => {
  const bytes = fs.readFileSync(file);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
};
const pending = new Set(ids);
for (const area of ['world', 'village', 'farm']) {
  const path = `assets/source/models/${area}/PROVENANCE.json`;
  if (!fs.existsSync(path)) continue;
  const text = fs.readFileSync(path, 'utf8');
  const provenance = JSON.parse(text);
  let changed = false;
  for (const pack of provenance.sourcePacks ?? []) {
    if (!pending.has(pack.id)) continue;
    for (const key of ['runtimeDerivative', 'blenderPreparation', 'preparedSource']) {
      const record = pack[key];
      if (!record?.file || !fs.existsSync(record.file)) continue;
      const facts = fileFacts(record.file);
      // Update only the fields this entry already records; never add new ones.
      if (!('bytes' in record)) delete facts.bytes;
      if (record.sha256 !== facts.sha256 || ('bytes' in facts && record.bytes !== facts.bytes)) {
        console.log(
          `${pack.id} ${key}: ${record.sha256?.slice(0, 12)} -> ${facts.sha256.slice(0, 12)} (${facts.bytes ?? 'same'} bytes)`
        );
        Object.assign(record, facts);
        changed = true;
      }
    }
    pending.delete(pack.id);
  }
  if (changed) {
    const indent = /\n( +)"/.exec(text)?.[1].length ?? 2;
    fs.writeFileSync(
      path,
      `${JSON.stringify(provenance, null, indent)}${text.endsWith('\n') ? '\n' : ''}`
    );
  }
}
if (pending.size) console.log(`no provenance pack for: ${[...pending].join(', ')}`);
