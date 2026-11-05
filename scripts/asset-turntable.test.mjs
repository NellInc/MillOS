import { describe, expect, it } from 'vitest';
import { gapBounds, parseArgs, probeFlags, selectAssets } from './asset-turntable.mjs';

const manifest = {
  assets: [
    { id: 'world-bus-shelter', file: 'world/bus-shelter.glb' },
    { id: 'village-pub', file: 'village/pub.glb' },
    { id: 'village-school', file: 'village/school.glb' },
  ],
};

const report = (floating, extra = {}) => ({
  boundsThree: { size: { width: 4.4, height: 3, length: 2.3 } },
  probe: {
    floating,
    inconsistentWindingEdges: 0,
    nonManifoldEdges: 0,
    degenerateTriangles: 0,
    ...extra,
  },
});

describe('asset turntable arguments', () => {
  it('requires a selection', () => {
    expect(() => parseArgs([])).toThrow(/Select assets/);
  });

  it('grades a candidate GLB against exactly one asset contract', () => {
    expect(() => parseArgs(['--ids=a,b', '--input=x.glb'])).toThrow(/exactly one/);
    expect(parseArgs(['--ids=a', '--input=x.glb']).input).toBe('x.glb');
  });

  it('rejects unknown flags instead of silently ignoring them', () => {
    expect(() => parseArgs(['--all', '--samples=8', '--colour-only'])).toThrow(/Unsupported/);
  });

  it('selects by area, id and all, and names unknown ids', () => {
    expect(selectAssets(manifest, { area: 'village' }).map((a) => a.id)).toEqual([
      'village-pub',
      'village-school',
    ]);
    expect(selectAssets(manifest, { all: true })).toHaveLength(3);
    expect(() => selectAssets(manifest, { ids: ['nope'] })).toThrow(/nope/);
  });
});

describe('probe flags', () => {
  it('reports the gap as the interval between probe radii', () => {
    expect(gapBounds(0.01)).toEqual({ lower: 0.005, upper: 0.01 });
    expect(gapBounds(0.25)).toEqual({ lower: 0.1, upper: 0.25 });
    expect(gapBounds(null)).toEqual({ lower: 5, upper: null });
  });

  it('fails a clearly detached part and only notes a near-contact one', () => {
    const flags = probeFlags({
      report: report([
        {
          size: 1.2,
          triangles: 12,
          centreThree: [0, 0.95, -0.55],
          heightAboveGround: 0.93,
          gapToOtherGeometryAtMost: 0.25,
        },
        {
          size: 0.14,
          triangles: 64,
          centreThree: [0, 0.25, -0.88],
          heightAboveGround: 0.2,
          gapToOtherGeometryAtMost: 0.02,
        },
        {
          size: 0.01,
          triangles: 8,
          centreThree: [0, 1, 0],
          heightAboveGround: 1,
          gapToOtherGeometryAtMost: null,
        },
      ]),
      validation: { errors: [] },
    });
    expect(flags.map((f) => `${f.severity}:${f.code}`)).toEqual(['fail:floating', 'note:floating']);
  });

  it('fails a part with nothing near it at all', () => {
    const [flag] = probeFlags({
      report: report([
        {
          size: 0.5,
          triangles: 12,
          centreThree: [0, 9, 0],
          heightAboveGround: 8,
          gapToOtherGeometryAtMost: null,
        },
      ]),
      validation: { errors: [] },
    });
    expect(flag.severity).toBe('fail');
    expect(flag.detail).toMatch(/> 5 m/);
  });

  it('turns contract errors into fails and mesh facts into notes', () => {
    const flags = probeFlags({
      report: report([], { inconsistentWindingEdges: 3, nonManifoldEdges: 2 }),
      validation: { errors: ['file-size: 700000 <= 620000 bytes'] },
    });
    expect(flags.map((f) => `${f.severity}:${f.code}`)).toEqual([
      'fail:contract',
      'note:winding',
      'note:non-manifold',
    ]);
  });

  it('fails when the Blender probe produced nothing', () => {
    expect(probeFlags({ report: null, validation: { errors: [] } })[0].code).toBe('probe-missing');
  });
});
