import { describe, expect, it } from 'vitest';
import {
  advanceCreatureStride,
  creatureCadence,
  creaturePoseBlend,
  creatureTravelDistance,
  fountainRippleScale,
} from '../creatureMotion';

describe('creature ground motion and individuality', () => {
  it('gives each authored seed reproducible, bounded timing without changing placement', () => {
    const values = Array.from({ length: 20 }, (_, i) => creatureCadence(100 + i));
    expect(new Set(values).size).toBe(20);
    values.forEach((value, i) => {
      expect(value).toBe(creatureCadence(100 + i));
      expect(value).toBeGreaterThanOrEqual(0.88);
      expect(value).toBeLessThanOrEqual(1.12);
    });
  });

  it('turns in place instead of sliding backwards or sideways', () => {
    expect(creatureTravelDistance(3, Math.PI, 0.1, 1.5)).toBe(0);
    expect(creatureTravelDistance(3, Math.PI / 2, 0.1, 1.5)).toBeCloseTo(0);
    expect(creatureTravelDistance(3, Math.PI / 3, 0.1, 1.5)).toBeCloseTo(0.075);
    expect(creatureTravelDistance(3, 0, 0.1, 1.5)).toBeCloseTo(0.15);
  });

  it('clamps arrival to the actual target and applies no paused travel', () => {
    expect(creatureTravelDistance(0.02, 0, 0.1, 1.5)).toBe(0.02);
    expect(creatureTravelDistance(2, 0, 0, 1.5)).toBe(0);
    expect(creatureTravelDistance(2, 0, 0.1, 0)).toBe(0);
    expect(creatureTravelDistance(0, 0, 0.1, 1.5)).toBe(0);
  });

  it('advances the same foot phase for the same ground travel at clear/storm speeds', () => {
    const radiansPerMetre = 3.5 / 0.5;
    let clearPhase = 0;
    let stormPhase = 0;
    for (let i = 0; i < 10; i++)
      clearPhase = advanceCreatureStride(clearPhase, 0.05, radiansPerMetre);
    for (let i = 0; i < 50; i++)
      stormPhase = advanceCreatureStride(stormPhase, 0.01, radiansPerMetre);
    expect(clearPhase).toBeCloseTo(stormPhase, 12);
    expect(advanceCreatureStride(clearPhase, 0, radiansPerMetre)).toBe(clearPhase);
    // External position changes are not an input: reset/spawn cannot advance phase.
    expect(advanceCreatureStride(0, 0, radiansPerMetre)).toBe(0);
    expect(advanceCreatureStride(6, 0.5, radiansPerMetre)).toBeLessThan(Math.PI * 2);
  });

  it('preserves the 15Hz pose blend under irregular and lower frame rates', () => {
    expect(creaturePoseBlend(0.15, 1 / 15)).toBeCloseTo(0.15);
    expect(creaturePoseBlend(0.15, 0)).toBe(0);
    const twoSteps = 1 - (1 - creaturePoseBlend(0.15, 0.02)) * (1 - creaturePoseBlend(0.15, 0.08));
    expect(twoSteps).toBeCloseTo(creaturePoseBlend(0.15, 0.1));
  });
});

describe('generated fountain ripple contact', () => {
  it('keeps the entire ring inside the measured water rather than crossing the coping', () => {
    for (let i = 0; i <= 100; i++) {
      const scale = fountainRippleScale(i / 100, 1.28, 0.5);
      expect(0.5 * scale).toBeLessThanOrEqual(1.28);
      expect(0.38 * scale).toBeGreaterThanOrEqual(0.36);
    }
    expect(fountainRippleScale(0, 1.28, 0.5)).toBe(1);
    expect(fountainRippleScale(1, 1.28, 0.5)).toBe(2.56);
  });
});
