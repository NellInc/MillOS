/**
 * Classify every failing ledger asset by how it can be fixed, before any builder
 * is dispatched. A builder round on an asset the turntable cannot show, or whose
 * geometry is pinned to runtime TypeScript, is wasted or unsafe, so those classes
 * go elsewhere with the reason recorded.
 *
 * Usage: node scripts/asset-loop/disposition.mjs <ledger.json> [--write]
 */
import fs from 'node:fs';

// Delivery stages (surface atlases, attribute transfer, packing, normalisation) and
// scripts a card names as belonging to another lineage do not author geometry.
const DELIVERY_ONLY =
  /refine-authored-surfaces\.mjs|restore-authored-asset-attributes\.mjs|normalize-model-assets\.mjs|reconcile-[a-z]+-models\.mjs|prepare_authored_atlas\.py|prepare-dock-canopy-surfaces\.mjs|fit_elevator_depth\.py/;
// A real lockstep contract: the runtime regenerates or triangle-matches this geometry.
const LOCKSTEP =
  /triangle-for-triangle|refused if|matched against|createMachineHousingGeometry|MILL_BODY|SIFTER_BODY|PACKER_BODY|createBrickArchGeometry|createPipe\w*Geometry|runtime three\.js (?:lathe|cylinder)/i;
const CANOPY = /-canopy-(zero-|one-|two-)?unit$/;

export function geometryScripts(owner) {
  return [...new Set(owner.match(/scripts\/[\w./-]+\.(?:py|mjs)/g) ?? [])].filter(
    (script) => !DELIVERY_ONLY.test(script)
  );
}

export function classify(asset) {
  const round = asset.rounds.at(-1);
  const card = asset.card ?? {};
  const owner = card.owner?.script ?? '';
  const scripts = geometryScripts(owner);
  if (round.pass) return { class: 'pass', reason: 'judge PASS, no probe fail' };
  if (
    /^none: provider original/i.test(owner) ||
    /^worker-/.test(asset.id) ||
    asset.id === 'forklift'
  )
    return {
      class: 'provider-retain',
      reason: 'provider original: surface-only or retain, never a geometry rebuild',
    };
  if (card.casterPinned)
    return {
      class: 'pinned-batch',
      reason:
        'civic lamp bake pins this GLB by hash: fix with the other pinned assets, then one rebake',
    };
  if (CANOPY.test(asset.id))
    return {
      class: 'in-game',
      reason: 'runtime leaf atlas replaces the GLB colour: the turntable cannot show the crown',
    };
  if (LOCKSTEP.test(owner))
    return {
      class: 'runtime-contract',
      reason:
        'the runtime regenerates or triangle-matches this geometry from TypeScript; changing it means changing that code in lockstep',
    };
  if (!round.blocking.length && round.probeFails.length && scripts.length)
    return {
      class: 'seat',
      reason: 'only a measured floating/contract flag blocks it',
      script: scripts[0],
    };
  if (scripts.length)
    return {
      class: 'owned-build',
      reason: 'geometry is authored by a script in the repo',
      script: scripts[0],
    };
  return {
    class: 'new-authoring',
    reason:
      'exported or authored-atlas geometry with no generator: a builder writes the authoring function, after confirming no runtime contract pins it',
  };
}

if (process.argv[1]?.endsWith('disposition.mjs')) {
  const [ledgerPath, flag] = process.argv.slice(2);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  // Measured overrides (render path, builder blocks) beat the text-based classes.
  const overridesPath = `${ledgerPath.replace(/[^/]+$/, '')}disposition-overrides.json`;
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
    : {};
  const byClass = {};
  for (const asset of Object.values(ledger.assets)) {
    const measured = overrides[asset.id];
    const disposition =
      measured && !asset.rounds.at(-1).pass ? { ...measured, measured: true } : classify(asset);
    asset.disposition = disposition;
    (byClass[disposition.class] ??= []).push(
      disposition.script ? `${asset.id} [${disposition.script.replace('scripts/', '')}]` : asset.id
    );
  }
  for (const [name, ids] of Object.entries(byClass))
    console.log(`${name} (${ids.length}): ${ids.join(', ')}\n`);
  if (flag === '--write') fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
}
