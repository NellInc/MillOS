/** CPU-only scratch delivery proof for six budget-constrained authored atlases.
 * Working if no public asset is written and each accepted source meets its
 * unchanged delivery budget and coupled-normal direction error bounds.
 */
import { NodeIO, Document } from '@gltf-transform/core';
import { textureCompress } from '@gltf-transform/functions';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { decodeRGB } from './refine-authored-png.mjs';
import { retargetNormalScale, normalDifference } from './refine-authored-normal-scale.mjs';
import {
  authoredSurfaceCustody,
  authoredSurfaceFamily,
  bakeAuthoredSurface,
} from './refine-authored-surfaces.mjs';
const limits = {
  'wooden-bollard': 19000,
  'lock-gate-structure': 33000,
  'dock-door-panel': 21000,
  'factory-concrete-unit': 19000,
  'city-masonry-unit': 20000,
  'station-wall-unit': 20000,
};
const root = 'output/asset-upgrade-20260926',
  folder = `${root}/normal-scale-delivery`;
await mkdir(folder, { recursive: true });
const reportPath = `${root}/authored-surfaces-result.json`,
  recipePath = 'scripts/refine-authored-inputs.json';
const report = JSON.parse(await readFile(reportPath, 'utf8')),
  recipe = JSON.parse(await readFile(recipePath, 'utf8')),
  io = new NodeIO(),
  results = [];
const hash = (b) => createHash('sha256').update(b).digest('hex'),
  canonical = (v) => hash(JSON.stringify(v));
