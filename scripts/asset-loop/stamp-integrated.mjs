/**
 * Record each kept asset's integrated delivery hash in the ledger, read from the
 * GLB on disk, so later rounds compare against what actually ships.
 *
 * Usage: node scripts/asset-loop/stamp-integrated.mjs <ledger.json> <id,id,...> <note>
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const [ledgerPath, idList, note] = process.argv.slice(2);
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync('public/models/asset-manifest.json', 'utf8'));
const files = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));
for (const id of idList.split(',')) {
  const asset = ledger.assets[id];
  if (!asset) throw new Error(`No ledger entry for ${id}`);
  const bytes = fs.readFileSync(`public/models/${files.get(id)}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (asset.integrated?.sha256 && asset.integrated.sha256 !== sha256)
    (asset.integratedHistory ??= []).push(asset.integrated);
  asset.integrated = { sha256, bytes: bytes.length, note };
  console.log(`${id.padEnd(34)} ${sha256.slice(0, 12)}`);
}
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
