import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  RAILWAY_CONSIST,
  RAILWAY_LENGTH,
  RAILWAY_LEVELS,
  RAILWAY_STATION,
} from '../../constants/railwayLayout';
import { buildRailwayStationGeometry, RAILWAY_LAMPS, RAILWAY_NAMEBOARDS } from './RailwayStation';
import {
  createBallastGeometry,
  createRailGeometry,
  railwaySleeperPlacements,
} from './RailwayTrack';
import { buildRailwayCoachGeometry, buildRailwayEngineGeometry } from './RailwayTrain';

const triangles = (geometry: THREE.BufferGeometry) =>
  (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

function expectFinite(geometry: THREE.BufferGeometry) {
  const values = geometry.getAttribute('position').array;
  let finite = true;
  for (let i = 0; i < values.length && finite; i++) finite = Number.isFinite(values[i]);
  expect(finite, geometry.name).toBe(true);
}

describe('Riverside station geometry', () => {
  const station = buildRailwayStationGeometry();

  it('builds seven finite, bounded batches within a modest triangle budget', () => {
    const { forecourt, platform1, platform2, rampLength } = RAILWAY_STATION;
    let total = 0;
    for (const [name, geometry] of Object.entries(station)) {
      expectFinite(geometry);
      const box = geometry.boundingBox!;
      expect(triangles(geometry), name).toBeGreaterThan(0);
      expect(box.min.x, name).toBeGreaterThan(forecourt.minX - 2.5);
      expect(box.max.x, name).toBeLessThan(platform2.maxX + 0.5);
      // The barrow crossing lies just beyond the north ramps' feet.
      expect(box.min.z, name).toBeGreaterThan(
        Math.min(platform1.minZ - rampLength, RAILWAY_STATION.crossingZ - 1.2) - 0.5
      );
      expect(box.max.z, name).toBeLessThan(platform1.maxZ + rampLength + 0.5);
      expect(box.min.y, name).toBeGreaterThan(RAILWAY_LEVELS.ground - 0.1);
      expect(box.max.y, name).toBeLessThan(14);
      total += triangles(geometry);
    }
    expect(total).toBeLessThan(40000);
  });

  it('carries every vertex colour and metre UV the batched materials read', () => {
    for (const geometry of Object.values(station)) {
      expect(geometry.getAttribute('color')).toBeDefined();
      expect(geometry.getAttribute('uv')).toBeDefined();
      expect(geometry.getAttribute('normal')).toBeDefined();
    }
  });

  it('stands its lamps and nameboards on a platform or the forecourt', () => {
    for (const [x, y, z, pool] of RAILWAY_LAMPS) {
      const onPlatform = [RAILWAY_STATION.platform1, RAILWAY_STATION.platform2].find(
        (p) => x - pool >= p.minX - 0.01 && x + pool <= p.maxX + 0.01 && z >= p.minZ && z <= p.maxZ
      );
      if (onPlatform) expect(y).toBeCloseTo(RAILWAY_LEVELS.platformTop);
      else expect(y).toBeCloseTo(RAILWAY_LEVELS.ground);
    }
    for (const { position } of RAILWAY_NAMEBOARDS)
      expect(position[1]).toBeCloseTo(RAILWAY_LEVELS.platformTop);
  });
});

describe('Riverside permanent way', () => {
  it('sets the rail heads on the sleepers and buries the ballast toe', () => {
    const rails = createRailGeometry();
    const ballast = createBallastGeometry();
    expectFinite(rails);
    expectFinite(ballast);
    expect(rails.boundingBox!.max.y).toBeCloseTo(RAILWAY_LEVELS.railTop);
    expect(rails.boundingBox!.min.y).toBeCloseTo(RAILWAY_LEVELS.sleeperTop);
    expect(ballast.boundingBox!.min.y).toBeLessThan(RAILWAY_LEVELS.ground);
    expect(ballast.boundingBox!.max.y).toBeLessThan(RAILWAY_LEVELS.sleeperTop);
    // Straights need two cross-sections: the whole line stays cheap.
    expect(triangles(rails) + triangles(ballast)).toBeLessThan(12000);
    const sleepers = railwaySleeperPlacements();
    expect(sleepers.length).toBe(2 * Math.ceil((RAILWAY_LENGTH - 0.35) / 0.7));
    rails.dispose();
    ballast.dispose();
  });
});

describe('Riverside train geometry', () => {
  it('fits each vehicle inside its length over buffers and the loading gauge', () => {
    for (const [kind, build] of [
      ['engine', buildRailwayEngineGeometry],
      ['coach', buildRailwayCoachGeometry],
    ] as const) {
      const { body, glass } = build();
      const length = RAILWAY_CONSIST.find((vehicle) => vehicle.kind === kind)!.length;
      for (const geometry of [body, glass]) {
        expectFinite(geometry);
        const box = geometry.boundingBox!;
        expect(Math.max(-box.min.x, box.max.x), kind).toBeLessThanOrEqual(1.42);
        // Roof vents top out just under 3.95 m above rail.
        expect(box.max.y, kind).toBeLessThan(3.95);
        expect(Math.max(-box.min.z, box.max.z), kind).toBeLessThanOrEqual(length / 2 + 0.03);
        geometry.dispose();
      }
    }
  });
});
