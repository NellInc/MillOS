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
import { playCritterSound } from '../utils/critterAudio';
import { clutterPlacements } from './scenery/InstancedFoliage';

const boundary = vi.hoisted(() => ({
  fallback: false,
  throttle: 1,
  frame: 0,
  graze: [] as number[],
  reducedMotion: false,
  rigAngles: [] as number[],
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
      React.useImperativeHandle(ref, () => ({
        setGraze: (amount: number) => boundary.graze.push(amount),
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
  boundary.throttle = 1;
  boundary.frame = 0;
  boundary.graze.length = 0;
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
