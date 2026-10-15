import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getWorkerAppearance, type WorkerMotionState } from './workerTypes';
import {
  SHARED_WORKER_ACCESSORY_MATERIALS,
  SHARED_WORKER_MATERIALS,
} from './SharedWorkerMaterials';
import {
  SHARED_WORKER_GEOMETRY,
  WORKER_HAIR_GEOMETRIES,
  createWorkerHairMotion,
} from './SharedWorkerGeometries';
import * as hairShapes from './SharedWorkerGeometries';
import * as workerPoses from './workerPose';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import { createWorkerBodyLod, WORKER_BODY_LOD } from './workerBodyLod';
import {
  createWorkerWrenchHead,
  createWorkerTrowelBlade,
  createWorkerLoafGeometry,
  WORKER_TOOL_GEOMETRIES,
  createWorkerSampleVial,
  createWorkerSampleScoop,
} from './WorkerTools';

const harness = vi.hoisted(() => ({
  frame: null as null | ((state: unknown, delta: number) => void),
  asset: null as unknown,
  clone: null as null | ((scene: THREE.Group) => THREE.Group),
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    harness.frame = callback;
  },
  createPortal: (children: React.ReactNode) => children,
}));
vi.mock('../../utils/dracoLoader', () => ({ useDracoGLTF: () => harness.asset }));
vi.mock('three/addons/utils/SkeletonUtils.js', () => ({
  clone: (scene: THREE.Group) => harness.clone?.(scene) ?? scene,
}));
import {
  WorkerModel,
  shareWorkerSkin,
  createWorkerAccessoryPair,
  createWorkerHairMaterial,
  createBakerApron,
  setWorkerPupilBlink,
  setWorkerPupilPose,
  softenWorkerFaceNormals,
} from '../models/WorkerModel';

afterEach(() => {
  cleanup();
  harness.clone = null;
  vi.restoreAllMocks();
});
describe('paused worker pose transitions', () => {
  it('changes task/seat poses without advancing clip time when paused', () => {
    const scene = new THREE.Group();
    const body = new THREE.Group();
    body.name = 'Body';
    const hips = new THREE.Group();
    hips.name = 'Hips';
    body.add(hips);
    scene.add(body);
    const clips = [
      'idle',
      'walk',
      'run',
      'break',
      'inspect',
      'repair',
      'supervise',
      'radio',
      'sample',
    ].map(
      (name, index) =>
        new THREE.AnimationClip(`worker-${name}`, 2, [
          new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [index, index + 1]),
        ])
    );
    harness.asset = { scene, animations: clips };
    const motion: WorkerMotionState = {
      activity: 'working',
      groundSpeed: 0,
      seated: false,
      phase: Math.PI,
      enabled: false,
    };
    render(
      <WorkerModel
        appearance={getWorkerAppearance('Engineer', '', 'crew-engineer')}
        motion={motion}
      />
    );
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBeCloseTo(4.5); // inspect at deterministic half phase
    harness.frame?.({}, 100);
    expect(body.position.y).toBeCloseTo(4.5); // no clock advance, even a huge frame delta
    motion.activity = 'idle';
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBeCloseTo(0.5);
    motion.activity = 'break';
    motion.seated = true;
    harness.frame?.({}, 1 / 60);
    const seatedHeight = body.position.y;
    expect(seatedHeight).toBeGreaterThan(0.5);
    expect(seatedHeight).toBeLessThan(0.6);
    harness.frame?.({}, 10);
    expect(body.position.y).toBe(seatedHeight);
    motion.seated = false;
    motion.cycling = true;
    motion.cyclePhase = 0;
    harness.frame?.({}, 1 / 60);
    const cyclingHeight = body.position.y;
    expect(cyclingHeight).toBeGreaterThan(0.9);
    expect(cyclingHeight).toBeLessThan(1);
    motion.cyclePhase = Math.PI / 2;
    harness.frame?.({}, 100);
    expect(body.position.y).toBeCloseTo(cyclingHeight);
    motion.activity = 'working';
    motion.cycling = false;
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBeCloseTo(4.5);
  });
});

function mountAnimatedWorker(activity: WorkerMotionState['activity'] = 'idle', speed = 0) {
  const scene = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'Body';
  scene.add(body);
  const clips = ['idle', 'walk', 'run', 'break', 'inspect'].map(
    (name, index) =>
      new THREE.AnimationClip(`worker-${name}`, 20, [
        new THREE.NumberKeyframeTrack('Body.position[y]', [0, 20], [index, index + 1]),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity,
    groundSpeed: speed,
    seated: false,
    phase: 0,
    enabled: true,
    animationInterval: 1 / 30,
  };
  render(
    <WorkerModel
      appearance={getWorkerAppearance('Engineer', '', 'crew-engineer')}
      motion={motion}
    />
  );
  return { motion, body };
}

describe('animation scheduling and freezing', () => {
  it('matches relaxed walking cadence to actual metres travelled, without a minimum-speed floor', () => {
    const action = vi.spyOn(THREE.AnimationAction.prototype, 'play');
    mountAnimatedWorker('walking', 1.1 / 6);
    harness.frame?.({}, 1 / 30);
    const walk = action.mock.contexts.find((a) => a.getClip().name === 'worker-walk')!;
    expect(walk.timeScale).toBeLessThan(0.2);
    expect(walk.timeScale).toBeGreaterThan(0);
  });

  it('samples distant skeletons at 30 Hz while preserving elapsed animation time', () => {
    const { motion } = mountAnimatedWorker();
    const update = vi.spyOn(THREE.AnimationMixer.prototype, 'update');
    harness.frame?.({}, 0); // establish initial semantic state
    update.mockClear();
    for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 120);
    expect(update).toHaveBeenCalledTimes(30);
    expect(update.mock.calls.reduce((total, [dt]) => total + dt, 0)).toBeCloseTo(1);
    motion.enabled = false;
    update.mockClear();
    for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 60);
    expect(update).not.toHaveBeenCalled();
    motion.activity = 'working';
    harness.frame?.({}, 1 / 60);
    expect(update).toHaveBeenCalledExactlyOnceWith(0);
  });
  it('preserves a running stride when paused, instead of switching to idle or walk', () => {
    const { motion, body } = mountAnimatedWorker('walking', 4);
    for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 60);
    const before = body.position.y;
    motion.enabled = false;
    motion.groundSpeed = 0;
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBe(before);
  });
  it('keeps cycling skeletons on the exact per-frame pedal phase', () => {
    const { motion } = mountAnimatedWorker();
    motion.cycling = true;
    const update = vi.spyOn(THREE.AnimationMixer.prototype, 'update');
    for (let i = 0; i < 12; i++) {
      motion.cyclePhase = i / 10;
      harness.frame?.({}, 1 / 120);
    }
    expect(update).toHaveBeenCalledTimes(12);
  });
});

describe('worker skin sharing', () => {
  it('keeps one cloned skeleton per compatible skin without sharing between people', async () => {
    const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
      'three/addons/utils/SkeletonUtils.js'
    );
    const source = new THREE.Group();
    const body = new THREE.Bone();
    body.name = 'Body';
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    body.add(hips);
    source.add(body);
    source.updateMatrixWorld(true);
    const skin = new THREE.Skeleton([body, hips]);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.name = `worker-part-${i}`;
      mesh.bind(skin);
      source.add(mesh);
    }
    const clones: THREE.Group[] = [];
    harness.clone = (scene) => {
      const model = clone(scene);
      clones.push(model);
      return model;
    };
    harness.asset = { scene: source, animations: [] };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    render(
      <>
        <WorkerModel
          appearance={getWorkerAppearance('Engineer', '', 'engineer-one')}
          motion={motion}
        />
        <WorkerModel
          appearance={getWorkerAppearance('Engineer', '', 'engineer-two')}
          motion={motion}
        />
      </>
    );
    expect(clones).toHaveLength(2);
    const parts = clones.map((model) =>
      [0, 1].map((i) => model.getObjectByName(`worker-part-${i}`) as THREE.SkinnedMesh)
    );
    for (const [first, second] of parts) {
      expect(first.skeleton.bones[0]).toBe(second.skeleton.bones[0]);
      expect(first.skeleton).toBe(second.skeleton);
      expect(first.bindMatrix.equals(second.bindMatrix)).toBe(true);
    }
    expect(parts[0][0].skeleton).not.toBe(parts[1][0].skeleton);
    expect(parts[0][0].skeleton.bones[0]).not.toBe(parts[1][0].skeleton.bones[0]);
    expect(parts[0][0].skeleton.bones[0]).not.toBe(body);
    expect(source.getObjectByName('worker-part-0')).toHaveProperty('skeleton', skin);
  });
});

it('preserves distinct bind poses, bone order and independently owned bones', () => {
  const root = new THREE.Group();
  const bones = [new THREE.Bone(), new THREE.Bone()];
  const first = new THREE.Skeleton(bones);
  const reordered = new THREE.Skeleton([...bones].reverse());
  const independent = new THREE.Skeleton([new THREE.Bone(), new THREE.Bone()]);
  const differentBind = first.clone();
  differentBind.boneInverses = first.boneInverses.map((inverse) => inverse.clone());
  differentBind.boneInverses[0].makeTranslation(0, 1, 0);
  const meshes = [first, reordered, independent, differentBind].map((skin) => {
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.bind(skin, new THREE.Matrix4());
    root.add(mesh);
    return mesh;
  });
  expect(shareWorkerSkin(root)).toHaveLength(4);
  expect(meshes.map((mesh) => mesh.skeleton)).toEqual([
    first,
    reordered,
    independent,
    differentBind,
  ]);
});

