import { describe, expect, it } from 'vitest';
import {
  createRoundedForkliftRoute,
  canPerformForkliftLogisticsAction,
  dampAngle,
  hydraulicSoundSeconds,
  isForkliftSimulationPaused,
  moveTowards,
  resolveForkliftMastTilt,
  resolveForkliftSteeringAngle,
  smoothOperationHeight,
} from '../forkliftRoute';

describe('forklift route motion', () => {
  const path = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 10],
    [0, 0, 10],
  ] as const;
  const actions = [
    { type: 'pickup', duration: 2 },
    { type: 'none', duration: 0 },
    { type: 'dropoff', duration: 2 },
    { type: 'none', duration: 0 },
  ] as const;

  it('rounds travel corners while preserving exact operational poses', () => {
    const route = createRoundedForkliftRoute(path, actions);

    expect(route.path.length).toBeGreaterThan(path.length);
    expect(route.path).toContainEqual(path[0]);
    expect(route.path).toContainEqual(path[2]);
    expect(route.actions).toHaveLength(route.path.length);
    expect(route.actions.filter(({ type }) => type === 'pickup')).toHaveLength(1);
    expect(route.actions.filter(({ type }) => type === 'dropoff')).toHaveLength(1);
  });

  it('rejects route and action arrays that can drift apart', () => {
    expect(() => createRoundedForkliftRoute(path, actions.slice(1))).toThrow(/4 points.*3 actions/);
  });

  it('bounds acceleration and deceleration per step', () => {
    expect(moveTowards(0, 3.5, 0.2)).toBeCloseTo(0.2);
    expect(moveTowards(3.5, 0, 0.5)).toBeCloseTo(3);
    expect(moveTowards(0.1, 0, 0.5)).toBe(0);
  });

  it('uses the shortest wrapped heading change', () => {
    const result = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 8, 1 / 60);
    expect(result).toBeGreaterThan(Math.PI - 0.1);
    expect(result).toBeLessThan(Math.PI + 0.1);
  });

  it('maps the shortest heading error to a bounded steering pose', () => {
    expect(resolveForkliftSteeringAngle(0, 0.2)).toBeCloseTo(0.2);
    expect(resolveForkliftSteeringAngle(0, 1.2)).toBeCloseTo(0.48);
    expect(resolveForkliftSteeringAngle(0, -1.2)).toBeCloseTo(-0.48);
    expect(resolveForkliftSteeringAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(resolveForkliftSteeringAngle(Number.NaN, 0.2)).toBe(0);
  });

  it('uses a restrained rearward mast tilt for loaded travel', () => {
    expect(resolveForkliftMastTilt('traveling', true)).toBeCloseTo(-0.055);
    expect(resolveForkliftMastTilt('waiting', true)).toBeCloseTo(-0.04);
    expect(resolveForkliftMastTilt('traveling', false)).toBe(0);
  });

  it('presents the mast neutrally for pickup and slightly forward for set-down', () => {
    expect(resolveForkliftMastTilt('loading', false)).toBe(0);
    expect(resolveForkliftMastTilt('loading', true)).toBe(0);
    expect(resolveForkliftMastTilt('unloading', true)).toBeCloseTo(0.025);
  });

  it('uses a smooth, symmetric lift cycle', () => {
    expect(smoothOperationHeight(0, 1.2)).toBe(0);
    expect(smoothOperationHeight(0.5, 1.2)).toBe(1.2);
    expect(smoothOperationHeight(1, 1.2)).toBe(0);
    expect(smoothOperationHeight(0.25, 1.2)).toBeCloseTo(smoothOperationHeight(0.75, 1.2));
  });

  it('stops vehicle motion only when the shift clock is paused, never for a line setpoint', () => {
    expect(isForkliftSimulationPaused(30)).toBe(false);
    expect(isForkliftSimulationPaused(120)).toBe(false);
    expect(isForkliftSimulationPaused(0)).toBe(true);
    expect(isForkliftSimulationPaused(-1)).toBe(true);
    expect(isForkliftSimulationPaused(Number.NaN)).toBe(true);
  });

  it('gates dock actions against released stock and truck presence', () => {
    const base = {
      forkliftId: 'forklift-1',
      action: 'pickup' as const,
      shippingDocked: false,
      receivingDocked: false,
      releasedFinishedKg: 500,
      dispatchLoadStatus: 'away' as const,
    };
    expect(canPerformForkliftLogisticsAction(base)).toBe(true);
    expect(canPerformForkliftLogisticsAction({ ...base, releasedFinishedKg: 0 })).toBe(false);
    expect(
      canPerformForkliftLogisticsAction({
        ...base,
        action: 'dropoff',
        shippingDocked: true,
        dispatchLoadStatus: 'loading',
      })
    ).toBe(true);
    expect(canPerformForkliftLogisticsAction({ ...base, action: 'dropoff' })).toBe(false);
    expect(
      canPerformForkliftLogisticsAction({
        ...base,
        forkliftId: 'forklift-2',
        receivingDocked: false,
      })
    ).toBe(false);
  });
});

describe('hydraulic sound length on plant time', () => {
  it('lasts as long as the lift does in real seconds at every pace', () => {
    expect(hydraulicSoundSeconds(1.5, 30)).toBeCloseTo(1.5, 9);
    expect(hydraulicSoundSeconds(1.5, 15)).toBeCloseTo(3, 9);
    expect(hydraulicSoundSeconds(1.5, 120)).toBeCloseTo(0.375, 9);
  });

  it('never schedules an envelope shorter than its own attack and release', () => {
    expect(hydraulicSoundSeconds(0.6, 120)).toBe(0.3);
  });

  it('plays nothing while the clock is held or once the lift is done', () => {
    expect(hydraulicSoundSeconds(1.5, 0)).toBe(0);
    expect(hydraulicSoundSeconds(0, 30)).toBe(0);
    expect(hydraulicSoundSeconds(Number.NaN, 30)).toBe(0);
  });
});
