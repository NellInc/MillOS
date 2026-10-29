import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrganicLakeBankGeometry } from './organicLakeGeometry';
import { createLakeShoreDetails } from './lakeShoreDetails';
import {
  createLakeDragonflyGeometry,
  createLakeDragonflyContacts,
  writeLakeDragonflyLegPose,
  createLakeDragonflyPerches,
  disposeLakeDragonflies,
  LAKE_DRAGONFLY_BOUNDS,
  LAKE_DRAGONFLY_COUNT,
  writeLakeDragonflyPose,
  writeLakeDragonflyWingPose,
} from './LakeDragonflies';

describe('lake dragonflies', () => {
  it('has finite shaped bodies and veined wings in three bounded instanced draws', () => {
    const geometry = createLakeDragonflyGeometry();
    let triangles = 0;
    for (const [key, count] of [
      ['body', 4],
      ['wing', 16],
      ['leg', 48],
    ] as const) {
      const g = geometry[key],
        p = g.getAttribute('position'),
        n = g.getAttribute('normal');
      expect(g.getAttribute('color').count).toBe(p.count);
      expect(g.getAttribute('uv').count).toBe(p.count);
      for (let i = 0; i < p.count; i++) {
        expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
      }
      triangles += ((g.index?.count ?? p.count) / 3) * count;
      g.dispose();
    }
    expect(triangles).toBeLessThan(7000);
    expect(geometry.body.boundingBox!.min.x).toBeLessThan(-0.08);
    expect(geometry.wing.boundingBox!.max.z).toBeGreaterThan(0.09);
  });

  it('chooses four separated perches from actual high reed surface vertices', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const details = createLakeShoreDetails(bank),
      p = details.vegetation.getAttribute('position');
    const perches = createLakeDragonflyPerches(details.vegetation);
    expect(perches).toHaveLength(LAKE_DRAGONFLY_COUNT);
    const contacts = createLakeDragonflyContacts(details.vegetation, perches);
    for (const [index, perch] of perches.entries()) {
      const pose = new THREE.Object3D();
      writeLakeDragonflyPose(index, 36 - index * 8.7, perch, pose);
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const support = new THREE.Mesh(details.vegetation, material);
      for (let leg = 0; leg < 6; leg++) {
        const segment = new THREE.Object3D();
        writeLakeDragonflyLegPose(leg, 1, 0, contacts[index][leg], segment);
        const matrix = new THREE.Matrix4().multiplyMatrices(pose.matrix, segment.matrix);
        const foot = new THREE.Vector3(0, 0.5, 0).applyMatrix4(matrix);
        const hit = new THREE.Raycaster(
          new THREE.Vector3(foot.x, 3, foot.z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(support)[0];
        expect(hit).toBeDefined();
        expect(Math.abs(foot.y - hit.point.y)).toBeLessThan(0.00001);
        for (const lift of [0, 0.5, 1])
          for (let part = 0; part < 2; part++) {
            writeLakeDragonflyLegPose(leg, part, lift, contacts[index][leg], segment);
            expect(segment.matrix.elements.every(Number.isFinite)).toBe(true);
            expect(segment.matrix.determinant()).toBeGreaterThan(0);
          }
      }
      material.dispose();
      expect(perch.y).toBeGreaterThan(1);
      let matches = false;
      for (let i = 0; i < p.count; i++) {
        if (perch.x === p.getX(i) && perch.y === p.getY(i) && perch.z === p.getZ(i)) matches = true;
      }
      expect(matches).toBe(true);
      expect(perch.length()).toBeLessThan(LAKE_DRAGONFLY_BOUNDS - 1);
    }
    for (let i = 1; i < perches.length; i++)
      expect(perches[i].distanceTo(perches[i - 1])).toBeGreaterThan(10);
    bank.dispose();
    for (const key of ['vegetation', 'stones', 'brush', 'gravel', 'moss', 'groundcover'] as const)
      details[key].dispose();
  });

  it('takes off smoothly and holds all transforms at a fixed phase', () => {
    const perch = new THREE.Vector3(18, 1.5, 7),
      a = new THREE.Object3D(),
      b = new THREE.Object3D();
    for (let i = 0; i < LAKE_DRAGONFLY_COUNT; i++) {
      const rest = 36 - i * 8.7;
      expect(writeLakeDragonflyPose(i, rest, perch, a)).toBe(0);
      for (let t = 0; t <= 72; t += 0.1) {
        const lift = writeLakeDragonflyPose(i, t, perch, a);
        writeLakeDragonflyPose(i, t, perch, b);
        expect(a.matrix.elements).toEqual(b.matrix.elements);
        expect(a.position.y).toBeGreaterThan(perch.y);
        expect(a.position.length() + 0.2).toBeLessThan(LAKE_DRAGONFLY_BOUNDS);
        writeLakeDragonflyPose(i, t + 1 / 120, perch, b);
        expect(a.position.distanceTo(b.position)).toBeLessThan(0.01);
        for (let wing = 0; wing < 4; wing++) {
          writeLakeDragonflyWingPose(wing, t, i, lift, a);
          writeLakeDragonflyWingPose(wing, t, i, lift, b);
          expect(a.matrix.elements).toEqual(b.matrix.elements);
          expect(a.matrix.determinant()).toBeGreaterThan(0.8);
        }
      }
    }
    writeLakeDragonflyPose(0, 12, perch, a);
    writeLakeDragonflyPose(0, 12.1, perch, b);
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(0.01);
    writeLakeDragonflyWingPose(0, 12, 0, 1, a);
    writeLakeDragonflyWingPose(0, 12.01, 0, 1, b);
    expect(a.matrix.elements).not.toEqual(b.matrix.elements);
  });

  it('keeps wings positive-determinant so instanced normals and winding agree', () => {
    const pose = new THREE.Object3D();
    for (let wing = 0; wing < 4; wing++) {
      writeLakeDragonflyWingPose(wing, 12, 0, 1, pose);
      expect(pose.matrix.determinant()).toBeGreaterThan(0.8);
    }
  });

  it('disposes all three instance meshes and all component-owned resources', () => {
    const geometry = createLakeDragonflyGeometry();
    const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const body = new THREE.InstancedMesh(geometry.body, materials[0], 4);
    const wings = new THREE.InstancedMesh(geometry.wing, materials[1], 16);
    const legs = new THREE.InstancedMesh(geometry.leg, materials[0], 48);
    body.setColorAt(0, new THREE.Color('#ffffff'));
    const disposed: string[] = [];
    for (const [name, resource] of Object.entries({
      body,
      wings,
      legs,
      geometryBody: geometry.body,
      geometryWing: geometry.wing,
      geometryLeg: geometry.leg,
      materialBody: materials[0],
      materialWing: materials[1],
    })) {
      resource.addEventListener('dispose', () => disposed.push(name));
    }
    disposeLakeDragonflies(geometry, materials, body, wings, legs);
    expect(disposed).toEqual([
      'body',
      'wings',
      'legs',
      'geometryBody',
      'geometryWing',
      'geometryLeg',
      'materialBody',
      'materialWing',
    ]);
  });
});