it('retains per-mesh bind matrices and disposes only a redundant private palette', () => {
  const root = new THREE.Group();
  const bones = [new THREE.Bone()];
  const first = new THREE.Skeleton(bones);
  const duplicate = first.clone();
  const a = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const b = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  a.bind(first, new THREE.Matrix4());
  b.bind(duplicate, new THREE.Matrix4().makeTranslation(0, 1, 0));
  root.add(a, b);
  const bind = b.bindMatrix.clone(),
    inverse = b.bindMatrixInverse.clone();
  const disposeDuplicate = vi.spyOn(duplicate, 'dispose');
  const disposeFirst = vi.spyOn(first, 'dispose');
  expect(shareWorkerSkin(root)).toEqual([first]);
  expect(b.skeleton).toBe(first);
  expect(b.bindMatrix.equals(bind)).toBe(true);
  expect(b.bindMatrixInverse.equals(inverse)).toBe(true);
  expect(disposeDuplicate).toHaveBeenCalledExactlyOnceWith();
  expect(disposeFirst).not.toHaveBeenCalled();
  expect(shareWorkerSkin(root)).toEqual([first]);
  expect(disposeDuplicate).toHaveBeenCalledTimes(1);
});

it('keeps shared fittings alive when one worker leaves and disposes individual accents', () => {
  harness.asset = { scene: new THREE.Group(), animations: [] };
  harness.clone = () => new THREE.Group();
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: false,
  };
  const engineer = getWorkerAppearance('Engineer', '', 'shared-fittings-engineer');
  const operator = getWorkerAppearance('Operator', '', 'shared-fittings-operator');
  const dispose = vi.spyOn(THREE.Material.prototype, 'dispose');
  const first = render(<WorkerModel appearance={engineer} motion={{ ...motion }} />);
  const second = render(<WorkerModel appearance={operator} motion={{ ...motion }} />);
  first.unmount();
  expect(dispose).toHaveBeenCalledTimes(1);
  const firstAccent = dispose.mock.contexts[0] as THREE.MeshStandardMaterial;
  expect(firstAccent.color.equals(new THREE.Color(engineer.accentColor))).toBe(true);
  expect(Object.values(SHARED_WORKER_ACCESSORY_MATERIALS)).not.toContain(firstAccent);
  second.unmount();
  expect(dispose).toHaveBeenCalledTimes(2);
  const secondAccent = dispose.mock.contexts[1] as THREE.MeshStandardMaterial;
  expect(secondAccent).not.toBe(firstAccent);
  expect(secondAccent.color.equals(new THREE.Color(operator.accentColor))).toBe(true);
  expect(Object.values(SHARED_WORKER_ACCESSORY_MATERIALS)).not.toContain(secondAccent);
});

function bodyFixture() {
  const model = new THREE.Group();
  const bone = new THREE.Bone();
  model.add(bone);
  const skin = new THREE.Skeleton([bone]);
  const sources = Array.from({ length: 5 }, (_, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([i, 0, 0, i, 1, 0, i, 0, 1], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3)
    );
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
    );
    geometry.setIndex([0, 1, 2]);
    const material = new THREE.MeshStandardMaterial({
      color: i % 2 ? '#193a83' : '#e6bf84',
      side: THREE.DoubleSide,
    });
    material.visible = i !== 4; // A person whose authored hat is hidden.
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = i !== 3;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    mesh.bind(skin, new THREE.Matrix4());
    model.add(mesh);
    return mesh;
  });
  return { model, bone, skin, sources };
}

describe('distant worker body draws', () => {
  it('retains vertices, skin, linear role colours and the feet shadow contract', () => {
    const { model, bone, skin, sources } = bodyFixture();
    const inverses = skin.boneInverses.map((matrix) => matrix.clone());
    const lod = createWorkerBodyLod(model)!;
    expect(lod.meshes).toHaveLength(2);
    expect(lod.sources).toEqual(sources.slice(0, 4));
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 100);
    lod.update(camera);
    expect(sources.map((mesh) => mesh.visible)).toEqual([false, false, false, false, true]);
    expect(sources[4].material).toHaveProperty('visible', false);
    expect(lod.meshes.map((mesh) => [mesh.visible, mesh.castShadow])).toEqual([
      [true, true],
      [true, false],
    ]);
    bone.position.y = 2;
    model.updateMatrixWorld(true);
    skin.update();
    let offset = 0;
    for (const source of sources.slice(0, 3)) {
      const merged = lod.meshes[0];
      for (let i = 0; i < 3; i++) {
        expect(merged.getVertexPosition(offset + i, new THREE.Vector3()).toArray()).toEqual(
          source.getVertexPosition(i, new THREE.Vector3()).toArray()
        );
        expect(merged.geometry.getAttribute('color').getX(offset + i)).toBeCloseTo(
          (source.material as THREE.MeshStandardMaterial).color.r
        );
      }
      offset += 3;
    }
    expect(lod.meshes[0].geometry.getAttribute('position').count).toBe(9);
    expect(lod.meshes[1].geometry.getAttribute('position').count).toBe(3);
    expect(lod.meshes.every((mesh) => mesh.skeleton === skin)).toBe(true);
    expect(skin.boneInverses.every((matrix, i) => matrix.equals(inverses[i]))).toBe(true);
    const disposeSkin = vi.spyOn(skin, 'dispose');
    const disposeSource = vi.spyOn(sources[0].geometry, 'dispose');
    const disposeFar = vi.spyOn(lod.meshes[0].geometry, 'dispose');
    lod.dispose();
    expect(disposeFar).toHaveBeenCalledTimes(1);
    expect(disposeSource).not.toHaveBeenCalled();
    expect(disposeSkin).not.toHaveBeenCalled();
  });

  it('switches paused workers with hysteresis and camera zoom, without affecting another rig', () => {
    const first = bodyFixture();
    const second = bodyFixture();
    const other = createWorkerBodyLod(second.model)!;
    harness.asset = { scene: first.model, animations: [] };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    render(
      <WorkerModel appearance={getWorkerAppearance('Engineer', '', 'lod-paused')} motion={motion} />
    );
    const camera = new THREE.PerspectiveCamera();
    const sample = (distance: number, zoom = 1) => {
      camera.position.z = distance;
      camera.zoom = zoom;
      for (let i = 0; i < WORKER_BODY_LOD.sampleEveryFrames; i++) harness.frame?.({ camera }, 0);
    };
    sample(100);
    expect(first.sources[0].visible).toBe(false);
    sample(75);
    expect(first.sources[0].visible).toBe(false);
    sample(100, 2);
    expect(first.sources[0].visible).toBe(true);
    sample(75);
    expect(first.sources[0].visible).toBe(true);
    expect(second.sources[0].visible).toBe(true);
    expect(other.meshes[0].visible).toBe(false);
    other.dispose();
  });

  it('keeps the full renderer for incompatible binds or mapped surfaces', () => {
    const fixture = bodyFixture();
    fixture.sources[0].bindMatrix.makeTranslation(1, 0, 0);
    expect(createWorkerBodyLod(fixture.model)).toBeNull();
    fixture.sources[0].bindMatrix.identity();
    (fixture.sources[0].material as THREE.MeshStandardMaterial).map = new THREE.Texture();
    expect(createWorkerBodyLod(fixture.model)).toBeNull();
    expect(fixture.sources.every((mesh) => mesh.visible)).toBe(true);
  });
});

it.each([
  {
    kind: 'glasses-temples' as const,
    x: 0.084,
    z: -0.052,
    scale: [1, 1, 1],
    rotationZ: 0,
  },
  { kind: 'hearing-cups' as const, x: 0.104, z: 0, scale: [1, 1, 1], rotationZ: Math.PI / 2 },
  { kind: 'vest-strips' as const, x: 0.078, z: 0, scale: [0.018, 0.135, 0.008], rotationZ: 0 },
])('retains both $kind through moving bone poses without disposing borrowed resources', (spec) => {
  const material = new THREE.MeshPhysicalMaterial();
  const pair = createWorkerAccessoryPair(spec.kind, material);
  const geometryDispose = vi.spyOn(pair.geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  const bone = new THREE.Bone();
  const person = new THREE.Group();
  person.add(bone);
  bone.add(pair);
  const originals = [-spec.x, spec.x].map((x) => {
    const mesh = new THREE.Mesh(pair.geometry, material);
    mesh.position.set(x, 0, spec.z);
    mesh.scale.fromArray(spec.scale);
    mesh.rotation.z = spec.rotationZ;
    bone.add(mesh);
    return mesh;
  });
  expect(pair.count).toBe(2);
  expect(pair.matrixAutoUpdate).toBe(false);
  expect(pair.matrixWorldAutoUpdate).toBe(true);
  expect(pair.castShadow).toBe(false);
  expect(pair.receiveShadow).toBe(false);
  const positions = pair.geometry.getAttribute('position');
  for (const phase of [0, 0.7, 1.4]) {
    person.position.set(9 + phase, 1, -6);
    person.rotation.y = phase;
    bone.position.set(0, 1 + Math.sin(phase), 0.12);
    bone.rotation.set(phase * 0.4, 0, phase * 0.2);
    person.updateMatrixWorld(true);
    for (const [index, original] of originals.entries()) {
      const instance = new THREE.Matrix4();
      pair.getMatrixAt(index, instance);
      const world = pair.matrixWorld.clone().multiply(instance);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, vertex);
        expect(
          p.clone().applyMatrix4(world).distanceTo(p.applyMatrix4(original.matrixWorld))
        ).toBeLessThan(1e-7);
      }
    }
    const expected = new THREE.Box3();
    originals.forEach((mesh) => expected.union(new THREE.Box3().setFromObject(mesh)));
    const actual = new THREE.Box3().setFromObject(pair);
    expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-7);
    expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-7);
  }
  pair.dispose();
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
});

