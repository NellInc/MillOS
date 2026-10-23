// @vitest-environment node
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';
import { instanceScale, instanceYaw } from '../components/models/GeneratedModel';
import {
  COMMUNITY_ANCHORS as A,
  COMMUNITY_PATHS,
  getCommunityHours,
  getCommunityReopeningDetail,
  COMMUNITY_OPENING_HOURS,
} from './communityLayout';
import { landmarkLocalToWorld, SITE_LAYOUT } from './siteLayout';

type Vec3 = [number, number, number];

describe('community hours and shared placement contract', () => {
  it('ties useful closed-board captions to the actual reopening schedule', () => {
    for (const place of ['shops', 'pub'] as const) {
      const hour = COMMUNITY_OPENING_HOURS[place].open;
      expect(getCommunityReopeningDetail(place, false)).toBe(
        `Opens ${String(hour).padStart(2, '0')}:00`
      );
      expect(getCommunityReopeningDetail(place, true)).toBeUndefined();
      const key = place === 'shops' ? 'shopsOpen' : 'pubOpen';
      expect(getCommunityHours(hour - 0.001)[key]).toBe(false);
      expect(getCommunityHours(hour)[key]).toBe(true);
    }
  });

  it.each([
    [6.999, false, false, false, false],
    [7, true, false, false, false],
    [8, true, false, false, true],
    [9, true, false, true, true],
    [10.999, true, false, true, true],
    [11, true, true, false, true],
    [17, true, true, false, false],
    [18, false, true, false, false],
    [23, false, false, false, false],
  ])(
    'hour %s has consistent opening, delivery and gardening boundaries',
    (hour, shopsOpen, pubOpen, deliveryActive, gardeningActive) => {
      expect(getCommunityHours(hour)).toEqual({
        shopsOpen,
        pubOpen,
        deliveryActive,
        gardeningActive,
      });
    }
  );
  it('wraps valid clocks and fails closed on malformed clocks', () => {
    expect(getCommunityHours(34)).toEqual(getCommunityHours(10));
    expect(getCommunityHours(-14)).toEqual(getCommunityHours(10));
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(Object.values(getCommunityHours(value))).toEqual([false, false, false, false]);
    }
  });
  it('transforms the real village and freezes positions and routes', () => {
    expect(A.bakeryCounter.position).toEqual(
      landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [15.8, 0, 6.8])
    );
    expect(A.allotmentGardener.position).toEqual(
      landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [-25.35, 0, 10])
    );
    expect(Object.isFrozen(A)).toBe(true);
    for (const anchor of Object.values(A)) {
      expect(Object.isFrozen(anchor)).toBe(true);
      expect(Object.isFrozen(anchor.position)).toBe(true);
      expect(anchor.position.every(Number.isFinite)).toBe(true);
    }
    for (const path of Object.values(COMMUNITY_PATHS)) {
      expect(Object.isFrozen(path)).toBe(true);
      expect(path.every(Object.isFrozen)).toBe(true);
    }
  });
  it('puts each shop door anchor on the step outside the actual shop.glb door', async () => {
    // The door is wherever the delivered model's stone threshold is: the
    // upward faces 0.05-0.3 m above the ground on the front (+z) face.
    const document = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .read('public/models/village/shop.glb');
    const threshold = { minX: Infinity, maxX: -Infinity, maxZ: -Infinity };
    for (const node of document.getRoot().listNodes()) {
      const world = node.getWorldMatrix();
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const position = primitive.getAttribute('POSITION')!;
        const indices = primitive.getIndices()!;
        for (let t = 0; t < indices.getCount(); t += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => {
            const [x, y, z] = position.getElement(indices.getScalar(t + k), []);
            return [
              world[0] * x + world[4] * y + world[8] * z + world[12],
              world[1] * x + world[5] * y + world[9] * z + world[13],
              world[2] * x + world[6] * y + world[10] * z + world[14],
            ];
          });
          const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
          if (ny <= 0 || ![a, b, c].every((v) => v[1] > 0.05 && v[1] < 0.3 && v[2] > 0)) continue;
          for (const v of [a, b, c]) {
            threshold.minX = Math.min(threshold.minX, v[0]);
            threshold.maxX = Math.max(threshold.maxX, v[0]);
            threshold.maxZ = Math.max(threshold.maxZ, v[2]);
          }
        }
      }
    }
    const doorX = (threshold.minX + threshold.maxX) / 2;
    expect(threshold.maxX - threshold.minX, 'one doorway-wide threshold').toBeLessThan(1.4);

    // The placements as VillageArea renders them, with ShopBuilding's own
    // per-instance yaw and scale.
    const source = readFileSync('src/components/VillageArea.tsx', 'utf8');
    const placements = new Map<string, { position: Vec3; rotation: number }>();
    for (const m of source.matchAll(
      /<ShopBuilding\s+position=\{\[([^\]]+)\]\}\s+rotation=\{(-?)Math\.PI \/ 2\}[^>]*?signText="([^"]+)"/g
    )) {
      const position = m[1].split(',').map(Number) as Vec3;
      placements.set(m[3], { position, rotation: (m[2] ? -1 : 1) * (Math.PI / 2) });
    }
    const village = SITE_LAYOUT.landmarks.village;
    for (const [sign, anchor, board] of [
      ['BAKER', A.bakeryDoor, A.bakeryBoard],
      ['GENERAL STORE', A.shopDoor, A.shopBoard],
    ] as const) {
      const placement = placements.get(sign);
      expect(placement, sign).toBeDefined();
      const { position, rotation } = placement!;
      const yaw = village.rotation[1] + rotation + instanceYaw(position);
      const scale = village.scale * instanceScale(position);
      const centre = landmarkLocalToWorld(village, position);
      // Anchor back into the model's own frame.
      const dx = (anchor.position[0] - centre[0]) / scale;
      const dz = (anchor.position[2] - centre[2]) / scale;
      const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      expect(Math.abs(localX - doorX), `${sign} anchor across the doorway`).toBeLessThan(0.1);
      expect(localZ - threshold.maxZ, `${sign} anchor clear of the step`).toBeGreaterThan(0.2);
      expect(localZ - threshold.maxZ, `${sign} anchor at the step`).toBeLessThan(0.5);
      // Facing out of the door, along the model's +z.
      const facing = Math.atan2(Math.sin(anchor.rotation - yaw), Math.cos(anchor.rotation - yaw));
      expect(Math.abs(facing), `${sign} anchor faces out of the door`).toBeLessThan(0.07);
      // The opening board stands out in line with that door, facing the street.
      const bx = board.position[0] - anchor.position[0];
      const bz = board.position[2] - anchor.position[2];
      const along = bx * Math.sin(yaw) + bz * Math.cos(yaw);
      const across = bx * Math.cos(yaw) - bz * Math.sin(yaw);
      expect(Math.abs(across), `${sign} board in line with the door`).toBeLessThan(0.1);
      expect(along, `${sign} board out from the door`).toBeGreaterThan(0.8);
      expect(along, `${sign} board out from the door`).toBeLessThan(2.5);
      expect(Math.abs(board.rotation - anchor.rotation), `${sign} board faces the street`).toBe(0);
    }
    // The store's board stays clear of the delivery crate in front of the door
    // (0.64 x 0.46 m, turned with its anchor; the board is 0.71 x 0.075 m).
    const crate = A.shopDelivery.position;
    const gapX = Math.abs(A.shopBoard.position[0] - crate[0]) - (0.23 + 0.0375);
    const gapZ = Math.abs(A.shopBoard.position[2] - crate[2]) - (0.32 + 0.355);
    expect(Math.max(gapX, gapZ), 'board clear of the delivery crate').toBeGreaterThan(0.3);
  });
  it('keeps the mill break seats west of the transfer belt and the painted west walkway clear', () => {
    for (const seat of [A.millRestNorth, A.millRestSouth]) {
      expect(seat.position[0]).toBe(-34);
      expect(seat.rotation).toBe(Math.PI / 2);
      expect(seat.seatHeight).toBe(0.46);
      expect(seat.position[0] - 0.3).toBeGreaterThan(-35.5);
    }
    expect(COMMUNITY_PATHS.millWest.every((p) => p[0] < -30)).toBe(true);
  });
  it('resolves the actual rotated bus-shelter bench, including its top surface', () => {
    expect(A.busSeat.position).toEqual([29.55, 0, 140]);
    expect(A.busSeat.rotation).toBe(-Math.PI / 2);
    expect(A.busSeat.seatHeight).toBe(0.522);
  });
});
