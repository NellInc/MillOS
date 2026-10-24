import { describe, expect, it } from 'vitest';

import {
  createAnimalWanderPlan,
  getAnimalActivityMultiplier,
  getCulvertWaterHeight,
  getWindmillAngularSpeed,
  sampleAmbientSequence,
} from '../ambientWorld';

describe('ambient world simulation', () => {
  it('generates deterministic, bounded animal movement plans', () => {
    const bounds = { minX: 9, maxX: 15, minZ: -8, maxZ: -2 };
    const first = createAnimalWanderPlan(101, 4, bounds);

    expect(createAnimalWanderPlan(101, 4, bounds)).toEqual(first);
    expect(first.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(first.x).toBeLessThanOrEqual(bounds.maxX);
    expect(first.z).toBeGreaterThanOrEqual(bounds.minZ);
    expect(first.z).toBeLessThanOrEqual(bounds.maxZ);
    expect(first.idleSeconds).toBeGreaterThanOrEqual(2);
    expect(first.idleSeconds).toBeLessThanOrEqual(6);
    expect(createAnimalWanderPlan(101, 5, bounds)).not.toEqual(first);
  });

  it('keeps scalar sequence samples inside the unit interval', () => {
    for (let step = 0; step < 100; step += 1) {
      expect(sampleAmbientSequence(73, step)).toBeGreaterThanOrEqual(0);
      expect(sampleAmbientSequence(73, step)).toBeLessThan(1);
    }
  });

  it('reduces roaming at night and in precipitation', () => {
    expect(getAnimalActivityMultiplier('clear', 12)).toBe(1);
    expect(getAnimalActivityMultiplier('rain', 12)).toBe(0.55);
    expect(getAnimalActivityMultiplier('storm', 12)).toBe(0.2);
    expect(getAnimalActivityMultiplier('clear', 23)).toBe(0.25);
    expect(getAnimalActivityMultiplier('storm', 23)).toBeCloseTo(0.05);
    expect(getAnimalActivityMultiplier('cloudy', -1)).toBe(0.25);
  });

  it('maps wind and rainfall to finite mechanical and drainage responses', () => {
    expect(getWindmillAngularSpeed(0.2)).toBeCloseTo(0.5);
    expect(getWindmillAngularSpeed(0.92)).toBeCloseTo(1.256302521);
    expect(getWindmillAngularSpeed(5)).toBe(1.3);

    const dry = getCulvertWaterHeight(0.6, 0, 0);
    const damp = getCulvertWaterHeight(0.6, 0.82, 0.62);
    const storm = getCulvertWaterHeight(0.6, 1, 1);
    expect(dry).toBeCloseTo(-0.312);
    expect(damp).toBeGreaterThan(dry);
    expect(storm).toBeGreaterThan(damp);
    expect(storm).toBeCloseTo(-0.108);
  });
});

it('fades animal activity smoothly across dawn/dusk and wraps the day without speed jumps', () => {
  for (const weather of ['clear', 'rain', 'storm'] as const) {
    for (let hour = 0; hour < 24; hour += 1 / 60) {
      const a = getAnimalActivityMultiplier(weather, hour),
        b = getAnimalActivityMultiplier(weather, hour + 1 / 60);
      expect(Math.abs(b - a)).toBeLessThan(0.01);
      expect(a).toBeGreaterThanOrEqual(
        weather === 'storm' ? 0.05 : weather === 'rain' ? 0.1375 : 0.25
      );
    }
    expect(getAnimalActivityMultiplier(weather, 24)).toBe(getAnimalActivityMultiplier(weather, 0));
  }
  expect(getAnimalActivityMultiplier('clear', NaN)).toBe(1);
  expect(getAnimalActivityMultiplier('clear', 7)).toBeCloseTo(0.625);
  expect(getAnimalActivityMultiplier('clear', 20)).toBeCloseTo(0.625);
});
it('keeps wind power finite and truly calm, without a perpetual-motion minimum', () => {
  for (const wind of [NaN, Infinity, -Infinity, -2, 0])
    expect(getWindmillAngularSpeed(wind)).toBe(0);
  for (let i = 0; i <= 100; i++) {
    const speed = getWindmillAngularSpeed(i / 100);
    expect(speed).toBeGreaterThanOrEqual(0);
    expect(speed).toBeLessThanOrEqual(1.3);
    if (i > 0) {
      const preceding = getWindmillAngularSpeed((i - 1) / 100);
      expect(speed).toBeGreaterThan(preceding);
      expect(speed - preceding).toBeLessThan(0.033);
    }
  }
  expect(getWindmillAngularSpeed(2)).toBe(1.3);
});