async function decodeImage(texture) {
  const d = new Document(),
    t = d.createTexture().setImage(texture.getImage()).setMimeType(texture.getMimeType());
  d.createMaterial().setNormalTexture(t);
  await d.transform(textureCompress({ targetFormat: 'png' }));
  return decodeRGB(t.getImage()).raw;
}
async function scratch(slug, png, scale) {
  let d;
  try {
    d = await io.read(`${folder}/${slug}-before-delivery.glb`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    d = await io.read(`public/models/world/${slug}.glb`);
  }
  const m = d.getRoot().listMaterials()[0];
  m.getNormalTexture().setImage(png).setMimeType('image/png');
  m.setNormalScale(scale);
  await d.transform(
    textureCompress({ targetFormat: 'jpeg', resize: [512, 512], slots: /^normalTexture$/ })
  );
  const bytes = await io.writeBinary(d);
  return { document: d, bytes, raw: await decodeImage(m.getNormalTexture()) };
}
for (const [slug, budget] of Object.entries(limits)) {
  const row = report.results.find((r) => r.id === `world-${slug}`),
    input = recipe.find((r) => r.id === row.id);
  const backup = `${folder}/${slug}-pre-coupling.glb`,
    derivative = `assets/source/models/world/${slug}-crafted-surface.glb`;
  try {
    await readFile(backup);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const originalBytes = await readFile(row.source);
    if (hash(originalBytes) !== input.spec.sourceSha256)
      throw Error('Pinned source changed', { cause: error });
    const original = await io.read(row.source);
    await bakeAuthoredSurface(original, input.spec, authoredSurfaceFamily(slug));
    await io.write(backup, original);
  }
  const oldDocument = await io.read(backup),
    oldPNG = oldDocument.getRoot().listMaterials()[0].getNormalTexture().getImage().slice();
  const oldDelivery = await scratch(slug, oldPNG, 0.2),
    trials = [];
  await writeFile(`${folder}/${slug}-before-delivery.glb`, oldDelivery.bytes);
  let selected;
  for (const scale of [0.25, 0.3, 0.4]) {
    const document = await io.read(backup),
      proof = retargetNormalScale(document, 0.2, scale);
    const newPNG = document.getRoot().listMaterials()[0].getNormalTexture().getImage().slice(),
      newRaw = decodeRGB(newPNG).raw;
    const delivery = await scratch(slug, newPNG, scale),
      jpegCoupling = normalDifference(oldDelivery.raw, 0.2, delivery.raw, scale),
      jpegFidelity = normalDifference(newRaw, scale, delivery.raw, scale);
    const accepted =
      delivery.bytes.length + 64 <= budget &&
      jpegCoupling.maximumDegrees <= 1 &&
      jpegCoupling.rmsDegrees <= 0.25;
    const trial = {
      scale,
      bytes: delivery.bytes.length,
      accepted,
      pngCoupling: proof,
      jpegCoupling,
      jpegFidelity,
    };
    trials.push(trial);
    console.log(JSON.stringify({ id: row.id, ...trial }));
    selected = {
      document,
      scale,
      proof,
      newPNG,
      newRaw,
      delivery,
      jpegCoupling,
      jpegFidelity,
      accepted,
    };
    if (accepted) break;
  }
  const { document, scale, proof, newPNG, newRaw, delivery, jpegCoupling, jpegFidelity, accepted } =
    selected;
  const sourceState = authoredSurfaceCustody(await io.read(row.source)),
    after = authoredSurfaceCustody(document);
  const allowedSourceState = JSON.parse(JSON.stringify(sourceState));
  allowedSourceState.materials.forEach((m) => (m.normal = scale));
  if (canonical(allowedSourceState) !== canonical(after))
    throw Error('Change outside declared normal-scale coupling');
  const item = {
    id: row.id,
    accepted,
    budget,
    minimumDeliveryHeadroomBytes: 64,
    beforeDeliveryBytes: oldDelivery.bytes.length,
    afterDeliveryBytes: delivery.bytes.length,
    pngCoupling: proof,
    jpegCoupling,
    jpegFidelity,
    jpegErrorBounds: { maximumDegrees: 1, rmsDegrees: 0.25 },
    sourceMaterialFactors: sourceState.materials.map((m) => m.normal),
    proposedSurface: { normalScale: scale },
    trials,
    proofPath: folder,
  };
  results.push(item);
  await writeFile(`${folder}/${slug}-after-delivery.glb`, delivery.bytes);
  if (accepted) {
    await io.write(derivative, document);
    const roundtrip = authoredSurfaceCustody(await io.read(derivative));
    if (canonical(roundtrip) !== canonical(after))
      throw Error('Coupled derivative roundtrip changed');
    row.derivative = derivative;
    row.sha256 = hash(await readFile(derivative));
    row.disposition = 'refined';
    row.reason =
      'Family-specific material relief retained using a budget-compatible coupled normal-scale encoding.';
    delete row.candidateDerivative;
    delete row.candidateSha256;
    delete row.verification.candidateRejected;
    row.proposedSurface = { normalScale: scale };
    Object.assign(row.verification, {
      normalScale: scale,
      normalScaleEncoding: proof,
      sourceCustodySha256: canonical(sourceState),
      derivativeCustodySha256: canonical(after),
      declaredCoupledCustodySha256: canonical(allowedSourceState),
      custodyComparison:
        'Exact except declared material.normalScale coupling; all geometry and other material factors remain exact.',
      rawPixelSha256: hash(newRaw),
      derivativeImageSha256: hash(newPNG),
      deliveryProof: item,
    });
    input.spec.encodingNormalScale = scale;
    delete input.retainReason;
  } else {
    row.disposition = 'retained';
    row.candidateDerivative = derivative;
    row.candidateSha256 = hash(await readFile(backup));
    row.candidateDerivative = backup;
    delete row.derivative;
    delete row.sha256;
    delete row.proposedSurface;
    row.reason = `Retained: tested scales .25/.3/.4 and1 cannot meet BOTH unchanged ${budget}-byte budget and1-degree max/.25-degree RMS JPEG direction bounds. See deliveryProof trials.`;
    row.verification.candidateRejected = true;
    row.verification.deliveryProof = item;
    input.retainReason = row.reason;
    delete input.spec.encodingNormalScale;
  }
}
report.refined = report.results.filter((r) => r.disposition === 'refined').length;
report.retained = report.total - report.refined;
await writeFile(`${folder}/report.json`, JSON.stringify(results, null, 2) + '\n');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n');
