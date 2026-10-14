import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFrame } from '@react-three/fiber';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import {
  BlacksmithHorse,
  Fountain,
  FountainBird,
  FOUNTAIN_BIRD_PERCH,
  FALLBACK_FOUNTAIN_BIRD_PERCH,
} from './VillageArea';
import { Scarecrow } from './FarmArea';
import { playCritterSound } from '../utils/critterAudio';

const boundary = vi.hoisted(() => ({
  fallback: false,
  reducedMotion: false,
  rigAngles: [] as number[],
  asset: null as unknown,
}));
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
vi.mock('./models/RiggedCreatureModel', async () => {
  const React = (await import('react')).default;
  return {
    CreatureBody: React.forwardRef(({ creature }: { creature: string }, ref) => {
      React.useImperativeHandle(ref, () => ({
        setGraze: vi.fn(),
        setStride: vi.fn(),
        setHeadShake: (angle: number) => boundary.rigAngles.push(angle),
      }));
      return <group name={`rigged-${creature}`} />;
    }),
  };
});
vi.mock('../utils/dracoLoader', () => ({ useDracoGLTF: () => boundary.asset }));
vi.mock('./effects/HeartParticle', () => ({
  HeartParticle: ({ position }: { position: [number, number, number] }) => (
    <group name="horse-pet-heart" position={position} />
  ),
}));
vi.mock('../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

afterEach(() => {
  cleanup();
  boundary.fallback = false;
  boundary.reducedMotion = false;
  boundary.rigAngles.length = 0;
  boundary.asset = null;
  vi.clearAllMocks();
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

it('drives one forge horse through its rig handle, keeps the root grounded and observes pause/hidden/safety/reduced holds', () => {
  const original = useGameSimulationStore.getState();
  useGameSimulationStore.setState({
    gameSpeed: 1,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  const view = render(<BlacksmithHorse position={[-4.35, 0, 4.6]} rotation={Math.PI / 4} />);
  const horse = view.container.querySelector('[name="blacksmith-horse"]')!;
  const tick = () =>
    vi
      .mocked(useFrame)
      .mock.calls.at(-1)![0]({} as Parameters<Parameters<typeof useFrame>[0]>[0], 1 / 15);
  try {
    expect(view.container.querySelectorAll('[name="rigged-horse"]')).toHaveLength(1);
    expect(playCritterSound).not.toHaveBeenCalled();
    for (let i = 0; i < 600; i++) tick();
    expect(new Set(boundary.rigAngles).size).toBeGreaterThan(20);
    expect(Math.max(...boundary.rigAngles.map(Math.abs))).toBeLessThanOrEqual(0.064);
    const freeze = () => {
      const count = boundary.rigAngles.length;
      for (let i = 0; i < 30; i++) tick();
      expect(boundary.rigAngles).toHaveLength(count);
    };
    useGameSimulationStore.setState({ gameSpeed: 0 });
    freeze();
    useGameSimulationStore.setState({ gameSpeed: 1, isTabVisible: false });
    freeze();
    useGameSimulationStore.setState({ isTabVisible: true, emergencyDrillMode: true });
    freeze();
    fireEvent.click(horse);
    expect(playCritterSound).not.toHaveBeenCalled();
    useGameSimulationStore.setState({ emergencyDrillMode: false });
    fireEvent.click(horse);
    expect(playCritterSound).toHaveBeenCalledOnce();
    for (let i = 0; i < 20; i++) tick();
    expect(Math.max(...boundary.rigAngles.map(Math.abs))).toBeLessThanOrEqual(0.11);
    expect(horse.getAttribute('position')).toBe('-4.35,0,4.6');
    boundary.reducedMotion = true;
    view.rerender(<BlacksmithHorse position={[-4.35, 0, 4.6]} rotation={Math.PI / 4} />);
    tick();
    expect(boundary.rigAngles.at(-1)).toBe(0);
    freeze();
  } finally {
    useGameSimulationStore.setState({
      gameSpeed: original.gameSpeed,
      isTabVisible: original.isTabVisible,
      emergencyActive: original.emergencyActive,
      emergencyDrillMode: original.emergencyDrillMode,
    });
  }
});

it('disposes only a private creature skeleton and preserves the cached rig, geometry, material and maps', async () => {
  const { RiggedCreatureModel } = await vi.importActual<
    typeof import('./models/RiggedCreatureModel')
  >('./models/RiggedCreatureModel');
  const source = new THREE.Group(),
    root = new THREE.Bone(),
    head = new THREE.Bone();
  root.name = 'Root';
  head.name = 'Head';
  head.position.y = 1;
  root.add(head);
  source.add(root);
  const skin = new THREE.Skeleton([root, head]),
    geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshStandardMaterial();
  material.map = new THREE.Texture();
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count * 4), 4)
  );
  const weights = new Float32Array(geometry.attributes.position.count * 4);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.bind(skin);
  source.add(mesh);
  source.updateMatrixWorld(true);
  boundary.asset = { scene: source };
  const skinDispose = vi.spyOn(THREE.Skeleton.prototype, 'dispose'),
    geometryDispose = vi.spyOn(geometry, 'dispose'),
    materialDispose = vi.spyOn(material, 'dispose'),
    mapDispose = vi.spyOn(material.map, 'dispose');
  const ref = React.createRef<import('./models/RiggedCreatureModel').CreatureRigHandle>();
  const view = render(<RiggedCreatureModel creature="horse" ref={ref} />);
  ref.current!.setHeadShake(0.1);
  expect(head.quaternion.equals(new THREE.Quaternion())).toBe(true);
  view.unmount();
  expect(skinDispose).toHaveBeenCalledOnce();
  expect(skinDispose.mock.contexts[0]).not.toBe(skin);
  expect(skinDispose.mock.contexts[0].bones[1]).not.toBe(head);
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
  expect(mapDispose).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
