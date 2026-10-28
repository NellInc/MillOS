import { clampShelterVerticalMovement } from '../constants/publicRealmLayout';
import { describe, expect, it } from 'vitest';
import { createDisplacedGeometry } from '../components/terrain/TerrainGround';
import { getRiverHeightfield, MILLOS_RIVER_CONFIG } from '../components/terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../components/terrain/terrainTypes';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { Vector3, Raycaster } from 'three';
import {
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_STEPS,
  RIVER_FOOTBRIDGE_LANDINGS,
} from '../constants/siteLayout';
import { createRiverFootbridgeAccessGeometry } from '../components/exterior/riverGeometry';
import {
  CASTLE_COURT_HEIGHT,
  CASTLE_ROCK_SINK,
  CASTLE_STEPS,
  CASTLE_ACCESS_LANTERNS,
  CASTLE_ACCESS_LIGHT,
  CASTLE_STAIR_X,
  CASTLE_STAIR_WIDTH,
} from '../constants/castleAccess';
import {
  CASTLE_WALKING_ROUTE,
  isWithinWalkingDomain,
  clampWalkingSpawn,
  castleBlocks,
  walkingBlocks,
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
        // Eye 0.48 above the court, measured in the castle's frame.
        expect(p.y).toBeCloseTo(castleWorldPosition(7.2, CASTLE_COURT_HEIGHT, 0)[1] + 0.48, 5);
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
        // Back down on the castle's base plane (local y = the rock sink).
        expect(p.y).toBeLessThan(castleWorldPosition(7.2, CASTLE_ROCK_SINK, 26)[1] + 0.6);
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
    // Feet on the court, inside the lintel, and well above the roofs, in the
    // castle's own frame so the checks follow it wherever it stands.
    const feetAt = (localY: number) => castleWorldPosition(7.2, localY, 14)[1];
    expect(castleBlocks(p.x, p.z, feetAt(3.2))).toBe(false);
    expect(castleBlocks(p.x, p.z, feetAt(6.88))).toBe(true);
    expect(castleBlocks(p.x, p.z, feetAt(43.55))).toBe(false);
    const y = (p.y = feetAt(43.55));
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
          expect(p.y).toBeCloseTo(1.68, 5);
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

describe('rendered river-bank contact', () => {
  it.each([64, 128])('matches actual displaced terrain at tier %i', (segments) => {
    const field = getRiverHeightfield(MILLOS_RIVER_CONFIG);
    const geometry = createDisplacedGeometry(
      1200,
      1200,
      segments,
      field.data,
      field.resolution,
      MILLOS_RIVER_CONFIG.depth,
      TERRAIN_BOUNDS
    );
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.position.y = SITE_LAYOUT.datum.terrain;
    mesh.updateMatrixWorld();
    try {
      for (const [x, z] of [
        [100, -118],
        [25, -190],
        [-190, -104],
      ]) {
        const hit = new Raycaster(new Vector3(x, 40, z), new Vector3(0, -1, 0)).intersectObject(
          mesh
        )[0];
        expect(hit).toBeDefined();
        expect(sampleWalkingGroundHeight(x, z, segments)).toBeCloseTo(hit.point.y, 5);
      }
    } finally {
      geometry.dispose();
      mesh.material.dispose();
    }
  });
});

it.each([64, 128])(
  'matches the real approach and keeps grounded movement out of water at tier %i',
  (segments) => {
    const mesh = new Mesh(createCastleStepsGeometry(segments), new MeshBasicMaterial());
    mesh.updateMatrixWorld();
    try {
      for (const x of [5.7, 7.2, 8.7])
        for (const z of [24.75, 25.35, 26.1, 27.95]) {
          const hit = new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0)).intersectObject(
            mesh
          )[0];
          expect(hit).toBeDefined();
          const p = castleWorldPosition(x, hit.point.y, z);
          expect(sampleWalkingGroundHeight(p[0], p[2], segments)).toBeCloseTo(p[1], 5);
        }
      const p = new Vector3(25, sampleWalkingGroundHeight(25, -108, segments) + 1.7, -108);
      moveWalkingPosition(p, 0, -65, segments, true, 1.7, () => false);
      expect(p.z).toBeGreaterThan(-140);
      expect(sampleWalkingGroundHeight(p.x, p.z, segments)).toBeGreaterThanOrEqual(-1.92);
      p.y = 10;
      moveWalkingPosition(p, 0, -20, segments, false, 1.7, () => false);
      expect(p.y).toBe(10);
      expect(sampleWalkingGroundHeight(p.x, p.z, segments)).toBeLessThan(-2);
    } finally {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
);

// Observed native touch movement entered the delivered bench at x=29.2424.
it('keeps a sprinting inspection camera in front of the shelter bench and lets it return', () => {
  const p = new Vector3(27.65, 1.68, 140.4);
  moveWalkingPosition(p, 4.32, 0, 64, true, 1.7, () => false);
  expect(p.x).toBeGreaterThan(28.3);
  expect(p.x + 0.4).toBeLessThanOrEqual(29.364 + 1e-6);
  expect(p.y).toBeCloseTo(1.81, 6);
  moveWalkingPosition(p, -4.32, 0, 64, true, 1.7, () => false);
  expect(p.x).toBeLessThan(27.65);
  expect(p.y).toBeCloseTo(1.68, 6);
});

it('keeps the shelter end panels and rear glass solid, with an open front and free space above', () => {
  expect(walkingBlocks(28.5, 140, 0.11)).toBe(false);
  expect(walkingBlocks(28.5, 142, 0.11)).toBe(true);
  expect(walkingBlocks(30.05, 140, 1.0)).toBe(true);
  expect(walkingBlocks(29.55, 140, 3.1)).toBe(false);
  const p = new Vector3(28.5, 1.81, 140);
  moveWalkingPosition(p, 0, 4.32, 64, true, 1.7, () => false);
  expect(p.z).toBeGreaterThan(141.4);
  expect(p.z + 0.4).toBeLessThanOrEqual(141.958 + 1e-6);
});
it('sweeps Q/E roof clearance in both directions without blocking inspection above it', () => {
  expect(clampShelterVerticalMovement(28.3, 140, 0.11, 10)).toBeCloseTo(1.0, 6);
  expect(clampShelterVerticalMovement(29, 140, 4, -1)).toBeCloseTo(2.99, 6);
  expect(clampShelterVerticalMovement(29, 140, 4, 8)).toBe(8);
  expect(clampShelterVerticalMovement(25, 140, 0, 10)).toBe(10);
  // Real luminaire lens hangs below the housing, not through the inspection head.
  expect(clampShelterVerticalMovement(28.88, 140, 0.11, 10)).toBeCloseTo(2.769 - 1.8, 6);
});

it('keeps the single access light inside the upper optic and within range of both flights and gateway paving', () => {
  expect(CASTLE_ACCESS_LIGHT.position).toBe(CASTLE_ACCESS_LANTERNS[1]);
  expect(CASTLE_ACCESS_LIGHT.intensity).toBe(96);
  expect(CASTLE_ACCESS_LIGHT.distance).toBe(24);
  const at = new Vector3(...castleWorldPosition(...CASTLE_ACCESS_LIGHT.position));
  for (const [x, y, z] of [
    [7.2, 0.2, 28],
    [7.2, 1.7, 20.65],
    [7.2, 3.2, 16.15],
    [7.2, 3.2, 8],
  ]) {
    const target = new Vector3(...castleWorldPosition(x, y, z));
    expect(at.distanceTo(target)).toBeLessThan(CASTLE_ACCESS_LIGHT.distance);
  }
});

describe('bounded access to the relocated castle', () => {
  it.each([64, 128])(
    'walks from the dry bridge bank to the approach and back at terrain %s',
    (segments) => {
      const { start, end } = CASTLE_WALKING_ROUTE;
      const p = new Vector3(start[0], 0, start[1]);
      p.y = sampleWalkingGroundHeight(p.x, p.z, segments) + 1.7;
      const direction = new Vector3(end[0] - p.x, 0, end[2] - p.z).normalize();
      const steps = Math.floor(Math.hypot(end[0] - p.x, end[2] - p.z) / 0.2);
      for (let i = 0; i < steps; i++)
        moveWalkingPosition(
          p,
          direction.x * 0.2,
          direction.z * 0.2,
          segments,
          true,
          1.7,
          () => false
        );
      expect(Math.hypot(p.x - end[0], p.z - end[2])).toBeLessThan(0.21);
      expect(p.y).toBeGreaterThan(9);
      expect(p.y).toBeCloseTo(sampleWalkingGroundHeight(p.x, p.z, segments) + 1.7, 6);
      for (let i = 0; i < steps; i++)
        moveWalkingPosition(
          p,
          -direction.x * 0.2,
          -direction.z * 0.2,
          segments,
          true,
          1.7,
          () => false
        );
      expect(Math.hypot(p.x - start[0], p.z - start[1])).toBeLessThan(0.01);
    }
  );
  it('contains the corridor and keeps the unrelated outer world closed, even without a collider callback', () => {
    const { start, end, halfWidth } = CASTLE_WALKING_ROUTE;
    const x = start[0] * 0.25 + end[0] * 0.75,
      z = start[1] * 0.25 + end[2] * 0.75;
    const dx = end[0] - start[0],
      dz = end[2] - start[1],
      length = Math.hypot(dx, dz);
    const nx = -dz / length,
      nz = dx / length;
    expect(isWithinWalkingDomain(x, z)).toBe(true);
    expect(isWithinWalkingDomain(x + nx * (halfWidth + 1), z + nz * (halfWidth + 1))).toBe(false);
    const p = new Vector3(x, sampleWalkingGroundHeight(x, z, 128) + 1.7, z);
    moveWalkingPosition(p, nx * 30, nz * 30, 128, true, 1.7, () => false);
    expect(isWithinWalkingDomain(p.x, p.z)).toBe(true);
    expect((p.x - x) * nx + (p.z - z) * nz).toBeLessThanOrEqual(halfWidth - 0.4);
    expect(isWithinWalkingDomain(400, 100)).toBe(false);
    expect(clampWalkingSpawn(end[0], end[2])).toEqual([end[0], end[2]]);
    const outside = clampWalkingSpawn(400, 100);
    expect(Math.hypot(...outside)).toBeLessThan(255);
  });
});
