/** Metre-aware authored finish baking. Geometry, palettes and rig data are immutable.
 * Working if each derivative has identical structural/accessor hashes, a changed
 * normal atlas, finite unit normals and no additions to the texture/material budget.
 * Sampling uses retained glTF UV0 charts, never a new unwrap or geometry export.
 */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { NodeIO } from '@gltf-transform/core';
import { retargetNormalScale } from './refine-authored-normal-scale.mjs';
import { encodeRGB, decodeRGB } from './refine-authored-png.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'output/asset-upgrade-20260926');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const canonical = (x) => hash(JSON.stringify(x));
const arrayHash = (a) => hash(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / (l || 1));
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const profiles = {
  coated: {
    period: 0.09,
    slope: 0.022,
    reason:
      'Satin coating with restrained broad manufacturing undulation; remove false triangular bulges.',
  },
  brushed: {
    period: 0.035,
    slope: 0.045,
    reason: 'Directional fine industrial machining with subdued crossing polish.',
  },
  timber: {
    period: 0.045,
    slope: 0.09,
    reason:
      'Lengthwise wood fibre with irregular growth bands, without changing authored timber palette.',
  },
  bark: {
    period: 0.11,
    slope: 0.14,
    reason:
      'Vertical bark fissures with broken cross-grain relief; existing colour/bark maps retained.',
  },
  concrete: {
    period: 0.08,
    slope: 0.055,
    reason: 'Non-directional mineral aggregate instead of broad planar bulges.',
  },
  masonry: {
    period: 0.09,
    slope: 0.07,
    reason:
      'Irregular mineral face relief; existing mortar and architectural detail remain authored.',
  },
  rubber: {
    period: 0.04,
    slope: 0.055,
    reason:
      'Moulded elastomer grain; preserve the existing tyre tread geometry and rubber identity.',
  },
};
function family(slug) {
  if (
    /canopy-(zero|one|two)-unit|(?:oak|birch|pine)-canopy|hedge-unit|frog-authored|cupid-authored|flour-sack-unit|dock-shelter-(side|top)/.test(
      slug
    )
  )
    return 'retain';
  if (/trunk/.test(slug)) return 'bark';
  if (/wooden|lock-gate|fence-(post|rail)|pallet-staging/.test(slug)) return 'timber';
  if (/bumper|wheel-chock|truck-tyre/.test(slug)) return 'rubber';
  if (/concrete|bridge-support/.test(slug)) return 'concrete';
  if (/masonry|station-wall|victorian-portal/.test(slug)) return 'masonry';
  if (/flange|dock-(leveler|plate)|grill|coffee-machine|grain-silo|machine-silo/.test(slug))
    return 'brushed';
  return 'coated';
}
export function authoredSurfaceCustody(document) {
  const root = document.getRoot();
  return {
    accessors: root.listAccessors().map((a) => ({
      name: a.getName(),
      type: a.getType(),
      normalized: a.getNormalized(),
      hash: arrayHash(a.getArray()),
    })),
    nodes: root.listNodes().map((n) => ({
      name: n.getName(),
      matrix: n.getMatrix(),
      extras: n.getExtras(),
      children: n.listChildren().map((c) => root.listNodes().indexOf(c)),
      mesh: root.listMeshes().indexOf(n.getMesh()),
    })),
    meshes: root.listMeshes().map((m) => ({
      name: m.getName(),
      extras: m.getExtras(),
      primitives: m.listPrimitives().map((p) => ({
        mode: p.getMode(),
        extras: p.getExtras(),
        indices: p.getIndices() && arrayHash(p.getIndices().getArray()),
        attributes: Object.fromEntries(
          p.listSemantics().map((s) => [s, arrayHash(p.getAttribute(s).getArray())])
        ),
      })),
    })),
    animations: root.listAnimations().map((a) => a.getName()),
    skins: root.listSkins().length,
    materials: root.listMaterials().map((m) => ({
      name: m.getName(),
      base: m.getBaseColorFactor(),
      emissive: m.getEmissiveFactor(),
      metal: m.getMetallicFactor(),
      rough: m.getRoughnessFactor(),
      normal: m.getNormalScale(),
      alpha: m.getAlphaMode(),
      cutoff: m.getAlphaCutoff(),
      double: m.getDoubleSided(),
    })),
    nonNormalImages: root
      .listTextures()
      .filter((t) => !root.listMaterials().some((m) => m.getNormalTexture() === t))
      .map((t) => hash(t.getImage())),
  };
}
// Smooth deterministic fields. Frequencies are limited to five texels per period.
// No pixel-space sharpening, random grain or palette retinting is performed.
function mineralNoise(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const smooth = (v) => v * v * v * (v * (v * 6 - 15) + 10);
  const fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  let sum = 0;
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        let h =
          Math.imul(ix + i, 374761393) ^
          Math.imul(iy + j, 668265263) ^
          Math.imul(iz + k, 1274126177);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        const v = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        sum += v * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz);
      }
  return sum - 0.5;
}
function height(p, period, family, grainAxis) {
  const q = p.map((x) => (x * Math.PI * 2) / period);
  const grain = q[grainAxis],
    across = q[(grainAxis + 1) % 3] + q[(grainAxis + 2) % 3] * 0.37;
  if (family === 'timber' || family === 'bark')
    return (
      ((Math.sin(across + 0.23 * Math.sin(grain * 0.17)) +
        0.28 * Math.sin(across * 0.53 + grain * 0.07)) *
        period) /
      (Math.PI * 2)
    );
  if (family === 'brushed')
    return ((Math.sin(across) + 0.12 * Math.sin(grain * 0.43)) * period) / (Math.PI * 2);
  const r = p.map((x) => x / period);
  return (
    (mineralNoise(r[0], r[1], r[2]) +
      0.35 * mineralNoise(r[0] * 0.47 + 19.3, r[1] * 0.47 - 7.8, r[2] * 0.47 + 3.9)) *
    period *
    0.5
  );
}
async function bake(document, spec, kind) {
  const root = document.getRoot(),
    materials = root.listMaterials(),
    primitives = root.listMeshes().flatMap((m) => m.listPrimitives());
  const material = materials[0],
    texture = material.getNormalTexture();
  if (!texture || materials.some((m) => m.getNormalTexture() !== texture))
    throw Error('Expected shared normal atlas');
  if (primitives.some((p) => !p.getAttribute('TEXCOORD_0') || !p.getAttribute('NORMAL')))
    throw Error('Missing retained corner attributes');
  const before = Buffer.from(texture.getImage());
  const W = spec.texture ?? 512,
    H = W;
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (const p of primitives) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) {
      const v = a.getElement(i, []);
      v.forEach((x, j) => {
        lo[j] = Math.min(lo[j], x);
        hi[j] = Math.max(hi[j], x);
      });
    }
  }
  const ext = hi.map((x, i) => x - lo[i]),
    axis = spec.axis === 'max' ? Math.max(ext[0], ext[2]) : ext['xyz'.indexOf(spec.axis)];
  const scale = spec.target / axis;
  const triangles = [];
  let area = 0,
    uvArea = 0;
  for (const prim of primitives) {
    const p = prim.getAttribute('POSITION'),
      n = prim.getAttribute('NORMAL'),
      uv = prim.getAttribute('TEXCOORD_0'),
      ind = prim.getIndices();
    for (let i = 0; i < (ind?.getCount() ?? p.getCount()); i += 3) {
      const ids = [0, 1, 2].map((k) => (ind ? ind.getScalar(i + k) : i + k));
      const ps = ids.map((j) => p.getElement(j, []).map((x) => x * scale));
      const us = ids.map((j) => uv.getElement(j, []));
      const ns = ids.map((j) => n.getElement(j, []));
      const e1 = subtract(ps[1], ps[0]),
        e2 = subtract(ps[2], ps[0]);
      const d1 = subtract(us[1], us[0]),
        d2 = subtract(us[2], us[0]);
      const det = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(det) < 1e-12) continue;
      area += Math.hypot(...cross(e1, e2)) / 2;
      uvArea += Math.abs(det) / 2;
      triangles.push({
        ps,
        us,
        ns,
        du: e1.map((x, j) => (x * d2[1] - e2[j] * d1[1]) / det),
        dv: e1.map((x, j) => (e2[j] * d1[0] - x * d2[0]) / det),
      });
    }
  }
  const profile = profiles[kind],
    period = Math.max(profile.period, Math.sqrt(area / (W * H * Math.min(1, uvArea))) * 5);
  const raw = Buffer.alloc(W * H * 3);
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = 128;
    raw[i + 1] = 128;
    raw[i + 2] = 255;
  }
  const occupied = new Uint8Array(W * H),
    normalScale = spec.surface?.normalScale ?? material.getNormalScale() ?? 1;
  let covered = 0,
    maxSlope = 0,
    overlaps = 0;
  for (const { ps, us, ns, du, dv } of triangles) {
    const u = us.map(([x, y]) => [x * W, y * H]);
    const [a, b, c] = u;
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const grainAxis = kind === 'bark' ? 1 : ext.indexOf(Math.max(...ext));
    for (
      let y = Math.max(0, Math.floor(Math.min(...u.map((v) => v[1]))));
      y <= Math.min(H - 1, Math.ceil(Math.max(...u.map((v) => v[1]))));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(Math.min(...u.map((v) => v[0]))));
        x <= Math.min(W - 1, Math.ceil(Math.max(...u.map((v) => v[0]))));
        x++
      ) {
        const px = x + 0.5,
          py = y + 0.5;
        const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den,
          w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den,
          w2 = 1 - w0 - w1;
        if (Math.min(w0, w1, w2) < -1e-8) continue;
        const weights = [w0, w1, w2],
          position = [0, 1, 2].map((j) => weights.reduce((s, w, k) => s + w * ps[k][j], 0)),
          N = norm([0, 1, 2].map((j) => weights.reduce((s, w, k) => s + w * ns[k][j], 0)));
        const T = norm(du.map((v, j) => v - dot(du, N) * N[j])),
          hand = dot(cross(N, T), dv) < 0 ? -1 : 1,
          B = cross(N, T).map((v) => v * hand);
        const eps = period * 0.01;
        const slope = (direction) => {
          const plus = position.map((v, j) => v + direction[j] * eps),
            minus = position.map((v, j) => v - direction[j] * eps);
          return (
            ((height(plus, period, kind, grainAxis) - height(minus, period, kind, grainAxis)) /
              (2 * eps)) *
            profile.slope *
            Math.min(1, profile.period / period)
          );
        };
        const sx = slope(T),
          sy = slope(B);
        maxSlope = Math.max(maxSlope, Math.hypot(sx, sy));
        const mapped = norm([-sx / normalScale, -sy / normalScale, 1]);
        const pixel = y * W + x;
        if (occupied[pixel]) overlaps++;
        else covered++;
        occupied[pixel] = 1;
        mapped.forEach(
          (v, j) => (raw[pixel * 3 + j] = Math.round(clamp(v * 0.5 + 0.5, 0, 1) * 255))
        );
      }
    }
  }
  // Eight-pass chart dilation fills gutters from covered neighbours without
  // changing covered pixels or copying colour from unrelated texture slots.
  let frontier = occupied;
  for (let pass = 0; pass < 8; pass++) {
    const next = frontier.slice(),
      pixels = Buffer.from(raw);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (frontier[k]) continue;
        const neighbour = [
          x > 0 ? k - 1 : -1,
          x < W - 1 ? k + 1 : -1,
          y > 0 ? k - W : -1,
          y < H - 1 ? k + W : -1,
        ].find((j) => j >= 0 && frontier[j]);
        if (neighbour !== undefined) {
          pixels.set(raw.subarray(neighbour * 3, neighbour * 3 + 3), k * 3);
          next[k] = 1;
        }
      }
    raw.set(pixels);
    frontier = next;
  }
  const bytes = encodeRGB(raw, W, H);
  texture.setImage(bytes).setMimeType('image/png');
  if (covered === 0 || maxSlope > 0.25 || !Number.isFinite(maxSlope))
    throw Error('Inert or excessive relief');
  return {
    family: kind,
    fieldRevision: ['timber', 'bark', 'fabric', 'brushed'].includes(kind)
      ? 'directional-v1'
      : 'aperiodic-mineral-v2',
    periodMetres: period,
    desiredPeriodMetres: profile.period,
    normalScale,
    coveredPixels: covered,
    overlappingRasterPixels: overlaps,
    maximumPhysicalSlope: maxSlope,
    gutterPixels: 8,
    originalImageSha256: hash(before),
    derivativeImageSha256: hash(bytes),
    width: W,
    height: H,
  };
}
export async function main() {
  const inventory = JSON.parse(
    await readFile(new URL('./refine-authored-inputs.json', import.meta.url), 'utf8')
  );
  if (inventory.length !== 96 || new Set(inventory.map((row) => row.id)).size !== 96)
    throw Error('Authored recipe scope changed');
  const familiesFlag = process.argv.find((a) => a.startsWith('--families='));
  const selected = familiesFlag ? new Set(familiesFlag.slice(11).split(',')) : null;
  if (selected && [...selected].some((name) => !profiles[name]))
    throw Error('Unknown finish family');
  const reencode = process.argv.includes('--reencode');
  const prior =
    selected || reencode
      ? JSON.parse(await readFile(path.join(REPORT, 'authored-surfaces-result.json'), 'utf8'))
          .results
      : [];
  const io = new NodeIO(),
    results = [];
  await mkdir(path.join(REPORT, 'authored-atlases'), { recursive: true });
  for (const row of inventory) {
    if (selected && !selected.has(row.spec ? family(row.spec.slug) : 'retain')) {
      const existing = prior.find((r) => r.id === row.id);
      if (!existing) throw Error('Scoped rebake needs complete prior custody');
      results.push(existing);
      continue;
    }
    if (row.id === 'forklift') {
      results.push({
        id: row.id,
        disposition: 'retained',
        reason:
          'Six differentiated authored PBR materials and zero texture budget; exact licensed rig and five named clips retained. Chassis atlas refined separately.',
      });
      continue;
    }
    const spec = row.spec,
      kind = family(spec.slug);
    const source = path.join('assets/source/models', spec.area, spec.preparedSource);
    const sourceBytes = await readFile(path.join(ROOT, source));
    if (hash(sourceBytes) !== spec.sourceSha256)
      throw Error(`${row.id}: immutable prepared source changed`);
    if (row.retainReason) {
      results.push({
        id: row.id,
        source,
        sourceSha256: hash(sourceBytes),
        disposition: 'retained',
        reason: row.retainReason,
      });
      continue;
    }
    if (kind === 'retain') {
      results.push({
        id: row.id,
        source,
        sourceSha256: hash(sourceBytes),
        disposition: 'retained',
        reason: spec.slug === 'hedge-unit'
          ? 'Opaque green rough box retains its authored hedge silhouette and material. No resolved visual defect justifies new surface grain; leaf-card, alpha-test and species-map reasoning does not apply to this asset.'
          : /dock-shelter-(side|top)/.test(spec.slug)
            ? 'Retained after paired material review: atlas-resolved weave reads as coarse ribbing. Existing opaque rough coated-shelter materials and compression animation are preserved without adding false corrugation.'
            : /flour-sack/.test(spec.slug)
              ? 'Retained after paired material review: atlas-resolved weave reads as coarse ribbing. Existing live cloth treatment preserves the intended fabric identity without adding false corrugation.'
              : /canopy/.test(spec.slug)
                ? 'Alpha-tested foliage retains existing species-specific leaf maps, reverse-face restoration and wind. Adding surface grain to thin cards risks false thickness.'
                : 'Authored figurative surface retained; generalized industrial grain would alter the creature or statue identity.',
      });
      continue;
    }
    const original = await io.read(path.join(ROOT, source)),
      before = authoredSurfaceCustody(original);
    const priorRow = reencode ? prior.find((r) => r.id === row.id) : null;
    if (reencode && priorRow.disposition === 'retained') {
      results.push(priorRow);
      continue;
    }
    const document = reencode ? await io.read(path.join(ROOT, priorRow.derivative)) : original;
    const materialCheck = reencode
      ? { ...priorRow.verification }
      : await bake(document, spec, kind);
    delete materialCheck.changedCoveredPixels;
    delete materialCheck.changedFraction;
    if (spec.encodingNormalScale && !reencode) {
      materialCheck.normalScaleEncoding = retargetNormalScale(
        document,
        materialCheck.normalScale,
        spec.encodingNormalScale
      );
      materialCheck.normalScale = spec.encodingNormalScale;
    }
    const atlas = document.getRoot().listMaterials()[0].getNormalTexture();
    const decoded = decodeRGB(atlas.getImage());
    if (reencode) atlas.setImage(encodeRGB(decoded.raw, decoded.width, decoded.height));
    let nonNeutralPixels = 0,
      maxUnitLengthError = 0;
    for (let i = 0; i < decoded.raw.length; i += 3) {
      const n = [0, 1, 2].map((j) => (decoded.raw[i + j] / 255) * 2 - 1);
      if (Math.abs(decoded.raw[i] - 128) > 1 || Math.abs(decoded.raw[i + 1] - 128) > 1)
        nonNeutralPixels++;
      maxUnitLengthError = Math.max(maxUnitLengthError, Math.abs(Math.hypot(...n) - 1));
    }
    if (maxUnitLengthError > 0.01) throw Error('Invalid encoded normal field');
    Object.assign(materialCheck, {
      nonNeutralPixels,
      nonNeutralFraction: nonNeutralPixels / (decoded.width * decoded.height),
      maxUnitLengthError,
      rawPixelSha256: hash(decoded.raw),
      derivativeImageSha256: hash(atlas.getImage()),
    });
    if (!nonNeutralPixels) {
      results.push({
        id: row.id,
        source,
        sourceSha256: hash(sourceBytes),
        disposition: 'retained',
        reason:
          'Atlas texel density cannot resolve this family relief above RGB8 quantization while preserving its physical height; retain the established finish rather than exaggerating relief.',
        verification: { ...materialCheck, candidateRejected: true },
      });
      continue;
    }
    const derivative = path.join(
      'assets/source/models',
      spec.area,
      `${spec.slug}-crafted-surface.glb`
    );
    await io.write(path.join(ROOT, derivative), document);
    const roundtrip = await io.read(path.join(ROOT, derivative));
    const after = authoredSurfaceCustody(roundtrip);
    if (materialCheck.normalScaleEncoding) {
      const expected = materialCheck.normalScaleEncoding.to;
      if (!after.materials.every((m) => m.normal === expected))
        throw Error('Declared normal scale was not retained');
      before.materials.forEach((m) => {
        m.normal = expected;
      });
    }
    if (canonical(before) !== canonical(after))
      throw Error(`${row.id}: structural or palette custody changed`);
    results.push({
      id: row.id,
      source,
      sourceSha256: hash(sourceBytes),
      derivative,
      sha256: hash(await readFile(path.join(ROOT, derivative))),
      disposition: 'refined',
      proposedSurface: spec.encodingNormalScale
        ? { normalScale: spec.encodingNormalScale }
        : undefined,
      reason: profiles[kind].reason,
      verification: {
        exactAttributes: true,
        exactStructure: true,
        exactPaletteAndOtherTextures: true,
        sourceCustodySha256: canonical(before),
        derivativeCustodySha256: canonical(after),
        ...materialCheck,
      },
      visualAcceptance:
        'Pending rendered material review; pixel differences alone do not establish visual improvement.',
    });
    console.log(
      `${row.id}: ${kind}, ${materialCheck.nonNeutralFraction.toFixed(3)} non-neutral normal pixels`
    );
  }
  await writeFile(
    path.join(REPORT, 'authored-surfaces-result.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        amplitudePolicy:
          'Physical relief height is fixed when atlas density requires a broader period.',
        total: results.length,
        refined: results.filter((a) => a.disposition === 'refined').length,
        retained: results.filter((a) => a.disposition === 'retained').length,
        sourceMapping:
          'Pinned recipe scripts/refine-authored-inputs.json, including original prepared sources and SHA256, shallow silo, pillow sack and canopy retained-light fixes.',
        results,
      },
      null,
      2
    ) + '\n'
  );
}
export { family as authoredSurfaceFamily, bake as bakeAuthoredSurface };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
