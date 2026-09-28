import { describe, expect, it } from 'vitest';
import { Vector3, Raycaster } from 'three';
import { CASTLE_STEPS } from '../constants/castleAccess';
import {
  castleBlocks,
  castleLocalPosition,
  castleWorldPosition,
  moveWalkingPosition,
  sampleWalkingGroundHeight,
} from './castleNavigation';
import { createCastleStepsGeometry } from '../components/scenery/CastleSteps';
import { Mesh, MeshBasicMaterial } from 'three';

const start = (x: number, z: number, segments = 128) => {
  const p = new Vector3(...castleWorldPosition(x, 0.2, z));
  p.y = sampleWalkingGroundHeight(p.x, p.z, segments) + 0.48;
  return p;
};
describe('castle ground access', () => {
  for (const segments of [64, 128]) {
    for (const stride of [0.2, 4.32]) {
      it(`walks both flights and returns at terrain ${segments}, stride ${stride}`, () => {
        const p = start(7.2, 26, segments);
        const direction = new Vector3(...castleWorldPosition(7.2, 0.2, 0))
          .sub(p)
          .setY(0)
          .normalize();
        for (let i = 0; i < Math.ceil(30 / stride); i++) {
          moveWalkingPosition(
            p,
            direction.x * stride,
            direction.z * stride,
            segments,
            true,
            0.48,
            () => false
          );
          expect(p.y).toBeCloseTo(sampleWalkingGroundHeight(p.x, p.z, segments) + 0.48, 6);
        }
        expect(castleLocalPosition(p.x, p.z)[1]).toBeLessThan(8);
        expect(p.y).toBeCloseTo(4.96, 5);
        for (let i = 0; i < Math.ceil(34 / stride); i++)
          moveWalkingPosition(
            p,
            -direction.x * stride,
            -direction.z * stride,
            segments,
            true,
            0.48,
            () => false
          );
        expect(castleLocalPosition(p.x, p.z)[1]).toBeGreaterThan(25);
        expect(p.y).toBeLessThan(0.6);
      });
    }
  }
  it('uses exactly the rendered tread and landing heights', () => {
    const geometry = createCastleStepsGeometry();
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.updateMatrixWorld();
    try {
      for (const step of CASTLE_STEPS) {
        const z = (step.minZ + step.maxZ) / 2;
        const hit = new Raycaster(new Vector3(7.2, 10, z), new Vector3(0, -1, 0)).intersectObject(
          mesh
        )[0];
        expect(hit?.point.y).toBeCloseTo(step.height, 5);
        const p = castleWorldPosition(7.2, hit.point.y, z);
        expect(sampleWalkingGroundHeight(p[0], p[2], 128)).toBeCloseTo(p[1], 5);
      }
    } finally {
      geometry.dispose();
      mesh.material.dispose();
    }
  });
  it('blocks wings, rock, stair sides and the terrace drop even during a sprint', () => {
    for (const [x, z] of [
      [-5, 0],
      [12, 4],
      [4, 13],
      [-18, 0],
    ]) {
      const p = start(x, z);
      expect(castleBlocks(p.x, p.z, p.y - 0.48)).toBe(true);
    }
    for (const [x, z, tx, tz] of [
      [7.2, 22, 14, 22],
      [6, 0, -2, 0],
      [7, -15, 7, -22],
    ]) {
      const p = start(x, z),
        target = start(tx, tz);
      const before = p.clone();
      moveWalkingPosition(p, target.x - p.x, target.z - p.z, 128, true, 0.48, () => false);
      expect(p.distanceTo(before)).toBeLessThan(target.distanceTo(before) - 0.4);
    }
  });
  it('preserves free inspection flight above the castle and rejects its lintel', () => {
    const p = start(7.2, 14);
    expect(castleBlocks(p.x, p.z, 4.48)).toBe(false);
    expect(castleBlocks(p.x, p.z, 10)).toBe(true);
    expect(castleBlocks(p.x, p.z, 65)).toBe(false);
    const y = (p.y = 65);
    moveWalkingPosition(p, 3, 0, 128, false, 0.48, () => false);
    expect(p.y).toBe(y);
  });
});
