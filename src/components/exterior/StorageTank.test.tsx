import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { PropaneTank, StorageTank } from '../FactoryExterior';
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
