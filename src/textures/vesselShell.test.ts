import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  VESSEL_CROWN_U,
  VESSEL_WELD,
  generateVesselShellMaps,
  profileArcLengths,
  sampleVesselShell,
  vesselCourseSeams,
  vesselLongitudinalSeamU,
  vesselShellUvs,
  type VesselShellLayout,
} from './vesselShell';
import { vesselProfile, vesselSeamOffset } from '../components/FactoryExterior';
import { utilityTankNozzles } from '../components/exterior/utilityVesselDetails';

const layoutFor = (radius: number, length: number): VesselShellLayout => ({
  radius,
  profile: vesselProfile(radius, length),
  seamOffset: vesselSeamOffset(radius, length),
  nozzles: utilityTankNozzles(length).map((n) => ({ y: -n.x, radius: n.radius })),
});
const luma = (tint: readonly number[]) => 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];

describe.each([
  [3, 10],
  [2.5, 8],
])('storage tank shell maps, %s m x %s m', (radius, length) => {
  const layout = layoutFor(radius, length);
  const seams = vesselCourseSeams(layout.seamOffset);
  // A point on the barrel's upper flank, well away from every fitting.
  const plainY = (seams[0] + seams[1]) / 2;
  const plainU = 0.08;

  it('splits the barrel into plate courses of about 2.4 m', () => {
    const bounds = [-layout.seamOffset, ...seams, layout.seamOffset];
    for (let i = 1; i < bounds.length; i += 1) {
      expect(bounds[i] - bounds[i - 1]).toBeGreaterThan(2);
      expect(bounds[i] - bounds[i - 1]).toBeLessThan(2.9);
    }
  });

  it('draws every weld as a darker, rougher line wide enough to survive the tank-farm camera', () => {
    const plate = sampleVesselShell(layout, seams, plainU, plainY, radius);
    for (const y of seams) {
      const weld = sampleVesselShell(layout, seams, plainU, y, radius);
      expect(luma(weld.tint)).toBeLessThan(luma(plate.tint) * 0.88);
      expect(weld.roughness).toBeGreaterThan(plate.roughness + 0.05);
    }
    const u = vesselLongitudinalSeamU(1);
    const longitudinal = sampleVesselShell(layout, seams, u, (seams[0] + seams[1]) / 2, radius);
    expect(luma(longitudinal.tint)).toBeLessThan(luma(plate.tint) * 0.88);
    // ~55 px/m from the tank-farm camera: the line is at least 3 px across.
    expect(2 * VESSEL_WELD.core * 55).toBeGreaterThanOrEqual(2);
    expect(2 * VESSEL_WELD.shoulder * 55).toBeGreaterThanOrEqual(6);
  });

  it('streaks the flanks under each crown fitting and nowhere else on the crown', () => {
    for (const nozzle of layout.nozzles) {
      let darkest = 1;
      for (let dy = -nozzle.radius; dy <= nozzle.radius; dy += 0.01)
        for (const u of [VESSEL_CROWN_U - 0.06, VESSEL_CROWN_U + 0.06])
          darkest = Math.min(
            darkest,
            luma(sampleVesselShell(layout, seams, u, nozzle.y + dy, radius).tint)
          );
      // Far along the barrel from any fitting, at the same height on the shell.
      const clearY = layout.nozzles.every((n) => Math.abs(plainY - n.y) > 1.5)
        ? plainY
        : -layout.seamOffset + 0.6;
      const clean = luma(
        sampleVesselShell(layout, seams, VESSEL_CROWN_U - 0.06, clearY, radius).tint
      );
      expect(darkest).toBeLessThan(clean * 0.85);
    }
  });

  it('varies roughness along and round the barrel instead of one even sheen', () => {
    const values: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const u = (i * 0.618) % 1;
      const y = -layout.seamOffset + ((i * 0.377) % 1) * 2 * layout.seamOffset;
      values.push(sampleVesselShell(layout, seams, u, y, radius).roughness);
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.7);
    expect(sd).toBeGreaterThan(0.03);
  });

  it('darkens each head toward its knuckle, so the dish reads as a dome in flat light', () => {
    const half = length / 2 + radius;
    const pole = sampleVesselShell(layout, seams, plainU, half - 0.01, 0.05 * radius);
    const knuckle = sampleVesselShell(
      layout,
      seams,
      plainU,
      layout.seamOffset + 0.05,
      0.97 * radius
    );
    expect(luma(knuckle.tint)).toBeLessThan(luma(pole.tint) * 0.93);
  });

  it('closes round the axis: the lathe u 0/1 column matches', () => {
    for (const y of [plainY, seams[0] + 0.4, -layout.seamOffset + 0.2]) {
      const a = sampleVesselShell(layout, seams, 0.00001, y, radius);
      const b = sampleVesselShell(layout, seams, 0.99999, y, radius);
      expect(Math.abs(luma(a.tint) - luma(b.tint))).toBeLessThan(0.01);
      expect(Math.abs(a.roughness - b.roughness)).toBeLessThan(0.01);
    }
  });
});

describe('vessel lathe uv', () => {
  it('runs v by arc length along the profile, so a metre is a metre everywhere', () => {
    const profile = vesselProfile(3, 10);
    const geometry = vesselShellUvs(new THREE.LatheGeometry(profile, 8), profile);
    const { at, total } = profileArcLengths(profile);
    const uv = geometry.getAttribute('uv');
    for (let j = 0; j < profile.length; j += 1) expect(uv.getY(j)).toBeCloseTo(at[j] / total, 6);
    // The barrel between the beads is most of the map, not one profile step.
    const seam = vesselSeamOffset(3, 10);
    const barrelRows = profile
      .map((p, j) => ({ p, v: uv.getY(j) }))
      .filter(({ p }) => Math.abs(p.y) <= seam + 1e-6);
    const span = Math.max(...barrelRows.map((r) => r.v)) - Math.min(...barrelRows.map((r) => r.v));
    expect(span).toBeGreaterThan(0.6);
  });

  it('bakes sRGB albedo, linear roughness in green and blue, and a unit normal map', () => {
    const maps = generateVesselShellMaps(layoutFor(2.5, 8), 64, 48);
    expect(maps.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(maps.roughnessMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(maps.normalMap.colorSpace).toBe(THREE.NoColorSpace);
    const rough = maps.roughnessMap.image.data as Uint8Array;
    for (let i = 0; i < rough.length; i += 4) {
      expect(rough[i + 1]).toBe(rough[i]);
      expect(rough[i + 2]).toBe(rough[i]);
    }
    const normal = maps.normalMap.image.data as Uint8Array;
    for (let i = 0; i < normal.length; i += 4) {
      const n = [0, 1, 2].map((c) => normal[i + c] / 127.5 - 1);
      expect(Math.hypot(...n)).toBeCloseTo(1, 1);
      expect(n[2]).toBeGreaterThan(0.9);
    }
  });
});
