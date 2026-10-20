// @vitest-environment node
/**
 * No delivered GLB may carry visible, differently shaded faces lying on each
 * other inside the asset itself. The scene sweeps compare separate meshes and
 * cannot see these: two faces of one mesh, flush or under 1 mm apart, that sample
 * a different colour, atlas tile or roughness fight for depth inside one draw
 * call. `coplanar-shading.mjs` finds them; this guard gates the ones with enough
 * contrast to read as flicker (base colour >= 24/255 or roughness >= 48/255, the
 * depth-flip probe's own pixel floor) over 1 cm2 of ray-visible area.
 * Normal-only differences (smooth-shading seams between parts, an upper-bound
 * angle) are reported by the sweep but not gated here.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetSelfCoplanar } from './lib/coplanar-shading.mjs';

const MODELS = 'public/models';
const MIN_VISIBLE_M2 = 1e-4;

/**
 * Known, measured and NOT fixed at source, each for a stated reason. The cap is
 * the visible contrast area today (cm2); a new or grown defect still fails.
 */
const PROVIDER_POSITIONS =
  'positions are the preserved provider mesh (restore-authored-asset-attributes keeps POSITION byte-exact); no authoring step can move a face';
const PROVIDER_FOLD =
  'fold inside the provider (Tripo) mesh, not an authored part; it stays double-sided because some of its faces are seen from behind, and separating the fold needs a new geometry stage';
const KNOWN_SELF_COPLANAR = Object.freeze({
  'farm/coop.glb': {
    maxVisibleCm2: 520,
    reason:
      "roof() in refine_architecture_assets.py lays the dark eave fascia on the roof slab's edge face; the coop chain pins that script, its prepared and normalized inputs, its output and face indices as a reviewed candidate, so the one-line offset needs that review",
  },
  'world/caravan.glb': { maxVisibleCm2: 7, reason: PROVIDER_FOLD },
  'world/cute-car-hatchback.glb': { maxVisibleCm2: 6, reason: PROVIDER_FOLD },
  'world/cute-car-pickup.glb': { maxVisibleCm2: 8, reason: PROVIDER_FOLD },
  'world/cute-car-sedan.glb': { maxVisibleCm2: 11, reason: PROVIDER_FOLD },
  'world/food-truck.glb': { maxVisibleCm2: 22, reason: PROVIDER_FOLD },
  'world/kiosk-cafe.glb': { maxVisibleCm2: 14, reason: PROVIDER_FOLD },
  'world/nissen-hut.glb': { maxVisibleCm2: 120, reason: PROVIDER_FOLD },
  'world/office-apartment.glb': { maxVisibleCm2: 62, reason: PROVIDER_FOLD },
  'world/office-apartment-three.glb': { maxVisibleCm2: 62, reason: PROVIDER_FOLD },
  'world/grain-elevator-authored-body.glb': { maxVisibleCm2: 9000, reason: PROVIDER_POSITIONS },
  'world/yard-compactor-body.glb': { maxVisibleCm2: 130, reason: PROVIDER_POSITIONS },
  'world/yard-intercom-body.glb': { maxVisibleCm2: 32, reason: PROVIDER_POSITIONS },
  'world/yard-pallet-charger-body.glb': { maxVisibleCm2: 1210, reason: PROVIDER_POSITIONS },
});
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(dir, entry.name))
      : entry.name.endsWith('.glb')
        ? [path.join(dir, entry.name)]
        : []
  );
const files = walk(MODELS).sort();

let io = null;
async function reader() {
  if (io) return io;
  await MeshoptDecoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
  return io;
}

describe('delivered GLBs have no visible differently shaded self-coplanar faces', () => {
  test.each(files.map((file) => [path.relative(MODELS, file), file]))(
    '%s',
    async (name, file) => {
      const { groups } = await assetSelfCoplanar(await (await reader()).read(file));
      const fighting = groups
        .filter((group) => group.kind === 'contrast' && group.visibleArea > MIN_VISIBLE_M2)
        .map((group) => ({
          at: group.centre,
          normal: group.normal,
          visibleCm2: Number((group.visibleArea * 1e4).toFixed(1)),
          severity: group.severity,
        }));
      const known = KNOWN_SELF_COPLANAR[name];
      if (!known) {
        expect(fighting).toEqual([]);
        return;
      }
      const total = fighting.reduce((sum, group) => sum + group.visibleCm2, 0);
      expect(total, `${name}: ${known.reason}`).toBeLessThanOrEqual(known.maxVisibleCm2);
    },
    600000
  );
});