it('dresses residents in matte cloth without an industrial badge, while retaining worker PPE', () => {
  for (const role of ['Resident', 'Operator']) {
    const scene = new THREE.Group();
    const body = new THREE.Group();
    body.name = 'Worker_Body';
    scene.add(body);
    for (const name of ['Head', 'Chest']) {
      const bone = new THREE.Group();
      bone.name = name;
      scene.add(bone);
    }
    const vest = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    vest.material.name = 'Worker_Vest';
    body.add(vest);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    strap.material.name = 'Worker_Yellow';
    body.add(strap);
    harness.asset = { scene, animations: [] };
    const appearance = getWorkerAppearance(role, '#596e72', 'wardrobe-' + role);
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    const view = render(<WorkerModel appearance={appearance} motion={motion} />);
    expect(!!view.container.querySelector('[name="worker-identity-badge"]')).toBe(
      role === 'Operator'
    );
    expect(vest.material.roughness).toBe(role === 'Operator' ? 0.6 : 0.86);
    expect(strap.material.roughness).toBe(role === 'Operator' ? 0.48 : 0.86);
    expect(strap.material.color.equals(new THREE.Color(appearance.hatColor))).toBe(
      role === 'Operator'
    );
    const glasses = view.container.querySelector('[name="worker-safety-glasses"]');
    expect(!!glasses).toBe(appearance.hasSafetyGlasses);
    if (glasses)
      expect(Number(glasses.getAttribute('position')?.split(',')[1])).toBeGreaterThan(0.09);
    view.unmount();
  }
});

it('uses the declared glove flag, zero extra hand draws and two-draw far LOD, then disposes only owned geometry', () => {
  for (const role of ['Operator', 'Engineer', 'Quality Control', 'Resident']) {
    const f = bodyFixture();
    f.bone.name = 'WristL';
    const torso = new THREE.Bone();
    torso.name = 'Chest';
    f.model.add(torso);
    const skin = new THREE.Skeleton([f.bone, torso]);
    const body = new THREE.Group();
    body.name = 'Worker_Body';
    f.model.add(body);
    const source = f.sources[0];
    body.add(source);
    const feet = new THREE.Group();
    feet.name = 'Worker_Feet';
    f.model.add(feet);
    feet.add(f.sources[3]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(Array(6).fill([0, 0, 1]).flat(), 3)
    );
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        4
      )
    );
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(Array(6).fill([1, 0, 0, 0]).flat(), 4)
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    source.geometry = geometry;
    for (const m of f.sources) m.bind(skin, new THREE.Matrix4());
    (source.material as THREE.Material).name = 'Skin';
    const borrowed = vi.spyOn(geometry, 'dispose');
    harness.asset = { scene: f.model, animations: [] };
    const appearance = {
      ...getWorkerAppearance(role, '', 'gloves-' + role),
      tool: 'none' as const,
    };
    const view = render(
      <WorkerModel
        appearance={appearance}
        motion={{ activity: 'idle', groundSpeed: 0, seated: false, phase: 0, enabled: false }}
      />
    );
    expect(!!source.userData.workerGloves).toBe(appearance.hasGloves);
    expect(f.model.getObjectByName('worker-skinned-gloves')).toBeUndefined();
    expect(source.geometry.index!.count).toBe(6);
    if (appearance.hasGloves) {
      expect((source.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
      const bodyDispose = vi.spyOn(source.geometry, 'dispose');
      const camera = new THREE.PerspectiveCamera();
      camera.position.z = 100;
      for (let i = 0; i < 12; i++) harness.frame?.({ camera }, 0);
      expect(source.visible).toBe(false);
      const far: THREE.Mesh[] = [];
      f.model.traverse((o) => {
        if (['worker-distant-body', 'worker-distant-feet'].includes(o.name))
          far.push(o as THREE.Mesh);
      });
      expect(far.filter((m) => m.visible)).toHaveLength(2);
      camera.position.z = 5;
      for (let i = 0; i < 12; i++) harness.frame?.({ camera }, 0);
      expect(source.visible).toBe(true);
      view.unmount();
      expect(bodyDispose).toHaveBeenCalledOnce();
    } else view.unmount();
    expect(borrowed).not.toHaveBeenCalled();
  }
});

it('animates the renamed actual eye surface and freezes its closure through disabled semantic changes', () => {
  const scene = new THREE.Group();
  const head = new THREE.Group();
  head.name = 'Head';
  scene.add(head);
  const eyeRoot = new THREE.Group();
  eyeRoot.name = 'Worker_Head';
  scene.add(eyeRoot);
  const source = new THREE.BoxGeometry(0.11, 0.025, 0.009);
  source.translate(0, 0.103, 0.112);
  const eye = new THREE.Mesh(source, new THREE.MeshStandardMaterial());
  eye.material.name = 'Brown';
  eyeRoot.add(eye);
  harness.asset = { scene, animations: [] };
  const motion: WorkerMotionState = {
    activity: 'working',
    groundSpeed: 0,
    seated: false,
    phase: 1.72,
    enabled: true,
  };
  const view = render(
    <WorkerModel
      appearance={{ ...getWorkerAppearance('Engineer', '', 'w2'), tool: 'none' }}
      motion={motion}
    />
  );
  expect(eye.userData.workerBlink).toBe(true);
  expect(eye.geometry).not.toBe(source);
  harness.frame?.({}, 0.03);
  const closed = Array.from(eye.geometry.attributes.position.array);
  expect(closed).not.toEqual(Array.from(source.attributes.position.array));
  motion.enabled = false;
  harness.frame?.({}, 100);
  expect(Array.from(eye.geometry.attributes.position.array)).toEqual(closed);
  motion.activity = 'idle';
  harness.frame?.({}, 100);
  expect(Array.from(eye.geometry.attributes.position.array)).toEqual(closed);
  motion.enabled = true;
  for (let i = 0; i < 4; i++) harness.frame?.({}, 0.075);
  expect(Array.from(eye.geometry.attributes.position.array)).toEqual(
    Array.from(source.attributes.position.array)
  );
  view.unmount();
  expect(eye.geometry).toBe(source);
});

it('closes the existing pupil instances without moving their centres or scaling the bone mount', () => {
  const pair = createWorkerAccessoryPair('eye-pupils', SHARED_WORKER_ACCESSORY_MATERIALS.dark);
  const before = Array.from(pair.instanceMatrix.array);
  for (const closure of [0.3, 1, 0]) {
    setWorkerPupilBlink(pair, closure);
    for (let instance = 0; instance < 2; instance++) {
      expect(pair.instanceMatrix.array[instance * 16 + 5]).toBeCloseTo(
        0.008 * (1 - closure * 0.92),
        8
      );
      for (const element of [0, 10, 12, 13, 14])
        expect(pair.instanceMatrix.array[instance * 16 + element]).toBe(
          before[instance * 16 + element]
        );
    }
    expect(pair.visible).toBe(closure < 0.5);
    expect(pair.scale.toArray()).toEqual([1, 1, 1]);
  }
  expect(Array.from(pair.instanceMatrix.array)).toEqual(before);
  pair.dispose();
});

it('face normals retain sharp corners and incompatible skin seams', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([0, 1, 0, 0.3, 0.954, 0, 1, 0, 0, -0.3, 0.954, 0], 3)
  );
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0], 4)
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
  );
  const result = softenWorkerFaceNormals(geometry)!;
  const v = (g: THREE.BufferGeometry, i: number) =>
    new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), i).normalize();
  expect(v(result, 0).x).toBeGreaterThan(0.05);
  expect(v(result, 2).distanceTo(v(geometry, 2))).toBe(0);
  expect(v(result, 3).distanceTo(v(geometry, 3))).toBeLessThan(0.000001);
  const sourceDispose = vi.spyOn(geometry, 'dispose');
  result.dispose();
  expect(sourceDispose).not.toHaveBeenCalled();
});

it('mounted face finish disposes only its private geometry', () => {
  const source = new THREE.BoxGeometry(),
    scene = new THREE.Group(),
    head = new THREE.Group();
  head.name = 'Worker_Head';
  const material = new THREE.MeshStandardMaterial();
  material.name = 'Skin';
  const mesh = new THREE.Mesh(source, material);
  head.add(mesh);
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const sourceDispose = vi.spyOn(source, 'dispose'),
    materialDispose = vi.spyOn(material, 'dispose');
  const { unmount } = render(
    <WorkerModel
      appearance={getWorkerAppearance('Shopkeeper', '', 'village-shopkeeper')}
      motion={{ activity: 'idle', groundSpeed: 0, seated: false, phase: 0, enabled: false }}
    />
  );
  const privateGeometry = mesh.geometry,
    ownedDispose = vi.spyOn(privateGeometry, 'dispose');
  expect(privateGeometry).not.toBe(source);
  expect(mesh.userData.workerSoftFace).toBe(true);
  unmount();
  expect(ownedDispose).toHaveBeenCalledOnce();
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
});

