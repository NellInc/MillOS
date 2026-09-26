import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { restoreGeometryOrigin } from '../models/GeneratedGeometrySurface';
import { SIFTER_LAYOUT, SITE_LAYOUT, SILO_ACCESS_LAYOUT } from '../../constants/siteLayout';
import { MachineType } from '../../types';
import { MILL_FEEDER_FASTENERS } from './machineFinishGeometry';
import {
  MACHINE_PART_GEOMETRY,
  MILL_FEEDER_LAYOUT,
  MACHINE_BEACON_MOUNTS,
  MACHINE_BEACON_SCALE,
  MACHINE_BEACON_BASE_SCALE,
  getMillRollerRotation,
  writeSiloFillInstance,
} from './CompactMachines';

/**
 * Machine parts are shared unit geometry instanced with hand-tuned non-uniform
 * scales, and they are positioned against each other in world space: the
 * stiffener rings stand proud of the silo shell, the roof eave overhangs it,
 * the fan grille sits buried in the mill body panel. Every one of those
 * relationships is expressed as a raw number in the instance matrices rather
 * than derived from the geometry, so reshaping a part is only safe while its
 * unit half-extents stay exactly where they were.
 *
 * These are the half-extents the instance matrices in CompactMachines assume.
 * A failure here means a geometry change moved a part relative to neighbours
 * that were never told about it - fix the geometry, not this table.
 */
const EXPECTED_HALF_EXTENTS: Record<
  keyof typeof MACHINE_PART_GEOMETRY,
  readonly [number, number, number]
> = {
  siloShell: [1, 0.5, 1],
  siloRoof: [1, 0.5, 1],
  siloOutlet: [1, 0.5, 1],
  siloRing: [1.03, 0.04, 1.03],
  hopper: [1, 0.5, 1],
  millFeeder: [0.5, 0.5, 0.5],
  millBody: [0.5, 0.5, 0.5],
  packerBody: [0.5, 0.5, 0.5],
  sifterCap: [0.5, 0.5, 0.5],
  roller: [1, 0.5, 1],
  inlet: [1, 0.5, 1],
  beacon: [1, 1, 1],
  // Ring outline in XY, tube along Z - three.js orients a torus that way, and
  // the grille is instanced at [0.78, 0.52, 0.09], so Z is the squashed axis.
  fanGrille: [1.1, 1.1, 0.1],
};

const halfExtents = (geometry: THREE.BufferGeometry): [number, number, number] => {
  const position = geometry.getAttribute('position');
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < position.count; index += 1) {
    x = Math.max(x, Math.abs(position.getX(index)));
    y = Math.max(y, Math.abs(position.getY(index)));
    z = Math.max(z, Math.abs(position.getZ(index)));
  }
  return [x, y, z];
};

