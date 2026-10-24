/**
 * Baked contact darkening round the five silo drums' feet, over the silo pad.
 *
 * WHY. At 12:00 on medium each drum's foot carried a ragged, notched
 * blue-black fringe (final7-med-12 verdict item 6, `yard` full-res x 380-900,
 * y 1100-1340). It is absent on low-12 and at med-06, so it is not SSAO noise:
 * the roof eave (radius 6.27 m) and the stiffener rings (6.08 m) cast a thin
 * annulus straight down at a zenith sun, and the shadow map draws its 27 cm in
 * texel notches against the pale pad. More samples or a blur pass cost frame
 * time nobody can measure at this machine's load; a baked decal costs nothing
 * per frame. It darkens the annulus and a smooth falloff past it, so the
 * notched edge sits inside a gradient instead of on bright concrete.
 *
 * One quad over the whole pad, not a blob per drum: the drums stand 1 m
 * apart, and overlapping transparent blobs double-darken (alpha over alpha).
 * Here each texel takes the NEAREST drum, so a valley is no darker than a
 * foot. The opaque drums reject the quad inside their footprint.
 */
import * as THREE from 'three';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { createLinearDataTexture, getTexture } from '../utils/textureGenerator';

/**
 * Drum radius (m), the darkening at the foot, how far it holds full (past
 * the eave's 0.27 m), how far it reaches from the wall, and the fade inside
 * the pad's edge.
 */
export const SILO_CONTACT = {
  radius: 6,
  alpha: 0.45,
  hold: 0.35,
  reach: 1.8,
  edgeFade: 0.4,
} as const;

/** The pad's top is at its height (it stands on the datum); the decal 1 cm above. */
export const SILO_CONTACT_DECAL_Y = SITE_LAYOUT.bulkStorage.siloPad.size[1] + 0.01;

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The decal's alpha at world (x, z). */
export function siloContactAlpha(x: number, z: number): number {
  const pad = SITE_LAYOUT.bulkStorage.siloPad;
  const halfX = pad.size[0] / 2;
  const halfZ = pad.size[2] / 2;
  const toEdge = Math.min(
    halfX - Math.abs(x - pad.position[0]),
    halfZ - Math.abs(z - SITE_LAYOUT.factory.zones.silos)
  );
  if (toEdge <= 0) return 0;
  let nearest = Infinity;
  for (const silo of SITE_LAYOUT.machines.silos)
    nearest = Math.min(nearest, Math.hypot(x - silo.position[0], z - silo.position[2]));
  const fromWall = nearest - SILO_CONTACT.radius;
  if (fromWall >= SILO_CONTACT.reach) return 0;
  return (
    SILO_CONTACT.alpha *
    (1 - smoothstep(SILO_CONTACT.hold, SILO_CONTACT.reach, fromWall)) *
    smoothstep(0, SILO_CONTACT.edgeFade, toEdge)
  );
}

/** Texels per metre: 10 cm, so the 1.45 m falloff is 14 texels. */
const TEXELS_PER_METRE = 10;

/**
 * The pad-sized mask: black, alpha = `siloContactAlpha`. Row 0 (v 0) is the
 * pad's +z end, as a plane laid flat with rotation -pi/2 about x maps it.
 */
export function generateSiloContactDecal(): THREE.DataTexture {
  const pad = SITE_LAYOUT.bulkStorage.siloPad;
  const width = Math.ceil(pad.size[0] * TEXELS_PER_METRE);
  const height = Math.ceil(pad.size[2] * TEXELS_PER_METRE);
  return getTexture(`silo-contact-decal-v1-${width}x${height}`, () => {
    const data = new Uint8Array(width * height * 4);
    const x0 = pad.position[0] - pad.size[0] / 2;
    const z0 = SITE_LAYOUT.factory.zones.silos - pad.size[2] / 2;
    for (let row = 0; row < height; row += 1) {
      const z = z0 + (1 - (row + 0.5) / height) * pad.size[2];
      for (let col = 0; col < width; col += 1) {
        const x = x0 + ((col + 0.5) / width) * pad.size[0];
        data[(row * width + col) * 4 + 3] = Math.round(255 * siloContactAlpha(x, z));
      }
    }
    // Alpha is not colour-managed: a mask, read verbatim.
    return createLinearDataTexture(data, width, height);
  });
}
