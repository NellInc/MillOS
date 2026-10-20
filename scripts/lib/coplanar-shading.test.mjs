// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { coplanarPieces, makeTriangle, shadingAt, shadingDifference } from './coplanar-shading.mjs';

// A unit quad on y = height facing +y (or -y), as two triangles.
const quad = (height, extra = {}, { x0 = 0, x1 = 1, up = true } = {}) => {
  const a = [x0, height, 0];
  const b = [x1, height, 0];
  const c = [x1, height, 1];
  const d = [x0, height, 1];
  const tris = up
    ? [makeTriangle(a, d, c, extra), makeTriangle(a, c, b, extra)]
    : [makeTriangle(a, c, d, extra), makeTriangle(a, b, c, extra)];
  return tris;
};
const white = {
  colours: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
};
const red = {
  colours: [
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
  ],
};

function differing(tris) {
  return coplanarPieces(tris)
    .map((piece) => ({
      piece,
      reasons: shadingDifference(
        shadingAt(tris[piece.i], piece.centre),
        shadingAt(tris[piece.j], piece.centre)
      ),
    }))
    .filter((entry) => entry.reasons.length);
}
const areaOf = (entries) => entries.reduce((sum, entry) => sum + entry.piece.area, 0);

describe('coplanar shading sweep', () => {
  test('a flush two-colour face is found with its whole overlap', () => {
    const found = differing([...quad(0, white), ...quad(0, red, { x0: 0.5, x1: 1.5 })]);
    expect(found.every((entry) => entry.reasons.includes('colour'))).toBe(true);
    expect(areaOf(found)).toBeCloseTo(0.5, 6);
  });

  test('a flush face of the same colour and material is not a finding', () => {
    expect(differing([...quad(0, white), ...quad(0, white, { x0: 0.5, x1: 1.5 })])).toEqual([]);
    // ...but it is still a coplanar piece, so the geometry stage did see it.
    expect(
      coplanarPieces([...quad(0, white), ...quad(0, white, { x0: 0.5, x1: 1.5 })]).length
    ).toBeGreaterThan(0);
  });

  test('separation: 0.5 mm counts, 2 mm does not', () => {
    expect(areaOf(differing([...quad(0, white), ...quad(0.0005, red)]))).toBeCloseTo(1, 6);
    expect(differing([...quad(0, white), ...quad(0.002, red)])).toEqual([]);
  });

  test('opposite facing counts only on a double-sided material', () => {
    expect(differing([...quad(0, white), ...quad(0, red, { up: false })])).toEqual([]);
    const doubled = differing([
      ...quad(0, { ...white, doubleSided: true }),
      ...quad(0, { ...red, doubleSided: true }, { up: false }),
    ]);
    expect(areaOf(doubled)).toBeCloseTo(1, 6);
  });

  test('textures are compared by the texel they return, not by UV', () => {
    // A 2x1 atlas: left half grey, right half grey too, then a red one.
    const atlas = (texels) => ({
      texCoord: 0,
      sample: ([u]) => texels[Math.min(texels.length - 1, Math.floor(u * texels.length))],
    });
    const uvAt = (u) => ({
      0: [
        [u, 0],
        [u, 0],
        [u, 0],
      ],
    });
    const sameTile = atlas([
      [90, 90, 90, 255],
      [90, 90, 90, 255],
    ]);
    const twoTiles = atlas([
      [90, 90, 90, 255],
      [200, 20, 20, 255],
    ]);
    const flat = (sampler, u) => ({ materialKey: 'm', textures: { base: sampler }, uvs: uvAt(u) });
    expect(differing([...quad(0, flat(sameTile, 0.25)), ...quad(0, flat(sameTile, 0.75))])).toEqual(
      []
    );
    const found = differing([...quad(0, flat(twoTiles, 0.25)), ...quad(0, flat(twoTiles, 0.75))]);
    expect(found.every((entry) => entry.reasons.includes('texture:base'))).toBe(true);
    expect(areaOf(found)).toBeCloseTo(1, 6);
  });

  test('different material factors are a shading difference', () => {
    const found = differing([...quad(0, { materialKey: 'a' }), ...quad(0, { materialKey: 'b' })]);
    expect(areaOf(found)).toBeCloseTo(1, 6);
    expect(found[0].reasons).toEqual(['material']);
  });
});
