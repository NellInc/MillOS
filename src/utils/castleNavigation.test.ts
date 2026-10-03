import { describe, expect, it } from 'vitest';
import { Vector3, Raycaster } from 'three';
import {
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_STEPS,
  RIVER_FOOTBRIDGE_LANDINGS,
} from '../constants/siteLayout';
import { createRiverFootbridgeAccessGeometry } from '../components/exterior/riverGeometry';
import {
  CASTLE_STEPS,
  CASTLE_ACCESS_LANTERNS,
  CASTLE_STAIR_X,
  CASTLE_STAIR_WIDTH,
} from '../constants/castleAccess';
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
  it('keeps the access lanterns outside the walking width', () => {
    for (const [x, , z] of CASTLE_ACCESS_LANTERNS) {
      expect(Math.abs(x - CASTLE_STAIR_X) - 0.225).toBeGreaterThan(CASTLE_STAIR_WIDTH / 2 - 0.1);
      expect(z).toBeGreaterThan(15.7);
      expect(z).toBeLessThan(24.7);
    }
  });
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

describe('river bridge ground access', () => {
  it('uses the rendered tread and landing heights with finite merged geometry', () => {
    const geometry = createRiverFootbridgeAccessGeometry();
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.updateMatrixWorld();
    try {
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(geometry.getAttribute('position').count).toBeLessThan(2500);
      for (const step of [...RIVER_FOOTBRIDGE_STEPS, ...RIVER_FOOTBRIDGE_LANDINGS]) {
        const z = (step.minZ + step.maxZ) / 2;
        const hit = new Raycaster(new Vector3(0, 8, z), new Vector3(0, -1, 0)).intersectObject(
          mesh
        )[0];
        expect(hit?.point.y).toBeCloseTo(step.top, 5);
        for (const segments of [64, 128])
          expect(sampleWalkingGroundHeight(0, z, segments)).toBeCloseTo(hit.point.y, 5);
      }
    } finally {
      geometry.dispose();
      mesh.material.dispose();
    }
  });
  it.each([64, 128])(
    'crosses both flights and the whole deck in either direction at terrain %i',
    (segments) => {
      for (const direction of [-1, 1])
        for (const stride of [0.2, 4.32]) {
          const p = new Vector3(0, 1.7, RIVER_FOOTBRIDGE_DECK.centre[2] - direction * 45);
          let highest = p.y;
          for (let i = 0; i < Math.ceil(90 / stride); i++) {
            moveWalkingPosition(p, 0, direction * stride, segments, true, 1.7, () => false);
            highest = Math.max(highest, p.y);
            expect(p.y - sampleWalkingGroundHeight(p.x, p.z, segments)).toBeCloseTo(1.7, 6);
          }
          expect(highest).toBeCloseTo(4.1, 5);
          expect(direction * (p.z - RIVER_FOOTBRIDGE_DECK.centre[2])).toBeGreaterThan(44);
          expect(p.y).toBeCloseTo(1.7, 5);
        }
    }
  );
  it('prevents a grounded side step off the high deck while preserving inspection flight', () => {
    const p = new Vector3(0, 4.1, -145);
    moveWalkingPosition(p, 6, 0, 64, true, 1.7, () => false);
    expect(p.x).toBeLessThanOrEqual(RIVER_FOOTBRIDGE_DECK.size[0] / 2);
    expect(p.y).toBeCloseTo(4.1, 5);
    p.y = 8;
    moveWalkingPosition(p, 6, 0, 64, false, 1.7, () => false);
    expect(p.x).toBeGreaterThan(RIVER_FOOTBRIDGE_DECK.size[0] / 2);
    expect(p.y).toBe(8);
  });
});
