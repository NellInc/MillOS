import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  PropaneTank,
  StorageTank,
  VESSEL_BEAD,
  VESSEL_FLANGE,
  VESSEL_SEAM_BAND,
  vesselProfile,
  vesselSeamOffset,
  vesselShellMaterial,
} from '../FactoryExterior';
import { applyBatchWorldSurface } from '../../utils/worldSurface';
import {
  utilityLadderLayout,
  createUtilityTankHardware,
  createLpgHardware,
  createUtilityPressureFace,
  resolveUtilityPressure,
  utilityPressureAngle,
} from './utilityVesselDetails';

describe('painted pressure-vessel fallback lighting', () => {
  it('keeps both generated-asset fallbacks non-emissive at every supported size', () => {
    for (const tree of [
      StorageTank({ position: [0, 0, 0], radius: 3, length: 10 }),
      StorageTank({ position: [0, 0, 0], radius: 2.5, length: 8 }),
      PropaneTank({ position: [0, 0, 0], radius: 1.5, height: 5 }),
      PropaneTank({ position: [0, 0, 0], radius: 1.2, height: 4 }),
    ]) {
      if (tree instanceof Promise) throw new Error('Tank assembly must be synchronous');
      const surfaces: Record<string, unknown>[] = [];
      const visit = (node: ReactNode) =>
        Children.forEach(node, (child) => {
          if (!isValidElement<Record<string, unknown>>(child)) return;
          if (child.type === 'meshStandardMaterial' && child.props.roughness === 0.64)
            surfaces.push(child.props);
          visit(child.props.children as ReactNode);
          visit(child.props.fallback as ReactNode);
        });
      visit(tree);
      expect(surfaces.length).toBeGreaterThan(0);
      for (const surface of surfaces) expect(surface.emissiveIntensity ?? 0).toBe(0);
    }
  });
});

describe('utility vessel service craft', () => {
  it('grounds both complete ladder sizes and seats every bracket on the actual barrel', () => {
    for (const radius of [2.5, 3]) {
      const l = utilityLadderLayout(radius);
      expect(l.rail[0]).toEqual([0, 0.05, -radius - 0.25]);
      expect(l.rail.at(-1)![1]).toBeCloseTo(2 * radius + 1.75);
      expect(l.rail.at(-1)![2]).toBeCloseTo(0);
      expect(l.rungs.at(-1)).toEqual(l.rail.at(-1));
      expect(l.spacing).toBeLessThanOrEqual(0.3);
      expect(l.rungs.length).toBeGreaterThan(25);
      for (const m of l.mounts) {
        expect(Math.hypot(m.shell[1] - l.centre, m.shell[2])).toBeCloseTo(radius);
        expect(m.rail[2]).toBeLessThan(m.shell[2]);
      }
    }
  });
  it('merges finite opaque hardware with pad-level feet and bounded vessel envelopes', () => {
    for (const [r, length] of [
      [2.5, 8],
      [3, 10],
    ]) {
      const g = createUtilityTankHardware(r, length),
        p = g.attributes.position;
      expect(g.boundingBox!.min.y).toBeCloseTo(0);
      expect(g.boundingBox!.min.z).toBeGreaterThan(-r - 0.5);
      expect(g.boundingBox!.max.x).toBeLessThan(length / 2);
      expect(p.count / 3).toBeLessThan(5000);
      for (const key of ['position', 'normal', 'color'])
        expect(Array.from(g.attributes[key].array).every(Number.isFinite)).toBe(true);
      g.dispose();
    }
    for (const [r, h] of [
      [1.5, 5],
      [1.2, 4],
    ]) {
      const g = createLpgHardware(r, h);
      expect(g.boundingBox!.min.y).toBeCloseTo(h + r + 0.46);
      g.dispose();
    }
    const face = createUtilityPressureFace();
    expect(face.boundingBox!.max.z).toBeGreaterThan(0.06);
    face.dispose();
  });
  it('matches finite SCADA-first panel readings and preserves real zero without inventing missing data', () => {
    expect(resolveUtilityPressure(0, 7.4)).toEqual({ pressureBar: 0, source: 'scada' });
    expect(resolveUtilityPressure(8.2, 7.4)).toEqual({ pressureBar: 8.2, source: 'scada' });
    expect(resolveUtilityPressure(NaN, 7.4)).toEqual({ pressureBar: 7.4, source: 'campaign' });
    expect(resolveUtilityPressure('7.4', 0)).toEqual({ pressureBar: 0, source: 'campaign' });
    expect(resolveUtilityPressure(undefined, Infinity)).toBeNull();
    expect(utilityPressureAngle(0)).toBeCloseTo(Math.PI * 0.75);
    expect(utilityPressureAngle(8)).toBeCloseTo(0);
    expect(utilityPressureAngle(16)).toBeCloseTo(-Math.PI * 0.75);
    expect(utilityPressureAngle(-2)).toEqual(utilityPressureAngle(0));
    expect(utilityPressureAngle(20)).toEqual(utilityPressureAngle(16));
  });
});

