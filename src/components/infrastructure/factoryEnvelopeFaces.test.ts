import { describe, expect, it } from 'vitest';
import {
  buildFactoryLowerWallSegments,
  buildFactoryParapetCopeChamfers,
  buildFactoryParapetSegments,
  buildFactoryPortalFrames,
  buildFactoryShellColumns,
} from './OptimizedFactoryInfrastructure';

type Box = {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
};

/**
 * Same-facing coplanar faces with overlapping area between two box sets. Only
 * the faces along `axis` are compared; a box rotated about `axis` keeps those
 * faces in place, and its in-plane extent is taken as its bounding square.
 */
function sharedFaces(a: readonly Box[], b: readonly Box[], axes: readonly number[] = [0, 1, 2]) {
  const extent = (box: Box, axis: number, along: number) => {
    const rotated = box.rotation?.some((angle) => angle !== 0);
    const half = rotated
      ? Math.hypot(...[0, 1, 2].filter((k) => k !== axis).map((k) => box.scale[k])) / 2
      : box.scale[along] / 2;
    return [box.position[along] - half, box.position[along] + half];
  };
  const hits: string[] = [];
  for (const axis of axes) {
    const [u, v] = [0, 1, 2].filter((k) => k !== axis);
    for (const p of a)
      for (const q of b)
        for (const sign of [-1, 1]) {
          const dp = p.position[axis] + (sign * p.scale[axis]) / 2;
          const dq = q.position[axis] + (sign * q.scale[axis]) / 2;
          if (Math.abs(dp - dq) > 1e-6) continue;
          const [pu0, pu1] = extent(p, axis, u);
          const [qu0, qu1] = extent(q, axis, u);
          const [pv0, pv1] = extent(p, axis, v);
          const [qv0, qv1] = extent(q, axis, v);
          const area =
            Math.max(0, Math.min(pu1, qu1) - Math.max(pu0, qu0)) *
            Math.max(0, Math.min(pv1, qv1) - Math.max(pv0, qv0));
          if (area > 1e-6)
            hits.push(`axis ${axis} at ${dp.toFixed(3)}: ${p.position} / ${q.position}`);
        }
  }
  return hits;
}

describe('factory envelope coincident faces', () => {
  it('stands every portal jamb clear of the wall plinth end it meets', () => {
    // Each jamb's inner face lay exactly on the plinth's end face at the
    // opening edge: structural steel against concrete at 0 mm, seen by every
    // forklift passing through the shipping and service portals.
    // Vertical faces only: both stand on the ground, so their bottoms are
    // coplanar by construction and face down into the slab.
    const jambs = buildFactoryPortalFrames().filter((box) => !box.rotation);
    expect(sharedFaces(jambs, buildFactoryLowerWallSegments(), [0, 2])).toEqual([]);
  });

  it('ends the side cope chamfers short of the gable parapet ends', () => {
    // The west and east cope chamfers ran the full 100 m, so their end faces
    // lay on the side parapets' end faces in the corner notch.
    expect(
      sharedFaces(buildFactoryParapetCopeChamfers(), buildFactoryParapetSegments(), [2])
    ).toEqual([]);
  });

  it('ends the gable cope chamfers short of the gable parapet ends', () => {
    // Same corner as above, on the north and south copes (x = +/-40).
    expect(
      sharedFaces(buildFactoryParapetCopeChamfers(), buildFactoryParapetSegments(), [0])
    ).toEqual([]);
  });

  it('keeps every wall column top below the parapet top it stands under', () => {
    // Full-height columns ended exactly on the parapet's top face: structural
    // steel against the parapet cladding at 0 mm, seen from every aerial camera.
    expect(sharedFaces(buildFactoryShellColumns(), buildFactoryParapetSegments(), [1])).toEqual([]);
  });
});
