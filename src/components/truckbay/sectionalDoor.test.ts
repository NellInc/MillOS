import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SECTIONAL_DOOR,
  SECTIONAL_DOOR_MATERIAL,
  buildSectionalDoorGeometry,
  sectionalDoorTone,
} from './sectionalDoor';

/**
 * final3 med-12 milling, far right: the dock door leaf was "a flat, untextured
 * pale-blue panel". It was a 9 x 4 x 0.15 box (the authored GLB is a box too,
 * with a 0.2-scale normal map) in a 0.6-metalness slate that mirrored the sky.
 * A sectional door is horizontal panels with a joint between each and pressed
 * bands across each panel.
 */
describe('sectional dock door leaf', () => {
  const { width, height, depth, sections } = SECTIONAL_DOOR;
  const pitch = height / sections;
  const v = (y: number) => y / height;

  it('keeps the box it replaces, with no modelled ledge to alias', () => {
    // r4 round 1 modelled the joints and bands: from 34 m their 6-30 mm sunlit
    // ledges broke into rows of dots across the leaf. No relief faces at all.
    const geometry = buildSectionalDoorGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    [-width / 2, -height / 2, -depth / 2].forEach((value, i) =>
      expect(box.min.getComponent(i)).toBeCloseTo(value, 6)
    );
    [width / 2, height / 2, depth / 2].forEach((value, i) =>
      expect(box.max.getComponent(i)).toBeCloseTo(value, 6)
    );
    expect(geometry.getAttribute('position').count).toBe(24);
  });

  it('paints a dark joint between every panel and a band across each one', () => {
    expect(sections).toBeGreaterThanOrEqual(6);
    expect(pitch).toBeLessThan(0.7);
    const panel = sectionalDoorTone(v(pitch * 0.6));
    for (let i = 1; i < sections; i++) {
      expect(sectionalDoorTone(v(i * pitch)), `joint ${i}`).toBeLessThan(panel * 0.6);
    }
    for (let i = 0; i < sections; i++) {
      for (const at of [0.25, 0.75]) {
        expect(sectionalDoorTone(v((i + at) * pitch)), `panel ${i}`).toBeGreaterThan(panel);
      }
    }
    // No joint line along the leaf's own bottom and top edges.
    expect(sectionalDoorTone(0.001)).toBe(panel);
    expect(sectionalDoorTone(0.999)).toBe(panel);
  });

  it('draws no joint or band under 2 px from the milling camera, and filters the rest', () => {
    const twoPixels = 2 * 34 * ((2 * Math.tan((25 * Math.PI) / 180)) / 1440);
    expect(SECTIONAL_DOOR.ribHeight).toBeGreaterThanOrEqual(twoPixels);
    expect(SECTIONAL_DOOR.jointHeight).toBeGreaterThanOrEqual(twoPixels);
    const map = (SECTIONAL_DOOR_MATERIAL as THREE.MeshStandardMaterial).map!;
    expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
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
