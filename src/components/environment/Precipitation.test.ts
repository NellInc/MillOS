import { describe, expect, it } from 'vitest';
import { PRECIPITATION, precipitationDropCount, rainReachesPoint } from './Precipitation';
import { sampleAtmosphere } from '../../simulation/atmosphere';
import { SITE_LAYOUT } from '../../constants/siteLayout';

describe('world-space precipitation', () => {
  it('draws nothing unless it is actually raining', () => {
    for (const weather of ['clear', 'cloudy'] as const) {
      expect(precipitationDropCount('high', sampleAtmosphere(0, 12, weather).precipitation)).toBe(
        0
      );
    }
    expect(precipitationDropCount('medium', Number.NaN)).toBe(0);
  });

  it('scales with the tier and the rate, and stays bounded', () => {
    const rain = sampleAtmosphere(0, 12, 'rain').precipitation;
    const storm = sampleAtmosphere(0, 12, 'storm').precipitation;
    const low = precipitationDropCount('low', rain);
    const medium = precipitationDropCount('medium', rain);
    const high = precipitationDropCount('high', rain);
    expect(low).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(medium);
    expect(precipitationDropCount('medium', storm)).toBeGreaterThan(medium);
    expect(precipitationDropCount('ultra', 1)).toBeLessThanOrEqual(PRECIPITATION.maxDrops);
  });

  it('never falls inside the covered hall', () => {
    const { bounds } = SITE_LAYOUT.factory;
    expect(rainReachesPoint(0, 3, 0)).toBe(false);
    expect(rainReachesPoint(bounds.minX + 1, 10, bounds.maxZ - 1)).toBe(false);
    expect(rainReachesPoint(0, bounds.maxY + 1, 0)).toBe(true);
    expect(rainReachesPoint(bounds.maxX + 2, 3, 0)).toBe(true);
    expect(rainReachesPoint(60, 2, 80)).toBe(true);
  });
});
