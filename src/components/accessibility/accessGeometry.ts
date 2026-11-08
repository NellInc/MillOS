/**
 * Pure shapes for the access fittings, shared by AccessFittings.tsx and its
 * tests: no React, no materials.
 */
import { CROSSING_TACTILE_DEPTH } from '../../constants/accessibilityLayout';
import { LAKE_APPROACH_PATH } from '../../constants/publicRealmLayout';
import { railwayRoadCrossing } from '../exterior/railwayRoadGeometry';

export type XZ = readonly [number, number];
/** The blister pads on the zebra's two dropped kerbs: road edge back `CROSSING_TACTILE_DEPTH`. */
export function crossingTactilePads(): XZ[][] {
  const crossing = railwayRoadCrossing(LAKE_APPROACH_PATH);
  return crossing.aprons.map((apron) => {
    // [setback corner, road-edge hit, ...edge, road-edge hit, setback corner]
    const a = apron[1],
      b = apron[apron.length - 2];
    const back = [apron[0][0] - a[0], apron[0][1] - a[1]];
    const length = Math.hypot(back[0], back[1]) || 1;
    const ux = (back[0] / length) * CROSSING_TACTILE_DEPTH,
      uz = (back[1] / length) * CROSSING_TACTILE_DEPTH;
    const quad: XZ[] = [a, b, [b[0] + ux, b[1] + uz], [a[0] + ux, a[1] + uz]];
    // Wind every pad to face up (+Y): the two aprons' `back` directions are
    // opposite, so one pad came out wound downward and rendered lit from below.
    return padNormalY(quad) < 0 ? quad.reverse() : quad;
  });
}

/** Y component of the normal of the pad's first triangle (positive faces up). */
export function padNormalY(quad: readonly XZ[]): number {
  const [p, q, r] = quad;
  return (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
}
