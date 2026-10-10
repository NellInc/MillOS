import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FairytaleCastle, CASTLE_COURT_SETTING } from './FairytaleCastle';
import { CASTLE_COURT_HEIGHT, CASTLE_STAIR_X } from '../../constants/castleAccess';

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
