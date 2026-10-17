import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFrame } from '@react-three/fiber';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import draco3d from 'draco3dgltf';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  createHorseRestPose,
  sampleHorseRest,
  createSheepRestPose,
  sampleSheepRest,
} from '../simulation/creatureMotion';
import {
  BlacksmithHorse,
  Fountain,
  FountainBird,
  FOUNTAIN_WATER_TEXTURES,
  Duck,
  FOUNTAIN_BIRD_GEOMETRIES,
  FOUNTAIN_BIRD_MATERIAL,
  FOUNTAIN_BIRD_TOE_CONTACTS,
  FOUNTAIN_BIRD_PERCH,
  FALLBACK_FOUNTAIN_BIRD_PERCH,
} from './VillageArea';
import {
  Scarecrow,
  FARM_CLUTTER,
  FARM_YARD_SIZE,
  GRAIN_PLANT_GEOMETRY,
  GRAIN_FIELD_MATERIAL,
  GRAIN_FIELD_DEPTH_MATERIAL,
  GRAIN_FIELD_COUNT,
  GRAIN_WIND_PADDING,
  populateGrainField,
} from './FarmArea';
import {
  createScarecrowCraftGeometry,
  createScarecrowShirtGeometry,
  createScarecrowPumpkinGeometry,
  createScarecrowFaceGeometry,
} from './scenery/ScarecrowCraft';
import { playCritterSound } from '../utils/critterAudio';
import { clutterPlacements } from './scenery/InstancedFoliage';

const boundary = vi.hoisted(() => ({
  fallback: false,
  rigReady: true,
  throttle: 1,
  frame: 0,
  graze: [] as number[],
  reducedMotion: false,
  rigAngles: [] as number[],
  resting: [] as [number, number][],
  asset: null as unknown,
}));
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => boundary.reducedMotion }));
vi.mock('../utils/frameThrottle', () => ({
  shouldRunThisFrame: () => ++boundary.frame % boundary.throttle === 0,
}));
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
      React.useImperativeHandle(ref, () =>
        boundary.rigReady
          ? {
              setGraze: (amount: number) => boundary.graze.push(amount),
              setStride: vi.fn(),
              setResting: (time: number, seed: number) => boundary.resting.push([time, seed]),
              setHeadShake: (angle: number) => boundary.rigAngles.push(angle),
            }
          : null
      );
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
  boundary.rigReady = true;
  boundary.throttle = 1;
  boundary.frame = 0;
  boundary.graze.length = 0;
  boundary.reducedMotion = false;
  boundary.rigAngles.length = 0;
  boundary.resting.length = 0;
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
  expect(view.container.querySelectorAll('[name="scarecrow-handmade-craft"]')).toHaveLength(1);
  expect(playCritterSound).not.toHaveBeenCalled();
});

it('keeps the hand-sewn scarecrow finite, opaque-batchable and inside the original hand/head envelope', () => {
  const g = createScarecrowCraftGeometry(),
    p = g.attributes.position;
  expect(p.count / 3).toBeLessThan(12000);
  expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position']);
  for (const attribute of Object.values(g.attributes))
    expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
  let error = 0;
  for (let i = 0; i < p.count; i++)
    error = Math.max(
      error,
      Math.abs(new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i).length() - 1)
    );
  expect(error).toBeLessThan(1e-5);
  expect(g.boundingBox!.min.x).toBeGreaterThan(-1.05);
  expect(g.boundingBox!.max.x).toBeLessThan(1.05);
  expect(g.boundingBox!.min.y).toBeGreaterThan(0.45);
  expect(g.boundingBox!.max.y).toBeCloseTo(2.85, 6);
  expect(g.boundingBox!.max.z).toBeLessThan(0.36);
  expect(g.boundingBox!.min.z).toBeGreaterThan(-0.36);
  g.dispose();
});