describe('authored held work props', () => {
  const ray = (g: THREE.BufferGeometry, x: number, y: number) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const hits = new THREE.Raycaster(
      new THREE.Vector3(x, y, 1),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(new THREE.Mesh(g, material));
    material.dispose();
    return hits;
  };
  it('keeps cached fittings finite and seats paper, screen, vials and bread on their real supports', () => {
    const g = WORKER_TOOL_GEOMETRIES;
    for (const family of Object.values(g))
      for (const part of Object.values(family)) {
        for (const a of Object.values(part.attributes))
          expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
        part.computeBoundingBox();
      }
    expect(g.clipboard.board.boundingBox!.max.z).toBeCloseTo(0.0075, 6);
    expect(0.0085 + g.clipboard.paper.boundingBox!.min.z).toBeCloseTo(0.0075, 6);
    expect(0.01 + g.clipboard.line.boundingBox!.min.z).toBeCloseTo(
      0.0085 + g.clipboard.paper.boundingBox!.max.z,
      6
    );
    expect(0.07 + g.clipboard.clip.boundingBox!.min.y).toBeLessThan(0.05); // clip extends onto paper
    const jaw = ray(g.clipboard.clip, 0, -0.022);
    expect(jaw[jaw.length - 1].point.z + 0.01).toBeCloseTo(
      0.0085 + g.clipboard.paper.boundingBox!.max.z,
      6
    );
    expect(0.006 + g.tablet.screen.boundingBox!.min.z).toBeCloseTo(
      g.tablet.body.boundingBox!.max.z,
      6
    );
    expect(g.sampleKit.tray.boundingBox!.max.y).toBeCloseTo(0.0125, 6); // shared bread support
    expect(0.045 + g.sampleKit.vial.boundingBox!.min.y).toBeLessThanOrEqual(
      g.sampleKit.tray.boundingBox!.max.y
    );
    expect(0.045 + g.sampleKit.vial.boundingBox!.min.y).toBeGreaterThan(0.009);
    expect(0.041 + g.sampleKit.cap.boundingBox!.min.y).toBeCloseTo(
      g.sampleKit.vial.boundingBox!.max.y,
      6
    );
    expect(SHARED_WORKER_MATERIALS.lensBlue.depthWrite).toBe(false);
  });
  it('models actual vial interiors and concave scoop surfaces rather than solid blocks', () => {
    const vial = createWorkerSampleVial(),
      scoop = createWorkerSampleScoop();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const base = new THREE.Raycaster(
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(0, -1, 0)
    ).intersectObject(new THREE.Mesh(vial, material))[0];
    expect(base.point.y).toBeCloseTo(-0.028, 6);
    expect(ray(scoop, 0, 0.025)[0].point.z).toBeCloseTo(-0.001, 6);
    expect(ray(scoop, 0.011, 0.025)[0].point.z).toBeCloseTo(0.005, 6);
    expect(ray(scoop, 0, -0.035).length).toBeGreaterThan(0);
    scoop.computeBoundingBox();
    expect(scoop.boundingBox!.max.y).toBeCloseTo(0.045, 6);
    expect(scoop.boundingBox!.min.y).toBeCloseTo(-0.045, 6);
    vial.dispose();
    scoop.dispose();
    material.dispose();
  });
  it('opens the engineer jaw while retaining both arms and its bridge inside the old envelope', () => {
    const g = createWorkerWrenchHead();
    g.computeBoundingBox();
    expect(ray(g, 0, 0.01)).toHaveLength(0);
    expect(ray(g, -0.02, 0.01).length).toBeGreaterThan(0);
    expect(ray(g, 0.02, 0.01).length).toBeGreaterThan(0);
    expect(ray(g, 0, -0.01).length).toBeGreaterThan(0);
    expect(g.boundingBox!.min.x).toBeCloseTo(-0.025, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.015, 6);
    g.dispose();
  });
  it('gives the gardener a tapered blade with the original shaft/tip contact range', () => {
    const g = createWorkerTrowelBlade();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0.0575, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.1325, 6);
    expect(ray(g, 0, 0.11).length).toBeGreaterThan(0);
    expect(ray(g, 0.022, 0.13)).toHaveLength(0);
    g.dispose();
  });
  it('closes scored loaves on the real tray top with finite shared geometry and no extra product draw', () => {
    const g = createWorkerLoafGeometry();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 8);
    expect(g.boundingBox!.max.y).toBeLessThanOrEqual(0.040001);
    expect(g.boundingBox!.max.x + 0.07).toBeLessThan(0.19);
    expect(g.boundingBox!.max.z).toBeLessThan(0.12);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, material);
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(0, -0.03, 0),
        new THREE.Vector3(0, 1, 0)
      ).intersectObject(mesh)[0].point.y
    ).toBeCloseTo(0, 8);
    expect(new Set(g.getAttribute('color').array).size).toBeGreaterThan(30);
    expect(g.index!.count / 3).toBeLessThan(700);
    for (const a of Object.values(g.attributes))
      expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
    g.dispose();
    material.dispose();
  });
});

it('shapes PPE shells, cushions and band inside the original head-fitting envelope', () => {
  const cup = SHARED_WORKER_GEOMETRY.hearingCup;
  const p = cup.getAttribute('position'),
    colours = cup.getAttribute('color');
  expect(colours.count).toBe(p.count);
  expect(new Set(Array.from(colours.array))).toEqual(new Set([1, Math.fround(0.22)]));
  const b = cup.boundingBox!;
  expect(b.min.y).toBeCloseTo(-0.0125);
  expect(b.max.y).toBeCloseTo(0.0125);
  expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThanOrEqual(0.038001);
  expect(SHARED_WORKER_GEOMETRY.hearingBand.boundingBox!.max.x).toBeLessThanOrEqual(0.112001);
  const band = new THREE.Mesh(SHARED_WORKER_GEOMETRY.hearingBand, new THREE.MeshBasicMaterial());
  band.updateMatrixWorld();
  // Adjustment rails physically enter the headband and both existing cup mounts.
  for (const side of [-1, 1]) {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(side * 0.104, 0.005, 0.04),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(band)[0];
    expect(hit).toBeDefined();
    expect(hit.point.z).toBeCloseTo(0.007);
  }
  (band.material as THREE.Material).dispose();
  expect(p.count / 3).toBeLessThan(700);
});
it('keeps curved glasses attached to the lenses, and badge print against a rounded holder', () => {
  const temple = SHARED_WORKER_GEOMETRY.glassesTemple;
  temple.computeBoundingBox();
  expect(temple.boundingBox!.max.z - 0.052).toBeGreaterThanOrEqual(0.0039);
  expect(temple.boundingBox!.min.y).toBeLessThan(-0.01);
  expect(temple.boundingBox!.max.x).toBeLessThanOrEqual(0.00401);
  expect(temple.boundingBox!.min.x).toBeGreaterThanOrEqual(-0.00401);
  const badge = new THREE.Mesh(SHARED_WORKER_GEOMETRY.identityBadge, new THREE.MeshBasicMaterial());
  badge.updateMatrixWorld();
  for (const [x, y] of [
    [0, 0.033],
    [-0.017, -0.009],
    [0.015, -0.022],
  ]) {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(x, y, 0.1),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(badge)[0];
    expect(hit.point.z).toBeCloseTo(0.0045);
  }
  (badge.material as THREE.Material).dispose();
  const radio = SHARED_WORKER_GEOMETRY.chestRadio;
  expect(radio.boundingBox!.max.z).toBeCloseTo(0.0145);
  expect(radio.getAttribute('position').count / 3).toBeLessThan(1000);
});

it('holds a walking clip through small speed fluctuations around the run crossover', () => {
  const play = vi.spyOn(THREE.AnimationAction.prototype, 'play');
  const appearance = getWorkerAppearance('Engineer', '', 'crew-engineer');
  const walkSpeed = (appearance.bodyType === 'masculine' ? 1.352 : 1.082) * appearance.bodyScale;
  const { motion } = mountAnimatedWorker('walking', walkSpeed * 1.44);
  for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 30);
  const run = play.mock.contexts.find((a) => a.getClip().name === 'worker-run')!;
  for (let i = 0; i < 60; i++) {
    motion.groundSpeed = walkSpeed * (i % 2 ? 1.449 : 1.451);
    harness.frame?.({}, 1 / 30);
  }
  expect(run.getEffectiveWeight()).toBeLessThan(0.01);
  motion.groundSpeed = walkSpeed * 1.65;
  for (let i = 0; i < 40; i++) harness.frame?.({}, 1 / 30);
  expect(run.getEffectiveWeight()).toBeGreaterThan(0.99);
  motion.groundSpeed = walkSpeed * 1.3;
  for (let i = 0; i < 40; i++) harness.frame?.({}, 1 / 30);
  expect(run.getEffectiveWeight()).toBeLessThan(0.01);
});

it('retains anatomical vertex colours in the existing two-draw distant body', () => {
  const { model, sources } = bodyFixture();
  const source = sources[0];
  const colours = new THREE.Float32BufferAttribute(
    [1.03, 0.96, 0.94, 1, 1, 1, 0.98, 0.97, 0.96],
    3
  );
  source.geometry.setAttribute('color', colours);
  (source.material as THREE.MeshStandardMaterial).vertexColors = true;
  const lod = createWorkerBodyLod(model)!;
  expect(lod.meshes).toHaveLength(2);
  const merged = lod.meshes[0].geometry.getAttribute('color');
  expect(merged.getX(0)).toBeCloseTo(
    (source.material as THREE.MeshStandardMaterial).color.r * 1.03,
    6
  );
  expect(merged.getY(0)).toBeCloseTo(
    (source.material as THREE.MeshStandardMaterial).color.g * 0.96,
    6
  );
  expect(source.geometry.getAttribute('color')).toBe(colours);
  lod.dispose();
});

