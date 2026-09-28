import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GAS_STATION_SITE, STATION_ROAD_EDGE_SEGMENTS } from '../../constants/siteLayout';
import { EXTERIOR_LAYERS } from '../../constants/renderLayers';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { createStationAccessMarkings, createStationAccessSurface } from './stationAccessGeometry';

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
      for (let x = -75.1; x < 14; x += 0.5)
        for (const z of [137.1, 138.5, 141.5, 142.9])
          expect(hit(x, z), `lane ${x},${z}`).toBe(true);
      for (const x of [-75.1, 13.9])
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
    expect(STATION_ROAD_EDGE_SEGMENTS).toEqual([
      [110, 131],
      [149, 280],
    ]);
    const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(source).toContain('STATION_ROAD_EDGE_SEGMENTS.map');
    expect(source).toContain('position={[7.5, EXTERIOR_LAYERS.groundOverlay, 0]}');
    expect(source).toContain('<StationAccess />');
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
