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
  getConveyorSupportMatrices,
  advanceRollerAngle,
  beltTravelMetres,
  rollerSpinRate,
  bagEdgeScale,
  BAG_MIN_SCALE,
  nextBagOccupied,
  scrollBeltOffset,
  IDLER_ROLLER_COUNT,
  idlerRollerX,
} from './ConveyorSystem';
import { FLOUR_SACK_PRINT_GEOMETRY, FLOUR_INK_STANDOFF } from '../utils/flourSacks';

describe('instanced conveyor supports', () => {
  it('keeps both legs and feet at their original centres without rotating the run', () => {
    for (const [part, y] of [
      ['legs', 0.25],
      ['feet', 0.02],
    ] as const) {
      const matrices = getConveyorSupportMatrices([-25, 5], part);
      expect(matrices).toHaveLength(4);
      expect(matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m).toArray())).toEqual([
        [-25, y, -0.5],
        [-25, y, 0.5],
        [5, y, -0.5],
        [5, y, 0.5],
      ]);
      expect(matrices.every((m) => m.determinant() === 1)).toBe(true);
    }
  });

  it('rotates each brace about its own centre and retains the parent run transform', () => {
    const run = CONVEYOR_LAYOUT.shipping;
    const parent = new THREE.Matrix4().makeRotationY(run.rotationY).setPosition(...run.position);
    for (const [index, matrix] of getConveyorSupportMatrices([-15, 15], 'brace').entries()) {
      const expected = new THREE.Matrix4()
        .makeRotationZ(0.3)
        .setPosition(index ? 15 : -15, 0.25, 0);
      expect(matrix.elements).toEqual(expected.elements);
      const actual = parent.clone().multiply(matrix);
      const point = new THREE.Vector3(0.04, 0.04, 0.45);
      expect(
        point
          .clone()
          .applyMatrix4(actual)
          .distanceTo(point.applyMatrix4(parent.clone().multiply(expected)))
      ).toBeLessThan(1e-12);
    }
  });
});

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

describe('belt, roller and sack agree on direction', () => {
  /** World x of the top-face point whose transformed uv.x is `texel`. */
  const texelX = (geometry: THREE.BoxGeometry, repeat: number, offset: number, texel: number) => {
    // Top face (+y) of a box: u runs linearly along x. Read the mapping from
    // the real geometry rather than assuming it.
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const top: { x: number; u: number }[] = [];
    for (let i = 0; i < position.count; i++) {
      if (normal.getY(i) > 0.5) top.push({ x: position.getX(i), u: uv.getX(i) });
    }
    const minX = Math.min(...top.map((p) => p.x));
    const maxX = Math.max(...top.map((p) => p.x));
    const uAtMin = top.find((p) => p.x === minX)!.u;
    const uAtMax = top.find((p) => p.x === maxX)!.u;
    // three samples repeat * u + offset.
    const u = (texel - offset) / repeat;
    return minX + ((u - uAtMin) / (uAtMax - uAtMin)) * (maxX - minX);
  };

  it('scrolls the belt cleats the same way the sacks travel', () => {
    const length = CONVEYOR_LAYOUT.shipping.length;
    const geometry = new THREE.BoxGeometry(length, 0.1, 2);
    const repeat = length / 4;
    try {
      const before = texelX(geometry, repeat, 0.5, 5.5);
      const after = texelX(geometry, repeat, scrollBeltOffset(0.5, 0.05), 5.5);
      const sackStep = advanceBagPosition(0, 5, 1, 0.01);
      expect(sackStep).toBeGreaterThan(0);
      expect(after - before).toBeGreaterThan(0);
      // One tile is 4 m, so 0.05 tile is 0.2 m of belt travel.
      expect(after - before).toBeCloseTo(0.2, 6);
    } finally {
      geometry.dispose();
    }
  });

  it('wraps a scrolled offset into [0, 1)', () => {
    expect(scrollBeltOffset(0.02, 0.05)).toBeCloseTo(0.97, 9);
    expect(scrollBeltOffset(0.5, 3.25)).toBeCloseTo(0.25, 9);
    expect(scrollBeltOffset(0.5, 0)).toBe(0.5);
  });

  it('turns the idler rollers so their top surface runs with the cargo', () => {
    // RollerConveyor composes Euler(PI/2, angle, 0); the barrel axis is local y.
    const top = new THREE.Vector3(0, 0, -0.15); // pre-image of (0, 0.15, 0) at angle 0
    const at = (angle: number) =>
      top
        .clone()
        .applyQuaternion(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, angle, 0))
        );
    expect(at(0).y).toBeCloseTo(0.15, 9);
    expect(at(advanceRollerAngle(0, 0.01)).x).toBeGreaterThan(0);
  });

  it('turns the drive rollers so their top surface runs with the belt', () => {
    // The drive-roller group spins about its own z axis.
    const top = new THREE.Vector3(0, 0.12, 0);
    const moved = top.clone().applyEuler(new THREE.Euler(0, 0, advanceRollerAngle(0, 0.01)));
    expect(moved.x).toBeGreaterThan(0);
  });
});

