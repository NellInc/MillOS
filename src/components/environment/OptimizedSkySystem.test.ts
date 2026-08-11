import { describe, expect, it } from 'vitest';
import {
  MOUNTAIN_ENCLOSURE_SPECS,
  MOUNTAIN_RIDGE_SEGMENTS,
  createMountainRidgeGeometry,
} from './OptimizedSkySystem';

describe('mountain ridge geometry', () => {
  it('creates a finite, closed slope with radial depth', () => {
    const geometry = createMountainRidgeGeometry({
      radius: 260,
      baseY: -16,
      minHeight: 20,
      maxHeight: 42,
      slopeDepth: 16,
      valleyFloor: 0.08,
      snowLine: 0.7,
      seed: 1.2,
      colors: ['#31483d', '#70817d', '#dce4e4'],
    });
    const positions = geometry.getAttribute('position');
    const rows = 5;
    const finalSegmentOffset = MOUNTAIN_RIDGE_SEGMENTS * rows;

    for (let index = 0; index < positions.array.length; index += 1) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }
    for (let row = 0; row < rows; row += 1) {
      expect(positions.getX(row)).toBeCloseTo(positions.getX(finalSegmentOffset + row), 5);
      expect(positions.getY(row)).toBeCloseTo(positions.getY(finalSegmentOffset + row), 5);
      expect(positions.getZ(row)).toBeCloseTo(positions.getZ(finalSegmentOffset + row), 5);
    }

    const baseRadius = Math.hypot(positions.getX(0), positions.getZ(0));
    const peakRadius = Math.hypot(positions.getX(rows - 1), positions.getZ(rows - 1));
    expect(peakRadius - baseRadius).toBeGreaterThan(12);
    expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);

    geometry.dispose();
  });

  it('carries true-albedo vertex colour and a normalised ridge height', () => {
    // THE DEFECT THIS GUARDS. The three palettes used to have aerial
    // perspective painted into them, which is why the far ring read as a flat
    // grey cut-out under any lighting. The material applies extinction per
    // channel at runtime now, so the geometry must ship albedo and a height
    // term and nothing else - double-applying haze is the failure mode.
    const geometry = createMountainRidgeGeometry({
      radius: 300,
      baseY: -17,
      minHeight: 4,
      maxHeight: 76,
      slopeDepth: 18,
      valleyFloor: 0.3,
      snowLine: 0.63,
      seed: 0.37,
      colors: ['#42574c', '#717a76', '#e9eff2'],
    });

    const heights = geometry.getAttribute('ridgeHeight');
    const positions = geometry.getAttribute('position');
    expect(heights.itemSize).toBe(1);
    expect(heights.count).toBe(positions.count);

    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < heights.count; index += 1) {
      const value = heights.getX(index);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
    // Needs real spread or the valley-haze term does nothing.
    expect(maximum - minimum).toBeGreaterThan(0.4);

    // Normals must be meaningful: the material is lit now, and an unlit ring is
    // exactly the flat cut-out this work exists to remove.
    const normals = geometry.getAttribute('normal');
    expect(normals).toBeDefined();
    let nonVertical = 0;
    for (let index = 0; index < normals.count; index += 1) {
      const length = Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index));
      expect(length).toBeCloseTo(1, 3);
      if (Math.abs(normals.getY(index)) < 0.98) nonVertical += 1;
    }
    expect(nonVertical).toBeGreaterThan(normals.count * 0.5);

    geometry.dispose();
  });

  it('resolves the summit finely enough to hide facet chords', () => {
    // 192 segments put a facet edge every 1.875 degrees, plainly visible as
    // straight chords along a summit at a ring radius of 280-325.
    expect(MOUNTAIN_RIDGE_SEGMENTS).toBeGreaterThanOrEqual(384);
  });

  it('keeps every enclosure layer above the terrain horizon', () => {
    const minimumSummits = { far: 29, mid: 18, near: 12 } as const;

    for (const key of ['far', 'mid', 'near'] as const) {
      const geometry = createMountainRidgeGeometry(MOUNTAIN_ENCLOSURE_SPECS[key]);
      const positions = geometry.getAttribute('position');
      const summitYs: number[] = [];
      for (let segment = 0; segment <= MOUNTAIN_RIDGE_SEGMENTS; segment += 1) {
        summitYs.push(positions.getY(segment * 5 + 4));
      }

      expect(Math.min(...summitYs)).toBeGreaterThanOrEqual(minimumSummits[key]);
      expect(Math.max(...summitYs) - Math.min(...summitYs)).toBeGreaterThan(20);
      geometry.dispose();
    }
  });
});