it('uses the shared rounded pouch inside the original fitting envelope with an open rear belt channel', () => {
  const g = SHARED_WORKER_GEOMETRY.toolPouch;
  expect(g.groups).toHaveLength(0);
  expect(g.getAttribute('position').count / 3).toBeLessThan(1200);
  for (const a of Object.values(g.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
  const b = g.boundingBox!;
  [0.075, 0.105, 0.045].forEach((v, i) =>
    expect(b.getSize(new THREE.Vector3()).getComponent(i)).toBeCloseTo(v, 6)
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(g, material);
  try {
    const hits = new THREE.Raycaster(
      new THREE.Vector3(-0.05, 0.02, -0.019),
      new THREE.Vector3(1, 0, 0)
    ).intersectObject(mesh);
    expect(hits.some((h) => h.point.x < -0.02)).toBe(true);
    expect(hits.some((h) => h.point.x > 0.02)).toBe(true);
    expect(hits.every((h) => Math.abs(h.point.x) > 0.02)).toBe(true);
    // The seam lies into the body front, and the fastener enters the layered flap.
    expect(0.0194 - 0.001).toBeLessThan(0.0185);
    expect(0.021 - 0.0015).toBeLessThan(0.0185 + 0.0056 / 2);
  } finally {
    material.dispose();
  }
});

it('runs hand articulation through the real frame callback and freezes/restores it on paused semantic changes', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    hips = new THREE.Group(),
    finger = new THREE.Bone();
  body.name = 'Body';
  hips.name = 'Hips';
  finger.name = 'Index2L';
  scene.add(body);
  body.add(hips);
  hips.add(finger);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1);
  const clips = ['idle', 'walk', 'run', 'repair'].map(
    (name) =>
      new THREE.AnimationClip(`worker-${name}`, 2, [
        new THREE.QuaternionKeyframeTrack(
          'Index2L.quaternion',
          [0, 2],
          name === 'run' ? [...q.toArray(), ...q.toArray()] : [0, 0, 0, 1, 0, 0, 0, 1]
        ),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity: 'working',
    enabled: false,
    seated: false,
    groundSpeed: 0,
    phase: 0,
  };
  const { unmount } = render(
    <WorkerModel
      appearance={{
        ...getWorkerAppearance('Engineer', '', 'hand-regression'),
        tool: 'wrench',
        workAction: 'repair',
      }}
      motion={motion}
    />
  );
  harness.frame?.({}, 1 / 60);
  expect(finger.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.3);
  const held = finger.quaternion.toArray();
  harness.frame?.({}, 100);
  expect(finger.quaternion.toArray()).toEqual(held);
  motion.activity = 'walking';
  harness.frame?.({}, 1 / 60);
  expect(finger.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  unmount();
});

it('equips the live inspection engineer with one shared belt surface and preserves other role cues', () => {
  const engineer = getWorkerAppearance('Engineer', '', 'mill-engineer');
  expect(engineer.hasToolBelt).toBe(true);
  expect(engineer.tool).toBe('tablet');
  expect(engineer.workAction).toBe('inspect');
  expect(getWorkerAppearance('Operator', '', 'mill-operator-east').hasToolBelt).toBe(false);
  const g = SHARED_WORKER_GEOMETRY.toolBelt,
    b = g.boundingBox!;
  expect(g.groups).toHaveLength(0);
  expect(g.getAttribute('position').count / 3).toBeLessThan(2200);
  expect(b.min.x).toBeCloseTo(-0.1775, 6);
  expect(b.max.x).toBeCloseTo(0.1775, 6);
  expect(b.min.y).toBeCloseTo(-0.0525, 6);
  expect(b.max.y).toBeCloseTo(0.0525, 6);
  expect(b.min.z).toBeCloseTo(-0.051, 6);
  expect(b.max.z).toBeCloseTo(0.0225, 6);
  for (const a of Object.values(g.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
});

it('resolves civilian hairstyles while retaining the original helmeted worker', () => {
  for (const [role, style] of [
    ['Resident', 'short'],
    ['Resident', 'medium'],
    ['Resident', 'curly'],
    ['Resident', 'ponytail'],
    ['Resident', 'bald'],
    ['Operator', 'curly'],
  ] as const) {
    const scene = new THREE.Group();
    const head = new THREE.Bone();
    head.name = 'Head';
    scene.add(head);
    harness.asset = { scene, animations: [] };
    const appearance = { ...getWorkerAppearance(role, '#596e72', 'hair-review'), hairStyle: style };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    const view = render(<WorkerModel appearance={appearance} motion={motion} />);
    const hair = view.container.querySelector('[name="worker-authored-hair"]');
    expect(!!hair).toBe(role === 'Resident' && style !== 'bald');
    view.unmount();
  }
});

it('shares bounded distinct civilian cuts with finite lit colour, normals and fixed scalp roots', () => {
  const signatures = new Set<string>();
  for (const [style, geometry] of Object.entries(WORKER_HAIR_GEOMETRIES)) {
    if (style === 'bald') {
      expect(geometry).toBeNull();
      continue;
    }
    const g = geometry!;
    const position = g.getAttribute('position');
    for (const name of ['position', 'normal', 'uv', 'color', 'hairFlex']) {
      const attribute = g.getAttribute(name);
      expect(attribute.count).toBe(position.count);
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    expect(position.count / 3).toBeLessThan(1800);
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.2);
    expect(g.boundingBox!.max.y).toBeLessThan(0.24);
    expect(g.boundingBox!.min.x).toBeGreaterThan(-0.13);
    expect(g.boundingBox!.max.x).toBeLessThan(0.13);
    expect(g.boundingBox!.max.z).toBeLessThan(0.13);
    const normals = g.getAttribute('normal');
    const n = new THREE.Vector3();
    for (let i = 0; i < normals.count; i++)
      expect(n.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 4);
    signatures.add(position.count + ':' + g.boundingBox!.min.toArray().join(','));
  }
  expect(signatures.size).toBe(4);
  const material = createWorkerHairMaterial('#c59a5b');
  expect(material.vertexColors).toBe(true);
  expect(material.roughness).toBe(0.84);
  expect(material.metalness).toBe(0);
  expect(material.type).toBe('MeshStandardMaterial');
  expect(material.color.equals(new THREE.Color('#c59a5b'))).toBe(true);
  material.dispose();
  const tied = WORKER_HAIR_GEOMETRIES.ponytail;
  const colour = tied.getAttribute('color'),
    flex = tied.getAttribute('hairFlex');
  let rootTie = 0,
    flexibleHair = 0;
  for (let i = 0; i < colour.count; i++) {
    if (flex.getX(i) === 0 && colour.getX(i) < 0.2) rootTie++;
    if (flex.getX(i) > 0 && colour.getX(i) > 0.6) flexibleHair++;
  }
  expect(rootTie).toBeGreaterThan(10);
  expect(flexibleHair).toBeGreaterThan(100);
});

it('moves only a privately owned tail, settles at rest and freezes at zero elapsed time', () => {
  const source = WORKER_HAIR_GEOMETRIES.ponytail;
  const original = source.attributes.position.array.slice();
  const hair = createWorkerHairMotion(source),
    other = createWorkerHairMotion(source);
  const p = hair.geometry.attributes.position,
    n = hair.geometry.attributes.normal;
  const weights = source.attributes.hairFlex;
  let walking = 0,
    resting = 0;
  const vec = new THREE.Vector3(),
    restPoint = new THREE.Vector3();
  let rootDrift = 0;
  for (let frame = 0; frame < 240; frame++) {
    hair.apply(frame / 60, 1 / 60, 2, false);
    for (let i = 0; i < p.count; i++) {
      if (weights.getX(i) === 0) {
        rootDrift = Math.max(
          rootDrift,
          Math.abs(p.getX(i) - source.attributes.position.getX(i)),
          Math.abs(p.getY(i) - source.attributes.position.getY(i)),
          Math.abs(p.getZ(i) - source.attributes.position.getZ(i))
        );
      } else
        walking = Math.max(
          walking,
          vec
            .fromBufferAttribute(p, i)
            .distanceTo(restPoint.fromBufferAttribute(source.attributes.position, i))
        );
    }
  }
  const frozen = p.array.slice();
  hair.apply(100, 0, 0, true);
  expect(p.array).toEqual(frozen);
  for (let frame = 240; frame < 720; frame++) {
    hair.apply(frame / 60, 1 / 60, 0, true);
    if (frame > 600)
      for (let i = 0; i < p.count; i++)
        resting = Math.max(
          resting,
          vec
            .fromBufferAttribute(p, i)
            .distanceTo(restPoint.fromBufferAttribute(source.attributes.position, i))
        );
  }
  expect(rootDrift).toBe(0);
  expect(walking).toBeGreaterThan(0.008);
  expect(walking).toBeLessThan(0.025);
  expect(resting).toBeLessThan(0.004);
  for (let i = 0; i < n.count; i++)
    expect(vec.fromBufferAttribute(n, i).length()).toBeCloseTo(1, 4);
  expect(source.attributes.position.array).toEqual(original);
  expect(other.geometry.attributes.position.array).toEqual(original);
  const sharedDispose = vi.spyOn(source, 'dispose'),
    ownedDispose = vi.spyOn(hair.geometry, 'dispose');
  hair.dispose();
  other.dispose();
  expect(ownedDispose).toHaveBeenCalledOnce();
  expect(sharedDispose).not.toHaveBeenCalled();
  const short = createWorkerHairMotion(WORKER_HAIR_GEOMETRIES.short);
  expect(short.geometry).toBe(WORKER_HAIR_GEOMETRIES.short);
  short.dispose();
});

it('runs hair motion on the existing worker frame, freezes pause, and cleans only the private tail', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone();
  head.name = 'Head';
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const factory = vi.spyOn(hairShapes, 'createWorkerHairMotion');
  const motion: WorkerMotionState = {
    activity: 'walking',
    groundSpeed: 1.2,
    seated: false,
    phase: 0,
    enabled: true,
  };
  const appearance = {
    ...getWorkerAppearance('Resident', '#596e72', 'tail-motion'),
    hairStyle: 'ponytail' as const,
  };
  const view = render(<WorkerModel appearance={appearance} motion={motion} />);
  const hair = factory.mock.results[0].value as ReturnType<typeof createWorkerHairMotion>;
  const dispose = vi.spyOn(hair.geometry, 'dispose');
  const before = hair.geometry.attributes.position.array.slice();
  for (let frame = 0; frame < 30; frame++) harness.frame?.({}, 1 / 60);
  expect(hair.geometry.attributes.position.array).not.toEqual(before);
  motion.enabled = false;
  harness.frame?.({}, 1 / 60);
  const paused = hair.geometry.attributes.position.array.slice();
  harness.frame?.({}, 10);
  expect(hair.geometry.attributes.position.array).toEqual(paused);
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

it('assigns stable civilian cut variation without changing industrial PPE or named profiles', () => {
  const styles = new Set<string>();
  for (let id = 0; id < 32; id++) {
    const a = getWorkerAppearance('Resident', '#596e72', 'civilian-' + id);
    expect(a).toEqual(getWorkerAppearance('Resident', '#596e72', 'civilian-' + id));
    styles.add(a.hairStyle);
    expect(a.hasHardHat).toBe(false);
  }
  expect(styles.size).toBe(5);
  const roster = COMMUNITY_ROSTER.map((person) => getWorkerAppearance(person.role, '', person.id));
  expect(new Set(roster.filter((a) => !a.hasHardHat).map((a) => a.hairStyle)).size).toBe(5);
  expect(getWorkerAppearance('Baker', '', 'village-baker').hairStyle).toBe('ponytail');
  expect(getWorkerAppearance('Cyclist', '', 'village-cyclist').hairStyle).toBe('ponytail');
  expect(getWorkerAppearance('Engineer', '', 'w2').hairStyle).toBe('ponytail');
  expect(getWorkerAppearance('Operator', '', 'mill-operator-west').hasHardHat).toBe(true);
});

it('mounts garden rise/return, freezes mid-rise and releases stance for walking', () => {
  const scene = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'Body';
  scene.add(body);
  const hips = new THREE.Group();
  hips.name = 'Hips';
  hips.position.y = 0.82;
  body.add(hips);
  const clips = ['idle', 'break', 'walk', 'run'].map(
    (name) =>
      new THREE.AnimationClip(`worker-${name}`, 2, [
        new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0, 0]),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity: 'working',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: true,
    animationInterval: 1 / 60,
  };
  const appearance = getWorkerAppearance('Gardener', '', 'village-gardener');
  const { container } = render(<WorkerModel appearance={appearance} motion={motion} />);
  const tool = container.querySelector('[name="worker-held-tool"]') as unknown as THREE.Group;
  // DOM portal mock has no Three position; supply only the ref field used here.
  tool.position = new THREE.Vector3();
  const y = () => hips.getWorldPosition(new THREE.Vector3()).y;
  const crouched = y();
  expect(tool.visible).toBe(true);
  motion.activity = 'idle';
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(crouched);
  expect(y() - crouched).toBeLessThan(0.045 / appearance.heightScale);
  expect(tool.visible).toBe(false);
  const held = y();
  motion.enabled = false;
  for (let i = 0; i < 10; i++) harness.frame?.({}, 1);
  expect(y()).toBe(held);
  motion.enabled = true;
  for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(0.75);
  motion.activity = 'working';
  harness.frame?.({}, 1 / 60);
  expect(tool.visible).toBe(false);
  for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
  expect(tool.visible).toBe(true);
  expect(y()).toBeCloseTo(crouched, 5);
  motion.activity = 'walking';
  motion.groundSpeed = 0.2;
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(0.75);
  expect(tool.visible).toBe(false);
  motion.activity = 'working';
  motion.groundSpeed = 0;
  motion.enabled = false;
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeCloseTo(crouched, 5);
  expect(tool.visible).toBe(true);
  motion.activity = 'idle';
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(0.75);
  expect(tool.visible).toBe(false);
});

it('adds owned baker cloth to the cloned rig and disposes only its private resources', async () => {
  const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
    'three/addons/utils/SkeletonUtils.js'
  );
  const scene = new THREE.Group(),
    bones = ['Hips', 'Abdomen', 'Chest', 'UpperLegL', 'UpperLegR'].map((name) => {
      const b = new THREE.Bone();
      b.name = name;
      return b;
    });
  bones[0].position.y = 0.9;
  bones[1].position.y = 1;
  bones[2].position.y = 1.38;
  bones[3].position.set(0.1, 0.9, 0);
  bones[4].position.set(-0.1, 0.9, 0);
  scene.add(...bones);
  scene.updateMatrixWorld(true);
  const geometry = new THREE.BoxGeometry(0.4, 0.5, 0.25);
  geometry.translate(0, 1.15, 0);
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint8BufferAttribute(new Uint8Array(geometry.attributes.position.count * 4), 4)
  );
  const weights = new Float32Array(geometry.attributes.position.count * 4);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const source = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
  );
  source.bind(new THREE.Skeleton(bones));
  const group = new THREE.Group();
  group.name = 'Worker_Body';
  group.add(source);
  scene.add(group);
  const clones: THREE.Group[] = [];
  harness.clone = (s) => {
    const m = clone(s);
    clones.push(m);
    return m;
  };
  harness.asset = { scene, animations: [] };
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: false,
  };
  const { unmount } = render(
    <WorkerModel appearance={getWorkerAppearance('Baker', '', 'village-baker')} motion={motion} />
  );
  const apron = clones[0].getObjectByName('baker-authored-apron') as THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  expect(apron).toBeDefined();
  const disposeCloth = vi.spyOn(apron.geometry, 'dispose'),
    disposeMaterial = vi.spyOn(apron.material, 'dispose'),
    disposeSource = vi.spyOn(geometry, 'dispose');
  expect(scene.getObjectByName('baker-authored-apron')).toBeUndefined();
  unmount();
  expect(disposeCloth).toHaveBeenCalledTimes(1);
  expect(disposeMaterial).toHaveBeenCalledTimes(1);
  expect(disposeSource).not.toHaveBeenCalled();
  expect(createBakerApron(new THREE.Group())).toBeNull();
});

it('samples seat cue numbers without throttle or pause lag, and keeps legacy seating', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    hips = new THREE.Group();
  body.name = 'Body';
  hips.name = 'Hips';
  body.position.y = 0.9;
  body.add(hips);
  scene.add(body);
  const clips = ['idle', 'walk', 'break'].map(
    (n) =>
      new THREE.AnimationClip('worker-' + n, 2, [
        new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0.9, 0.9]),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity: 'break',
    seated: true,
    enabled: false,
    phase: 0,
    groundSpeed: 0,
    animationInterval: 1 / 15,
    seat: { amount: 1, support: 1, x: 0, z: 0, yaw: 0 },
  };
  render(
    <WorkerModel
      appearance={{
        ...getWorkerAppearance('Resident', '', 'seated-neighbour'),
        heightScale: 1,
        bodyScale: 1,
      }}
      motion={motion}
    />
  );
  const y = () => {
    scene.updateWorldMatrix(true, true);
    return hips.getWorldPosition(new THREE.Vector3()).y;
  };
  expect(y()).toBeCloseTo(0.55, 5);
  motion.seat!.amount = 0.5;
  harness.frame?.({}, 1 / 120);
  const half = y();
  expect(half).toBeGreaterThan(0.6);
  expect(half).toBeLessThan(0.85);
  harness.frame?.({}, 100);
  expect(y()).toBe(half);
  motion.seat!.amount = 0;
  harness.frame?.({}, 1 / 120);
  expect(y()).toBeCloseTo(0.9, 5);
  motion.enabled = true;
  motion.seat!.x = 0.1;
  harness.frame?.({}, 1 / 120);
  const before = hips.getWorldPosition(new THREE.Vector3()).x;
  motion.seat!.x = 0.2;
  harness.frame?.({}, 1 / 120);
  expect(hips.getWorldPosition(new THREE.Vector3()).x - before).toBeCloseTo(0.1, 5);
  motion.enabled = false;
  motion.seat = undefined;
  harness.frame?.({}, 0);
  expect(y()).toBeCloseTo(0.55, 5);
});

describe('owned duty preparation and release', () => {
  for (const role of ['Baker', 'Engineer'])
    it(`${role} mounts the correct work clip, owns its fade and gates truthful tool visibility`, () => {
      const original = workerPoses.createSeatedWorkerPose;
      let controller: ReturnType<typeof original> | undefined;
      vi.spyOn(workerPoses, 'createSeatedWorkerPose').mockImplementation((...args) => {
        controller = original(...args);
        vi.spyOn(controller, 'applyDuty');
        return controller;
      });
      const scene = new THREE.Group(),
        body = new THREE.Group(),
        hips = new THREE.Group();
      body.name = 'Body';
      hips.name = 'Hips';
      hips.position.y = 0.82;
      body.add(hips);
      scene.add(body);
      const wrist = new THREE.Group();
      wrist.name = 'WristL';
      body.add(wrist);
      const clips = [
        'idle',
        'walk',
        'run',
        'break',
        'inspect',
        'repair',
        'supervise',
        'radio',
        'sample',
      ].map(
        (name) =>
          new THREE.AnimationClip('worker-' + name, 2, [
            new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0, 0]),
          ])
      );
      harness.asset = { scene, animations: clips };
      const play = vi.spyOn(THREE.AnimationAction.prototype, 'play');
      const motion: WorkerMotionState = {
        activity: 'working',
        groundSpeed: 0,
        seated: false,
        phase: 0,
        enabled: true,
        animationInterval: 1 / 60,
      };
      const appearance = getWorkerAppearance(role, '', 'handover-' + role);
      const view = render(<WorkerModel appearance={appearance} motion={motion} />);
      const tool = view.container.querySelector(
        '[name="worker-held-tool"]'
      ) as unknown as THREE.Group;
      tool.position = new THREE.Vector3();
      const name = role === 'Baker' ? 'worker-break' : 'worker-inspect';
      expect(play.mock.contexts.find((a) => a.getClip().name === name)!.getEffectiveWeight()).toBe(
        1
      );
      expect(tool.visible).toBe(true);
      expect(controller!.applyDuty).toHaveBeenLastCalledWith(
        appearance.workAction,
        expect.anything(),
        1
      );
      harness.frame?.({}, 1 / 60);
      // A shared worker-break clip must not keep a baker's duty fully active.
      motion.activity = 'break';
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(false);
      const amount = vi.mocked(controller!.applyDuty).mock.lastCall![2];
      expect(amount).toBeLessThan(1);
      expect(amount).toBeGreaterThan(0);
      motion.enabled = false;
      const calls = vi.mocked(controller!.applyDuty).mock.calls.length;
      for (let i = 0; i < 10; i++) harness.frame?.({}, 1);
      expect(vi.mocked(controller!.applyDuty).mock.calls.length).toBe(calls);
      motion.enabled = true;
      for (let i = 0; i < 100; i++) harness.frame?.({}, 1 / 60);
      const afterRelease = vi.mocked(controller!.applyDuty).mock.calls.length;
      motion.activity = 'walking';
      motion.groundSpeed = 0.4;
      for (let i = 0; i < 20; i++) harness.frame?.({}, 1 / 60);
      expect(vi.mocked(controller!.applyDuty).mock.calls.length).toBe(afterRelease);
      expect(tool.visible).toBe(false);
      motion.activity = 'working';
      motion.groundSpeed = 0;
      motion.animationInterval = 1 / 15;
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(false);
      expect(vi.mocked(controller!.applyDuty).mock.lastCall![2]).toBeLessThan(0.1);
      for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(true);
      // A disabled semantic change resolves immediately without clip-time advance.
      motion.enabled = false;
      motion.activity = 'idle';
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(false);
      motion.activity = 'working';
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(true);
      // Constraint ownership clears a residual duty before a seated break.
      motion.activity = 'break';
      motion.seated = true;
      harness.frame?.({}, 1 / 60);
      const count = vi.mocked(controller!.applyDuty).mock.calls.length;
      motion.seated = false;
      motion.activity = 'walking';
      motion.groundSpeed = 0.5;
      motion.enabled = true;
      harness.frame?.({}, 1 / 60);
      expect(vi.mocked(controller!.applyDuty).mock.calls.length).toBe(count);
      expect(tool.visible).toBe(false);
    });
});

