import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  FairytaleCastle,
  CASTLE_COURT_SETTING,
  CASTLE_APPROACH_BEDS,
  createCastleSetting,
  addCastleApproachBloom,
  CASTLE_DRAIN_RUNS,
  CASTLE_DRAINAGE_GEOMETRY,
  CASTLE_DRAINAGE_MATERIAL,
} from './FairytaleCastle';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleSceneryGroundHeight } from '../environment/foothillGround';
import { CASTLE_COURT_HEIGHT, CASTLE_STAIR_X } from '../../constants/castleAccess';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { NodeIO } from '@gltf-transform/core';

vi.mock('../models/GeneratedModel', () => ({ GeneratedBody: () => null }));

type Props = { children?: ReactNode; fallback?: ReactElement; geometry?: THREE.BufferGeometry };
const renderMemo = (type: unknown, props = {}): ReactElement<Props> =>
  (type as { type: (props: object) => ReactElement<Props> }).type(props);

it('fallback curved roofs have outward top and gable faces', () => {
  const castle = renderMemo(FairytaleCastle);
  const model = Children.toArray(castle.props.children).find(
    (child) => isValidElement<Props>(child) && child.props.fallback
  ) as ReactElement<Props>;
  const fallback = renderMemo(model.props.fallback!.type);
  const roofs: THREE.BufferGeometry[] = [];
  const visit = (children: ReactNode) => {
    Children.forEach(children, (child) => {
      if (!isValidElement<Props>(child)) return;
      if (child.props.geometry) roofs.push(child.props.geometry);
      visit(child.props.children);
    });
  };
  visit(fallback);
  expect(roofs).toHaveLength(10);
  const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  try {
    for (const [index, geometry] of roofs.entries()) {
      const mesh = new THREE.Mesh(geometry, geometry.groups.length ? materials : materials[0]);
      expect(Array.from(geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      geometry.computeBoundingBox();
      const top = geometry.boundingBox!.max.y;
      const hit = new THREE.Raycaster(
        new THREE.Vector3(0.01, top + 1, 0.01),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(mesh)[0];
      expect(hit?.point.y, `roof ${index}, ${geometry.type}`).toBeGreaterThan(top - 0.1);
    }
    const palas = new THREE.Mesh(roofs[0], materials);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(0, 5, 20),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(palas)[0];
    expect(hit?.point.z).toBeCloseTo(26.7 / 2, 5);
  } finally {
    materials.forEach((material) => material.dispose());
  }
});

it('seats the sheltered court furniture on its delivered datum and clears the gateway axis', () => {
  const bounds = CASTLE_COURT_SETTING.boundingBox!;
  expect(bounds.min.y).toBeCloseTo(CASTLE_COURT_HEIGHT, 5);
  expect(bounds.min.x).toBeGreaterThan(1.7);
  expect(bounds.max.x).toBeLessThan(4);
  expect(bounds.min.z).toBeGreaterThan(-10);
  expect(bounds.max.z).toBeLessThan(9.3);
  expect(CASTLE_COURT_SETTING.groups).toHaveLength(0);
  expect(CASTLE_COURT_SETTING.getAttribute('position').count / 3).toBeLessThan(1800);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  try {
    const setting = new THREE.Mesh(CASTLE_COURT_SETTING, material);
    for (const x of [CASTLE_STAIR_X - 1, CASTLE_STAIR_X, CASTLE_STAIR_X + 1]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, CASTLE_COURT_HEIGHT + 0.5, 16),
        new THREE.Vector3(0, 0, -1),
        0,
        26
      ).intersectObject(setting);
      expect(hit).toHaveLength(0);
    }
  } finally {
    material.dispose();
  }
});

for (const segments of [64, 128]) {
  it(`grounds the merged approach at terrain ${segments} and clears every stair`, () => {
    const { position, rotation, scale } = SITE_LAYOUT.landmarks.castle;
    const geometry = createCastleSetting([...position], [...rotation], scale, segments);
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(scale, scale, scale)
    );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      const points = geometry.getAttribute('position'),
        colours = geometry.getAttribute('color');
      const soil = new THREE.Color('#594e40');
      let grounded = 0;
      for (let i = 0; i < points.count; i++) {
        expect(Number.isFinite(points.getY(i))).toBe(true);
        if (
          Math.abs(colours.getX(i) - soil.r) > 1e-6 ||
          Math.abs(colours.getY(i) - soil.g) > 1e-6 ||
          Math.abs(colours.getZ(i) - soil.b) > 1e-6
        )
          continue;
        const world = new THREE.Vector3(
          points.getX(i),
          points.getY(i) - 0.2,
          points.getZ(i)
        ).applyMatrix4(transform);
        // The castle stands on the foothills; its beds meet the ridge surface.
        const floor = sampleSceneryGroundHeight(world.x, world.z, segments);
        expect(world.y - floor).toBeCloseTo(0.025 * scale, 4);
        grounded++;
      }
      expect(grounded).toBe(4 * 8 * 3 * 6);
      expect(geometry.groups).toHaveLength(0);
      expect(points.count / 3).toBeLessThan(5200);
      const mesh = new THREE.Mesh(geometry, material);
      for (const x of [CASTLE_STAIR_X - 1.9, CASTLE_STAIR_X, CASTLE_STAIR_X + 1.9])
        for (const z of [16, 20, 21.6, 24.7, 27])
          expect(
            new THREE.Raycaster(
              new THREE.Vector3(x, 7, z),
              new THREE.Vector3(0, -1, 0)
            ).intersectObject(mesh),
            `clear approach ${x}, ${z}`
          ).toHaveLength(0);
      for (const bed of CASTLE_APPROACH_BEDS) expect(bed.z - bed.depth / 2).toBeGreaterThan(19.2);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });
}