it('encloses the original timber support in a rounded stuffed torso', () => {
  const g = createScarecrowShirtGeometry(),
    m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.updateMatrixWorld();
  const front = (x: number, y: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(
      m
    )[0].point.z;
  expect(front(0, 1.8)).toBeGreaterThan(0.16);
  expect(front(0.23, 1.8)).toBeLessThan(front(0, 1.8) - 0.04);
  expect(front(0, 2.2)).toBeLessThan(front(0, 1.8) - 0.05);
  expect(front(0, 1.4)).toBeGreaterThan(0.14);
  g.dispose();
  (m.material as THREE.Material).dispose();
});

it('seats the smiling face on actual pumpkin triangles instead of a floating fixed-depth plane', () => {
  const head = createScarecrowPumpkinGeometry(),
    face = createScarecrowFaceGeometry(head),
    m = new THREE.Mesh(head, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.updateMatrixWorld();
  const p = face.attributes.position;
  let maximumGap = -Infinity,
    minimumGap = Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      hit = new THREE.Raycaster(
        new THREE.Vector3(x, y, 1),
        new THREE.Vector3(0, 0, -1)
      ).intersectObject(m)[0];
    expect(hit).toBeDefined();
    const gap = p.getZ(i) - hit.point.z;
    maximumGap = Math.max(maximumGap, gap);
    minimumGap = Math.min(minimumGap, gap);
  }
  // Small thread edges embed into the pumpkin; no triangle eye can float 2cm away.
  expect(maximumGap).toBeLessThan(0.014);
  expect(minimumGap).toBeGreaterThan(-0.01);
  const all = head.attributes.position;
  let radius = 0;
  for (let i = 0; i < all.count; i++)
    radius = Math.max(radius, Math.hypot(all.getX(i), all.getY(i) - 2.5, all.getZ(i)));
  expect(radius).toBeCloseTo(0.35, 6);
  head.dispose();
  face.dispose();
  (m.material as THREE.Material).dispose();
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
    for (const [toeX, , toeZ] of FOUNTAIN_BIRD_TOE_CONTACTS) {
      const [x, y, z] = FOUNTAIN_BIRD_PERCH;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x - toeZ, 4, z + toeX),
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
    expect(boundary.resting.length).toBe(600);
    expect(boundary.resting.at(-1)![0]).toBeCloseTo(40);
    expect(boundary.resting.every(([, seed]) => seed === 733)).toBe(true);
    const freeze = () => {
      const count = boundary.rigAngles.length;
      const restCount = boundary.resting.length;
      for (let i = 0; i < 30; i++) tick();
      expect(boundary.rigAngles).toHaveLength(count);
      expect(boundary.resting).toHaveLength(restCount);
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
    expect(boundary.resting.at(-1)).toEqual([0, 733]);
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

it('borrows two shared bird surfaces without disposing them on remount', () => {
  const bodyDispose = vi.spyOn(FOUNTAIN_BIRD_GEOMETRIES.body, 'dispose'),
    headDispose = vi.spyOn(FOUNTAIN_BIRD_GEOMETRIES.head, 'dispose'),
    materialDispose = vi.spyOn(FOUNTAIN_BIRD_MATERIAL, 'dispose');
  const view = render(<FountainBird position={FOUNTAIN_BIRD_PERCH} />);
  expect(view.container.querySelectorAll('mesh')).toHaveLength(2);
  expect(
    view.container.querySelector('[name="fountain-bird-head"]')?.getAttribute('position')
  ).toBe('0,0.23,0.07');
  view.unmount();
  expect(bodyDispose).not.toHaveBeenCalled();
  expect(headDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it('uses elapsed active time for actual duck dabbling across display rates and clears holds', () => {
  const original = useGameSimulationStore.getState();
  useGameSimulationStore.setState({ gameSpeed: 1, isTabVisible: true });
  const sample = (fps: number) => {
    boundary.throttle = fps / 15;
    boundary.frame = 0;
    boundary.graze.length = 0;
    // React DOM supplies elements rather than R3F Object3Ds. Attach the existing
    // Three transform surface during layout, before the duck's passive effect.
    function DuckFixture() {
      const host = React.useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => {
        Object.assign(host.current!.querySelector('[name="village-duck-0"]')!, {
          position: new THREE.Vector3(2, 1.08, 1),
          rotation: new THREE.Euler(),
        });
      }, []);
      return (
        <div ref={host}>
          <Duck position={[2, 1.08, 1]} delay={0} onClick={() => {}} />
        </div>
      );
    }
    const view = render(<DuckFixture />);
    const root = view.container.querySelector('[name="village-duck-0"]')! as unknown as THREE.Group;
    const tick = (delta: number) => {
      const callback = vi.mocked(useFrame).mock.calls.at(-1)![0];
      callback({} as Parameters<typeof callback>[0], delta);
    };
    for (let i = 0; i < fps * 60; i++) tick(1 / fps);
    const result = { graze: boundary.graze.at(-1)!, position: root.position.clone() };
    expect(boundary.graze.length).toBe(900);
    expect(Math.hypot(root.position.x - 2, root.position.z - 1)).toBeLessThanOrEqual(0.400001);
    // Half an unsampled interval must be discarded when paused/hidden.
    tick(1 / fps);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    tick(0.1);
    const held = root.position.clone(),
      count = boundary.graze.length;
    for (let i = 0; i < 20; i++) tick(0.1);
    expect(root.position.equals(held)).toBe(true);
    expect(boundary.graze).toHaveLength(count);
    useGameSimulationStore.setState({ gameSpeed: 1, isTabVisible: false });
    tick(10);
    expect(boundary.graze).toHaveLength(count);
    useGameSimulationStore.setState({ isTabVisible: true });
    boundary.throttle = 1;
    tick(0.02);
    expect(root.position.distanceTo(held)).toBeLessThan(0.03);
    boundary.reducedMotion = true;
    useGameSimulationStore.setState({ gameSpeed: 0 });
    view.rerender(<DuckFixture />);
    tick(0.1);
    expect(root.position.toArray()).toEqual([2, 1.08, 1]);
    boundary.reducedMotion = false;
    useGameSimulationStore.setState({ gameSpeed: 1 });
    view.unmount();
    return result;
  };
  try {
    const a = sample(30),
      b = sample(60),
      c = sample(120);
    expect(a.graze).toBeCloseTo(b.graze, 8);
    expect(a.graze).toBeCloseTo(c.graze, 8);
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-8);
    expect(a.position.distanceTo(c.position)).toBeLessThan(1e-8);
    expect(playCritterSound).not.toHaveBeenCalled();
  } finally {
    useGameSimulationStore.setState({
      gameSpeed: original.gameSpeed,
      isTabVisible: original.isTabVisible,
    });
  }
});

it('authors the live crop geometry from a common ground-root datum for the wind shader', () => {
  for (const g of Object.values(GRAIN_PLANT_GEOMETRY)) {
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-1e-6);
  }
  const top = Math.max(...Object.values(GRAIN_PLANT_GEOMETRY).map((g) => g.boundingBox!.max.y));
  expect(top).toBeGreaterThan(1.7);
  expect(top).toBeLessThanOrEqual(1.8);
});

it('keeps coloured cereal geometry finite, bounded and attached at its actual vertices', () => {
  const parts = Object.values(GRAIN_PLANT_GEOMETRY);
  let triangles = 0;
  for (const g of parts) {
    expect(g.groups).toHaveLength(0);
    for (const name of ['position', 'normal', 'uv', 'color']) {
      const a = g.getAttribute(name);
      expect(a.count).toBe(g.getAttribute('position').count);
      expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
    }
    expect(Array.from(g.getAttribute('color').array).every((x) => x > 0 && x <= 1)).toBe(true);
    triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThan(0.5);
  }
  expect(triangles).toBeLessThan(500);
  const stems = GRAIN_PLANT_GEOMETRY.stems.getAttribute('position'),
    leaves = GRAIN_PLANT_GEOMETRY.leaves.getAttribute('position'),
    ears = GRAIN_PLANT_GEOMETRY.ears.getAttribute('position');
  const closest = (x: number, y: number, z: number) => {
    let distance = Infinity;
    for (let i = 0; i < stems.count; i++)
      distance = Math.min(
        distance,
        Math.hypot(stems.getX(i) - x, stems.getY(i) - y, stems.getZ(i) - z)
      );
    return distance;
  };
  // Each four-triangle leaf starts at the actual culm ring vertex it grows from.
  expect(leaves.count / 12).toBe(9);
  for (let i = 0; i < leaves.count; i += 12)
    expect(closest(leaves.getX(i), leaves.getY(i), leaves.getZ(i))).toBeLessThan(1e-6);
  const common = new Set<string>();
  for (let i = 0; i < ears.count; i++)
    if (closest(ears.getX(i), ears.getY(i), ears.getZ(i)) < 1e-6)
      common.add([ears.getX(i), ears.getY(i), ears.getZ(i)].map((v) => v.toFixed(5)).join(','));
  expect(common.size).toBeGreaterThanOrEqual(3);
  expect(GRAIN_FIELD_MATERIAL.vertexColors).toBe(true);
  expect(GRAIN_FIELD_MATERIAL.emissive.getHex()).toBe(0);
  expect(GRAIN_FIELD_MATERIAL.map).toBeNull();
});

it('retains all planting roots with identical transforms and conservative wind bounds for every part', () => {
  const meshes = Object.values(GRAIN_PLANT_GEOMETRY).map(
    (g) => new THREE.InstancedMesh(g, GRAIN_FIELD_MATERIAL, GRAIN_FIELD_COUNT)
  ) as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
  try {
    populateGrainField(meshes);
    expect(GRAIN_FIELD_COUNT).toBe(300);
    expect(meshes[0].instanceMatrix.array).toEqual(meshes[1].instanceMatrix.array);
    expect(meshes[0].instanceMatrix.array).toEqual(meshes[2].instanceMatrix.array);
    expect(meshes[0].instanceColor!.array).toEqual(meshes[1].instanceColor!.array);
    expect(meshes[0].instanceColor!.array).toEqual(meshes[2].instanceColor!.array);
    const matrix = new THREE.Matrix4();
    for (let r = 0; r < 15; r++)
      for (let c = 0; c < 20; c++) {
        meshes[0].getMatrixAt(r * 20 + c, matrix);
        const rnd = Math.sin(r * 20 + c) * 1000;
        expect(matrix.elements[12]).toBeCloseTo((c - 10) * 1.5 + Math.sin(rnd) * 0.5, 5);
        expect(matrix.elements[13]).toBe(0);
        expect(matrix.elements[14]).toBeCloseTo((r - 7) * 1.5 + Math.cos(rnd) * 0.5, 5);
        expect(
          new THREE.Vector3()
            .setFromMatrixScale(matrix)
            .toArray()
            .every((s) => s >= 0.79999 && s <= 1.20001)
        ).toBe(true);
      }
    const spheres = meshes.map((m) => m.boundingSphere!.radius);
    for (const m of meshes) {
      expect(m.customDepthMaterial).toBe(GRAIN_FIELD_DEPTH_MATERIAL);
      expect(m.boundingBox!.min.x).toBeGreaterThan(-18);
      expect(m.boundingBox!.max.x).toBeLessThan(18);
      expect(m.boundingBox!.min.z).toBeGreaterThan(-14);
      expect(m.boundingBox!.max.z).toBeLessThan(14);
      expect(m.boundingBox!.max.y).toBeLessThan(2.16 + GRAIN_WIND_PADDING);
    }
    expect(GRAIN_WIND_PADDING).toBeGreaterThan(0.16 * (0.7 + 1.5) * 1.4);
    populateGrainField(meshes);
    meshes.forEach((m, i) => expect(m.boundingSphere!.radius).toBeCloseTo(spheres[i], 8));
  } finally {
    meshes.forEach((m) => m.dispose());
  }
});

it('compiles the actual crop colour/depth hosts with the same root-height wind field and clock', () => {
  const compile = (material: THREE.Material, lib: typeof THREE.ShaderLib.standard) => {
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: lib.vertexShader,
      fragmentShader: lib.fragmentShader,
    };
    (material.onBeforeCompile as (s: typeof shader) => void)(shader);
    return shader;
  };
  const colour = compile(GRAIN_FIELD_MATERIAL, THREE.ShaderLib.standard),
    depth = compile(GRAIN_FIELD_DEPTH_MATERIAL, THREE.ShaderLib.depth);
  const wind = (s: string) =>
    s.slice(
      s.indexOf('  vec4 millosWindLocal'),
      s.indexOf('  transformed += millosOffset;') + '  transformed += millosOffset;'.length
    );
  expect(wind(colour.vertexShader)).toBe(wind(depth.vertexShader));
  expect(wind(colour.vertexShader)).toContain('position.y / 1.8000');
  for (const u of ['uWindTime', 'uWindDir', 'uWindStrength'])
    expect(colour.uniforms[u]).toBe(depth.uniforms[u]);
  expect(colour.vertexShader).toContain('vec4( position, 1.0 )');
  expect(GRAIN_FIELD_MATERIAL.customProgramCacheKey()).toContain('millos_corn_v1');
  expect(GRAIN_FIELD_DEPTH_MATERIAL.customProgramCacheKey()).toBe('millos_corn_v1_depth');
});

it('keeps actual farm tuft cards and storm sway clear of the swept yard and trough', () => {
  for (const density of [0, 0.35, 1]) {
    const placements = clutterPlacements({ ...FARM_CLUTTER, density });
    const intruders = placements.filter(
      (p) =>
        Math.abs(p.x) < FARM_YARD_SIZE[0] / 2 + 0.7 && Math.abs(p.z) < FARM_YARD_SIZE[1] / 2 + 0.7
    );
    expect(placements.length).toBeLessThanOrEqual(Math.floor(FARM_CLUTTER.count * density));
    expect(clutterPlacements({ ...FARM_CLUTTER, density })).toEqual(placements);
    if (density === 0) expect(placements).toHaveLength(0);
    else expect(placements.length).toBeGreaterThan(density === 1 ? 200 : 50);
    for (const p of placements) {
      expect(Object.values(p).every(Number.isFinite)).toBe(true);
      expect(p.y).toBeCloseTo(-0.025);
      expect(FARM_CLUTTER.accepts!(p.x, p.z)).toBe(true);
    }
    expect(intruders.map((p) => [p.x, p.z])).toEqual([]);
  }
});

const creatureAssets = new Map<string, Promise<THREE.Group>>();
function actualCreature(species: string) {
  if (!creatureAssets.has(species))
    creatureAssets.set(
      species,
      (async () => {
        const io = new NodeIO()
          .registerExtensions(ALL_EXTENSIONS)
          .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
        const document = await io.read(`public/models/farm/${species}.glb`);
        // Keep the real geometry/skin; jsdom need not decode the borrowed coat image.
        for (const m of document.getRoot().listMaterials())
          m.setBaseColorTexture(null)
            .setNormalTexture(null)
            .setMetallicRoughnessTexture(null)
            .setOcclusionTexture(null)
            .setEmissiveTexture(null);
        for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
        const bytes = await io.writeBinary(document);
        return (await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '')).scene;
      })()
    );
  return creatureAssets.get(species)!;
}
const actualHorse = () => actualCreature('horse');
function attributeValues(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  return Array.from({ length: attribute.count * attribute.itemSize }, (_, i) =>
    attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize)
  );
}
function creaturePoints(model: THREE.Object3D, body: string) {
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const mesh = model.getObjectByName(body) as THREE.SkinnedMesh;
  mesh.skeleton.update();
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  return Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
    mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(toModel)
  );
}
const horsePoints = (model: THREE.Object3D) => creaturePoints(model, 'HorseBody');

