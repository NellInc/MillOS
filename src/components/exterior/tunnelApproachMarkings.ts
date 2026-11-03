import type { Vec3Tuple } from '../../constants/siteLayout';
import { ROAD_TUNNEL_ROAD } from '../scenery/Tunnel';

/**
 * THE VALLEY ROADS' EDGE LINES, TAPERED INTO THE TUNNEL OPENINGS.
 *
 * Both truck roads are 16 m of terrain-painted asphalt with white edge lines
 * 15 m apart (x +/-7.5 from the road centre), and they ran straight on for
 * 60 m past each portal into the hill. The portal opening is 12 m between the
 * lining walls (`ROAD_TUNNEL_BORE`), and its 3 m posts stand at 6-9 m from the
 * axis, so both lines ran under the posts: on the `river` frame the near line
 * passed the right leg and on into the hillside, and the road read as missing
 * its portal. It was invisible until the lines were given
 * `RENDER_ORDER.floorMarkings` (2026-10-31), which is what made them draw.
 *
 * The lines now run straight to `TAPER_LENGTH` metres short of the tunnel's own
 * carriageway, close in to just outside its 10 m edge over that distance, and
 * run on to the portal face, where the bore's drainage channels take the edge
 * over. Inside the opening the asphalt beyond the line is shoulder.
 *
 * Working if neither edge line meets a portal post, and both stop at the face.
 */

/** Edge line centre from the road axis on the open approach. */
export const APPROACH_EDGE_OFFSET = 7.5;
/** Painted line width. */
export const APPROACH_LINE_WIDTH = 0.3;
/** Taper length, metres along the road. About 1:6, a lane-narrowing taper. */
export const APPROACH_TAPER_LENGTH = 14;
/**
 * Edge line centre from the axis at the portal: clear of the tunnel's own
 * 10 m carriageway, which is laid 7.5 cm above it and would hide the paint.
 */
export const PORTAL_EDGE_OFFSET = ROAD_TUNNEL_ROAD.width / 2 + APPROACH_LINE_WIDTH / 2 + 0.15;

export interface RoadTunnelPlacement {
  position: Vec3Tuple;
  /** 0 or PI: the valley roads run along world Z. Local +Z faces the yard. */
  rotation: number;
}

/** One painted strip, as world X/Z end points. */
export interface EdgeLineSegment {
  start: readonly [number, number];
  end: readonly [number, number];
}

/**
 * Edge line segments for one side of a valley road ending at `tunnel`.
 *
 * `offset` is the line's signed world-X distance from the tunnel axis on the
 * open approach (+/-`APPROACH_EDGE_OFFSET`). `runs` are the painted intervals in
 * world Z, as authored for the open road (a break for a side entrance, say);
 * they are clipped where the taper begins, and the taper and the run on to the
 * face are added if a run reaches it.
 */
export function approachEdgeLines(
  tunnel: RoadTunnelPlacement,
  offset: number,
  runs: readonly (readonly [number, number])[]
): EdgeLineSegment[] {
  const [px, , pz] = tunnel.position;
  // Outward (toward the yard) is local +Z; the roads are axis-aligned.
  const out = Math.round(Math.cos(tunnel.rotation));
  const side = Math.sign(offset);
  const taperStart = ROAD_TUNNEL_ROAD.lead + APPROACH_TAPER_LENGTH;
  const taperEnd = ROAD_TUNNEL_ROAD.lead;
  // u: metres from the portal face toward the yard.
  const toU = (z: number) => (z - pz) * out;
  const toZ = (u: number) => pz + u * out;

  const segments: EdgeLineSegment[] = [];
  let reachesTaper = false;
  for (const [a, b] of runs) {
    const u0 = Math.max(Math.min(toU(a), toU(b)), taperStart);
    const u1 = Math.max(toU(a), toU(b));
    if (u1 - u0 <= 0) continue;
    if (u0 === taperStart) reachesTaper = true;
    segments.push({ start: [px + offset, toZ(u1)], end: [px + offset, toZ(u0)] });
  }
  if (reachesTaper) {
    const inner = px + side * PORTAL_EDGE_OFFSET;
    segments.push(
      { start: [px + offset, toZ(taperStart)], end: [inner, toZ(taperEnd)] },
      { start: [inner, toZ(taperEnd)], end: [inner, toZ(0)] }
    );
  }
  return segments;
}
