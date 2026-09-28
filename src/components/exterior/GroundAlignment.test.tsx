import { describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Euler, Vector3 } from 'three';
import { GravelPath, HedgeRow } from '../FactoryExterior';
import { hedgeCrownTransforms } from './HedgeFoliage';

vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

type Triple = [number, number, number];
type Placement = { position: Triple; rotation: Triple; size?: Triple; children?: ReactNode };

const spans: Array<[Triple, Triple]> = [
  [
    [95, 0, 90],
    [110, 0, 100],
  ],
  [
    [95, 0, 85],
    [120, 0, 100],
  ],
  [
    [-100, 0, 95],
    [-125, 0, 105],
  ],
  [
    [100, 0, -85],
    [115, 0, -110],
  ],
  [
    [-130, 0, 90],
    [-130, 0, 60],
  ],
  [
    [-10, 0, -128],
    [10, 0, -128],
  ],
];

describe('exterior path and hedge centreline placement', () => {
  it.each(spans)('joins both authored endpoints %j to %j', (start, end) => {
    const hedge = HedgeRow({ start, end }) as ReactElement<Placement>;
    const path = GravelPath({ start, end }) as ReactElement<Placement>;
    const pathMesh = Children.toArray(path.props.children).find(
      (child) => isValidElement(child) && child.type === 'mesh'
    ) as ReactElement<Placement>;
    const geometry = Children.toArray(pathMesh.props.children)[0] as ReactElement<{
      args: [number, number];
    }>;
    for (const [element, length, childRotation] of [
      [hedge, hedge.props.size![2], null],
      [path, geometry.props.args[1], pathMesh.props.rotation],
    ] as const) {
      const endpoints = [-1, 1].map((sign) => {
        const point = childRotation
          ? new Vector3(0, (sign * length) / 2, 0).applyEuler(new Euler(...childRotation))
          : new Vector3(0, 0, (sign * length) / 2);
        point
          .applyEuler(new Euler(...element.props.rotation))
          .add(new Vector3(...element.props.position));
        return point;
      });
      for (const expected of [start, end]) {
        expect(
          Math.min(
            ...endpoints.map((point) => Math.hypot(point.x - expected[0], point.z - expected[2]))
          )
        ).toBeLessThan(1e-8);
      }
    }
  });
});

it('keeps varied overlapping hedge crowns in the clipped row envelope', () => {
  const [width, height, length] = [0.6, 0.8, 18];
  const crowns = hedgeCrownTransforms(width, height, length);
  expect(crowns.length).toBeLessThan(90);
  expect(new Set(crowns.map((c) => c.scale[1])).size).toBeGreaterThan(20);
  for (const c of crowns) {
    expect(Math.abs(c.position[0]) + c.scale[0] / 2).toBeLessThanOrEqual(width / 2 + 1e-8);
    expect(c.position[1] + c.scale[1] / 2).toBeLessThanOrEqual(height / 2 + 1e-8);
    expect(c.position[1] - c.scale[1] / 2).toBeCloseTo(-height / 2);
    expect(Math.abs(c.position[2]) + c.scale[2] / 2).toBeLessThanOrEqual(length / 2 + 1e-8);
  }
  expect(crowns[2].position[2] - crowns[0].position[2]).toBeLessThan(crowns[0].scale[2]);
});
