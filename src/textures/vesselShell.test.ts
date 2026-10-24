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
import {
  storageTankShellLayout,
  vesselProfile,
  vesselSeamOffset,
} from '../components/FactoryExterior';

const layoutFor = (radius: number, length: number): VesselShellLayout =>
  storageTankShellLayout(radius, length);
/** `VESSEL_HEAD_DEPTH` in FactoryExterior: a 2:1 head is half a radius deep. */
const VESSEL_HEAD_DEPTH_FOR_TEST = 0.5;
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

  /**
   * final4 med-12 read the welds as near-black rings and med-22 / med-1830 as
   * doubled seam lines: a 0.3 darkening over a 6 cm shoulder, a map weld at
   * each head seam beside the proud seam band, and longitudinal seams
   * staggered either side of the crown.
   */
  it('draws each course weld as one crisp line in the shell paint, a shade darker, never black', () => {
    // Clear of every run-off streak (they cross welds by design). Was 0.98,
    // which since round 8 lies in the grime band above the saddle horns (a
    // course weld stands 0.5 m from the 10 m tank's saddles); 0.05 is a
    // second point on the upper flank, above that band's reach and clear of
    // the ladder's streaks.
    for (const u of [plainU, 0.05]) {
      for (const y of seams) {
        const weld = sampleVesselShell(layout, seams, u, y, radius);
        const plate = sampleVesselShell(layout, seams, u, y + 0.08, radius);
        const ratio = luma(weld.tint) / luma(plate.tint);
        expect(ratio).toBeGreaterThan(0.86);
        expect(ratio).toBeLessThan(0.96);
        expect(weld.roughness).toBeGreaterThan(plate.roughness + 0.05);
        // One line: 5 cm off the weld centre the plate is back.
        const beside = sampleVesselShell(layout, seams, u, y + 0.05, radius);
        expect(luma(beside.tint) / luma(plate.tint)).toBeGreaterThan(0.98);
      }
      // No map weld at the head seams: the seam band stands there.
      for (const y of [-layout.seamOffset + 0.01, layout.seamOffset - 0.01]) {
        const edge = sampleVesselShell(layout, seams, u, y, radius);
        const inside = sampleVesselShell(layout, seams, u, y - Math.sign(y) * 0.1, radius);
        expect(luma(edge.tint) / luma(inside.tint)).toBeGreaterThan(0.97);
      }
    }
    // Longitudinal seams lie on the underside, out of the upper-flank view.
    for (let course = 0; course < seams.length + 1; course += 1) {
      const turn = Math.abs(vesselLongitudinalSeamU(course) - VESSEL_CROWN_U);
      expect(Math.min(turn, 1 - turn)).toBeGreaterThan(0.35);
    }
    // ~55 px/m from the tank-farm camera: the whole line is 3-4 px across.
    expect(2 * VESSEL_WELD.shoulder * 55).toBeGreaterThanOrEqual(3);
    expect(2 * VESSEL_WELD.shoulder * 55).toBeLessThan(5);
  });

  it('lays no fine streak field on the flanks: no creases along the axis away from fittings', () => {
    // Round 4's 0.15 m rain field aliased into vertical creases (final4 med-22).
    const from = seams[seams.length - 1] + 0.1;
    const to = layout.seamOffset - 0.1;
    for (const u of [0.12, 0.17, 0.33, 0.38]) {
      let step = 0;
      let previous = luma(sampleVesselShell(layout, seams, u, from, radius).tint);
      for (let y = from + 0.02; y <= to; y += 0.02) {
        const value = luma(sampleVesselShell(layout, seams, u, y, radius).tint);
        step = Math.max(step, Math.abs(value - previous));
        previous = value;
      }
      expect(step, `u ${u}`).toBeLessThan(0.004);
    }
  });

  it('streaks the flank under each of the ladder brackets', () => {
    expect(layout.flankFittings?.length).toBeGreaterThan(0);
    for (const fitting of layout.flankFittings ?? []) {
      // 0.3 m further round from the crown than the bracket, on its flank.
      const away = fitting.u > VESSEL_CROWN_U && fitting.u < VESSEL_CROWN_U + 0.5 ? 1 : -1;
      const u = (fitting.u + away * (0.3 / (2 * Math.PI * radius)) + 1) % 1;
      let darkest = 1;
      for (let dy = -fitting.span; dy <= fitting.span; dy += 0.01)
        darkest = Math.min(
          darkest,
          luma(sampleVesselShell(layout, seams, u, fitting.y + dy, radius).tint)
        );
      const clean = luma(sampleVesselShell(layout, seams, u, layout.seamOffset - 0.6, radius).tint);
      expect(darkest).toBeLessThan(clean * 0.9);
    }
  });

  it('darkens and roughens the shell where it beds in each saddle', () => {
    const saddles = layout.saddles!;
    // A hand's width below the cradle's horn, on either flank.
    const fromBottom = saddles.halfAngle * radius - 0.1;
    for (const side of [-1, 1]) {
      const u = (VESSEL_CROWN_U + 0.5 + (side * fromBottom) / (2 * Math.PI * radius) + 1) % 1;
      for (const ys of saddles.ys) {
        const bed = sampleVesselShell(layout, seams, u, ys, radius);
        const clear = sampleVesselShell(layout, seams, u, ys + Math.sign(ys) * -1.2, radius);
        expect(luma(bed.tint)).toBeLessThan(luma(clear.tint) * 0.88);
        expect(bed.roughness).toBeGreaterThan(clear.roughness + 0.1);
      }
    }
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

  /**
   * final7-med-12 verdict item 1: no drip tracks at the nozzle and manway
   * penetrations. The round-5 streaks were 10-22 cm wide and faded in over
   * 12 cm, so from the tank-farm camera they read as no mark at all; the
   * broad soft head streaks that replaced them read as fabric creases and
   * were reverted (0e1f892f). A drip track is narrow and starts hard at the
   * fitting's edge.
   */
  it('lays narrow, hard-topped drip tracks under each crown fitting', () => {
    const circumference = 2 * Math.PI * radius;
    // Clear of every fitting, weld and saddle, on the same flank.
    const clearY = -layout.seamOffset + 0.6;
    for (const nozzle of layout.nozzles) {
      const start = (nozzle.radius * 0.7) / circumference;
      for (const side of [-1, 1]) {
        const uAt = (fall: number) => VESSEL_CROWN_U + side * (start + fall / circumference);
        const darkness = (u: number, y: number) =>
          1 -
          luma(sampleVesselShell(layout, seams, u, y, radius).tint) /
            luma(sampleVesselShell(layout, seams, u, clearY, radius).tint);
        // The darkest track 0.3 m down the flank.
        let best = { y: nozzle.y, d: 0 };
        for (
          let y = nozzle.y - nozzle.radius - 0.5;
          y <= nozzle.y + nozzle.radius + 0.5;
          y += 0.005
        ) {
          const d = darkness(uAt(0.3), y);
          if (d > best.d) best = { y, d };
        }
        expect(best.d, `nozzle ${nozzle.y} side ${side}`).toBeGreaterThan(0.25);
        // Narrow: under 12 cm across at half its depth.
        let width = 0.0025;
        for (const dir of [-1, 1])
          for (let dy = 0.0025; dy <= 0.2; dy += 0.0025) {
            if (darkness(uAt(0.3), best.y + dir * dy) <= best.d / 2) break;
            width += 0.0025;
          }
        expect(width, `nozzle ${nozzle.y} side ${side}`).toBeLessThan(0.12);
        // Hard-topped: 2 cm below the fitting's edge it is already near full.
        expect(darkness(uAt(0.02), best.y)).toBeGreaterThan(best.d * 0.8);
      }
    }
  });

  /**
   * final7-med-12: no grime band at the saddle contact. The cradle term ended
   * 0.3 m above the horn, ~20 degrees below the equator, where the shell is in
   * its own shade at noon and darkening it changed nothing a camera could see.
   */
  it('runs a grime band up the flank from each saddle horn, confined to the saddle', () => {
    const saddles = layout.saddles!;
    const circumference = 2 * Math.PI * radius;
    const horn = saddles.halfAngle * radius;
    for (const side of [-1, 1]) {
      const uFrom = (fromBottom: number) =>
        (VESSEL_CROWN_U + 0.5 + (side * fromBottom) / circumference + 1) % 1;
      for (const ys of saddles.ys) {
        const away = ys - Math.sign(ys) * 1.2;
        for (const above of [0.4, 0.9]) {
          const u = uFrom(horn + above);
          const band = luma(sampleVesselShell(layout, seams, u, ys, radius).tint);
          const clear = luma(sampleVesselShell(layout, seams, u, away, radius).tint);
          expect(band, `${above} m above the horn`).toBeLessThan(clear * 0.9);
        }
        // Not up to the crown, and not along the barrel.
        const high = uFrom(horn + 2.4);
        expect(
          luma(sampleVesselShell(layout, seams, high, ys, radius).tint) /
            luma(sampleVesselShell(layout, seams, high, away, radius).tint)
        ).toBeGreaterThan(0.97);
        const beside = ys + Math.sign(ys) * (saddles.width / 2 + 0.45);
        const u = uFrom(horn + 0.4);
        expect(
          luma(sampleVesselShell(layout, seams, u, beside, radius).tint) /
            luma(sampleVesselShell(layout, seams, u, away, radius).tint)
        ).toBeGreaterThan(0.97);
      }
    }
  });

  /**
   * final7-med-12: "no roughness drift" on the heads, which fill half the
   * tank-farm frame. Measured round one ring of the dish, so the knuckle's
   * own radial gradient does not count.
   */
  it('drifts the roughness round each head, not one even satin', () => {
    const half = length / 2 + radius;
    for (const sign of [-1, 1]) {
      const values: number[] = [];
      for (let i = 0; i < 360; i += 1) {
        const t = 0.6;
        const y = sign * (half - VESSEL_HEAD_DEPTH_FOR_TEST * radius * (1 - Math.sqrt(1 - t * t)));
        values.push(sampleVesselShell(layout, seams, i / 360, y, t * radius).roughness);
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      expect(sd, `head ${sign}`).toBeGreaterThan(0.04);
      expect(sd, `head ${sign}`).toBeLessThan(0.12);
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
    expect(mean).toBeGreaterThan(0.38);
    expect(mean).toBeLessThan(0.7);
    expect(sd).toBeGreaterThan(0.05);
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
