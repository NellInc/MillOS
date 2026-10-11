import { describe, expect, it } from 'vitest';
import {
  getExteriorLampLevel,
  CANAL_CROSSING_LAMPS,
  CANAL_CROSSING_LIGHT,
  WEST_FACTORY_PATH,
  WEST_FACTORY_PATH_LAMPS,
  WEST_FACTORY_PATH_POOL_RADIUS,
} from './ExteriorLighting';
import {
  CANAL_FOOTBRIDGE_ACCESS,
  WORLD_REALM_PATHS,
  inRealmPath,
} from '../../constants/publicRealmLayout';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { LAMP_LENS_HEIGHTS } from '../models/GeneratedLampModel';

describe('exterior lamp schedule', () => {
  it('is fully lit at night and off at clear noon', () => {
    expect(getExteriorLampLevel(23, 'clear')).toBe(1);
    expect(getExteriorLampLevel(12, 'clear')).toBe(0);
  });

  it('fades smoothly at dawn and dusk', () => {
    expect(getExteriorLampLevel(6, 'clear')).toBe(1);
    expect(getExteriorLampLevel(18, 'clear')).toBe(1);
  });

  it('raises a daytime minimum in severe weather', () => {
    expect(getExteriorLampLevel(12, 'storm')).toBe(0.7);
  });
});

it('covers the existing west walk without poles in its two-metre paving', () => {
  expect(WEST_FACTORY_PATH_LAMPS).toHaveLength(7);
  for (const [x, y] of WEST_FACTORY_PATH_LAMPS) {
    expect(Math.abs(x - WEST_FACTORY_PATH.start[0])).toBeGreaterThan(
      WEST_FACTORY_PATH.width / 2 + 0.5
    );
    expect(y).toBe(0);
  }
  for (let z = WEST_FACTORY_PATH.end[2]; z <= WEST_FACTORY_PATH.start[2]; z += 0.5) {
    const nearest = Math.min(
      ...WEST_FACTORY_PATH_LAMPS.map(([x, , lampZ]) =>
        Math.hypot(x - WEST_FACTORY_PATH.start[0], lampZ - z)
      )
    );
    // Keep the whole centreline inside the useful inner part of the shared mask.
    expect(nearest / WEST_FACTORY_PATH_POOL_RADIUS).toBeLessThan(0.71);
  }
});

it('lights the site before sunset and fades continuously without a late switch', () => {
  expect(getExteriorLampLevel(17, 'clear')).toBeGreaterThan(0.4);
  expect(getExteriorLampLevel(17.5, 'clear')).toBeGreaterThan(0.9);
  for (let h = 16; h < 20; h += 1 / 60) {
    const delta = getExteriorLampLevel(h + 1 / 60, 'clear') - getExteriorLampLevel(h, 'clear');
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(0.02);
  }
  expect(getExteriorLampLevel(18 + 24, 'clear')).toBe(1);
});

it('puts both crossing lamps on dry banks, outside stairs and paths, with light inside the real optic', () => {
  const bridge = CANAL_FOOTBRIDGE_ACCESS;
  const canal = SITE_LAYOUT.exteriorFeatures.canal;
  expect(CANAL_CROSSING_LAMPS.map((l) => l.id)).toEqual(['west', 'east']);
  for (const {
    position: [x, y, z],
  } of CANAL_CROSSING_LAMPS) {
    for (const segments of [64, 128]) expect(sampleTerrainGroundHeight(x, z, segments)).toBe(0);
    expect(y).toBe(-0.02);
    expect(Math.abs(z - bridge.z) - 0.2 - 0.4).toBeGreaterThan(bridge.halfWidth);
    expect(WORLD_REALM_PATHS.some((path) => inRealmPath(x, z, path, 0.6))).toBe(false);
    // The shared ground-pool disk never floats over the actual inner water edge.
    expect(Math.abs(x - canal.position[0]) - CANAL_CROSSING_LIGHT.poolRadius).toBeGreaterThan(
      (canal.width - 1) / 2
    );
  }
  expect(CANAL_CROSSING_LIGHT.height).toBeGreaterThan(LAMP_LENS_HEIGHTS.victorian[0]);
  expect(CANAL_CROSSING_LIGHT.height).toBeLessThan(LAMP_LENS_HEIGHTS.victorian[1]);
});
