import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getWorkerAppearance, type WorkerMotionState } from './workerTypes';
import { SHARED_WORKER_ACCESSORY_MATERIALS } from './SharedWorkerMaterials';
import { createWorkerBodyLod, WORKER_BODY_LOD } from './workerBodyLod';
import {
  createWorkerWrenchHead,
  createWorkerTrowelBlade,
  createWorkerLoafGeometry,
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
  setWorkerPupilBlink,
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
    scale: [0.008, 0.008, 0.112],
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
