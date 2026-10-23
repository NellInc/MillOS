import { describe, expect, it } from 'vitest';
import {
  advancePrecipitationTime,
  createPrecipitationMaterial,
  createRainGeometry,
  LOADING_DOCK_CANOPY_GLB_EXTENT,
  PRECIPITATION,
  precipitationDropCount,
  RAIN_SHELTERS,
  rainDropHeights,
  rainReachesPoint,
} from './Precipitation';
import { sampleAtmosphere } from '../../simulation/atmosphere';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { LOADING_DOCK_CANOPIES } from '../FactoryExterior';
import { DOCK_CANOPY_ROOF } from '../truckbay/OptimizedTruckBay';

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

  it('keeps every dock canopy dry underneath and wet beside it', () => {
    // r4 med-rain: streaks under cover. The hall was the only shelter the
    // field knew; the yard canopies over both docks let rain fall through.
    for (const canopy of LOADING_DOCK_CANOPIES) {
      const [cx, , cz] = canopy.position;
      expect(rainReachesPoint(cx, 3, cz)).toBe(false);
      expect(rainReachesPoint(cx + canopy.width / 2 - 0.3, 5.5, cz)).toBe(false);
      expect(rainReachesPoint(cx + canopy.width / 2 + 0.5, 3, cz)).toBe(true);
      // Above both roofs (the dock-face canopy over the same spot tops out at 7.84).
      expect(rainReachesPoint(cx, 8, cz)).toBe(true);
    }
    for (const dockZ of [50, -50]) {
      const side = Math.sign(dockZ);
      const [, y, localZ] = DOCK_CANOPY_ROOF.position;
      const [width, height, depth] = DOCK_CANOPY_ROOF.scale;
      const z = dockZ + side * localZ;
      // Under the truck-bay canopy (y 7.46 underside), between it and the yard canopy.
      expect(rainReachesPoint(0, 6.8, z)).toBe(false);
      expect(rainReachesPoint(width / 2 - 0.3, 1, dockZ + side * (localZ - depth / 2 + 0.3))).toBe(
        false
      );
      expect(rainReachesPoint(0, y + height, z)).toBe(true);
      expect(rainReachesPoint(width / 2 + 2, 6.8, z)).toBe(true);
    }
  });

  it('derives its shelters from the authored canopies, not a copy that can drift', () => {
    const covers = (minX: number, maxX: number, minZ: number, maxZ: number, roofY: number) =>
      RAIN_SHELTERS.some(
        (box) =>
          box.minX <= minX + 1e-6 &&
          box.maxX >= maxX - 1e-6 &&
          box.minZ <= minZ + 1e-6 &&
          box.maxZ >= maxZ - 1e-6 &&
          Math.abs(box.maxY - roofY) < 1e-6
      );
    const glb = LOADING_DOCK_CANOPY_GLB_EXTENT;
    for (const canopy of LOADING_DOCK_CANOPIES) {
      const [cx, , cz] = canopy.position;
      // The GLB variant is mounted 0.1 m along the canopy's own +z.
      const z = cz + Math.cos(canopy.rotation) * glb.offsetZ;
      expect(glb.halfWidth).toBeGreaterThanOrEqual(canopy.width / 2);
      expect(glb.halfDepth).toBeGreaterThanOrEqual(canopy.depth / 2);
      expect(
        covers(
          cx - glb.halfWidth,
          cx + glb.halfWidth,
          z - glb.halfDepth,
          z + glb.halfDepth,
          glb.roofY
        )
      ).toBe(true);
    }
    const [, y, localZ] = DOCK_CANOPY_ROOF.position;
    const [width, height, depth] = DOCK_CANOPY_ROOF.scale;
    for (const dockZ of [50, -50]) {
      const near = dockZ + Math.sign(dockZ) * (localZ - depth / 2);
      const far = dockZ + Math.sign(dockZ) * (localZ + depth / 2);
      expect(
        covers(-width / 2, width / 2, Math.min(near, far), Math.max(near, far), y + height / 2)
      ).toBe(true);
    }
  });

  // final5-med-rain: farm and water showed no rain at all, and village's rain
  // stopped in a band partway down the sky. Each drop's fall speed was keyed
  // to aSeed.y, the same random that places it vertically, so the height
  // h = 36 s - 9.5 t (0.85 + 0.3 s) = s (36 - 2.85 t) - 8.1 t lost its spread
  // as t grew: every 12.6 s the whole field fell as one thin sheet. Whether a
  // capture showed rain depended on the render clock when it fired.
  it('keeps the drops spread through the volume at every moment, not one falling sheet', () => {
    const geometry = createRainGeometry();
    try {
      const bins = 6;
      for (let time = 0; time <= 120; time += 0.37) {
        const heights = rainDropHeights(geometry, time);
        const counts = new Array<number>(bins).fill(0);
        for (const h of heights)
          counts[Math.min(bins - 1, Math.floor((h / PRECIPITATION.height) * bins))] += 1;
        for (const count of counts) {
          // A uniform field puts 1/6 (16.7%) in each sixth of the volume.
          expect(count / heights.length, `t=${time.toFixed(2)}`).toBeGreaterThan(0.12);
        }
      }
      // The mirror reads the same attribute the shader does.
      const material = createPrecipitationMaterial();
      expect(material.vertexShader).toMatch(/travel = velocity \* uTime \* aRate;/);
      expect(material.vertexShader).not.toMatch(/uTime \*[^;]*aSeed/);
      material.dispose();
    } finally {
      geometry.dispose();
    }
  });

  it('falls on the render clock, so a held time of day never stops it', () => {
    // Capture mode holds the time of day (timeOfDayHeld); the rain must keep
    // falling and keep raining.
    const store = useGameSimulationStore.getState();
    const previous = { weather: store.weather, held: store.timeOfDayHeld };
    try {
      store.setWeather('rain');
      store.setTimeOfDayHeld(true);
      const { gameDay, gameTime, weather } = useGameSimulationStore.getState();
      const rain = sampleAtmosphere(gameDay, gameTime, weather).precipitation;
      expect(precipitationDropCount('medium', rain)).toBeGreaterThan(0);
      let time = 0;
      for (let frame = 0; frame < 60 * 15; frame += 1)
        time = advancePrecipitationTime(time, 1 / 60, false);
      expect(time).toBeCloseTo(15, 6);
      expect(useGameSimulationStore.getState().gameTime).toBe(gameTime);
      expect(advancePrecipitationTime(4, 1 / 60, true)).toBe(4);
      expect(advancePrecipitationTime(4, 5, false)).toBeCloseTo(4.1, 9);
    } finally {
      store.setWeather(previous.weather);
      store.setTimeOfDayHeld(previous.held);
    }
  });

  it('clips each streak per fragment, so no streak pokes through a wall or roof', () => {
    // A vertex-level test let a 0.8 m streak straddling a wall fade INTO the
    // hall; the clip has to run on the interpolated world position.
    const material = createPrecipitationMaterial();
    try {
      expect(material.fragmentShader).toContain('vRainWorld');
      expect(material.fragmentShader).toMatch(/rainSheltered\(\s*vRainWorld\s*\)/);
      expect(material.vertexShader).not.toContain('indoors');
    } finally {
      material.dispose();
    }
  });
});
