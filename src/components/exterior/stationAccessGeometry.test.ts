import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GAS_STATION_SITE,
  SITE_LAYOUT,
  STATION_ROAD_EDGE_SEGMENTS,
} from '../../constants/siteLayout';
import { EXTERIOR_LAYERS } from '../../constants/renderLayers';
import { BUS_TURNAROUND } from '../../constants/publicRealmLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import {
  createStationAccessMarkings,
  createStationAccessSurface,
  STATION_ACCESS_MOUTH_X,
  stationAccessMouthEdge,
} from './stationAccessGeometry';
import { GIVE_WAY, VALLEY_ROAD_TONE } from './railwayRoadGeometry';
import { approachEdgeLines, APPROACH_EDGE_OFFSET } from './tunnelApproachMarkings';
import { RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS } from '../../constants/railwayRoadLayout';

function withPavement(check: (hit: (x: number, z: number) => boolean) => void) {
  const geometry = createStationAccessSurface();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = EXTERIOR_LAYERS.ground;
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  try {
    check((x, z) => {
      ray.ray.origin.set(x, 2, z);
      return ray.intersectObject(mesh).length > 0;
    });
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

describe('station road connection', () => {
  it('continuously seats both lanes into the real forecourt and southern road', () => {
    const a = GAS_STATION_SITE.access;
    expect(a.forecourtX).toBeLessThan(GAS_STATION_SITE.position[0] + 10);
    expect(a.roadX).toBeGreaterThan(20 - 16 / 2);
    withPavement((hit) => {
      for (let x = -75.1; x < STATION_ACCESS_MOUTH_X; x += 0.5)
        for (const z of [137.1, 138.5, 141.5, 142.9])
          expect(hit(x, z), `lane ${x},${z}`).toBe(true);
      for (const x of [-75.1, STATION_ACCESS_MOUTH_X - 0.1])
        for (const z of [134, 146]) expect(hit(x, z), `flare ${x},${z}`).toBe(true);
      expect(hit(-45, 133)).toBe(false);
      expect(hit(-45, 147)).toBe(false);
    });
  });

  it('connects the existing parked-car pad without widening over the cars', () => {
    withPavement((hit) => {
      for (let z = 128.9; z < 139; z += 0.3)
        for (const x of [-65.1, -63, -61.7]) expect(hit(x, z)).toBe(true);
      for (const [x, z] of [
        [-75, 125],
        [-70, 125],
        [-65, 126],
      ])
        expect(hit(x, z)).toBe(false);
    });
  });

  it('moves the blocking sign to the verge with a clear foot around it', () => {
    const [sx, , sz] = GAS_STATION_SITE.position;
    const [lx, , lz] = GAS_STATION_SITE.signPosition;
    withPavement((hit) => {
      // Reproduces why retaining the old pylon transform would obstruct access.
      expect(hit(sx + 10, sz)).toBe(true);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8)
        expect(hit(sx + lx + Math.cos(angle), sz + lz + Math.sin(angle))).toBe(false);
    });
    expect(readFileSync('src/components/GasStationInstanced.tsx', 'utf8')).toContain(
      'name="station-verge-sign" position={GAS_STATION_SITE.signPosition}'
    );
  });

  it.each([64, 128])('has no ground step or buried strip on the %i terrain grid', (segments) => {
    for (let x = -75; x <= 14; x += 2)
      for (let z = 133.5; z <= 146.5; z += 2)
        expect(sampleTerrainGroundHeight(x, z, segments), `${x},${z}`).toBeCloseTo(0, 6);
  });

  it('breaks only the west road edge across the actual entrance', () => {
    // 2026-11-08: the first run ends at the shuttle turnaround's apron, not
    // the gas station mouth; the apron runs on into the mouth.
    expect(STATION_ROAD_EDGE_SEGMENTS).toEqual([
      [110, 115.7],
      [149, 280],
    ]);
    const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(source).toMatch(
      /approachEdgeLines\(\s*SITE_LAYOUT\.roadTunnels\.south,\s*-APPROACH_EDGE_OFFSET,\s*STATION_ROAD_EDGE_SEGMENTS\s*\)/
    );
    // The east line breaks only for the railway road's bell mouth (D-047).
    expect(source).toMatch(
      /approachEdgeLines\(\s*SITE_LAYOUT\.roadTunnels\.south,\s*APPROACH_EDGE_OFFSET,\s*RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS\s*\)/
    );
    expect(source).toContain('<StationAccess />');
    // The west line keeps its break across the entrance; the east line has none
    // opposite it, only the railway road's mouth 16 m further south.
    const west = approachEdgeLines(
      SITE_LAYOUT.roadTunnels.south,
      -APPROACH_EDGE_OFFSET,
      STATION_ROAD_EDGE_SEGMENTS
    );
    const covers = (segments: typeof west, z: number) =>
      segments.some(
        ({ start, end }) => z >= Math.min(start[1], end[1]) && z <= Math.max(start[1], end[1])
      );
    for (const z of [112, 160, 190]) expect(covers(west, z), `west ${z}`).toBe(true);
    for (const z of [120, 125, 132, 140, 148]) expect(covers(west, z), `west ${z}`).toBe(false);
    // No west edge paint inside the shuttle turnaround's apron.
    const [cx, cz] = BUS_TURNAROUND.centre;
    for (const { start, end } of west)
      for (let t = 0; t <= 1; t += 0.01) {
        const x = start[0] + (end[0] - start[0]) * t;
        const z = start[1] + (end[1] - start[1]) * t;
        expect(Math.hypot(x - cx, z - cz), `${x},${z}`).toBeGreaterThanOrEqual(
          BUS_TURNAROUND.apronRadius - 0.05
        );
      }
    const east = approachEdgeLines(
      SITE_LAYOUT.roadTunnels.south,
      APPROACH_EDGE_OFFSET,
      RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS
    );
    const [[, mouthNorth], [mouthSouth]] = RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS;
    for (let z = 110; z <= 220; z += 2)
      expect(covers(east, z), `east ${z}`).toBe(z < mouthNorth || z > mouthSouth);
    // The railway mouth's north tangent point meets z 149 exactly, where the
    // west line resumes after the station entrance (2026-11-07: both mouths
    // now break their edge lines at the kerb arcs' tangent points).
    expect(mouthNorth).toBeGreaterThanOrEqual(149);
  });

  it('stops the bell mouth on the valley road edge, its kerbs tangent to both roads', () => {
    const a = GAS_STATION_SITE.access;
    expect(STATION_ACCESS_MOUTH_X).toBe(SITE_LAYOUT.roadTunnels.south.position[0] - 8);
    const h = 1e-6;
    for (const side of [-1, 1] as const) {
      const [x0, z0] = stationAccessMouthEdge(side, 0);
      const [x1, z1] = stationAccessMouthEdge(side, h);
      expect(Math.abs(z1 - z0) / Math.abs(x1 - x0)).toBeLessThan(1e-4);
      const [xa, za] = stationAccessMouthEdge(side, 1 - h);
      const [xb, zb] = stationAccessMouthEdge(side, 1);
      expect(Math.abs(xb - xa) / Math.abs(zb - za)).toBeLessThan(1e-4);
      expect(xb).toBeCloseTo(STATION_ACCESS_MOUTH_X, 9);
      // The tangent points are where the west edge line breaks.
      expect(zb).toBeCloseTo(a.centreZ + side * a.mouthHalfWidth, 9);
    }
    withPavement((hit) => {
      // Nothing on the valley road's carriageway or its shoulder strip.
      for (let z = 128; z <= 152; z += 0.25)
        expect(hit(STATION_ACCESS_MOUTH_X + 0.02, z)).toBe(false);
    });
    // The mouth's tone eases into the terrain road's at its edge.
    const surface = createStationAccessSurface();
    const position = surface.getAttribute('position');
    const colour = surface.getAttribute('color');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      if (Math.abs(x - STATION_ACCESS_MOUTH_X) < 1e-6)
        expect(colour.getX(i)).toBeCloseTo(VALLEY_ROAD_TONE, 6);
      else if (x <= a.roadNeckX + 1e-6) expect(colour.getX(i)).toBe(1);
    }
    surface.dispose();
  });

  it('paints give way on the outbound (south, keep-right) lane only', () => {
    const a = GAS_STATION_SITE.access;
    const paint = createStationAccessMarkings();
    const p = paint.getAttribute('position');
    let lines = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (
        x >
        STATION_ACCESS_MOUTH_X - GIVE_WAY.setback - 2 * GIVE_WAY.lineWidth - GIVE_WAY.between - 1e-6
      ) {
        expect(p.getZ(i)).toBeGreaterThan(a.centreZ);
        lines++;
      }
    }
    expect(lines).toBeGreaterThanOrEqual(4 * 8);
    paint.dispose();
  });

  it('keeps guidance inside the pavement and bounds the two static meshes', () => {
    const surface = createStationAccessSurface();
    const paint = createStationAccessMarkings();
    for (const geometry of [surface, paint]) {
      expect(geometry.index!.count / 3).toBeLessThan(160);
      for (const name of ['position', 'normal', 'uv'])
        expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      const normal = geometry.getAttribute('normal');
      for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeGreaterThan(0.99);
    }
    withPavement((hit) => {
      const p = paint.getAttribute('position');
      for (let i = 0; i < p.count; i++) expect(hit(p.getX(i), p.getZ(i))).toBe(true);
    });
    surface.dispose();
    paint.dispose();
  });
});