it('admits face attention only with the existing pose delta and near-face visibility, preserving disabled semantic holds', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone();
  head.name = 'Head';
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const gaze = vi.spyOn(workerPoses, 'sampleWorkerGaze');
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: true,
    animationInterval: 1 / 15,
    attentionYaw: 0.26,
  };
  const view = render(
    <WorkerModel
      appearance={{ ...getWorkerAppearance('Engineer', '', 'attention'), tool: 'none' }}
      motion={motion}
    />
  );
  harness.frame?.({}, 0.01); // The existing first semantic pose is admitted immediately.
  expect(gaze).toHaveBeenCalledOnce();
  gaze.mockClear();
  for (let i = 0; i < 6; i++) harness.frame?.({}, 0.01);
  expect(gaze).not.toHaveBeenCalled();
  harness.frame?.({}, 0.01);
  expect(gaze).toHaveBeenCalledOnce();
  expect(gaze.mock.calls[0][2]).toBeCloseTo(0.07);
  expect(gaze.mock.calls[0][3].horizontal).toBeGreaterThan(0);
  motion.enabled = false;
  harness.frame?.({}, 100);
  motion.activity = 'working';
  harness.frame?.({}, 100);
  expect(gaze).toHaveBeenCalledOnce();
  motion.enabled = true;
  motion.animationInterval = 0;
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 50;
  harness.frame?.({ camera }, 1 / 60);
  expect(gaze).toHaveBeenCalledOnce();
  camera.position.z = 2;
  harness.frame?.({ camera }, 1 / 60);
  expect(gaze).toHaveBeenCalledTimes(2);
  expect(gaze.mock.calls.at(-1)![0].lookPitch).toBeGreaterThan(0);
  expect(gaze.mock.calls.at(-1)![3].vertical).toBeLessThan(0);
  view.unmount();
});