function headVertices(mesh: THREE.SkinnedMesh) {
  const owners = mesh.skeleton.bones.map((bone) => {
    let parent: THREE.Object3D | null = bone;
    while (parent) {
      if (['Head', 'NeckTwist01', 'NeckTwist02'].includes(parent.name)) return true;
      parent = parent.parent;
    }
    return false;
  });
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  return Array.from({ length: skinIndex.count }, (_, i) => i).filter((i) =>
    Array.from({ length: 4 }, (_, n) => n).some(
      (n) => owners[skinIndex.getComponent(i, n)] && skinWeight.getComponent(i, n) > 0.000001
    )
  );
}

function tailFaceIntegrity(
  before: THREE.Vector3[],
  after: THREE.Vector3[],
  rest: THREE.Vector3[],
  index: THREE.BufferAttribute
) {
  let minimumDot = 1,
    minimumAreaRatio = 1,
    checked = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    n = new THREE.Vector3(),
    m = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    // Covers the whole rear component AND every attachment-crossing triangle.
    if (!ids.some((j) => rest[j].z < -1.02 && rest[j].y > 0.35)) continue;
    a.subVectors(before[ids[1]], before[ids[0]]);
    b.subVectors(before[ids[2]], before[ids[0]]);
    n.crossVectors(a, b);
    const area = n.length();
    if (area < 1e-6) continue;
    a.subVectors(after[ids[1]], after[ids[0]]);
    b.subVectors(after[ids[2]], after[ids[0]]);
    m.crossVectors(a, b);
    minimumAreaRatio = Math.min(minimumAreaRatio, m.length() / area);
    minimumDot = Math.min(minimumDot, n.normalize().dot(m.normalize()));
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
  expect(minimumDot).toBeGreaterThan(0.75);
  expect(minimumAreaRatio).toBeGreaterThan(0.3);
}

