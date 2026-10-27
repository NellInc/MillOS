import { readFileSync } from 'node:fs';
import React from 'react';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ApartmentFacade, STAIR_LIGHT_GLAZING, stairLightIntensity } from './ApartmentFacade';
import { apartmentFacadeLayout } from './apartmentFacadeLayout';

/**
 * shipping med-22: the stair tower beside the apartment block was an unlit
 * black monolith. Its full-height glazing slot was dark glass by day and by
 * night, so the one vertical the block has read as a hole in the sky.
 */
describe('apartment stair core at night', () => {
  it('lights the stair glazing from the exterior lamp level, off by day', () => {
    expect(stairLightIntensity(0)).toBeLessThan(0.02);
    // Lit like the flats' windows, not a strip light: 0.75 read near-white (med-22).
    expect(stairLightIntensity(1)).toBeGreaterThan(0.2);
    expect(stairLightIntensity(1)).toBeLessThanOrEqual(0.4);
    for (let level = 0; level < 1; level += 0.1)
      expect(stairLightIntensity(level + 0.1)).toBeGreaterThanOrEqual(stairLightIntensity(level));
    const { r, g, b } = STAIR_LIGHT_GLAZING.emissive;
    expect(Math.min(r, g, b)).toBeGreaterThan(0.25);
  });

  it('keeps the lit glazing out of the static batch, which clones materials', () => {
    // A merged clone would never see the per-frame intensity.
    const source = readFileSync('src/components/exterior/ApartmentFacade.tsx', 'utf8');
    const lit = source.match(/material=\{STAIR_LIGHT_GLAZING\}/g) ?? [];
    expect(lit.length).toBeGreaterThanOrEqual(1);
    expect(source).toMatch(/noStaticBatch: true/);
  });

  /**
   * final4 med-1830 (farm, shipping): one cream strip the height of the tower
   * beside a block whose flats are lit on alternate storeys.
   */
  it.each([3, 4] as const)(
    'lights the %s-storey stair only on the storeys whose flats are lit',
    (floors) => {
      const { stairStoreys, stairLandings, stairTower } = apartmentFacadeLayout(floors);
      expect(stairStoreys).toHaveLength(floors);
      expect(stairStoreys[0].bottom).toBe(1.2);
      expect(stairStoreys.at(-1)!.top).toBe(stairTower.top - 1.4);
      stairStoreys.slice(1).forEach((s, i) => expect(s.bottom).toBe(stairLandings[i]));
      // The window shader's occupiedFloor: mod(storey, 2) == 1.
      expect(stairStoreys.map((s) => s.lit)).toEqual(
        Array.from({ length: floors }, (_, k) => k % 2 === 1)
      );
      const source = readFileSync('src/components/exterior/ApartmentFacade.tsx', 'utf8');
      expect(source).toMatch(/material=\{lit \? STAIR_LIGHT_GLAZING : STAIR_GLAZING\}/);
      // Glows like a lit pane, not a mirror of the dusk sky.
      expect(STAIR_LIGHT_GLAZING.roughness).toBeGreaterThanOrEqual(0.35);
      expect(STAIR_LIGHT_GLAZING.metalness).toBeLessThanOrEqual(0.1);
      expect(stairLightIntensity(0.5)).toBeCloseTo(stairLightIntensity(1) / 2, 6);
    }
  );

  it.each([3, 4] as const)('marks every landing of the %s-storey stair', (floors) => {
    const { stairTower, gallery, stairLandings } = apartmentFacadeLayout(floors);
    expect(stairLandings).toHaveLength(gallery.tops.length);
    for (const y of stairLandings) {
      expect(y).toBeGreaterThan(1.2);
      expect(y).toBeLessThan(stairTower.top - 1.4);
    }
  });
});

/** Expand the actual stateless Block component, using its real shared geometry
 * and material. Drivers render no meshes and are deliberately not invoked.
 */
function facadeMeshes(floors: 3 | 4) {
  type Props = {
    children?: React.ReactNode;
    min?: [number, number, number];
    max?: [number, number, number];
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material;
    position?: [number, number, number];
    scale?: [number, number, number];
  };
  const meshes: THREE.Mesh[] = [];
  const visit = (children: React.ReactNode) => {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement<Props>(child)) return;
      const p = child.props;
      if (typeof child.type === 'function' && p.min && p.max) {
        visit((child.type as (props: Props) => React.ReactNode)(p));
        return;
      }
      if (child.type === 'mesh') {
        const mesh = new THREE.Mesh(p.geometry, p.material);
        if (p.position) mesh.position.fromArray(p.position);
        if (p.scale) mesh.scale.fromArray(p.scale);
        mesh.updateMatrixWorld(true);
        meshes.push(mesh);
      }
      visit(p.children);
    });
  };
  visit(ApartmentFacade({ floors }) as React.ReactNode);
  return meshes;
}

describe('complete apartment gallery returns', () => {
  it.each([3, 4] as const)(
    'closes every free end of the %s-storey facade below its retained rail',
    (floors) => {
      const meshes = facadeMeshes(floors);
      const { shell, gallery: g, stairTower } = apartmentFacadeLayout(floors);
      const outer = shell.halfX + g.depth;
      const bounds = (mesh: THREE.Mesh) => new THREE.Box3().setFromObject(mesh);
      for (const top of g.tops) {
        const ray = (y: number) =>
          new THREE.Raycaster(
            new THREE.Vector3(shell.halfX + g.depth / 2, y, g.maxZ + 0.5),
            new THREE.Vector3(0, 0, -1),
            0,
            0.8
          ).intersectObjects(meshes);
        expect(ray(top + 0.975)).toHaveLength(1);
        const hit = ray(top + 0.55);
        expect(hit, 'A top bar alone leaves an open gallery end').toHaveLength(1);
        expect(hit[0].point.z).toBeCloseTo(g.maxZ - 0.04, 6);
        const returned = bounds(hit[0].object as THREE.Mesh);
        expect(returned.min.x).toBeLessThan(shell.halfX);
        expect(returned.max.x).toBeCloseTo(outer - 0.1, 6);
        expect(returned.min.y).toBeCloseTo(top + 0.08, 6);
        expect(returned.max.y).toBeCloseTo(top + g.railHeight - 0.05, 6);
        const front = meshes.find((mesh) => {
          const b = bounds(mesh);
          return (
            Math.abs(b.min.x - (outer - 0.1)) < 1e-6 &&
            Math.abs(b.min.y - (top + 0.08)) < 1e-6 &&
            b.max.z > g.maxZ - 0.05
          );
        })!;
        expect(front).toBeDefined();
        expect((hit[0].object as THREE.Mesh).material).toBe(front.material);
        const joint = returned.clone().intersect(bounds(front));
        expect(joint.isEmpty()).toBe(false);
        expect(joint.getSize(new THREE.Vector3()).x).toBeLessThan(1e-6);
      }
      const all = new THREE.Box3();
      for (const mesh of meshes) {
        all.union(bounds(mesh));
        const n = mesh.geometry.getAttribute('normal');
        expect(Array.from(n.array).every(Number.isFinite)).toBe(true);
      }
      expect(all.min.x).toBeCloseTo(stairTower.minX - 0.05, 6);
      expect(all.min.y).toBeCloseTo(-0.1, 6);
      expect(all.min.z).toBeCloseTo(-6.06, 6);
      expect(all.max.x).toBeCloseTo(9.71, 6);
      expect(all.max.y).toBeCloseTo(stairTower.top + 0.18, 6);
      expect(all.max.z).toBeCloseTo(8.42, 6);
    }
  );
});
