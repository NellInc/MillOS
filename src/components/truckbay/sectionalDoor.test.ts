import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SECTIONAL_DOOR,
  SECTIONAL_DOOR_MATERIAL,
  buildSectionalDoorGeometry,
} from './sectionalDoor';

/**
 * final3 med-12 milling, far right: the dock door leaf was "a flat, untextured
 * pale-blue panel". It was a 9 x 4 x 0.15 box (the authored GLB is a box too,
 * with a 0.2-scale normal map) in a 0.6-metalness slate that mirrored the sky.
 * A sectional door is horizontal panels with a joint between each and pressed
 * ribs across each panel.
 */
describe('sectional dock door leaf', () => {
  const { width, height, depth, sections } = SECTIONAL_DOOR;
  const geometry = buildSectionalDoorGeometry();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  // Distance from a ray started 1 m in front of the leaf (+z) to its outer face.
  const faceAt = (x: number, y: number) => {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(x, y, 1),
      new THREE.Vector3(0, 0, -1),
      0,
      3
    ).intersectObject(mesh)[0];
    return hit ? 1 - hit.distance : null;
  };

  it('keeps the box it replaces: centred, the same width and height, closed through', () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-width / 2, 6);
    expect(box.max.x).toBeCloseTo(width / 2, 6);
    expect(box.min.y).toBeCloseTo(-height / 2, 6);
    expect(box.max.y).toBeCloseTo(height / 2, 6);
    expect(box.max.z - box.min.z).toBeLessThan(depth + 0.04);
    // No slot anywhere up the leaf: every row stops a ray.
    for (let y = -height / 2 + 0.01; y < height / 2; y += 0.01) {
      expect(faceAt(0, y), `y ${y.toFixed(2)}`).not.toBeNull();
    }
  });

  it('draws a recessed joint between every panel and pressed ribs across each one', () => {
    const pitch = height / sections;
    expect(sections).toBeGreaterThanOrEqual(6);
    expect(pitch).toBeLessThan(0.7);
    const panelFace = faceAt(0, -height / 2 + pitch * 0.5 + pitch * 0.1)!;
    for (let i = 1; i < sections; i++) {
      const joint = faceAt(0, -height / 2 + i * pitch)!;
      // A groove at least 2 cm deep: 2 px from the milling camera at 34 m.
      expect(panelFace - joint, `joint ${i}`).toBeGreaterThanOrEqual(0.02);
    }
    for (let i = 0; i < sections; i++) {
      const centre = -height / 2 + (i + 0.5) * pitch;
      const ribs = [centre - pitch / 4, centre + pitch / 4].map((y) => faceAt(0, y)!);
      for (const rib of ribs) expect(rib - panelFace, `panel ${i}`).toBeGreaterThan(0.008);
    }
  });

  it('is a lit dielectric, not a mirror of the sky', () => {
    const material = SECTIONAL_DOOR_MATERIAL as THREE.MeshStandardMaterial;
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBeGreaterThanOrEqual(0.4);
    // The leaf moves (it rolls up), so any surface field rides with it.
    const surface = material.userData.millosWorldSurface as
      | { uSurfSpan: { value: THREE.Vector4 } }
      | undefined;
    expect(surface?.uSurfSpan.value.w).toBe(1);
  });
});