it('gives the actual skinned horse private ear/tail/rib life, exact anchors and byte-exact neutral restoration', async () => {
  const { createHorseRestMotion } = await vi.importActual<
    typeof import('./models/RiggedCreatureModel')
  >('./models/RiggedCreatureModel');
  const source = await actualHorse();
  const a = cloneSkeleton(source),
    b = cloneSkeleton(source);
  const mesh = a.getObjectByName('HorseBody') as THREE.SkinnedMesh;
  const borrowed = mesh.geometry;
  const attributes = Object.fromEntries(
    Object.entries(borrowed.attributes).map(([key, value]) => [key, attributeValues(value)])
  );
  const index = Array.from(borrowed.index!.array);
  const original = horsePoints(a),
    other = horsePoints(b);
  const motion = createHorseRestMotion(a)!;
  expect(motion).not.toBeNull();
  expect(mesh.geometry).not.toBe(borrowed);
  expect(mesh.material).toBe((b.getObjectByName('HorseBody') as THREE.SkinnedMesh).material);
  const changed = { leftEar: 0, rightEar: 0, tail: 0, breath: 0 };
  let maxDisplacement = 0;
  let minimumTailOrientation = 1,
    maxAnchorDelta = 0,
    maxInactiveEarDelta = 0,
    minNormal = 1,
    maxNormal = 1;
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    cross = new THREE.Vector3();
  const tailTriangles: { indices: number[]; normal: THREE.Vector3 }[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const indices = index.slice(i, i + 3);
    if (!indices.every((j) => original[j].z < -0.91 && original[j].y > 0.35 && original[j].y < 1.1))
      continue;
    ab.subVectors(original[indices[1]], original[indices[0]]);
    ac.subVectors(original[indices[2]], original[indices[0]]);
    const normal = ab.clone().cross(ac);
    if (normal.lengthSq() > 1e-12) tailTriangles.push({ indices, normal: normal.normalize() });
  }
  expect(tailTriangles.length).toBeGreaterThan(20);
  // Actual-skin extrema protect geometry; the pure sampler covers every frame.
  // Avoid hundreds of thousands of matcher calls under this suite's 10s limit.
  const times = new Set([0.25, 21]);
  for (const channel of ['breath', 'leftEar', 'rightEar', 'tail'] as const) {
    let lo = Infinity,
      hi = -Infinity,
      loTime = 0,
      hiTime = 0;
    const out = createHorseRestPose();
    for (let i = 1; i <= 600; i++) {
      const value = sampleHorseRest(i / 20, 733, out)[channel];
      if (value < lo) {
        lo = value;
        loTime = i / 20;
      }
      if (value > hi) {
        hi = value;
        hiTime = i / 20;
      }
    }
    times.add(loTime);
    times.add(hiTime);
  }
  for (const time of times) {
    motion.apply(time, 733);
    const points = horsePoints(a);
    tailFaceIntegrity(original, points, original, mesh.geometry.index!);
    const pose = sampleHorseRest(time, 733, createHorseRestPose());
    for (const {
      indices: [a, b, c],
      normal,
    } of tailTriangles) {
      ab.subVectors(points[b], points[a]);
      ac.subVectors(points[c], points[a]);
      cross.crossVectors(ab, ac).normalize();
      minimumTailOrientation = Math.min(minimumTailOrientation, normal.dot(cross));
    }
    for (let i = 0; i < points.length; i++) {
      const p = original[i],
        distance = p.distanceTo(points[i]);
      maxDisplacement = Math.max(maxDisplacement, distance);
      if (
        p.y < 0.3 ||
        (Math.abs(p.x) > 0.2 && p.y < 0.8 && p.z > -1.05 && p.z < -0.8) ||
        (p.z > 1.02 && p.y < 1.55) ||
        (Math.abs(p.x) < 0.02 && p.z > 0.4)
      )
        maxAnchorDelta = Math.max(maxAnchorDelta, distance);
      if (p.y > 1.65 && p.z > 0.6 && p.z < 0.9 && Math.abs(p.x) > 0.055) {
        const side = p.x > 0 ? 'leftEar' : 'rightEar';
        if (pose[side] === 0) maxInactiveEarDelta = Math.max(maxInactiveEarDelta, distance);
        else changed[side] = Math.max(changed[side], distance);
      }
      if (p.z < -1.04 && p.y < 0.9) changed.tail = Math.max(changed.tail, distance);
      if (Math.abs(p.x) > 0.25 && p.y > 0.95 && p.y < 1.15 && p.z > -0.5 && p.z < 0)
        changed.breath = Math.max(changed.breath, distance);
    }
    const normals = mesh.geometry.attributes.normal;
    for (let i = 0; i < normals.count; i++) {
      const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      minNormal = Math.min(minNormal, length);
      maxNormal = Math.max(maxNormal, length);
    }
  }
  expect(maxAnchorDelta).toBe(0);
  expect(maxInactiveEarDelta).toBe(0);
  expect(minNormal).toBeCloseTo(1, 4);
  expect(maxNormal).toBeCloseTo(1, 4);
  expect(changed.leftEar).toBeGreaterThan(0.015);
  expect(changed.rightEar).toBeGreaterThan(0.015);
  expect(changed.tail).toBeGreaterThan(0.065);
  expect(changed.breath).toBeGreaterThan(0.0025);
  expect(changed.breath).toBeLessThan(0.0031);
  expect(maxDisplacement).toBeLessThan(0.15);
  expect(minimumTailOrientation).toBeGreaterThan(0.9);
  expect(horsePoints(b)).toEqual(other);
  for (const [key, values] of Object.entries(attributes)) {
    expect(attributeValues(borrowed.attributes[key])).toEqual(values);
    if (key !== 'position' && key !== 'normal')
      expect(attributeValues(mesh.geometry.attributes[key])).toEqual(values);
  }
  expect(Array.from(mesh.geometry.index!.array)).toEqual(index);
  for (const seed of [500, 733]) {
    motion.apply(5, seed);
    motion.apply(0, seed);
    expect(attributeValues(mesh.geometry.attributes.position)).toEqual(attributes.position);
    expect(attributeValues(mesh.geometry.attributes.normal)).toEqual(attributes.normal);
  }
  const ownDispose = vi.spyOn(mesh.geometry, 'dispose'),
    sourceDispose = vi.spyOn(borrowed, 'dispose');
  motion.dispose();
  motion.dispose();
  expect(ownDispose).toHaveBeenCalledOnce();
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(mesh.geometry).toBe(borrowed);
  vi.restoreAllMocks();
});

