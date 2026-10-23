import { describe, expect, it } from 'vitest';
import {
  getAnimationDampingAlpha,
  isYardEquipmentRunning,
  truckMarkerLightIntensity,
  yardPulseIntensity,
} from './animationSystem';

describe('truck bay decorative loops under reduced motion', () => {
  it('holds the yard machinery clock when the viewer prefers reduced motion', () => {
    const running = { gameSpeed: 30, safetyHold: false, reducedMotion: false };
    expect(isYardEquipmentRunning(running)).toBe(true);
    expect(isYardEquipmentRunning({ ...running, reducedMotion: true })).toBe(false);
    // The existing holds still apply.
    expect(isYardEquipmentRunning({ ...running, gameSpeed: 0 })).toBe(false);
    expect(isYardEquipmentRunning({ ...running, safetyHold: true })).toBe(false);
  });

  it('holds pulsing lamps at their midpoint instead of breathing', () => {
    const data = { speed: 2, min: 0.4, max: 1.2, offset: 0.3 };
    const still = [0, 0.7, 1.9, 5.3].map((time) => yardPulseIntensity(time, data, true));
    expect(new Set(still).size).toBe(1);
    expect(still[0]).toBeCloseTo(0.8);
    const moving = [0, 0.7, 1.9, 5.3].map((time) => yardPulseIntensity(time, data, false));
    expect(new Set(moving).size).toBeGreaterThan(1);
    expect(truckMarkerLightIntensity(1.1, true)).toBe(truckMarkerLightIntensity(4.2, true));
    expect(truckMarkerLightIntensity(1.1, false)).not.toBe(truckMarkerLightIntensity(4.2, false));
  });
});

const dampForOneSecond = (framesPerSecond: number, perFrameAlpha: number): number => {
  let value = 0;
  for (let frame = 0; frame < framesPerSecond; frame += 1) {
    const alpha = getAnimationDampingAlpha(perFrameAlpha, 1 / framesPerSecond);
    value += (1 - value) * alpha;
  }
  return value;
};

describe('truck bay animation damping', () => {
  it('converges identically at 30, 60 and 120 fps', () => {
    const at30 = dampForOneSecond(30, 0.1);
    const at60 = dampForOneSecond(60, 0.1);
    const at120 = dampForOneSecond(120, 0.1);
    expect(at30).toBeCloseTo(at60, 12);
    expect(at120).toBeCloseTo(at60, 12);
  });

  it('guards invalid deltas and clamps authored fractions', () => {
    expect(getAnimationDampingAlpha(0.1, 0)).toBe(0);
    expect(getAnimationDampingAlpha(2, 1 / 60)).toBe(1);
    expect(getAnimationDampingAlpha(-1, 1 / 60)).toBe(0);
  });
});
