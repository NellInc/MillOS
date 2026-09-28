// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COMMUNITY_ANCHORS as A, COMMUNITY_PATHS, getCommunityHours } from './communityLayout';
import { landmarkLocalToWorld, SITE_LAYOUT } from './siteLayout';

describe('community hours and shared placement contract', () => {
  it.each([
    [6.999, false, false, false, false],
    [7, true, false, false, false],
    [8, true, false, false, true],
    [9, true, false, true, true],
    [10.999, true, false, true, true],
    [11, true, true, false, true],
    [17, true, true, false, false],
    [18, false, true, false, false],
    [23, false, false, false, false],
  ])(
    'hour %s has consistent opening, delivery and gardening boundaries',
    (hour, shopsOpen, pubOpen, deliveryActive, gardeningActive) => {
      expect(getCommunityHours(hour)).toEqual({
        shopsOpen,
        pubOpen,
        deliveryActive,
        gardeningActive,
      });
    }
  );
  it('wraps valid clocks and fails closed on malformed clocks', () => {
    expect(getCommunityHours(34)).toEqual(getCommunityHours(10));
    expect(getCommunityHours(-14)).toEqual(getCommunityHours(10));
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(Object.values(getCommunityHours(value))).toEqual([false, false, false, false]);
    }
  });
  it('transforms the real village and freezes positions and routes', () => {
    expect(A.bakeryCounter.position).toEqual(
      landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [15.8, 0, 6.8])
    );
    expect(A.allotmentGardener.position).toEqual(
      landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [-25.35, 0, 10])
    );
    expect(Object.isFrozen(A)).toBe(true);
    for (const anchor of Object.values(A)) {
      expect(Object.isFrozen(anchor)).toBe(true);
      expect(Object.isFrozen(anchor.position)).toBe(true);
      expect(anchor.position.every(Number.isFinite)).toBe(true);
    }
    for (const path of Object.values(COMMUNITY_PATHS)) {
      expect(Object.isFrozen(path)).toBe(true);
      expect(path.every(Object.isFrozen)).toBe(true);
    }
  });
  it('keeps the mill break seats west of the transfer belt and the painted west walkway clear', () => {
    for (const seat of [A.millRestNorth, A.millRestSouth]) {
      expect(seat.position[0]).toBe(-34);
      expect(seat.rotation).toBe(Math.PI / 2);
      expect(seat.seatHeight).toBe(0.46);
      expect(seat.position[0] - 0.3).toBeGreaterThan(-35.5);
    }
    expect(COMMUNITY_PATHS.millWest.every((p) => p[0] < -30)).toBe(true);
  });
  it('resolves the actual rotated bus-shelter bench, including its top surface', () => {
    expect(A.busSeat.position).toEqual([29.55, 0, 140]);
    expect(A.busSeat.rotation).toBe(-Math.PI / 2);
    expect(A.busSeat.seatHeight).toBe(0.522);
  });
});