it('composes resting geometry with the actual neck/stride/pet pose under a transformed parent and preserves culling', async () => {
  const { RiggedCreatureModel } = await vi.importActual<
    typeof import('./models/RiggedCreatureModel')
  >('./models/RiggedCreatureModel');
  const source = await actualHorse();
  boundary.asset = { scene: source };
  const cloned = vi.spyOn(source, 'clone');
  const ref = React.createRef<import('./models/RiggedCreatureModel').CreatureRigHandle>();
  const view = render(<RiggedCreatureModel creature="horse" ref={ref} />);
  const model = cloned.mock.results[0].value as THREE.Group;
  const parent = new THREE.Group();
  parent.position.set(12, 0.3, -7);
  parent.rotation.y = 1.8;
  parent.scale.setScalar(1.08);
  parent.add(model);
  const mesh = model.getObjectByName('HorseBody') as THREE.SkinnedMesh;
  const restPoints = horsePoints(model);
  for (const graze of [0, 0.55, 1]) {
    ref.current!.setGraze(graze);
    ref.current!.setStride(0.4, 0.2);
    ref.current!.setHeadShake(0.1);
    ref.current!.setResting!(0, 733);
    const before = horsePoints(model);
    ref.current!.setResting!(13, 733);
    const posed = horsePoints(model);
    for (const tailTime of [12.5, 13, 14, 15]) {
      ref.current!.setResting!(tailTime, 733);
      tailFaceIntegrity(before, horsePoints(model), restPoints, mesh.geometry.index!);
    }
    ref.current!.setResting!(13, 733);
    ref.current!.setHeadShake(0.1);
    ref.current!.setStride(0.4, 0.2);
    ref.current!.setGraze(graze);
    expect(horsePoints(model)).toEqual(posed);
    const rest = source.getObjectByName('HorseBody') as THREE.SkinnedMesh;
    const restToRoot = new THREE.Matrix4()
      .copy(source.matrixWorld)
      .invert()
      .multiply(rest.matrixWorld);
    for (let i = 0; i < before.length; i++) {
      const sourcePoint = new THREE.Vector3()
        .fromBufferAttribute(rest.geometry.attributes.position, i)
        .applyMatrix4(restToRoot);
      if (sourcePoint.y < 0.3 || (sourcePoint.z > 1.02 && sourcePoint.y < 1.55))
        expect(posed[i]).toEqual(before[i]);
      const local = mesh.getVertexPosition(i, new THREE.Vector3());
      expect(mesh.boundingSphere!.containsPoint(local)).toBe(true);
      expect(Number.isFinite(local.length())).toBe(true);
    }
    ref.current!.setResting!(0, 500);
    expect(horsePoints(model)).toEqual(before);
  }
  view.unmount();
  expect(mesh.geometry).toBe((source.getObjectByName('HorseBody') as THREE.SkinnedMesh).geometry);
  cloned.mockRestore();
});