it('retains the legacy neutral pair atomically for incomplete or nonfinite eye profiles', () => {
  const surface: workerPoses.WorkerEyeSurface = {
    centre: [-0.047, 0.108, 0.112],
    right: [1, 0, 0],
    up: [0, 1, 0],
    normal: [0, 0, 1],
    halfWidth: 0.01,
    halfHeight: 0.01,
  };
  for (const profiles of [[surface], [surface, { ...surface, halfWidth: NaN }]]) {
    const pair = createWorkerAccessoryPair(
      'eye-pupils',
      SHARED_WORKER_ACCESSORY_MATERIALS.dark,
      profiles,
      'masculine'
    );
    const original = Array.from(pair.instanceMatrix.array);
    setWorkerPupilPose(pair, 0, 1, 1);
    expect(Array.from(pair.instanceMatrix.array)).toEqual(original);
    expect(pair.userData.workerEyeSurfaces).toBeUndefined();
    setWorkerPupilBlink(pair, 1);
    expect(pair.visible).toBe(false);
    setWorkerPupilBlink(pair, 0);
    expect(Array.from(pair.instanceMatrix.array)).toEqual(original);
    pair.dispose();
  }
});

it('shares the admitted greeting envelope with facial detail and resets the far face without advancing a paused hello', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone();
  head.name = 'Head';
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const expression = { mouth: null, apply: vi.fn(), refreshAttachment: vi.fn(), dispose: vi.fn() };
  vi.spyOn(workerPoses, 'createWorkerFaceExpression').mockReturnValue(expression);
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: true,
    greeting: true,
    greetingTargetId: 'neighbour',
  };
  const view = render(
    <WorkerModel appearance={getWorkerAppearance('Shopkeeper', '', 'face')} motion={motion} />
  );
  harness.frame?.({}, 1 / 60);
  expect(expression.apply).toHaveBeenCalledOnce();
  expect(expression.apply.mock.calls[0][0]).toBeGreaterThan(0);
  motion.enabled = false;
  harness.frame?.({}, 100);
  expect(expression.apply).toHaveBeenCalledOnce();
  motion.greeting = false;
  harness.frame?.({}, 100);
  expect(expression.apply).toHaveBeenCalledTimes(2);
  expect(expression.apply.mock.calls.at(-1)![0]).toBe(0);
  motion.enabled = true;
  motion.greeting = true;
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 50;
  harness.frame?.({ camera }, 1 / 60);
  expect(expression.apply.mock.calls.at(-1)![0]).toBe(0);
  const callsBeforeReveal = expression.apply.mock.calls.length;
  motion.enabled = false;
  camera.position.z = 2;
  harness.frame?.({ camera }, 1 / 60);
  expect(expression.refreshAttachment).toHaveBeenCalledOnce();
  expect(expression.apply.mock.calls.length).toBe(callsBeforeReveal);
  motion.enabled = true;
  harness.frame?.({ camera }, 1 / 60);
  expect(expression.apply.mock.calls.at(-1)![0]).toBeGreaterThan(0);
  view.unmount();
  expect(expression.dispose).toHaveBeenCalledOnce();
});