describe('pressure-vessel heads', () => {
  it.each([
    [3, 10],
    [2.5, 8],
    [1.5, 5],
    [1.2, 4],
  ])(
    'ends a %s m vessel in 2:1 elliptical heads with a weld bead at each seam',
    (radius, length) => {
      const points = vesselProfile(radius, length);
      const half = length / 2 + radius;
      const depth = radius / 2;
      // Envelope: pole to pole is unchanged.
      expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(-half, 9);
      expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(half, 9);
      // Every point beyond the head's tangent line lies on the 2:1 ellipse.
      for (const p of points.filter((q) => Math.abs(q.y) > half - depth + 1e-9)) {
        const along = (Math.abs(p.y) - (half - depth)) / depth;
        expect((p.x / radius) ** 2 + along ** 2).toBeCloseTo(1, 6);
      }
      // The only points standing proud of the shell are the two weld beads, and
      // each sits just inboard of its head's tangent line.
      const proud = points.filter((p) => p.x > radius + 1e-9);
      expect(proud.length).toBeGreaterThan(0);
      for (const p of proud) {
        const fromTangent = half - depth - Math.abs(p.y);
        expect(fromTangent).toBeGreaterThan(0);
        expect(fromTangent).toBeLessThanOrEqual((VESSEL_FLANGE + VESSEL_BEAD.width) * radius);
        expect(p.x).toBeCloseTo(radius * (1 + VESSEL_BEAD.height), 9);
      }
      expect(proud.some((p) => p.y > 0)).toBe(true);
      expect(proud.some((p) => p.y < 0)).toBe(true);
      // The darker seam band sits on each bead and stands proud of it.
      const seam = vesselSeamOffset(radius, length);
      for (const p of proud)
        expect(Math.abs(Math.abs(p.y) - seam)).toBeLessThan(VESSEL_BEAD.width * radius);
      expect(VESSEL_SEAM_BAND.height).toBeGreaterThan(VESSEL_BEAD.height);
      expect(VESSEL_SEAM_BAND.width * radius).toBeGreaterThan(VESSEL_BEAD.width * radius);
    }
  );

  it('draws both tank families with the vessel lathe, not the generated shells', () => {
    const assets: unknown[] = [];
    const visit = (node: ReactNode) =>
      Children.forEach(node, (child) => {
        if (!isValidElement<Record<string, unknown>>(child)) return;
        if (child.props.asset) assets.push(child.props.asset);
        visit(child.props.children as ReactNode);
        visit(child.props.fallback as ReactNode);
      });
    for (const tree of [
      StorageTank({ position: [0, 0, 0], radius: 3, length: 10, color: '#dce4e5' }),
      StorageTank({ position: [0, 0, 0], radius: 2.5, length: 8, color: '#eef1ed' }),
      PropaneTank({ position: [0, 0, 0], radius: 1.5, height: 5 }),
      PropaneTank({ position: [0, 0, 0], radius: 1.2, height: 4 }),
    ])
      visit(tree as ReactNode);
    for (const shell of [
      'utilityFuelShell',
      'utilityProcessShell',
      'propaneLargeShell',
      'propaneSmallShell',
    ])
      expect(assets).not.toContain(shell);
  });
});

describe('vessel paint', () => {
  it('keeps the lathe shells near-constant white with one satin highlight, through the batch', () => {
    // final-med-12 tank-farm: the shells read as cotton under `painted` (meso,
    // splash grime, crown dust) at roughness 0.5, with no highlight. The shells
    // are static-batched, and the batcher re-finishes the merged clone from
    // the source, so the finish has to be pinned to survive it.
    for (const color of ['#dce4e5', '#eef1ed']) {
      const material = vesselShellMaterial(color);
      expect(material.roughness).toBeCloseTo(0.4, 5);
      expect(material.userData.millosWorldSurfaceProfile).toBe('vessel');
      const merged = material.clone();
      expect(applyBatchWorldSurface(merged, material)).toBe('vessel');
      merged.dispose();
    }
  });
});