it('builds a closed stemmed bloom inside the existing bed and triangle budget', () => {
  const build = () => {
    const b = new PlotGeometry();
    addCastleApproachBloom(b, 0, 0.38, 0, '#b5accb');
    return b.finish();
  };
  const geometry = build(),
    repeated = build();
  try {
    expect(geometry.getAttribute('position').count / 3).toBe(32);
    expect(geometry.groups).toHaveLength(0);
    const bounds = geometry.boundingBox!;
    expect(bounds.min.y).toBeGreaterThan(0.14);
    expect(bounds.max.y).toBeLessThan(0.46);
    expect(
      Math.max(
        Math.abs(bounds.min.x),
        Math.abs(bounds.max.x),
        Math.abs(bounds.min.z),
        Math.abs(bounds.max.z)
      )
    ).toBeLessThan(0.26);
    expect([...geometry.getAttribute('position').array]).toEqual([
      ...repeated.getAttribute('position').array,
    ]);
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++)
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
  } finally {
    geometry.dispose();
    repeated.dispose();
  }
});

it('keeps the palas drainage finite, compact and clear of towers and the accessible route', () => {
  const g = CASTLE_DRAINAGE_GEOMETRY,
    p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  expect(p.count / 3).toBeLessThan(3000);
  expect(g.groups).toHaveLength(0);
  expect(g.getAttribute('color').count).toBe(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    expect([x, y, z].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    if (y > 3.5) expect(Math.hypot(x - 2.05, z + 14)).toBeGreaterThan(1.85);
  }
  expect(g.boundingBox!.min.x).toBeGreaterThan(-12.3);
  expect(g.boundingBox!.max.x).toBeLessThan(2.3);
  expect(g.boundingBox!.max.y).toBeLessThan(25.12);
  expect(g.boundingBox!.max.z).toBeLessThan(7);
  expect(CASTLE_DRAINAGE_MATERIAL.map).toBeNull();
  expect(CASTLE_DRAINAGE_MATERIAL.metalness).toBe(0);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  for (const x of [CASTLE_STAIR_X - 1.6, CASTLE_STAIR_X, CASTLE_STAIR_X + 1.6])
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(x, 7, 28),
        new THREE.Vector3(0, 0, -1),
        0,
        40
      ).intersectObject(mesh)
    ).toHaveLength(0);
  (mesh.material as THREE.Material).dispose();
});
it('seats the drainage straps, wall clips and outlets against the actual delivered castle', async () => {
  const doc = await new NodeIO().read('public/models/village/castle.glb');
  const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
  );
  g.setIndex(Array.from(primitive.getIndices()!.getArray()!));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const body = new THREE.Mesh(g, material),
    fittings = new THREE.Mesh(CASTLE_DRAINAGE_GEOMETRY, material);
  try {
    for (const r of CASTLE_DRAIN_RUNS) {
      for (const [z, direction] of [
        [r.startZ - 0.1, 1],
        [r.endZ + 0.1, -1],
      ]) {
        const cap = new THREE.Raycaster(
          new THREE.Vector3(r.gutterX, 24.95, z),
          new THREE.Vector3(0, 0, direction),
          0,
          0.2
        ).intersectObject(fittings)[0];
        expect(cap, 'closed gutter end').toBeDefined();
      }
      const strapCount = Math.ceil((r.endZ - r.startZ) / 4);
      for (let i = 0; i <= strapCount; i++) {
        const z = r.startZ + 0.3 + (i / strapCount) * (r.endZ - r.startZ - 0.6);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(r.gutterX - r.side * 0.05, 26, z),
          new THREE.Vector3(0, -1, 0),
          0,
          2
        );
        const roof = ray.intersectObject(body)[0],
          strap = ray.intersectObject(fittings)[0];
        expect(strap.point.y).toBeGreaterThan(roof.point.y);
        expect(strap.point.y - roof.point.y).toBeLessThan(0.1);
      }
      for (const z of [r.startZ + 0.5, (r.startZ + r.endZ) / 2, r.endZ - 0.5]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(r.gutterX - r.side * 0.05, 26, z),
          new THREE.Vector3(0, -1, 0),
          0,
          2
        );
        const roof = ray.intersectObject(body)[0],
          strap = ray.intersectObject(fittings)[0];
        expect(roof).toBeDefined();
        expect(strap).toBeDefined();
        expect(roof.point.y).toBeGreaterThan(24.99);
        expect(roof.point.y).toBeLessThan(25.12);
      }
      for (const y of [5.2, 10, 14.8, 19.6, 23.7]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(r.wallX + r.side, y, r.z),
          new THREE.Vector3(-r.side, 0, 0)
        );
        const wall = ray.intersectObject(body)[0],
          plate = ray.intersectObject(fittings);
        expect(wall.point.x).toBeCloseTo(r.wallX, 4);
        expect(plate[0].distance).toBeLessThan(wall.distance);
        expect(
          plate.some((hit) => hit.distance > wall.distance && hit.distance < wall.distance + 0.1)
        ).toBe(true);
      }
      const floor = new THREE.Raycaster(
        new THREE.Vector3(r.drainX, 3.3, r.z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(body)[0];
      expect(floor.point.y).toBeCloseTo(3.2, 4);
      expect(Math.abs(r.drainX - r.pipeX)).toBeCloseTo(0.28, 5);
    }
    expect(CASTLE_DRAIN_RUNS[1].drainX).toBeCloseTo(2.05, 5);
  } finally {
    g.dispose();
    material.dispose();
  }
});
