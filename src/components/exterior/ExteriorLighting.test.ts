import { describe, expect, it } from 'vitest';
import { getExteriorLampLevel } from './ExteriorLighting';

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
