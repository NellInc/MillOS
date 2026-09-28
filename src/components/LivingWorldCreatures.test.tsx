import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFrame } from '@react-three/fiber';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import {
  Fountain,
  FountainBird,
  FOUNTAIN_BIRD_PERCH,
  FALLBACK_FOUNTAIN_BIRD_PERCH,
} from './VillageArea';
import { Scarecrow } from './FarmArea';
import { playCritterSound } from '../utils/critterAudio';

const boundary = vi.hoisted(() => ({ fallback: false, reducedMotion: false }));
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => boundary.reducedMotion }));
vi.mock('../utils/frameThrottle', () => ({ shouldRunThisFrame: () => true }));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useFrame: vi.fn(),
}));
vi.mock('./models/GeneratedModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./models/GeneratedModel')>()),
  GeneratedBoundary: ({
    children,
    fallback,
  }: {
    children: React.ReactNode;
    fallback: React.ReactNode;
  }) => <>{boundary.fallback ? fallback : children}</>,
  GeneratedModel: () => null,
}));
vi.mock('./models/RiggedCreatureModel', () => ({
  CreatureBody: ({ creature }: { creature: string }) => <group name={`rigged-${creature}`} />,
}));
vi.mock('../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

afterEach(() => {
  cleanup();
  boundary.fallback = false;
  boundary.reducedMotion = false;
});

it.each([false, true])(
  'retains exactly one interactive fountain bird (fallback=%s)',
  (fallback) => {
    boundary.fallback = fallback;
    const view = render(<Fountain position={[0, 0, 0]} />);
    const birds = view.container.querySelectorAll('[name="fountain-bird"]');
    expect(birds).toHaveLength(1);
    expect(birds[0].getAttribute('position')).toBe(
      (fallback ? FALLBACK_FOUNTAIN_BIRD_PERCH : FOUNTAIN_BIRD_PERCH).join(',')
    );
    expect(playCritterSound).not.toHaveBeenCalled();
  }
);

it('restores the rigged crow on the scarecrow hat rather than a pen fence', () => {
  const view = render(<Scarecrow position={[0, 0, 0]} />);
  const crow = view.container.querySelector('[name="rigged-crow"]');
  expect(crow).not.toBeNull();
  expect(crow!.parentElement!.parentElement!.getAttribute('position')).toBe('0.2,3.018,0');
  expect(view.container.querySelector('[name="field-scarecrow"]')!.contains(crow)).toBe(true);
  expect(playCritterSound).not.toHaveBeenCalled();
});

it('seats both bird feet on the actual delivered fountain coping', async () => {
  const doc = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .read('public/models/village/fountain.glb');
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  try {
    for (const node of doc.getRoot().listNodes())
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
        );
        geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices()!.getArray()!, 1));
        geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
        meshes.push(
          new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        );
      }
    for (const foot of [-0.035, 0.035]) {
      const [x, y, z] = FOUNTAIN_BIRD_PERCH;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 4, z + foot),
        new THREE.Vector3(0, -1, 0)
      );
      const hit = ray.intersectObjects(meshes, false)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y).toBeCloseTo(y, 5);
    }
  } finally {
    meshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }
});

it('animates the shared bird silently and stops its motion when paused or reduced', () => {
  const original = useGameSimulationStore.getState();
  useGameSimulationStore.setState({ gameSpeed: 1, isTabVisible: true });
  const view = render(<FountainBird position={FOUNTAIN_BIRD_PERCH} />);
  const head = Object.assign(view.container.querySelector('[name="fountain-bird-head"]')!, {
    rotation: new THREE.Euler(),
  });
  const body = Object.assign(view.container.querySelector('[name="fountain-bird-motion"]')!, {
    position: new THREE.Vector3(),
  });
  const tick = () =>
    vi
      .mocked(useFrame)
      .mock.calls.at(-1)![0]({} as Parameters<Parameters<typeof useFrame>[0]>[0], 1 / 15);
  try {
    const angles = new Set<string>();
    for (let i = 0; i < 600; i++) {
      tick();
      angles.add(head.rotation.toArray().join(','));
    }
    expect(angles.size).toBeGreaterThan(50);
    expect(body.position.y).toBe(0);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    const held = head.rotation.clone();
    for (let i = 0; i < 30; i++) tick();
    expect(head.rotation.equals(held)).toBe(true);
    boundary.reducedMotion = true;
    view.rerender(<FountainBird position={[...FOUNTAIN_BIRD_PERCH]} />);
    tick();
    expect(head.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(playCritterSound).not.toHaveBeenCalled();
  } finally {
    useGameSimulationStore.setState({
      gameSpeed: original.gameSpeed,
      isTabVisible: original.isTabVisible,
    });
  }
});
