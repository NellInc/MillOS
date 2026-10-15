import { describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import * as THREE from 'three';
import { ConveyorBridge, RoadRiverBridge } from '../FactoryExterior';
import { BULK_STORAGE_GALLERY } from '../../constants/siteLayout';

vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

describe('elevator conveyor alignment', () => {
  it('retains an enclosed grain path and a bounded, open, guarded catwalk', () => {
    const start = BULK_STORAGE_GALLERY.head;
    const end = BULK_STORAGE_GALLERY.nearBin;
    const length = new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...end));
    const tree = ConveyorBridge({ start: [...start], end: [...end] });
    if (tree instanceof Promise) throw new Error('ConveyorBridge must render synchronously');
    const elements: Array<ReactElement<Record<string, unknown>>> = [];
    const visit = (node: ReactNode) =>
      Children.forEach(node, (child) => {
        if (!isValidElement<Record<string, unknown>>(child)) return;
        elements.push(child);
        visit(child.props.children as ReactNode);
      });
    visit(tree);
    const named = (name: string) => elements.filter((node) => node.props.name === name);
    expect(named('gallery-enclosed-conveyor')[0].props.size).toEqual([1, 0.45, length]);
    expect(named('gallery-walkway')[0].props.size).toEqual([2.4, 0.12, length]);
    expect(named('gallery-guardrail-post')).toHaveLength(2 * (Math.ceil(length / 5) + 1));
    expect(named('gallery-truss-brace')).toHaveLength(2 * Math.ceil(length / 5));
    const boxes = elements.filter((node) => node.type === 'boxGeometry');
    for (const box of boxes)
      expect(
        (box.props.args as number[]).every((value) => Number.isFinite(value) && value > 0)
      ).toBe(true);
    expect((boxes.length + 2) * 12).toBeLessThan(900);
  });

  it('joins both actual endpoints for ascending, descending and level spans', () => {
    for (const [start, end] of [
      [BULK_STORAGE_GALLERY.head, BULK_STORAGE_GALLERY.nearBin],
      [BULK_STORAGE_GALLERY.nearBin, BULK_STORAGE_GALLERY.farBin],
      [
        [0, 4, 0],
        [-10, 12, 9],
      ],
    ] as const) {
      const group = ConveyorBridge({ start: [...start], end: [...end] }) as ReactElement<{
        position: [number, number, number];
        quaternion: THREE.Quaternion;
      }>;
      const length = new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...end));
      for (const [sign, expected] of [
        [-1, start],
        [1, end],
      ] as const) {
        const actual = new THREE.Vector3(0, 0, (sign * length) / 2)
          .applyQuaternion(group.props.quaternion)
          .add(new THREE.Vector3(...group.props.position));
        expect(actual.distanceTo(new THREE.Vector3(...expected))).toBeLessThan(1e-8);
      }
    }
  });
});

// Realise the actual pure JSX assembly, so a merged support still has to keep
// the same clear carriageway as its original separate source meshes.
function roadAssembly() {
  const root = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const visit = (node: ReactNode, parent: THREE.Object3D) =>
    Children.forEach(node, (child) => {
      if (!isValidElement<Record<string, unknown>>(child)) return;
      const p = child.props;
      if (child.type === 'boxGeometry' || child.type === 'planeGeometry') {
        const a = p.args as [number, number, number];
        const g =
          child.type === 'boxGeometry'
            ? new THREE.BoxGeometry(...a)
            : new THREE.PlaneGeometry(a[0], a[1]);
        (parent as THREE.Mesh).geometry = g;
        owned.push(g);
        return;
      }
      if (child.type !== 'group' && child.type !== 'mesh') return;
      const object =
        child.type === 'mesh'
          ? new THREE.Mesh(p.geometry as THREE.BufferGeometry)
          : new THREE.Group();
      if (p.position) object.position.fromArray(p.position as number[]);
      if (p.rotation) object.rotation.fromArray(p.rotation as [number, number, number]);
      parent.add(object);
      visit(p.children as ReactNode, object);
    });
  visit(RoadRiverBridge({}) as ReactNode, root);
  root.updateMatrixWorld(true);
  return { root, dispose: () => owned.forEach((g) => g.dispose()) };
}

describe('actual road river bridge', () => {
  it('keeps every pier and bearing below the unchanged wearing course', () => {
    const { root, dispose } = roadAssembly();
    try {
      for (const x of [-26, -20, -14])
        for (const z of [-173, -159, -145, -131, -117]) {
          const hit = new THREE.Raycaster(
            new THREE.Vector3(x, 3, z),
            new THREE.Vector3(0, -1, 0)
          ).intersectObject(root, true)[0];
          expect(hit?.point.y, `carriageway at ${x},${z}`).toBeCloseTo(0.61, 5);
        }
    } finally {
      dispose();
    }
  });
});
