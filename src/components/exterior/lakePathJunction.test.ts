import { readFileSync } from 'node:fs';
import { Children, isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CurvedPath, LAKE_APPROACH_TURN, LAKE_LOOP_PATH } from '../FactoryExterior';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

type CurvedProps = Parameters<typeof CurvedPath>[0];
type Node = ReactElement<{
  position?: [number, number, number];
  rotation?: [number, number, number];
  children?: unknown;
  width?: number;
  length?: number;
  polygonOffsetFactor?: number;
}>;

interface Quad {
  cx: number;
  cz: number;
  /** Unit vector along the chord, world X/Z. */
  ux: number;
  uz: number;
  halfAlong: number;
  halfAcross: number;
  bias: number;
}

const kids = (node: Node) => Children.toArray(node.props.children).filter(isValidElement) as Node[];

/** The quads CurvedPath actually emits, read off its element tree. */
function quads(props: CurvedProps): Quad[] {
  const root = CurvedPath(props) as Node;
  const [ox, , oz] = root.props.position!;
  return kids(root).map((segment) => {
    const [mx, , mz] = segment.props.position!;
    const yaw = segment.props.rotation![1];
    const mesh = kids(segment)[0];
    const [geometry, material] = kids(mesh);
    return {
      cx: ox + mx,
      cz: oz + mz,
      // three's Ry(yaw) carries local +X to (cos yaw, -sin yaw) in X/Z.
      ux: Math.cos(yaw),
      uz: -Math.sin(yaw),
      halfAlong: geometry.props.width! / 2,
      halfAcross: geometry.props.length! / 2,
      bias: material.props.polygonOffsetFactor!,
    };
  });
}

const inside = (q: Quad, x: number, z: number) => {
  const along = (x - q.cx) * q.ux + (z - q.cz) * q.uz;
  const across = -(x - q.cx) * q.uz + (z - q.cz) * q.ux;
  return Math.abs(along) <= q.halfAlong + 1e-9 && Math.abs(across) <= q.halfAcross + 1e-9;
};

/** The far end edge of a path's last quad: both corners and the middle. */
function endEdge(path: Quad[]) {
  const q = path[path.length - 1];
  const ex = q.cx + q.ux * q.halfAlong;
  const ez = q.cz + q.uz * q.halfAlong;
  return [-1, 0, 1].map(
    (s) => [ex - q.uz * q.halfAcross * s, ez + q.ux * q.halfAcross * s] as const
  );
}

describe('the lake approach turn meets the lakeside loop', () => {
  const loop = quads(LAKE_LOOP_PATH);

  it('reaches the loop across its whole end, with no grass between', () => {
    for (const [x, z] of endEdge(quads(LAKE_APPROACH_TURN)))
      expect(
        loop.some((q) => inside(q, x, z)),
        `${x.toFixed(2)},${z.toFixed(2)}`
      ).toBe(true);
  });

  it('would fall short at the old end angle, so the check can fail', () => {
    const short = endEdge(quads({ ...LAKE_APPROACH_TURN, endAngle: 0 }));
    expect(short.some(([x, z]) => !loop.some((q) => inside(q, x, z)))).toBe(true);
  });

  it('sits one depth step behind the loop, so the loop draws over the overlap', () => {
    const turn = quads(LAKE_APPROACH_TURN);
    expect(turn.every((q) => q.bias === POLYGON_OFFSET.standard.factor)).toBe(true);
    expect(loop.every((q) => q.bias === POLYGON_OFFSET.moderate.factor)).toBe(true);
    const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(source).toContain('<CurvedPath {...LAKE_APPROACH_TURN} />');
    expect(source).toContain('<CurvedPath {...LAKE_LOOP_PATH} />');
  });
});