/**
 * final4 med-12 packing: "the gravity rollers are about 0.5 m apart; real ones
 * are 0.1-0.15 m". They were 1 m apart: 0.3 m barrels with 0.7 m of air
 * between, which reads as a rack, not a roller bed. A bed's pitch is 1.25-1.5
 * barrel diameters.
 */
describe('idler roller bed', () => {
  it('pitches the 0.3 m barrels at no more than 1.4 diameters over the same 24 m run', () => {
    const pitch = idlerRollerX(1) - idlerRollerX(0);
    expect(pitch).toBeLessThanOrEqual(0.3 * 1.4);
    // Barrels never touch.
    expect(pitch - 0.3).toBeGreaterThanOrEqual(0.05);
    expect(idlerRollerX(0)).toBeCloseTo(-12, 9);
    expect(idlerRollerX(IDLER_ROLLER_COUNT - 1)).toBeCloseTo(12, 9);
  });
});

describe('belt travel follows the plant clock', () => {
  it('is still while the clock is held and scales with pace', () => {
    // lineMotionRate(0.8, gameSpeed, false) at paused, 1/2x, 1x, 2x.
    expect(beltTravelMetres(1 / 60, 0)).toBe(0);
    const half = beltTravelMetres(1 / 60, 0.4);
    const standard = beltTravelMetres(1 / 60, 0.8);
    const double = beltTravelMetres(1 / 60, 1.6);
    expect(standard).toBeCloseTo(5 * 0.8 * (1 / 60), 9);
    expect(half * 2).toBeCloseTo(standard, 9);
    expect(double).toBeCloseTo(standard * 2, 9);
  });

  it('never shows more than half a cleat per frame, so 4x cannot read as reversed', () => {
    const cleatPitch = 0.5;
    for (const rate of [3.2, 10]) {
      for (const delta of [1 / 60, 1 / 30, 5]) {
        expect(beltTravelMetres(delta, rate)).toBeLessThan(cleatPitch / 2);
      }
    }
  });

  it('caps roller spin at the authored rate that does not strobe', () => {
    expect(rollerSpinRate(0)).toBe(0);
    expect(rollerSpinRate(0.4)).toBe(0.4);
    expect(rollerSpinRate(3.2)).toBe(1);
  });
});

describe('sacks enter and leave by scale, never by a mid-belt pop', () => {
  it('is full size mid-belt and nearly gone at both ends', () => {
    expect(bagEdgeScale(0)).toBe(1);
    expect(bagEdgeScale(BAG_BOUNDARY)).toBe(BAG_MIN_SCALE);
    expect(bagEdgeScale(-BAG_BOUNDARY)).toBe(BAG_MIN_SCALE);
    expect(bagEdgeScale(BAG_BOUNDARY - 0.3)).toBeGreaterThan(BAG_MIN_SCALE);
    expect(bagEdgeScale(BAG_BOUNDARY - 0.3)).toBeLessThan(1);
  });

  it('never writes a singular instance matrix', () => {
    for (let x = -BAG_BOUNDARY - 1; x <= BAG_BOUNDARY + 1; x += 0.05) {
      expect(bagEdgeScale(x)).toBeGreaterThan(0);
    }
  });

  it('is invisible on both sides of the wrap, so the 42 m jump cannot be seen', () => {
    const before = BAG_BOUNDARY - 0.01;
    const after = advanceBagPosition(before, 5, 1, 0.016);
    expect(after).toBeLessThan(0);
    expect(bagEdgeScale(before)).toBeLessThan(0.02);
    expect(bagEdgeScale(after)).toBeLessThan(0.05);
  });

  it('refills a wrapped slot only while its packer is packing', () => {
    // Mid-belt a sack keeps whatever it carries.
    expect(nextBagOccupied(1, 1.1, true, false)).toBe(true);
    expect(nextBagOccupied(1, 1.1, false, true)).toBe(false);
    // At the wrap the slot re-enters at the head only if its packer is operating.
    expect(nextBagOccupied(BAG_BOUNDARY - 0.01, -BAG_BOUNDARY + 0.07, true, false)).toBe(false);
    expect(nextBagOccupied(BAG_BOUNDARY - 0.01, -BAG_BOUNDARY + 0.07, false, true)).toBe(true);
  });
});
