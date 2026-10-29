import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MILLOS_RIVER_CONFIG } from '../terrain/splatMapGenerator';

// The branch footprint remains the shared woodland exclusion. Its western edge
// meets the main canal's INNER bank; its northern mouth lies inside the river.
const branch = SITE_LAYOUT.exteriorFeatures.canalBranch;
export const CANAL_OUTLET = {
  west: branch.position[0] - branch.width / 2,
  east: branch.position[0] + branch.width / 2,
  north: branch.position[2] - branch.length / 2,
  south: branch.position[2] + branch.length / 2,
  width: 8,
  upperLevel: 0.15,
  apronLevel: 0.1,
  lowerLevel: MILLOS_RIVER_CONFIG.waterLevel,
  foundation: -4.5,
  wallTop: 1.05,
} as const;

/** Same world landing as the existing vertical sheet, with a five-metre visual runout.
 * Working if the sheet and receiving finish share this datum without moving either surface.
 */
export const CANAL_WEIR_IMPACT = {
  position: [CANAL_OUTLET.east - CANAL_OUTLET.width / 2, CANAL_OUTLET.north - 0.035] as const,
  halfWidth: CANAL_OUTLET.width / 2,
  runMetres: 5,
} as const;

export function createCanalOutletSurface() {
  const { west, east, north, south, width } = CANAL_OUTLET;
  const shape = new THREE.Shape([
    new THREE.Vector2(west, -south),
    new THREE.Vector2(east, -south),
    new THREE.Vector2(east, -north),
    new THREE.Vector2(east - width, -north),
    new THREE.Vector2(east - width, -south + width),
    new THREE.Vector2(west, -south + width),
  ]);
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      (position.getX(i) - west) / (east - west),
      (-position.getY(i) - north) / (south - north)
    );
  return geometry;
}

/** Meter-scaled UVs and lit linear vertex colour survive the ordinary batcher.
 * Working if the actual waterline is damp, coping stays dry and bounds do not move.
 */
export function createOutletStoneGeometry(
  width: number,
  height: number,
  depth: number,
  origin: readonly [number, number, number] = [0, 0, 0],
  coping = false
) {
  const geometry = new THREE.BoxGeometry(
    width,
    height,
    depth,
    Math.min(24, Math.max(1, Math.ceil(width / 3))),
    Math.min(18, Math.max(1, Math.ceil(height / 0.35))),
    Math.min(24, Math.max(1, Math.ceil(depth / 3)))
  );
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const colour = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    const v = Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / 2, v / 2);
    const x = p.getX(i) + origin[0];
    const y = p.getY(i) + origin[1];
    const z = p.getZ(i) + origin[2];
    const uneven = Math.sin(x * 1.3 + Math.sin(z * 0.6)) * Math.cos(z * 0.91) * 0.08;
    const level = CANAL_OUTLET.upperLevel + uneven;
    const damp = coping ? 0 : 1 - THREE.MathUtils.smoothstep(y, level - 0.22, level + 0.42);
    const moss = coping
      ? 0
      : (1 - THREE.MathUtils.smoothstep(Math.abs(y - level - 0.09), 0.03, 0.24)) *
        (1 - Math.abs(n.getY(i)));
    // Linear RGB multiplier on the retained sRGB stone map, no emissive decal.
    colour.set(
      [1 - damp * 0.34 - moss * 0.07, 1 - damp * 0.32, 1 - damp * 0.36 - moss * 0.05],
      i * 3
    );
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  return geometry;
}

/** Close only the positive-Z head, opposite the negative-Z river branch.
 * The cap fits between the bank faces: their top surfaces meet at an edge,
 * rather than overlap. Working if water-level rays hit solid stone across
 * the head and the retained river mouth remains open.
 */
export function canalClosedEndSpec(width: number, length: number) {
  return {
    position: [0, 0.3, length / 2] as [number, number, number],
    size: [width - 1, 1.5, 1] as [number, number, number],
  };
}

/** The existing bank maps repeat 110 times over 220 m, once over 1.5 m.
 * Compensate in geometry UVs so the short cap uses that same stone scale
 * without allocating another set of textures.
 */
export function createCanalClosedEndGeometry(width: number) {
  const geometry = new THREE.BoxGeometry(...canalClosedEndSpec(width, 1).size);
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    const v = Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / 220, v / 1.5);
  }
  return geometry;
}

/**
 * How far each east-bank stub runs into the 0.8 m outlet wall it meets. Ending
 * flush with the wall's face left the stub's end face coplanar with it.
 */
const BANK_STUB_EMBED = 0.02;

export function canalEastBankSections(length: number, centerZ: number) {
  const gapStart = CANAL_OUTLET.south - CANAL_OUTLET.width - centerZ - BANK_STUB_EMBED;
  const gapEnd = CANAL_OUTLET.south - centerZ + BANK_STUB_EMBED;
  return [
    [-length / 2, gapStart],
    [gapEnd, length / 2],
  ] as const;
}
