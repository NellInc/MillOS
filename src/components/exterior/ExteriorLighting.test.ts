import { describe, expect, it } from 'vitest';
import {
  getExteriorLampLevel,
  WEST_FACTORY_PATH,
  WEST_FACTORY_PATH_LAMPS,
  WEST_FACTORY_PATH_POOL_RADIUS,
} from './ExteriorLighting';

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
