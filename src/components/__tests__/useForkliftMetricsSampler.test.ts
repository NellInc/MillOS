import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useForkliftMetricsSampler } from '../useForkliftMetricsSampler';

const metrics = () => useSafetyStore.getState().forkliftMetrics['forklift-1'];

describe('useForkliftMetricsSampler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    useSafetyStore.getState().resetForkliftMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('samples once a second while the forklift simulation runs', () => {
    renderHook(() => useForkliftMetricsSampler('forklift-1', true, () => true));
    vi.advanceTimersByTime(3000);
    expect(metrics().totalMovingTime).toBe(2);
    expect(metrics().totalStoppedTime).toBe(0);
  });

  it('takes no samples while held or hidden, and books none of that span on resume', () => {
    const { rerender } = renderHook(
      ({ running }) => useForkliftMetricsSampler('forklift-1', running, () => false),
      { initialProps: { running: true } }
    );
    vi.advanceTimersByTime(3000);
    expect(metrics().totalStoppedTime).toBe(2);

    rerender({ running: false });
    const heldUpdate = metrics().lastUpdateTime;
    vi.advanceTimersByTime(60_000);
    expect(metrics().lastUpdateTime).toBe(heldUpdate);

    rerender({ running: true });
    vi.advanceTimersByTime(1000);
    expect(metrics().totalStoppedTime).toBe(3);
  });

  it('books the partial second up to the moment sampling stops', () => {
    const { rerender } = renderHook(
      ({ running }) => useForkliftMetricsSampler('forklift-1', running, () => true),
      { initialProps: { running: true } }
    );
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(600);
    rerender({ running: false });
    expect(metrics().totalMovingTime).toBeCloseTo(0.6, 6);
  });

  it('reads the moving state at each sample, not at mount', () => {
    let moving = true;
    renderHook(() => useForkliftMetricsSampler('forklift-1', true, () => moving));
    vi.advanceTimersByTime(2000);
    moving = false;
    vi.advanceTimersByTime(2000);
    // Each delta is booked to the state of the sample that opened it, so the
    // second after the change still counts as moving. Read at mount: 3 and 0.
    expect(metrics().totalMovingTime).toBe(2);
    expect(metrics().totalStoppedTime).toBe(1);
  });
});