it('uses admitted forge time across throttle rates, with a paused pet independent of ambient motion and late reduced handles neutral', () => {
  const original = useGameSimulationStore.getState();
  useGameSimulationStore.setState({
    gameSpeed: 1,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  const tick = (delta: number) =>
    vi
      .mocked(useFrame)
      .mock.calls.at(-1)![0]({} as Parameters<Parameters<typeof useFrame>[0]>[0], delta);
  try {
    for (const fps of [30, 60, 120]) {
      boundary.throttle = fps / 15;
      boundary.frame = 0;
      const view = render(<BlacksmithHorse position={[0, 0, 0]} />);
      for (let i = 0; i < fps * 12; i++) tick(1 / fps);
      expect(boundary.resting.at(-1)![0]).toBeCloseTo(12);
      useGameSimulationStore.setState({ gameSpeed: 0 });
      const count = boundary.resting.length;
      fireEvent.click(view.container.querySelector('[name="blacksmith-horse"]')!);
      for (let i = 0; i < fps; i++) tick(1 / fps);
      expect(boundary.resting).toHaveLength(count);
      useGameSimulationStore.setState({ gameSpeed: 1 });
      for (let i = 0; i < fps; i++) tick(1 / fps);
      expect(boundary.resting.at(-1)![0]).toBeCloseTo(13);
      view.unmount();
    }
    boundary.reducedMotion = true;
    boundary.rigReady = false;
    const view = render(<BlacksmithHorse position={[0, 0, 0]} />);
    const count = boundary.resting.length;
    tick(0.1);
    expect(boundary.resting).toHaveLength(count);
    boundary.rigReady = true;
    view.rerender(<BlacksmithHorse position={[0, 0, 0]} />);
    tick(0.1);
    expect(boundary.resting.at(-1)).toEqual([0, 733]);
  } finally {
    useGameSimulationStore.setState({
      gameSpeed: original.gameSpeed,
      isTabVisible: original.isTabVisible,
      emergencyActive: original.emergencyActive,
      emergencyDrillMode: original.emergencyDrillMode,
    });
  }
});

it('admits shared fountain normals with its water clock and freezes pause/hidden/reduced holds', () => {
  const saved = useGameSimulationStore.getState();
  const offsets = Object.fromEntries(
    Object.entries(FOUNTAIN_WATER_TEXTURES).map(([key, t]) => [key, t.offset.clone()])
  );
  try {
    useGameSimulationStore.setState({ gameSpeed: 1, isTabVisible: true });
    boundary.fallback = false;
    boundary.throttle = 3;
    boundary.frame = 0;
    const view = render(<Fountain position={[0, 0, 0]} />);
    const ring = view.container.querySelector('[name="fountain-ripple-generated"]')!;
    Object.assign(ring, { scale: new THREE.Vector3(1, 1, 1) });
    const material = ring.querySelector('meshStandardMaterial')!;
    Object.assign(material, { opacity: 0.26 });
    const frame = vi.mocked(useFrame).mock.calls[0][0];
    const step = () => frame({} as never, 1 / 60, undefined as never);
    const before = FOUNTAIN_WATER_TEXTURES.water.offset.x;
    step();
    step();
    expect(FOUNTAIN_WATER_TEXTURES.water.offset.x).toBe(before);
    step();
    expect(FOUNTAIN_WATER_TEXTURES.water.offset.x - before).toBeCloseTo(0.001, 7);
    expect(FOUNTAIN_WATER_TEXTURES.normal.offset.equals(FOUNTAIN_WATER_TEXTURES.water.offset)).toBe(
      true
    );
    const held = FOUNTAIN_WATER_TEXTURES.water.offset.clone();
    useGameSimulationStore.setState({ gameSpeed: 0 });
    step();
    step();
    step();
    useGameSimulationStore.setState({ gameSpeed: 1, isTabVisible: false });
    step();
    step();
    step();
    useGameSimulationStore.setState({ isTabVisible: true });
    boundary.reducedMotion = true;
    const reducedIndex = vi.mocked(useFrame).mock.calls.length;
    view.rerender(<Fountain position={[0, 0, 0]} />);
    const reduced = vi.mocked(useFrame).mock.calls[reducedIndex][0];
    reduced({} as never, 10, undefined as never);
    expect(FOUNTAIN_WATER_TEXTURES.water.offset.equals(held)).toBe(true);
    expect(FOUNTAIN_WATER_TEXTURES.normal.offset.equals(held)).toBe(true);
    boundary.reducedMotion = false;
    const resumeIndex = vi.mocked(useFrame).mock.calls.length;
    view.rerender(<Fountain position={[0, 0, 0]} />);
    const resume = vi.mocked(useFrame).mock.calls[resumeIndex][0];
    for (let i = 0; i < 3; i++) resume({} as never, 10, undefined as never);
    expect(FOUNTAIN_WATER_TEXTURES.water.offset.x - held.x).toBeLessThanOrEqual(0.006001);
    expect(FOUNTAIN_WATER_TEXTURES.normal.offset.equals(FOUNTAIN_WATER_TEXTURES.water.offset)).toBe(
      true
    );
  } finally {
    useGameSimulationStore.setState(saved);
    for (const [key, t] of Object.entries(FOUNTAIN_WATER_TEXTURES)) t.offset.copy(offsets[key]);
  }
});

it.each(['cow', 'pig'] as const)(
  'gives the actual %s four independent grounded soles with private skin/inverses and exact neutral shape',
  async (species) => {
    const { createQuadrupedWalk } = await vi.importActual<
      typeof import('./models/RiggedCreatureModel')
    >('./models/RiggedCreatureModel');
    const { sampleHoofStep } = await import('../simulation/creatureMotion');
    const source = await actualCreature(species),
      model = cloneSkeleton(source),
      sibling = cloneSkeleton(source);
    const name = species === 'cow' ? 'CowBody' : 'PigBody';
    const mesh = model.getObjectByName(name) as THREE.SkinnedMesh;
    const cached = source.getObjectByName(name) as THREE.SkinnedMesh;
    const borrowed = mesh.geometry,
      inverses = [...cached.skeleton.boneInverses];
    const attributes = Object.fromEntries(
      Object.entries(borrowed.attributes).map(([key, value]) => [key, attributeValues(value)])
    );
    const protectedHead = headVertices(cached);
    expect(protectedHead.length).toBeGreaterThan(100);
    const before = creaturePoints(model, name),
      other = creaturePoints(sibling, name);
    const walking = createQuadrupedWalk(model, species)!;
    console.info('QUADRUPED_PACKING', species, JSON.stringify(walking.fitting));
    expect(walking.fitting.maximumDiscardedWeight).toBeLessThan(0.000001);
    expect(walking.fitting.maximumFieldsTouched).toBeLessThanOrEqual(2);
    expect(mesh.geometry).not.toBe(borrowed);
    expect(mesh.material).toBe(cached.material);
    expect(mesh.skeleton.bones).toHaveLength(53);
    expect(cached.skeleton.bones).toHaveLength(41);
    expect(cached.skeleton.boneInverses).toEqual(inverses);
    expect(mesh.skeleton.boneInverses).toHaveLength(53);
    inverses.forEach((inverse, i) => {
      expect(mesh.skeleton.boneInverses[i]).toEqual(inverse);
      expect(mesh.skeleton.boneInverses[i]).not.toBe(inverse);
    });
    for (const key of ['position', 'normal', 'uv'])
      expect(attributeValues(mesh.geometry.attributes[key])).toEqual(attributes[key]);
    expect(Array.from(mesh.geometry.index!.array)).toEqual(Array.from(borrowed.index!.array));
    for (const i of protectedHead)
      for (let n = 0; n < 4; n++) {
        expect(mesh.geometry.attributes.skinIndex.getComponent(i, n)).toBe(
          borrowed.attributes.skinIndex.getComponent(i, n)
        );
        expect(mesh.geometry.attributes.skinWeight.getComponent(i, n)).toBe(
          borrowed.attributes.skinWeight.getComponent(i, n)
        );
      }
    expect(
      Math.max(...creaturePoints(model, name).map((p, i) => p.distanceTo(before[i])))
    ).toBeLessThan(0.000003);
    const soles = Array.from({ length: 4 }, (_, leg) =>
      before.flatMap((p, i) =>
        p.y < 0.018 &&
        (p.z > (species === 'cow' ? -0.25 : -0.16) ? 0 : 2) + (p.x < 0 ? 1 : 0) === leg
          ? [i]
          : []
      )
    );
    soles.forEach((ids) => expect(ids.length).toBeGreaterThan(5));
    const links = mesh.skeleton.bones
      .filter((b) => b.name.startsWith('stride-'))
      .map((b) => b.position.clone());
    const step = { forward: 0, lift: 0 };
    let minimumAttachmentArea = 1,
      maximumAttachmentEdge = 1,
      minimumNormalDot = 1;
    let witness: unknown;
    const edge = new THREE.Vector3(),
      otherEdge = new THREE.Vector3();
    const normal = new THREE.Vector3(),
      otherNormal = new THREE.Vector3();
    const index = mesh.geometry.index!;
    const skin = mesh.geometry.attributes.skinIndex,
      weights = mesh.geometry.attributes.skinWeight;
    const attachment = before.map((_, i) => {
      let newer = 0;
      for (let n = 0; n < 4; n++)
        if (skin.getComponent(i, n) >= 41) newer += weights.getComponent(i, n);
      return newer > 0.0001;
    });
    for (let n = 0; n < 32; n++) {
      const phase = (n * Math.PI) / 16;
      walking.apply(phase, 1);
      const points = creaturePoints(model, name);
      for (let t = 0; t < index.count; t += 3) {
        const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
        if (!ids.some((i) => attachment[i])) continue;
        normal.crossVectors(
          edge.subVectors(before[ids[1]], before[ids[0]]),
          otherEdge.subVectors(before[ids[2]], before[ids[0]])
        );
        const area = normal.length();
        if (area < 0.000001) continue;
        otherNormal.crossVectors(
          edge.subVectors(points[ids[1]], points[ids[0]]),
          otherEdge.subVectors(points[ids[2]], points[ids[0]])
        );
        minimumAttachmentArea = Math.min(minimumAttachmentArea, otherNormal.length() / area);
        minimumNormalDot = Math.min(
          minimumNormalDot,
          normal.normalize().dot(otherNormal.normalize())
        );
        for (let n = 0; n < 3; n++) {
          const a = ids[n],
            b = ids[(n + 1) % 3],
            length = before[a].distanceTo(before[b]);
          if (length > 0.004) {
            const ratio = points[a].distanceTo(points[b]) / length;
            if (ratio > maximumAttachmentEdge) {
              maximumAttachmentEdge = ratio;
              witness = {
                phase,
                a,
                b,
                before: [before[a].toArray(), before[b].toArray()],
                after: [points[a].toArray(), points[b].toArray()],
                weights: [a, b].map((v) =>
                  Array.from({ length: 4 }, (_, n) => [
                    skin.getComponent(v, n),
                    weights.getComponent(v, n),
                  ])
                ),
              };
            }
          }
        }
      }
      expect(Math.min(...points.map((p) => p.y))).toBeGreaterThan(-0.0001);
      for (let leg = 0; leg < 4; leg++) {
        sampleHoofStep(species, leg, phase, step);
        for (const i of soles[leg]) {
          expect(points[i].y - before[i].y).toBeCloseTo(step.lift, 5);
          expect(points[i].z - before[i].z).toBeCloseTo(step.forward, 5);
          expect(points[i].x).toBeCloseTo(before[i].x, 5);
        }
      }
      for (let i = 0; i < points.length; i++) {
        const p = before[i];
        const tail = species === 'cow' && p.z < -0.88 && p.y > 0.25 && p.y < 0.9;
        const udder =
          species === 'cow' &&
          p.y > 0.25 &&
          p.y < 0.45 &&
          p.z > -0.55 &&
          p.z < -0.3 &&
          p.x > -0.08 &&
          p.x < 0.05;
        if (
          before[i].y > (species === 'cow' ? 0.66 : 0.37) ||
          tail ||
          udder ||
          protectedHead.includes(i)
        )
          expect(points[i].distanceTo(before[i])).toBeLessThan(0.000003);
        expect(Number.isFinite(points[i].length())).toBe(true);
      }
      mesh.skeleton.bones
        .filter((b) => b.name.startsWith('stride-'))
        .forEach((b, i) => {
          expect(b.position).toEqual(links[i]);
          expect(b.scale.toArray()).toEqual([1, 1, 1]);
        });
    }
    console.info(
      'QUADRUPED_ATTACHMENT',
      species,
      JSON.stringify({ minimumAttachmentArea, maximumAttachmentEdge, minimumNormalDot, witness })
    );
    expect(minimumAttachmentArea).toBeGreaterThan(0.15);
    expect(maximumAttachmentEdge).toBeLessThan(2);
    expect(minimumNormalDot).toBeGreaterThan(0);
    walking.apply(0.7, 0);
    expect(
      Math.max(...creaturePoints(model, name).map((p, i) => p.distanceTo(before[i])))
    ).toBeLessThan(0.000003);
    expect(creaturePoints(sibling, name)).toEqual(other);
    for (const [key, value] of Object.entries(borrowed.attributes))
      expect(attributeValues(value)).toEqual(attributes[key]);
    const dispose = vi.spyOn(mesh.geometry, 'dispose'),
      sharedDispose = vi.spyOn(borrowed, 'dispose');
    walking.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(sharedDispose).not.toHaveBeenCalled();
    expect(mesh.geometry).toBe(borrowed);
    expect(model.getObjectByName('quadruped-stride')).toBeUndefined();
    dispose.mockRestore();
    sharedDispose.mockRestore();
  }
);

it.each(['cow', 'pig'] as const)(
  'composes the mounted %s walk, graze and pet without drift under a rotated scaled farm',
  async (species) => {
    const { RiggedCreatureModel } = await vi.importActual<
      typeof import('./models/RiggedCreatureModel')
    >('./models/RiggedCreatureModel');
    const source = await actualCreature(species);
    boundary.asset = { scene: source };
    const cloned = vi.spyOn(source, 'clone'),
      ref = React.createRef<import('./models/RiggedCreatureModel').CreatureRigHandle>();
    const view = render(<RiggedCreatureModel creature={species} ref={ref} />);
    const model = cloned.mock.results[0].value as THREE.Group,
      parent = new THREE.Group();
    parent.position.set(18, 0.3, -12);
    parent.rotation.y = Math.PI;
    parent.scale.setScalar(1.04);
    parent.add(model);
    const name = species === 'cow' ? 'CowBody' : 'PigBody',
      mesh = model.getObjectByName(name) as THREE.SkinnedMesh;
    const rest = creaturePoints(model, name);
    const protectedHead = headVertices(source.getObjectByName(name) as THREE.SkinnedMesh);
    for (const graze of [0, 0.5, 1])
      for (const phase of [0, 1.4, 3.2, 5.3]) {
        ref.current!.setGraze(graze);
        ref.current!.setStride(phase, 0);
        ref.current!.setHeadShake(0.12);
        const grazing = creaturePoints(model, name);
        ref.current!.setStride(phase, 0.85);
        ref.current!.setHeadShake(0.12);
        const posed = creaturePoints(model, name);
        expect(Math.max(...protectedHead.map((i) => posed[i].distanceTo(grazing[i])))).toBeLessThan(
          0.0000001
        );
        ref.current!.setHeadShake(0.12);
        ref.current!.setStride(phase, 0.85);
        ref.current!.setGraze(graze);
        expect(creaturePoints(model, name).every((p, i) => p.equals(posed[i]))).toBe(true);
        let minimumSole = Infinity,
          contained = true;
        const local = new THREE.Vector3();
        for (let i = 0; i < rest.length; i++) {
          if (rest[i].y < 0.018) minimumSole = Math.min(minimumSole, posed[i].y);
          mesh.getVertexPosition(i, local);
          contained &&= mesh.boundingSphere!.containsPoint(local);
        }
        expect(minimumSole).toBeGreaterThan(-0.0001);
        expect(contained).toBe(true);
      }
    ref.current!.setGraze(0);
    ref.current!.setStride(0, 0);
    ref.current!.setHeadShake(0);
    expect(
      Math.max(...creaturePoints(model, name).map((p, i) => p.distanceTo(rest[i])))
    ).toBeLessThan(0.000003);
    view.unmount();
    cloned.mockRestore();
  }
);

it('fits independent private sheep ears and flanks to the actual skin while protecting feet, face, normals and borrowed copies', async () => {
  const { createSheepRestMotion } = await import('./models/sheepRestMotion');
  const source = await actualCreature('sheep'),
    a = cloneSkeleton(source),
    b = cloneSkeleton(source);
  const mesh = a.getObjectByName('SheepBody') as THREE.SkinnedMesh,
    borrowed = mesh.geometry;
  const attributes = Object.fromEntries(
    Object.entries(borrowed.attributes).map(([k, v]) => [k, attributeValues(v)])
  );
  const original = creaturePoints(a, 'SheepBody'),
    other = creaturePoints(b, 'SheepBody');
  const motion = createSheepRestMotion(a)!;
  expect(motion).not.toBeNull();
  expect(mesh.geometry).not.toBe(borrowed);
  expect(mesh.material).toBe((b.getObjectByName('SheepBody') as THREE.SkinnedMesh).material);
  let footDelta = 0,
    faceDelta = 0,
    maxMove = 0,
    normalError = 0,
    minArea = 1,
    minDot = 1;
  const changes = { leftEar: 0, rightEar: 0, breath: 0 };
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    beforeNormal = new THREE.Vector3(),
    afterNormal = new THREE.Vector3();
  const times = new Set([0.25, 1, 2, 7, 12, 21, 32]);
  for (const channel of ['leftEar', 'rightEar', 'breath'] as const) {
    let largest = 0,
      peakTime = 0;
    const out = createSheepRestPose();
    for (let i = 1; i <= 640; i++) {
      const value = Math.abs(sampleSheepRest(i / 20, 400, out)[channel]);
      if (value > largest) {
        largest = value;
        peakTime = i / 20;
      }
    }
    times.add(peakTime);
  }
  for (const time of times) {
    motion.apply(time, 400);
    const points = creaturePoints(a, 'SheepBody');
    for (let i = 0; i < points.length; i++) {
      const p = original[i],
        distance = p.distanceTo(points[i]);
      maxMove = Math.max(maxMove, distance);
      if (p.y < 0.3) footDelta = Math.max(footDelta, distance);
      if (p.z > 0.49) faceDelta = Math.max(faceDelta, distance);
      if (p.y > 0.7 && p.z > 0.27 && p.z < 0.49 && Math.abs(p.x) > 0.145)
        changes[p.x > 0 ? 'leftEar' : 'rightEar'] = Math.max(
          changes[p.x > 0 ? 'leftEar' : 'rightEar'],
          distance
        );
      if (p.z < 0.2 && p.y > 0.34 && p.y < 0.84)
        changes.breath = Math.max(changes.breath, distance);
      normalError = Math.max(
        normalError,
        Math.abs(
          new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, i).length() - 1
        )
      );
    }
    const index = mesh.geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const x = index.getX(i),
        y = index.getX(i + 1),
        z = index.getX(i + 2);
      beforeNormal.crossVectors(
        ab.subVectors(original[y], original[x]),
        ac.subVectors(original[z], original[x])
      );
      const area = beforeNormal.length();
      if (area < 1e-8) continue;
      afterNormal.crossVectors(
        ab.subVectors(points[y], points[x]),
        ac.subVectors(points[z], points[x])
      );
      minArea = Math.min(minArea, afterNormal.length() / area);
      minDot = Math.min(minDot, beforeNormal.normalize().dot(afterNormal.normalize()));
    }
  }
  expect(footDelta).toBe(0);
  expect(faceDelta).toBe(0);
  expect(changes.leftEar).toBeGreaterThan(0.01);
  expect(changes.rightEar).toBeGreaterThan(0.01);
  expect(changes.breath).toBeGreaterThan(0.002);
  expect(maxMove).toBeLessThan(0.04);
  expect(normalError).toBeLessThan(1e-6);
  expect(minArea).toBeGreaterThan(0.5);
  expect(minDot).toBeGreaterThan(0.7);
  motion.apply(0, 400);
  for (const [k, v] of Object.entries(attributes))
    expect(attributeValues(mesh.geometry.attributes[k])).toEqual(v);
  expect(creaturePoints(b, 'SheepBody')).toEqual(other);
  for (const [k, v] of Object.entries(attributes))
    expect(attributeValues(borrowed.attributes[k])).toEqual(v);
  const ownDispose = vi.spyOn(mesh.geometry, 'dispose'),
    sourceDispose = vi.spyOn(borrowed, 'dispose');
  motion.dispose();
  motion.dispose();
  motion.apply(10, 400);
  expect(mesh.geometry).toBe(borrowed);
  expect(ownDispose).toHaveBeenCalledOnce();
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(createSheepRestMotion(new THREE.Group())).toBeNull();
  vi.restoreAllMocks();
});

