/**
 * SMAA edge detection on display-encoded values.
 *
 * `postprocessing`'s SMAA runs its colour edge detection on the composer's
 * HalfFloat buffer, which holds LINEAR values: the sRGB encode happens only on
 * the pass that draws to the screen. SMAA's threshold (0.1 at the MEDIUM and
 * HIGH presets) was designed for gamma-encoded input, and in linear space it is
 * blind to every edge darker than mid-grey. Measured on the integrated build:
 *
 *   truss against the ceiling (med-12 interior)  linear 0.087, encoded 0.33
 *   pallet against the floor  (med-19 logistics) linear 0.014, encoded 0.13
 *
 * Both sit under 0.1 in linear, so the shipped SMAA never found them and the
 * judges saw raw stair-steps. Encoding each colour read before the comparison
 * restores the reference behaviour. The neighbourhood BLEND still happens in
 * linear light inside the effect pass, which is the correct space for it.
 */
import type { EdgeDetectionMaterial } from 'postprocessing';

/** `EDGE_THRESHOLD` at the presets this repo uses (MEDIUM and HIGH). */
export const SMAA_EDGE_THRESHOLD = 0.1;

const RAW_READ = /texture2D\(inputBuffer,/g;
const UNIFORM = 'uniform sampler2D inputBuffer;';
const ENCODER = 'vec4 smaaEncodedTexel(';

// The exact sRGB transfer function, not a 2.2 power: the toe below 0.0031308 is
// where the night edges live.
const ENCODER_SOURCE = `
${ENCODER}vec2 uv){
  vec4 texel = texture2D(inputBuffer, uv);
  vec3 c = max(texel.rgb, vec3(0.0));
  vec3 encoded = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  return vec4(encoded, texel.a);
}
`;

/**
 * Route every colour read of the edge-detection shader through the sRGB
 * encoder. Idempotent. Returns false, and leaves the material untouched, if the
 * installed library no longer has the shape this patches; the unit test pins
 * that shape so an upgrade fails there first.
 */
export function encodeSmaaEdgeInput(material: EdgeDetectionMaterial): boolean {
  const source = material.fragmentShader;
  if (source.includes(ENCODER)) return true;
  if (!source.includes(UNIFORM) || !source.includes('texture2D(inputBuffer,')) return false;
  material.fragmentShader = source
    .replace(RAW_READ, 'smaaEncodedTexel(')
    .replace(UNIFORM, `${UNIFORM}${ENCODER_SOURCE}`);
  material.needsUpdate = true;
  return true;
}

const srgbDecode = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

type Rgb = readonly [number, number, number];

/**
 * The colour-mode edge test SMAA applies to one neighbour pair (largest
 * per-channel difference against the threshold), evaluated on display bytes
 * either as the library sees them (decoded to linear) or encoded.
 */
export function smaaEdgeDetected(a: Rgb, b: Rgb, space: 'linear' | 'encoded'): boolean {
  const value = space === 'linear' ? srgbDecode : (byte: number) => byte / 255;
  const delta = Math.max(...a.map((channel, index) => Math.abs(value(channel) - value(b[index]))));
  return delta >= SMAA_EDGE_THRESHOLD;
}
