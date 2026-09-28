/** A coupled normal-map/normalScale encoding change, not a relief-strength change.
 * Working if effective decoded tangent normals stay within the measured RGB8 bound.
 */
import { Buffer } from 'node:buffer';
import { decodeRGB, encodeRGB } from './refine-authored-png.mjs';
const unit = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
export function normalDifference(a, scaleA, b, scaleB) {
  if (a.length !== b.length || a.length % 3) throw Error('Normal atlas dimensions differ');
  let max = 0,
    sum = 0;
  for (let i = 0; i < a.length; i += 3) {
    const av = unit([
      ((a[i] / 255) * 2 - 1) * scaleA,
      ((a[i + 1] / 255) * 2 - 1) * scaleA,
      (a[i + 2] / 255) * 2 - 1,
    ]);
    const bv = unit([
      ((b[i] / 255) * 2 - 1) * scaleB,
      ((b[i + 1] / 255) * 2 - 1) * scaleB,
      (b[i + 2] / 255) * 2 - 1,
    ]);
    const delta =
      (Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            av.reduce((s, v, j) => s + v * bv[j], 0)
          )
        )
      ) *
        180) /
      Math.PI;
    max = Math.max(max, delta);
    sum += delta * delta;
  }
  return { maximumDegrees: max, rmsDegrees: Math.sqrt(sum / (a.length / 3)), pixels: a.length / 3 };
}
export function retargetNormalScale(document, oldScale, newScale) {
  if (!(oldScale > 0 && newScale > 0)) throw Error('Normal scales must be positive');
  const materials = document.getRoot().listMaterials(),
    texture = materials[0].getNormalTexture();
  if (materials.some((m) => m.getNormalTexture() !== texture))
    throw Error('Expected one shared normal atlas');
  const { raw, width, height } = decodeRGB(texture.getImage()),
    out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    const v = unit([
      (((raw[i] / 255) * 2 - 1) * oldScale) / newScale,
      (((raw[i + 1] / 255) * 2 - 1) * oldScale) / newScale,
      (raw[i + 2] / 255) * 2 - 1,
    ]);
    v.forEach((x, j) => (out[i + j] = Math.round((x * 0.5 + 0.5) * 255)));
  }
  const proof = normalDifference(raw, oldScale, out, newScale);
  if (proof.maximumDegrees > 0.65) throw Error('Normal-scale encoding exceeds RGB8 error bound');
  texture.setImage(encodeRGB(out, width, height)).setMimeType('image/png');
  for (const material of materials) material.setNormalScale(newScale);
  return { from: oldScale, to: newScale, errorBoundDegrees: 0.65, ...proof };
}