it('composes sheep rest with actual grazing and pet poses under a transformed parent, with exact neutral and culling protection', async () => {
  const { RiggedCreatureModel } = await vi.importActual<
    typeof import('./models/RiggedCreatureModel')
  >('./models/RiggedCreatureModel');
  const source = await actualCreature('sheep');
  boundary.asset = { scene: source };
  const cloned = vi.spyOn(source, 'clone');
  const ref = React.createRef<import('./models/RiggedCreatureModel').CreatureRigHandle>();
  const view = render(<RiggedCreatureModel creature="sheep" ref={ref} />),
    model = cloned.mock.results[0].value as THREE.Group,
    parent = new THREE.Group();
  parent.position.set(15, 0.1, -8);
  parent.rotation.y = 1.7;
  parent.scale.setScalar(1.04);
  parent.add(model);
  const mesh = model.getObjectByName('SheepBody') as THREE.SkinnedMesh,
    rest = creaturePoints(model, 'SheepBody');
  for (const graze of [0, 0.55, 1]) {
    ref.current!.setGraze(graze);
    ref.current!.setHeadShake(0.1);
    ref.current!.setStride(0, 0);
    ref.current!.setResting!(0, 400);
    const before = creaturePoints(model, 'SheepBody');
    ref.current!.setResting!(4, 400);
    const posed = creaturePoints(model, 'SheepBody');
    ref.current!.setHeadShake(0.1);
    ref.current!.setGraze(graze);
    expect(creaturePoints(model, 'SheepBody')).toEqual(posed);
    let protectedDelta = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].y < 0.3 || rest[i].z > 0.49)
        protectedDelta = Math.max(protectedDelta, before[i].distanceTo(posed[i]));
      expect(
        mesh.boundingSphere!.containsPoint(mesh.getVertexPosition(i, new THREE.Vector3()))
      ).toBe(true);
    }
    expect(protectedDelta).toBe(0);
    ref.current!.setResting!(0, 400);
    expect(creaturePoints(model, 'SheepBody')).toEqual(before);
  }
  view.unmount();
  expect(mesh.geometry).toBe((source.getObjectByName('SheepBody') as THREE.SkinnedMesh).geometry);
  cloned.mockRestore();
});
