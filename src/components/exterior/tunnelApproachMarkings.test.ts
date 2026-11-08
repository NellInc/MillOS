import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT, STATION_ROAD_EDGE_SEGMENTS } from '../../constants/siteLayout';
import { RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS } from '../../constants/railwayRoadLayout';
import { ROAD_TUNNEL_BORE, ROAD_TUNNEL_ROAD } from '../scenery/Tunnel';
import {
  approachEdgeLines,
  APPROACH_EDGE_OFFSET,
  APPROACH_LINE_WIDTH,
  PORTAL_EDGE_OFFSET,
  type EdgeLineSegment,
} from './tunnelApproachMarkings';

/** The edge lines exactly as FactoryExterior builds them, per tunnel. */
const ROADS = [
  {
    name: 'south',
    tunnel: SITE_LAYOUT.roadTunnels.south,
    lines: [
      approachEdgeLines(
        SITE_LAYOUT.roadTunnels.south,
        -APPROACH_EDGE_OFFSET,
        STATION_ROAD_EDGE_SEGMENTS
      ),
      approachEdgeLines(
        SITE_LAYOUT.roadTunnels.south,
        APPROACH_EDGE_OFFSET,
        RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS
      ),
    ],
  },
  {
    name: 'north',
    tunnel: SITE_LAYOUT.roadTunnels.north,
    lines: [
      approachEdgeLines(SITE_LAYOUT.roadTunnels.north, -APPROACH_EDGE_OFFSET, [[-280, -110]]),
      approachEdgeLines(SITE_LAYOUT.roadTunnels.north, APPROACH_EDGE_OFFSET, [[-280, -110]]),
    ],
  },
] as const;

/** Points along every segment, 0.25 m apart, with each strip's half width. */
function samples(segments: readonly EdgeLineSegment[]) {
  return segments.flatMap(({ start, end }) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 0.25));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t] as const;
    });
  });
}

describe('valley road edge lines meet the tunnel openings', () => {
  it('is mounted from these segments, not hand-placed planes', () => {
    const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(source).toContain('VALLEY_ROAD_EDGE_LINES.map((segment, index) => (');
    expect(source).not.toContain('<planeGeometry args={[0.3, 170]} />');
  });

  it.each(ROADS)(
    '$name: keeps both lines out of the portal posts and the hill',
    ({ tunnel, lines }) => {
      const [px, , pz] = tunnel.position;
      const out = Math.round(Math.cos(tunnel.rotation));
      const half = APPROACH_LINE_WIDTH / 2;
      for (const line of lines) {
        for (const [x, z] of samples(line)) {
          const u = (z - pz) * out; // metres from the portal face toward the yard
          // Nothing painted behind the face: that ground is under the hill.
          expect(u).toBeGreaterThanOrEqual(-1e-9);
          // Through the post depth (3 m, centred on the face) the whole strip
          // stays inside the opening between the lining walls.
          if (u <= 1.5) expect(Math.abs(x - px) + half).toBeLessThan(ROAD_TUNNEL_BORE.halfWidth);
        }
      }
    }
  );

  it.each(ROADS)(
    '$name: runs continuously from the open road onto the tunnel carriageway',
    ({ tunnel, lines }) => {
      const [px, , pz] = tunnel.position;
      const out = Math.round(Math.cos(tunnel.rotation));
      for (const line of lines) {
        const atFace = line.filter(
          (s) => Math.abs((s.end[1] - pz) * out) < 1e-9 || Math.abs((s.start[1] - pz) * out) < 1e-9
        );
        expect(atFace).toHaveLength(1);
        const [face] = atFace;
        // Beside the tunnel's own 10 m road, never under it (it is laid above).
        expect(Math.abs(face.end[0] - px)).toBeCloseTo(PORTAL_EDGE_OFFSET);
        expect(PORTAL_EDGE_OFFSET - APPROACH_LINE_WIDTH / 2).toBeGreaterThan(
          ROAD_TUNNEL_ROAD.width / 2
        );
        // Each segment starts where the previous one ended (no gaps, no jumps)
        // from the taper onward.
        const tail = line.slice(-3);
        expect(tail[1].start).toEqual(tail[0].end);
        expect(tail[2].start).toEqual(tail[1].end);
      }
    }
  );
});
