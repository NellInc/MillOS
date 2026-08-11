import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  HORIZON_CITY_BASE_RADIUS,
  HORIZON_CITY_BASE_Y,
  HORIZON_CITY_END_ANGLE,
  HORIZON_CITY_SEGMENTS,
  HORIZON_CITY_START_ANGLE,
  buildHorizonCityProfile,
  createHorizonCityGeometry,
  syncHorizonBackdropPosition,
} from './NearHorizonCity';

describe('horizon city silhouette', () => {
  it('recreates the deterministic v0.30 skyline sector at skybox depth', () => {
    const first = buildHorizonCityProfile();
    expect(buildHorizonCityProfile()).toEqual(first);
    expect(first).toHaveLength(HORIZON_CITY_SEGMENTS + 1);
    expect(first.every(Number.isFinite)).toBe(true);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(1.8);
    expect(Math.max(...first)).toBeGreaterThan(24);
    expect(Math.max(...first)).toBeLessThan(42);
    expect(first[0]).toBe(first.at(-1));
    expect(HORIZON_CITY_START_ANGLE).toBeCloseTo(Math.PI * 1.65 - Math.PI * 2);
    expect(HORIZON_CITY_END_ANGLE).toBeCloseTo(Math.PI * 1.95 - Math.PI * 2);
    expect(HORIZON_CITY_BASE_RADIUS).toBe(275);
    expect(HORIZON_CITY_BASE_RADIUS).toBe(SITE_LAYOUT.world.horizonRadius + 15);
    expect(HORIZON_CITY_BASE_RADIUS).toBeGreaterThan(200);
  });

  it('builds a finite curved sheet with the expected bounds and topology', () => {
    const heights = buildHorizonCityProfile();
    const geometry = createHorizonCityGeometry(heights);
    const positions = geometry.getAttribute('position');
    const bounds = geometry.boundingSphere;

    expect(positions.count).toBe((HORIZON_CITY_SEGMENTS + 1) * 2);
    expect(geometry.index?.count).toBe(HORIZON_CITY_SEGMENTS * 6);
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    expect(bounds).not.toBeNull();

    for (let index = 0; index < positions.count; index += 2) {
      expect(positions.getY(index)).toBe(HORIZON_CITY_BASE_Y);
      expect(Math.hypot(positions.getX(index), positions.getZ(index))).toBeCloseTo(
        HORIZON_CITY_BASE_RADIUS
      );
    }

    geometry.dispose();
  });

  it('follows the camera horizontally without floating vertically', () => {
    const target = new THREE.Vector3(0, -0.25, 0);
    syncHorizonBackdropPosition(target, new THREE.Vector3(112, 74, -96));
    expect(target.toArray()).toEqual([112, -0.25, -96]);
  });
});