it('fits continuous protective rims to the real clear lenses, bridge and temple fronts', () => {
  const frame = SHARED_WORKER_GEOMETRY.glassesBridge,
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(frame, material),
    lens = new THREE.Mesh(SHARED_WORKER_GEOMETRY.glassesLens, material),
    temple = new THREE.Mesh(SHARED_WORKER_GEOMETRY.glassesTemple, material);
  const hit = (object: THREE.Mesh, x: number, y: number) => {
    object.updateMatrixWorld(true);
    return new THREE.Raycaster(
      new THREE.Vector3(x, y, 0.2),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(object)[0];
  };
  expect(frame.boundingBox!.min.x).toBeCloseTo(-0.0835, 6);
  expect(frame.boundingBox!.max.x).toBeCloseTo(0.0835, 6);
  expect(frame.boundingBox!.max.y).toBeCloseTo(0.021, 6);
  expect(frame.getAttribute('position').count / 3).toBeLessThan(1500);
  for (const a of Object.values(frame.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
  for (const side of [-1, 1]) {
    lens.position.x = side * 0.047;
    temple.position.set(side * 0.084, 0, -0.052);
    expect(hit(mesh, side * 0.047, 0)).toBeUndefined();
    expect(hit(lens, side * 0.047, 0).point.z).toBeCloseTo(0.005, 6);
    // Sample all four straight rim sides, including the bridge and temple joints.
    for (const [x, y] of [
      [side * 0.082, 0],
      [side * 0.012, 0],
      [side * 0.047, 0.0195],
      [side * 0.047, -0.0195],
    ]) {
      const rim = hit(mesh, x, y),
        clear = hit(lens, x, y);
      expect(rim).toBeDefined();
      expect(clear).toBeDefined();
      const back = (object: THREE.Mesh) =>
        new THREE.Raycaster(
          new THREE.Vector3(x, y, -0.2),
          new THREE.Vector3(0, 0, 1)
        ).intersectObject(object)[0].point.z;
      // Curved lens and bevelled rim fronts need not be coplanar. Their solid
      // intervals must overlap, rather than float next to each other.
      expect(
        Math.min(rim.point.z, clear.point.z) - Math.max(back(mesh), back(lens))
      ).toBeGreaterThan(0.0005);
    }
    // The curved temple is an open-ended tube. Cross its closed section at the
    // joint, rather than casting down its empty bore toward the far ear hook.
    const across = new THREE.Raycaster(
      new THREE.Vector3(side * 0.2, 0, 0.002),
      new THREE.Vector3(-side, 0, 0)
    );
    temple.updateMatrixWorld(true);
    const joint = across.intersectObject(mesh)[0].point.x * side;
    const walls = across.intersectObject(temple).map((h) => h.point.x * side);
    expect(walls[0]).toBeGreaterThan(joint);
    expect(walls.at(-1)).toBeLessThan(joint);
  }
  // Preserve the original six-sided capsule bridge's actual face, not an
  // ideal analytic cylinder that the retained geometry never represented.
  expect(hit(mesh, 0, 0).point.z).toBeCloseTo(0.005 * Math.cos(Math.PI / 6), 6);
  material.dispose();
});

it('admits bounded walking attention, holds it exactly when paused and releases it without steering the body', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone(),
    body = new THREE.Bone();
  head.name = 'Head';
  body.name = 'Body';
  body.add(head);
  scene.add(body);
  harness.asset = { scene, animations: [] };
  const motion: WorkerMotionState = {
    activity: 'walking',
    groundSpeed: 1,
    seated: false,
    phase: 0,
    enabled: true,
    attentionYaw: 5,
  };
  render(
    <WorkerModel
      appearance={{ ...getWorkerAppearance('Resident', '', 'route-test'), tool: 'none' }}
      motion={motion}
    />
  );
  for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 60);
  expect(head.rotation.y).toBeGreaterThan(0.18);
  expect(head.rotation.y).toBeLessThan(0.3);
  expect(body.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  const held = head.quaternion.clone();
  motion.enabled = false;
  motion.attentionYaw = 0;
  for (let i = 0; i < 5; i++) harness.frame?.({}, 100);
  expect(head.quaternion.equals(held)).toBe(true);
  motion.enabled = true;
  for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
  expect(Math.abs(head.rotation.y)).toBeLessThan(0.09);
  motion.attentionYaw = NaN;
  harness.frame?.({}, 1 / 60);
  expect(head.quaternion.toArray().every(Number.isFinite)).toBe(true);
});

it('mounts civilian tailoring in existing body draws, preserves PPE and disposes only private trim', () => {
  const shared = new THREE.BoxGeometry(0.2, 0.3, 0.1).translate(0, 1.35, 0),
    count = shared.attributes.position.count;
  shared.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  shared.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const borrowed = vi.spyOn(shared, 'dispose'),
    owned: THREE.BufferGeometry[] = [],
    dispose: Array<ReturnType<typeof vi.spyOn>> = [];
  const builder = vi.spyOn(hairShapes, 'createWorkerShirtTrim').mockImplementation((mesh, kind) => {
    const g = mesh.geometry.clone();
    g.name = 'worker-tailored-' + kind;
    g.userData.workerTailoring = { kind };
    owned.push(g);
    dispose.push(vi.spyOn(g, 'dispose'));
    return g;
  });
  function asset() {
    const scene = new THREE.Group(),
      node = new THREE.Group(),
      neck = new THREE.Bone();
    node.name = 'Worker_Body';
    neck.name = 'Neck';
    scene.add(node, neck);
    const skin = new THREE.Skeleton([neck]);
    for (const name of ['Worker_Vest', 'LightBrown']) {
      const material = new THREE.MeshStandardMaterial();
      material.name = name;
      const m = new THREE.SkinnedMesh(shared, material);
      node.add(m);
      m.bind(skin);
    }
    return { scene, animations: [] };
  }
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: false,
  };
  harness.asset = asset();
  const appearance = {
    ...getWorkerAppearance('Shopkeeper', '', 'tailoring-owner'),
    bodyType: 'masculine' as const,
  };
  const view = render(<WorkerModel appearance={appearance} motion={motion} />);
  expect(builder).toHaveBeenCalledTimes(2);
  expect(builder.mock.calls.map((c) => c[1])).toEqual(['collar', 'shirt']);
  view.unmount();
  dispose.forEach((d) => expect(d).toHaveBeenCalledOnce());
  expect(borrowed).not.toHaveBeenCalled();
  builder.mockClear();
  harness.asset = asset();
  const ppe = render(
    <WorkerModel
      appearance={{
        ...getWorkerAppearance('Engineer', '', 'tailoring-ppe'),
        bodyType: 'masculine',
      }}
      motion={motion}
    />
  );
  expect(builder).not.toHaveBeenCalled();
  ppe.unmount();
  expect(borrowed).not.toHaveBeenCalled();
  expect(owned).toHaveLength(2);
  builder.mockClear();
  builder
    .mockImplementationOnce((mesh) => {
      const g = mesh.geometry.clone();
      dispose.push(vi.spyOn(g, 'dispose'));
      return g;
    })
    .mockImplementationOnce(() => null);
  harness.asset = asset();
  const unsupported = render(<WorkerModel appearance={appearance} motion={motion} />);
  expect(builder).toHaveBeenCalledTimes(2);
  expect(dispose.at(-1)).toHaveBeenCalledOnce();
  unsupported.unmount();
  expect(dispose.at(-1)).toHaveBeenCalledOnce();
  expect(borrowed).not.toHaveBeenCalled();
});

it('leaves unsupported clothing complete rather than adding partial fittings', () => {
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
    source = mesh.geometry,
    dispose = vi.spyOn(source, 'dispose');
  expect(hairShapes.createWorkerShirtTrim(mesh, 'collar')).toBeNull();
  expect(mesh.geometry).toBe(source);
  expect(dispose).not.toHaveBeenCalled();
});

it('rounds arm tube seams with corner-angle weights while preserving sharp and incompatible corners', () => {
  function fan(split: boolean) {
    const positions: number[] = [],
      normals: number[] = [],
      ids: number[] = [];
    const add = (tilt: number, start: number, end: number, joint = 1) => {
      const origin = new THREE.Vector3(),
        u = new THREE.Vector3(1, 0, 0),
        v = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)),
        n = u.clone().cross(v);
      for (const p of [
        origin,
        u.clone().multiplyScalar(Math.cos(start)).addScaledVector(v, Math.sin(start)),
        u.clone().multiplyScalar(Math.cos(end)).addScaledVector(v, Math.sin(end)),
      ]) {
        positions.push(...p.toArray());
        normals.push(...n.toArray());
        ids.push(joint, 0, 0, 0);
      }
    };
    if (split) {
      add(0, 0, Math.PI / 4);
      add(0, Math.PI / 4, Math.PI / 2);
    } else add(0, 0, Math.PI / 2);
    add((55 * Math.PI) / 180, 0, Math.PI / 6);
    // An opposing surface is sharp against both tube faces. A 90-degree
    // face here would also be only35degrees from the second face.
    add(Math.PI, 0, Math.PI / 3);
    add((-55 * Math.PI) / 180, 0, Math.PI / 6, 2);
    const g = new THREE.BufferGeometry(),
      weights = new Float32Array(ids.length);
    for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(ids, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    g.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
    return g;
  }
  const a = fan(false),
    b = fan(true),
    aa = softenWorkerFaceNormals(a, [1])!,
    bb = softenWorkerFaceNormals(b, [1])!,
    n = (g: THREE.BufferGeometry, i: number) =>
      new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i),
    expected = new THREE.Vector3(0, 0, Math.PI / 2)
      .addScaledVector(
        new THREE.Vector3(0, -Math.sin((55 * Math.PI) / 180), Math.cos((55 * Math.PI) / 180)),
        Math.PI / 6
      )
      .normalize();
  expect(n(aa, 0).distanceTo(expected)).toBeLessThan(1e-6);
  expect(n(bb, 0).distanceTo(expected)).toBeLessThan(1e-6);
  expect(n(aa, 3).distanceTo(expected)).toBeLessThan(1e-6);
  expect(n(aa, 9).distanceTo(n(a, 9))).toBeLessThan(1e-6);
  const legacy = softenWorkerFaceNormals(a)!;
  expect(n(aa, 6).distanceTo(n(legacy, 6))).toBeLessThan(1e-6);
  for (const key of ['position', 'skinIndex', 'skinWeight'])
    expect(aa.attributes[key].array).toEqual(a.attributes[key].array);
  expect(aa.index!.array).toEqual(a.index!.array);
  for (const g of [a, b, aa, bb, legacy]) g.dispose();
});

it('mounts the real-joint arm profile on body skin only and disposes private geometry', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    head = new THREE.Group(),
    source = new THREE.BoxGeometry(0.2, 0.3, 0.1),
    skin = new THREE.MeshStandardMaterial();
  body.name = 'Worker_Body';
  head.name = 'Worker_Head';
  skin.name = 'Skin';
  const bones = ['UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR', 'WristL'].map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  const count = source.attributes.position.count,
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  source.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(count * 4), 4));
  source.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  scene.add(body, head, ...bones);
  const m = new THREE.SkinnedMesh(source, skin);
  body.add(m);
  m.bind(new THREE.Skeleton(bones));
  const face = new THREE.Mesh(source, skin);
  head.add(face);
  harness.asset = { scene, animations: [] };
  const borrowed = vi.spyOn(source, 'dispose'),
    material = vi.spyOn(skin, 'dispose');
  const view = render(
    <WorkerModel
      appearance={getWorkerAppearance('Engineer', '', 'arm-wiring')}
      motion={{ activity: 'idle', groundSpeed: 0, seated: false, phase: 0, enabled: false }}
    />
  );
  expect(m.userData.workerSoftArms).toBe(true);
  expect(face.userData.workerSoftArms).toBeUndefined();
  expect(face.userData.workerSoftFace).toBe(true);
  const owned = vi.spyOn(m.geometry, 'dispose');
  view.unmount();
  expect(owned).toHaveBeenCalledOnce();
  expect(borrowed).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
});
