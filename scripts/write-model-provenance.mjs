/**
 * Write `assets/source/models/{farm,village}/PROVENANCE.json` from the
 * normalization report, so provenance is generated rather than typed.
 *
 * Provenance that is hand-maintained drifts: the cow's file was accurate on the
 * day it was written and described one of thirty assets a day later. Everything
 * here is read from artefacts that the pipeline itself produced -
 * `test-results/assets/normalization.json` for hashes, scale factors and
 * measured bounds - or parsed out of `normalize-model-assets.mjs`'s own
 * `GENERATED_ASSETS` table for the size decisions.
 *
 * The table is IMPORTED rather than duplicated, on the same principle as
 * `validSceneNames()` in `capture-art-review.mjs`: a hand-copied list is a copy
 * that silently goes stale, and stale provenance is worse than none because it
 * reads as verified. The normalizer only runs its pass when invoked as a
 * command, so importing it here is side-effect free.
 *
 * Run after `npm run normalize-models`:
 *
 *   npm run provenance:models
 *
 * It reads only, apart from the two JSON files it writes, so it never touches a
 * GLB and cannot introduce the 4-byte forklift drift that re-running
 * normalization does.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { GENERATED_ASSETS } from './normalize-model-assets.mjs';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'assets', 'source', 'models');
const NORMALIZATION = path.join(ROOT, 'test-results', 'assets', 'normalization.json');

const AXIS_NOTE = {
  max: 'longest axis',
  x: 'width',
  y: 'height',
  z: 'length',
};

function packFor(spec, result) {
  const rigged = result.joints > 0;
  return {
    name: spec.slug,
    id: spec.id,
    sourcePage: spec.sourcePage ?? 'https://platform.tripo3d.ai',
    license: spec.license,
    attribution: spec.attribution,
    taskId: spec.taskId,
    pipeline: spec.pipeline ?? [
      'text_to_model v2.5-20250123, texture:true, pbr:true',
      ...(rigged ? ['animate_prerigcheck (0 credits)', 'animate_rig'] : []),
    ],
    preservedAs: `${spec.slug}-tripo-original.glb`,
    sha256: result.sourceSha256,
    blenderPreparation: result.blenderPreparation,
    runtimeDerivative: {
      file: `public/models/${result.file}`,
      sha256: result.outputSha256,
      bytes: result.outputBytes,
    },
    normalization: {
      // Which dimension the size decision was made against, and the value it
      // was set to. `max` is the default; the exceptions are recorded because
      // they were each paid for by a wrong render.
      sizedBy: AXIS_NOTE[spec.axis] ?? spec.axis,
      targetMetres: spec.target,
      fittedEnvelopeMetres: spec.fitDimensions,
      simplification: spec.simplifyRatio
        ? {
            requestedRatio: spec.simplifyRatio,
            maximumRelativeError: 0.005,
            method: 'meshoptimizer attribute-aware, UV seams retained',
          }
        : undefined,
      scaleFactor: result.scaleFactor,
      // Snapped to the nearest quarter turn from the whole heading vector, for
      // rigged bodies; a fixed yaw for the props whose generated long axis ran
      // across the axis their component lays them along.
      facingYawRadians: result.facingYaw,
      authoredYawRadians: spec.yaw ?? 0,
      bounds: result.bounds,
      bodyNode: result.bodyNode,
      joints: result.joints,
      clips: [],
      materials: result.materials,
      textures: result.textures,
      textureBytes: result.textureBytes,
      renderVertices: result.renderVertices,
    },
  };
}

const REJECTED = [
  {
    file: 'test-results/tripo-probe-20260815/models/tripo_cow_idle_REJECTED.glb',
    step: 'animate_retarget preset:idle',
    reason:
      'The preset library is humanoid and the quadruped rig names the front legs Clavicle/Upperarm/Hand, so a biped idle maps onto it and rears the animal onto its hind legs for the whole clip. Applies to every quadruped and avian rig in this set, not only the cow: all of them carry the identical 41-joint skeleton with identical bone names. Kept outside the repo as reproducible evidence; never promoted.',
  },
];

const LICENCE = {
  publisher: 'Tripo3D',
  license: 'Tripo3D API-plan output',
  licenceNote:
    "Generated through the Tripo3D API under the account owner's confirmed API-plan rights. Account-owner rights confirmation is separate from the technical validation reported here.",
};

const main = async () => {
  const report = JSON.parse(await readFile(NORMALIZATION, 'utf8'));
  const specs = GENERATED_ASSETS;
  const byId = new Map(report.generated.map((entry) => [entry.id, entry]));
  const missing = specs.filter((spec) => !byId.has(spec.id));
  if (missing.length > 0) {
    throw new Error(
      `${NORMALIZATION} has no entry for ${missing.map((s) => s.id).join(', ')}. ` +
        'Run `npm run normalize-models` first.'
    );
  }

  const areaFlag = process.argv.find((arg) => arg.startsWith('--area='))?.slice(7);
  const areas = [...new Set(specs.map((spec) => spec.area))];
  if (areaFlag && !areas.includes(areaFlag)) throw new Error('Unknown provenance area');
  for (const area of areaFlag ? [areaFlag] : areas) {
    const packs = specs
      .filter((spec) => spec.area === area)
      .map((spec) => packFor(spec, byId.get(spec.id)));
    const file = path.join(SOURCE_ROOT, area, 'PROVENANCE.json');
    await writeFile(
      file,
      `${JSON.stringify(
        {
          schemaVersion: 3,
          retrievedAt:
            specs.find((spec) => spec.area === area && spec.retrievedAt)?.retrievedAt ??
            '2026-08-15',
          area,
          ...LICENCE,
          transformation: {
            script: 'scripts/normalize-model-assets.mjs',
            table: 'GENERATED_ASSETS',
            description:
              'Per asset: derive facing from the whole Head-to-Hip heading vector and snap to the nearest quarter turn (rigged only), apply any authored yaw, scale uniformly to the stated target along the stated axis, optionally fit the recorded architectural envelope within a 20 percent axis limit, re-origin to bottom centre through a Pivot node so a skin binding survives, resample source maps to each asset table entry texture size (512 by default) in JPEG, force the metallic factor to zero, and rename material, mesh and textures semantically.',
            generatedBy: 'scripts/write-model-provenance.mjs',
          },
          sourcePacks: packs,
          rejected: area === 'farm' ? REJECTED : [],
        },
        null,
        2
      )}\n`
    );
    console.log(`${path.relative(ROOT, file)}  ${packs.length} assets`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