describe('shared machine part geometry', () => {
  it('retains the installed silo frame across initial and subsequent fill updates', () => {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 16),
      new THREE.MeshBasicMaterial(),
      1
    );
    const object = new THREE.Object3D();
    const machine = {
      position: [65, 0, 59] as [number, number, number],
      size: SITE_LAYOUT.machineDimensions.silo,
    };
    const matrix = new THREE.Matrix4(),
      position = new THREE.Vector3(),
      scale = new THREE.Vector3();
    for (const fill of [0.5, 0.02, 1, 0.73]) {
      writeSiloFillInstance(mesh, 0, object, machine, fill);
      mesh.getMatrixAt(0, matrix);
      matrix.decompose(position, new THREE.Quaternion(), scale);
      expect(scale.x).toBeCloseTo((2.02 * 12) / 4.5, 5);
      expect(scale.z).toBeCloseTo(scale.x, 5);
      expect(scale.y).toBeCloseTo(fill * 23.8, 5);
      expect(position.y - scale.y / 2).toBeCloseTo(5.1, 5);
      expect(position.toArray().filter((_, axis) => axis !== 1)).toEqual([65, 59]);
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
  });

  it('keeps the discharge enclosure cylindrical and flush with the storage pad', () => {
    const p = MACHINE_PART_GEOMETRY.siloOutlet.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const radius = Math.hypot(p.getX(i), p.getZ(i));
      if (radius > 1e-6) expect(radius).toBeCloseTo(1, 5);
    }
    const layout = SILO_ACCESS_LAYOUT;
    expect((layout.baseCentreY - layout.baseHeight / 2) * 2).toBeCloseTo(
      SITE_LAYOUT.bulkStorage.siloPad.size[1] / 2,
      6
    );
    expect((layout.baseCentreY + layout.baseHeight / 2) * 2).toBeCloseTo(5, 6);
    expect((layout.baseRadius * 12) / 4.5).toBe(6);
  });

  it('uses shallow, finite corrugation at the actual twelve-metre drum scale', () => {
    const geometry = MACHINE_PART_GEOMETRY.siloShell;
    const p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal');
    let minRadius = Infinity,
      maxRadius = 0;
    for (let i = 0; i < p.count; i++) {
      const radius = Math.hypot(p.getX(i), p.getZ(i));
      if (radius < 1e-6) continue;
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    }
    expect((maxRadius - minRadius) * 6).toBeCloseTo(0.024, 5);
    expect(geometry.index!.count / 3).toBe(10368);
  });

  it('attaches the delivered silo atlas to the current authored topology', async () => {
    const document = await new NodeIO().read('public/models/world/machine-silo-unit.glb');
    const node = document
      .getRoot()
      .listNodes()
      .find((candidate) => candidate.getMesh())!;
    const primitive = node.getMesh()!.listPrimitives()[0];
    const delivered = new THREE.BufferGeometry();
    for (const [semantic, attribute] of [
      ['POSITION', 'position'],
      ['NORMAL', 'normal'],
      ['TEXCOORD_0', 'uv'],
    ]) {
      const accessor = primitive.getAttribute(semantic)!;
      delivered.setAttribute(
        attribute,
        new THREE.BufferAttribute(new Float32Array(accessor.getArray()!), accessor.getElementSize())
      );
    }
    delivered.setIndex(Array.from(primitive.getIndices()!.getArray()!));
    const atlas = new THREE.Texture(),
      material = new THREE.MeshStandardMaterial({ normalMap: atlas });
    const mesh = new THREE.Mesh(delivered, material);
    mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
    const restored = restoreGeometryOrigin(mesh, MACHINE_PART_GEOMETRY.siloShell).geometry;
    try {
      expect(restored.getAttribute('uv1').count).toBe(30912);
      expect(restored.getAttribute('uv').count).toBe(30912);
      restored.computeBoundingBox();
      expect(restored.boundingBox!.min.y).toBeCloseTo(-0.5, 5);
      expect(restored.boundingBox!.max.y).toBeCloseTo(0.5, 5);
      const n = restored.getAttribute('normal');
      let maxNormalError = 0;
      for (let i = 0; i < n.count; i++)
        maxNormalError = Math.max(
          maxNormalError,
          Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1)
        );
      expect(maxNormalError).toBeLessThan(1e-5);
    } finally {
      restored.dispose();
      delivered.dispose();
      material.dispose();
      atlas.dispose();
    }
  });

  it('smooths the cast crown across courses without bowing the chamber wall', () => {
    const geometry = MACHINE_PART_GEOMETRY.millBody;
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    const normals = new Map<string, THREE.Vector3>();
    let sharedCorners = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (Math.abs(y - 0.3) < 1e-6) expect(n.getY(i)).toBeCloseTo(0, 6);
      if (y < 0.3 - 1e-6) continue;
      const key = [p.getX(i), y, p.getZ(i)].map((v) => v.toFixed(6)).join(',');
      const value = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      expect(value.length()).toBeCloseTo(1, 5);
      const prior = normals.get(key);
      if (prior) {
        expect(value.distanceTo(prior), key).toBeLessThan(1e-6);
        sharedCorners++;
      }
      normals.set(key, value);
    }
    expect(sharedCorners).toBeGreaterThan(40);
  });

  it('seats every compact beacon on the actual housing geometry', () => {
    type Vec3 = readonly [number, number, number];
    const surfaces: ReadonlyArray<readonly [MachineType, THREE.BufferGeometry, Vec3, Vec3]> = [
      [MachineType.SILO, MACHINE_PART_GEOMETRY.siloRoof, [0, 15.65, 0], [2.35, 1.65, 2.35]],
      [MachineType.ROLLER_MILL, MACHINE_PART_GEOMETRY.millBody, [0, 2.7, 0], [4.8, 4.7, 3.8]],
      [
        MachineType.PLANSIFTER,
        MACHINE_PART_GEOMETRY.sifterCap,
        [0, SIFTER_LAYOUT.capCentreY, 0],
        [5.6, SIFTER_LAYOUT.capHeight, 4.8],
      ],
      [MachineType.PACKER, MACHINE_PART_GEOMETRY.packerBody, [0, 2.65, 0], [3.7, 4.75, 3.45]],
    ];
    const material = new THREE.MeshBasicMaterial();
    for (const [type, geometry, position, scale] of surfaces) {
      const mount = MACHINE_BEACON_MOUNTS[type]!;
      const surface = new THREE.Mesh(geometry, material);
      surface.position.set(...position);
      surface.scale.set(...scale);
      surface.updateMatrixWorld();
      // Check the seat perimeter too: a centre-point hit could leave half the
      // mounting foot hanging over a chamfer.
      for (let corner = 0; corner < 8; corner++) {
        const angle = (corner * Math.PI) / 4;
        const origin = new THREE.Vector3(
          mount[0] + Math.cos(angle) * MACHINE_BEACON_BASE_SCALE[0],
          mount[1] + 1,
          mount[2] + Math.sin(angle) * MACHINE_BEACON_BASE_SCALE[2]
        );
        const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(
          surface
        );
        expect(hits.length, `${type} mount perimeter ${corner}`).toBeGreaterThan(0);
        expect(hits[0].point.y, type).toBeCloseTo(mount[1], 2);
      }
    }
    expect(MACHINE_BEACON_SCALE[0]).toBeLessThan(0.12);
    expect(0.23 - MACHINE_BEACON_SCALE[1]).toBeCloseTo(0.04 + MACHINE_BEACON_BASE_SCALE[1] / 2);
    material.dispose();
  });

  it('keeps the lighter feed casting on the existing pipe connection and inside the chamber', () => {
    const feeder = MACHINE_PART_GEOMETRY.millFeeder;
    feeder.computeBoundingBox();
    const bounds = feeder.boundingBox!;
    const [width, height, depth] = MILL_FEEDER_LAYOUT.scale;
    expect(MILL_FEEDER_LAYOUT.height + bounds.max.y * height).toBeCloseTo(6.59, 5);
    expect(MILL_FEEDER_LAYOUT.height + bounds.min.y * height).toBeCloseTo(4.97, 5);
    expect((bounds.max.x - bounds.min.x) * width).toBeLessThan(4.8 * 0.6);
    expect((bounds.max.z - bounds.min.z) * depth).toBeLessThan(3.8 * 0.7);

    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(feeder, material);
    mesh.position.y = MILL_FEEDER_LAYOUT.height;
    mesh.scale.set(...MILL_FEEDER_LAYOUT.scale);
    mesh.updateMatrixWorld();
    for (const [x, y, z] of MILL_FEEDER_FASTENERS) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y + 1, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeGreaterThan(y - 0.075 / 2);
      expect(hits[0].point.y).toBeLessThan(y + 0.075 / 2 - 0.02);
    }
    material.dispose();
  });

  it('spins the chill rolls around their shafts without sweeping through the guards', () => {
    const localShaft = new THREE.Vector3(0, 1, 0);
    const localSurface = new THREE.Vector3(1, 0, 0);
    const surfacePositions: THREE.Vector3[] = [];
    for (const spin of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const rotation = new THREE.Euler(...getMillRollerRotation(spin));
      const shaft = localShaft.clone().applyEuler(rotation);
      expect(shaft.x).toBeCloseTo(-1, 8);
      expect(shaft.y).toBeCloseTo(0, 8);
      expect(shaft.z).toBeCloseTo(0, 8);
      const surface = localSurface.clone().applyEuler(rotation);
      expect(surface.x).toBeCloseTo(0, 8);
      expect(Math.hypot(surface.y, surface.z)).toBeCloseTo(1, 8);
      surfacePositions.push(surface);
    }
    expect(surfacePositions[0].distanceTo(surfacePositions[1])).toBeCloseTo(Math.SQRT2, 8);
  });

  it('keeps every shared geometry finite', () => {
    for (const [name, geometry] of Object.entries(MACHINE_PART_GEOMETRY)) {
      const position = geometry.getAttribute('position');
      expect(position, `${name} should have position data`).toBeDefined();
      for (let index = 0; index < position.count; index += 1) {
        expect(Number.isFinite(position.getX(index)), `${name} x${index}`).toBe(true);
        expect(Number.isFinite(position.getY(index)), `${name} y${index}`).toBe(true);
        expect(Number.isFinite(position.getZ(index)), `${name} z${index}`).toBe(true);
      }
    }
  });

  it('holds the unit envelope every instance matrix is tuned against', () => {
    for (const [name, expected] of Object.entries(EXPECTED_HALF_EXTENTS)) {
      const geometry = MACHINE_PART_GEOMETRY[name as keyof typeof MACHINE_PART_GEOMETRY];
      const actual = halfExtents(geometry);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(actual[axis], `${name} half-extent on ${'xyz'[axis]}`).toBeCloseTo(
          expected[axis],
          4
        );
      }
    }
  });

  it('keeps the stiffener rings standing proud of the corrugated shell', () => {
    // The shell corrugation cuts inward from radius 1.0 and the rings sit at
    // 1.03. If a shell change ever pushed past the rings they would be
    // swallowed by the wall instead of reading as bolted bands.
    const [shellX] = halfExtents(MACHINE_PART_GEOMETRY.siloShell);
    const [ringX] = halfExtents(MACHINE_PART_GEOMETRY.siloRing);
    expect(ringX).toBeGreaterThan(shellX);
  });

  it('gives the bin roof an eave lip and a peak collar', () => {
    // The silhouette features that make the roof read as a grain bin rather
    // than a cone: full radius at the rim, and a narrow collar still standing
    // at the very top instead of tapering to a point.
    const position = MACHINE_PART_GEOMETRY.siloRoof.getAttribute('position');
    let radiusAtRim = 0;
    let radiusAtPeak = 0;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      const radius = Math.hypot(position.getX(index), position.getZ(index));
      if (y <= -0.49) radiusAtRim = Math.max(radiusAtRim, radius);
      if (y >= 0.49) radiusAtPeak = Math.max(radiusAtPeak, radius);
    }
    expect(radiusAtRim).toBeCloseTo(1, 4);
    expect(radiusAtPeak).toBeGreaterThan(0.05);
    expect(radiusAtPeak).toBeLessThan(0.2);
  });

  it('matches the roof and ring facets to the shell so edges do not beat', () => {
    // Shared facet boundaries only line up when the segment counts agree.
    // Counting distinct angles is resolution-independent, unlike vertex counts.
    const distinctAngles = (geometry: THREE.BufferGeometry): number => {
      const position = geometry.getAttribute('position');
      const angles = new Set<string>();
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const z = position.getZ(index);
        if (Math.hypot(x, z) < 1e-6) continue; // poles and cap centres
        angles.add(Math.atan2(z, x).toFixed(4));
      }
      return angles.size;
    };

    const shell = distinctAngles(MACHINE_PART_GEOMETRY.siloShell);
    expect(distinctAngles(MACHINE_PART_GEOMETRY.siloRoof)).toBe(shell);
    expect(distinctAngles(MACHINE_PART_GEOMETRY.siloOutlet)).toBe(shell);
    expect(distinctAngles(MACHINE_PART_GEOMETRY.siloRing)).toBe(shell);
  });
});
