import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DOCK_BOARD,
  LOADED_PALLET_HEIGHT,
  PALLET_HEIGHT,
  STRETCH_FILM_GEOMETRY,
  STRETCH_FILM_MATERIAL,
} from './LoadingProps';

/**
 * logistics-close (med-06, med-12) read the wrapped loads as sacks inside a
 * ghosted glass box: one closed, 42%-opaque shell over the whole load, with a
 * flat lid across the top course and a hard outline down every corner.
 */
describe('stretch film on a flour load', () => {
  const positions = STRETCH_FILM_GEOMETRY.getAttribute('position');
  const ys = Array.from({ length: positions.count }, (_, i) => positions.getY(i));

  it('has no lid: every face of the film is a side wall', () => {
    const geometry = STRETCH_FILM_GEOMETRY.index
      ? STRETCH_FILM_GEOMETRY.toNonIndexed()
      : STRETCH_FILM_GEOMETRY;
    const p = geometry.getAttribute('position');
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const normal = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      normal.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
      expect(Math.abs(normal.y), `face ${i / 3}`).toBeLessThan(0.2);
    }
  });

  /**
   * Round 4 cut it to two bands with the middle courses bare, and shipping
   * med-12 then read the loads as unwrapped. It is one sleeve from the pallet
   * deck to over the top course, denser where the wrap doubles.
   */
  it('wraps the whole load from its pallet to over its top course, one sleeve', () => {
    expect(Math.min(...ys)).toBeLessThanOrEqual(PALLET_HEIGHT);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(LOADED_PALLET_HEIGHT - 0.02);
    const alpha = STRETCH_FILM_GEOMETRY.getAttribute('color');
    expect(alpha?.itemSize).toBe(4);
    // Every height up the load has film on it.
    for (let y = PALLET_HEIGHT; y <= LOADED_PALLET_HEIGHT; y += 0.05) {
      let covered = 0;
      for (let i = 0; i < positions.count; i += 3) {
        const v = [0, 1, 2].map((k) => ys[i + k]);
        if (Math.min(...v) <= y && Math.max(...v) >= y) covered += 1;
      }
      expect(covered, `film at y ${y.toFixed(2)}`).toBeGreaterThan(8);
    }
    // Denser at the bands than up the middle, and never thin enough to vanish.
    const middle = (PALLET_HEIGHT + LOADED_PALLET_HEIGHT) / 2;
    const alphaAt = (y: number) => {
      let best = { d: Infinity, a: 0 };
      for (let i = 0; i < positions.count; i += 1) {
        const d = Math.abs(ys[i] - y);
        if (d < best.d) best = { d, a: alpha.getW(i) };
      }
      return best.a;
    };
    expect(alphaAt(middle)).toBeGreaterThanOrEqual(0.2);
    expect(alphaAt(PALLET_HEIGHT)).toBeGreaterThan(alphaAt(middle));
    expect(alphaAt(LOADED_PALLET_HEIGHT)).toBeGreaterThan(alphaAt(middle));
    expect(alphaAt(LOADED_PALLET_HEIGHT)).toBeLessThanOrEqual(0.42);
  });

  it('is a thin glossy sheen, not a milky shell, with no doubled edge', () => {
    expect(STRETCH_FILM_MATERIAL.vertexColors).toBe(true);
    expect(STRETCH_FILM_MATERIAL.opacity).toBe(1);
    expect(STRETCH_FILM_MATERIAL.roughness).toBeLessThanOrEqual(0.25);
    expect(STRETCH_FILM_MATERIAL.depthWrite).toBe(false);
    expect(STRETCH_FILM_MATERIAL.side).toBe(THREE.FrontSide);
  });
});

/**
 * The blank grey panel leaning on the pallet stack in logistics-close (med-06)
 * is the spare dock board: a plain 1.5 x 1.0 m aluminium slab with nothing on
 * the face the camera sees.
 */
describe('spare dock board', () => {
  it('carries traction cleats across its deck and painted curbs along both edges', () => {
    const { width, length, thickness, cleats, curb } = DOCK_BOARD;
    expect(cleats.length).toBeGreaterThanOrEqual(6);
    for (const z of cleats) {
      expect(z).toBeGreaterThan(0.1);
      expect(z).toBeLessThan(length - 0.05);
    }
    // Cleat pitch stays above ~6 px at the 14 m logistics-close distance (124 px/m).
    for (let i = 1; i < cleats.length; i += 1)
      expect(cleats[i] - cleats[i - 1]).toBeGreaterThanOrEqual(0.08);
    // Curbs stand on the deck's two long edges, inside its width.
    expect(curb.x + curb.width / 2).toBeLessThanOrEqual(width / 2);
    expect(curb.x - curb.width / 2).toBeGreaterThan(width / 2 - 0.12);
    expect(curb.height).toBeGreaterThan(thickness);
  });
});
