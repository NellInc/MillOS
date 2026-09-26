import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONVEYOR_LAYOUT, conveyorBounds } from '../constants/siteLayout';
import {
  advanceBagPosition,
  BAG_BODY_OFFSET,
  BAG_STRIPE_OFFSET,
  BAG_BOUNDARY,
  FLOUR_BAG_BASE_Y,
  FLOUR_STRIPE_MATERIAL,
  getFlourBagStartX,
  getFlourSackGeometry,
} from './ConveyorSystem';
import { FLOUR_SACK_PRINT_GEOMETRY, FLOUR_INK_STANDOFF } from '../utils/flourSacks';

describe('advanceBagPosition', () => {
  it('moves at belt speed and caps a resumed-frame delta', () => {
    expect(advanceBagPosition(0, 5, 1, 1)).toBeCloseTo(0.5);
  });

  it('preserves overflow when a bag wraps around the belt', () => {
    expect(advanceBagPosition(BAG_BOUNDARY - 0.1, 5, 1, 0.1)).toBeCloseTo(-BAG_BOUNDARY + 0.4);
  });

  it('does not reverse while production is stopped', () => {
    expect(advanceBagPosition(4, 5, -1, 0.1)).toBe(4);
  });
});

describe('flour sack printing', () => {
  it('seats the rotated sack run on the belt and carries it toward shipping', () => {
    const run = CONVEYOR_LAYOUT.shipping;
    const transform = new THREE.Matrix4().makeRotationY(run.rotationY).setPosition(...run.position);
    const geometry = getFlourSackGeometry();
    geometry.computeBoundingBox();
    const bodyOffset = new THREE.Vector3().setFromMatrixPosition(BAG_BODY_OFFSET);
    expect(FLOUR_BAG_BASE_Y + bodyOffset.y + geometry.boundingBox!.min.y).toBeCloseTo(0.85, 6);
    const bounds = conveyorBounds(run);
    for (const localX of [-BAG_BOUNDARY, 0, BAG_BOUNDARY]) {
      const centre = new THREE.Vector3(localX, FLOUR_BAG_BASE_Y, 0).applyMatrix4(transform);
      expect(centre.x).toBeGreaterThan(bounds.minX);
      expect(centre.x).toBeLessThan(bounds.maxX);
      expect(centre.z).toBeGreaterThan(bounds.minZ);
      expect(centre.z).toBeLessThan(bounds.maxZ);
    }
    const direction = new THREE.Vector3(1, 0, 0).transformDirection(transform);
    expect(direction.x).toBeCloseTo(-1, 6);
  });
  it.each([8, 16, 32])('keeps %i sacks separated, including across the belt wrap', (count) => {
    // Coincident random draws used to place every sack inside its neighbours.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const geometry = getFlourSackGeometry().clone().rotateY(0.05);
    geometry.computeBoundingBox();
    const width = geometry.boundingBox!.getSize(new THREE.Vector3()).x;
    try {
      for (const elapsed of [0, 2.35, 6.91]) {
        const positions = Array.from({ length: count }, (_, index) => {
          let x = getFlourBagStartX(index, count);
          for (let step = 0; step < 100; step++) x = advanceBagPosition(x, 5, 0.8, elapsed / 100);
          return x;
        }).sort((a, b) => a - b);
        const gaps = positions.map((x, index) =>
          index === count - 1 ? positions[0] + 2 * BAG_BOUNDARY - x : positions[index + 1] - x
        );
        expect(Math.min(...gaps)).toBeGreaterThan(width + 0.15);
      }
    } finally {
      random.mockRestore();
      geometry.dispose();
    }
  });

  it('seats every top and side ink corner on the actual sack without changing the body', () => {
    const geometry = getFlourSackGeometry();
    const material = new THREE.MeshBasicMaterial();
    const body = new THREE.Mesh(geometry, material);
    body.applyMatrix4(BAG_BODY_OFFSET);
    body.updateMatrixWorld(true);
    const corners = FLOUR_SACK_PRINT_GEOMETRY.getAttribute('position');
    const normals = FLOUR_SACK_PRINT_GEOMETRY.getAttribute('normal');
    try {
      for (let index = 0; index < corners.count; index++) {
        const corner = new THREE.Vector3()
          .fromBufferAttribute(corners, index)
          .applyMatrix4(BAG_STRIPE_OFFSET);
        const normal = new THREE.Vector3()
          .fromBufferAttribute(normals, index)
          .transformDirection(BAG_STRIPE_OFFSET);
        const axis = normal
          .toArray()
          .map(Math.abs)
          .indexOf(Math.max(...normal.toArray().map(Math.abs)));
        const inward = new THREE.Vector3().setComponent(
          axis,
          -Math.sign(normal.getComponent(axis))
        );
        const hits = new THREE.Raycaster(corner, inward).intersectObject(body);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].distance).toBeCloseTo(FLOUR_INK_STANDOFF, 5);
      }
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.getSize(new THREE.Vector3()).y).toBeCloseTo(0.3, 6);
    } finally {
      material.dispose();
    }
  });

  it('renders sparse coloured ink with lit cloth showing through between the letters', () => {
    expect(FLOUR_STRIPE_MATERIAL.isMeshStandardMaterial).toBe(true);
    expect(FLOUR_STRIPE_MATERIAL.emissive.getHex()).toBe(0);
    expect(FLOUR_STRIPE_MATERIAL.alphaTest).toBe(0.5);
    expect(FLOUR_STRIPE_MATERIAL.depthWrite).toBe(true);
    const map = FLOUR_STRIPE_MATERIAL.map as THREE.DataTexture;
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    const bytes = map.image.data as Uint8Array;
    let inkPixels = 0;
    for (let i = 3; i < bytes.length; i += 4) if (bytes[i] === 255) inkPixels++;
    expect(inkPixels / (bytes.length / 4)).toBeGreaterThan(0.05);
    expect(inkPixels / (bytes.length / 4)).toBeLessThan(0.2);
  });
});
