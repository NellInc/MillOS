// @vitest-environment node
import React, { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, advance, createRoot, extend, useFrame, _roots } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ConveyorBelt,
  BAG_BODY_OFFSET,
  BAG_STRIPE_OFFSET,
  bagEdgeScale,
  BAG_MIN_SCALE,
} from './ConveyorSystem';
import { SHARED_GEOMETRIES } from '../utils/sharedMaterials';
import { CONVEYOR_MATERIALS } from './conveyors/conveyorSurfaces';
import { CONVEYOR_LAYOUT } from '../constants/siteLayout';
import { sanitizeGraphicsSettings, useGraphicsStore } from '../stores/graphicsStore';
import { getFlourSackGeometry, FLOUR_SACK_PRINT_GEOMETRY } from '../utils/flourSacks';
import {
  collectStaticBatchCandidates,
  createStaticMeshBatches,
} from './performance/StaticMeshBatch';

// Keep the private component private in production. Parse its exact declaration
// from the adjacent source, transpile only that declaration and its count, and
// supply the same imports. React/R3F execute every hook/ref/effect below.
const sourceText = readFileSync(new URL('./ConveyorSystem.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile(
  'ConveyorSystem.tsx',
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
function declaration(name: string) {
  const matches = sourceFile.statements.filter(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (entry) => ts.isIdentifier(entry.name) && entry.name.text === name
      )
  );
  if (matches.length !== 1) throw new Error(`Expected one exact source declaration for ${name}`);
  return matches[0].getText(sourceFile);
}
const extracted = ts.transpileModule(
  `${declaration('BRACKET_COUNT')}\n${declaration('SideRails')}`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.React,
    },
  }
).outputText;
const SideRails = new Function(
  'React',
  'useRef',
  'useMemo',
  'useEffect',
  'THREE',
  'SHARED_GEOMETRIES',
  'CONVEYOR_MATERIALS',
  `${extracted}\nreturn SideRails;`
)(
  React,
  React.useRef,
  React.useMemo,
  React.useEffect,
  THREE,
  SHARED_GEOMETRIES,
  CONVEYOR_MATERIALS
) as React.ComponentType<{ position: [number, number, number]; length: number }>;

// Actual React + R3F reconciler. Only the GPU renderer is a headless adapter;
// there is no WebGL context, rendered image, GPU-memory or performance claim.
const activeRoots: Array<{ root: ReturnType<typeof createRoot>; canvas: HTMLCanvasElement }> = [];
let priorActEnvironment: PropertyDescriptor | undefined;
beforeAll(() => {
  priorActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: true,
  });
  extend({
    Group: THREE.Group,
    Mesh: THREE.Mesh,
    InstancedMesh: THREE.InstancedMesh,
    BoxGeometry: THREE.BoxGeometry,
  });
});
afterEach(async () => {
  try {
    for (const { root, canvas } of activeRoots.splice(0)) {
      await act(async () => root.unmount());
      // R3F 9.4.2 schedules final root/resource cleanup 500 ms after unmount.
      await vi.waitFor(() => expect(_roots.has(canvas)).toBe(false), { timeout: 2000 });
    }
  } finally {
    vi.restoreAllMocks();
  }
});
afterAll(() => {
  try {
    if (priorActEnvironment) {
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', priorActEnvironment);
    } else {
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  } finally {
    vi.restoreAllMocks();
  }
});

async function mountedRoot() {
  const canvas = {} as HTMLCanvasElement;
  const renderer = {
    domElement: canvas,
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    renderLists: { dispose: vi.fn() },
    forceContextLoss: vi.fn(),
  };
  const root = createRoot(canvas);
  activeRoots.push({ root, canvas });
  await root.configure({
    gl: renderer as unknown as THREE.WebGLRenderer,
    frameloop: 'never',
    dpr: 1,
    size: { width: 128, height: 128, top: 0, left: 0 },
  });
  let store: ReturnType<typeof root.render>;
  const render = async (element: React.ReactNode) => {
    await act(async () => {
      store = root.render(element);
    });
    return store!;
  };
  return { root, render, renderer };
}

const runs = [CONVEYOR_LAYOUT.main, CONVEYOR_LAYOUT.transfer, CONVEYOR_LAYOUT.shipping];
function runTree(extraLength = 0, withBelts = false) {
  return (
    <>
      {runs.map((run) => (
        <group
          key={run.id}
          name={run.id}
          position={[...run.position]}
          rotation={[0, run.rotationY, 0]}
        >
          {withBelts && (
            <ConveyorBelt
              position={[0, 0.5, 0]}
              length={run.length}
              productionSpeed={0}
              enableAudio={false}
            />
          )}
          <SideRails
            position={[run.id === CONVEYOR_LAYOUT.shipping.id ? 2 : -2, 1.3, 0]}
            length={run.length - 4 + extraLength}
          />
        </group>
      ))}
    </>
  );
}
function brackets(scene: THREE.Object3D) {
  const found: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) found.push(object);
  });
  return found;
}
function rails(scene: THREE.Object3D) {
  const found: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh))
      found.push(object);
  });
  return found;
}
function checkMatrices(meshes: THREE.InstancedMesh[], extraLength = 0) {
  expect(meshes).toHaveLength(3);
  expect(meshes.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(66);
  expect(meshes.reduce((sum, mesh) => sum + mesh.count * (mesh.geometry.index!.count / 3), 0)).toBe(
    792
  );
  for (const [runIndex, mesh] of meshes.entries()) {
    expect(mesh.geometry).toBe(SHARED_GEOMETRIES.bracketSmall);
    expect(mesh.material).toBe(CONVEYOR_MATERIALS.paintedSlate);
    expect(mesh.count).toBe(22);
    expect(mesh.instanceMatrix.count).toBe(22);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    expect(mesh.castShadow).toBe(false);
    const length = runs[runIndex].length - 4 + extraLength;
    for (let i = 0; i < 22; i++) {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(i, matrix);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);
      expect(matrix.elements.every(Number.isFinite)).toBe(true);
      expect(position.x).toBeCloseTo(
        -length / 2 + 2.5 + (Math.floor(i / 2) * (length - 5)) / 10,
        5
      );
      expect(scale.toArray().every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
    }
  }
}

describe('real graphics-store admission', () => {
  it('admits the procedural-details override through persisted settings and the live setter', () => {
    const previous = useGraphicsStore.getState().graphics;
    try {
      expect(
        sanitizeGraphicsSettings({ quality: 'medium', enableProceduralTextures: true })
          .enableProceduralTextures
      ).toBe(true);
      useGraphicsStore.getState().setGraphicsSetting('enableProceduralTextures', true);
      expect(useGraphicsStore.getState().graphics.enableProceduralTextures).toBe(true);
    } finally {
      useGraphicsStore.setState({ graphics: previous });
    }
    expect(useGraphicsStore.getState().graphics).toBe(previous);
  });
});

describe('exact current SideRails: actual React/R3F lifecycle', () => {
  it('mounts, updates, unmounts and remounts all 66 brackets without disposing shared resources', async () => {
    const { render, renderer } = await mountedRoot();
    const sharedGeometry = SHARED_GEOMETRIES.bracketSmall;
    const sharedPositionBuffer = sharedGeometry.getAttribute('position').array;
    const sharedGeometryDispose = vi.spyOn(sharedGeometry, 'dispose');
    const sharedMaterials = [CONVEYOR_MATERIALS.steelDark, CONVEYOR_MATERIALS.paintedSlate];
    const sharedMaterialDisposes = sharedMaterials.map((material) => vi.spyOn(material, 'dispose'));
    const textureMaps = sharedMaterials.map((material) => [
      material.map,
      material.normalMap,
      material.roughnessMap,
    ]);
    const sharedTextures = [...new Set(textureMaps.flat().filter(Boolean))] as THREE.Texture[];
    const sharedTextureDisposes = sharedTextures.map((texture) => vi.spyOn(texture, 'dispose'));

    const store = await render(runTree());
    const scene = store.getState().scene;
    const first = brackets(scene);
    const firstRails = rails(scene);
    expect(firstRails).toHaveLength(6);
    checkMatrices(first);
    const firstBuffers = first.map((mesh) => mesh.instanceMatrix);
    const firstData = first.map((mesh) => Array.from(mesh.instanceMatrix.array));
    const initialVersions = first.map((mesh) => mesh.instanceMatrix.version);
    const meshDisposes = first.map((mesh) => vi.spyOn(mesh, 'dispose'));
    const railDisposes = firstRails.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));

    // New position prop arrays force React.memo to render while effect deps are stable.
    await render(runTree());
    brackets(scene).forEach((mesh, i) => {
      expect(mesh).toBe(first[i]);
      expect(mesh.instanceMatrix).toBe(firstBuffers[i]);
      expect(mesh.instanceMatrix.version).toBe(initialVersions[i]);
    });
    await render(runTree(2));
    checkMatrices(brackets(scene), 2);
    brackets(scene).forEach((mesh, i) => {
      expect(mesh).toBe(first[i]);
      expect(mesh.instanceMatrix).toBe(firstBuffers[i]);
      expect(mesh.instanceMatrix.version).toBeGreaterThan(initialVersions[i]);
    });
    // Rail length changes reconstruct their declarative box geometries.
    railDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    const updatedRailDisposes = rails(scene).map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));

    await render(null);
    expect(scene.children).toHaveLength(0);
    first.forEach((mesh) => expect(mesh.parent).toBeNull());
    meshDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    updatedRailDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(sharedGeometryDispose).not.toHaveBeenCalled();
    [...sharedMaterialDisposes, ...sharedTextureDisposes].forEach((dispose) =>
      expect(dispose).not.toHaveBeenCalled()
    );

    await render(runTree());
    const remounted = brackets(scene);
    checkMatrices(remounted);
    remounted.forEach((mesh, i) => {
      expect(mesh).not.toBe(first[i]);
      expect(mesh.instanceMatrix).not.toBe(firstBuffers[i]);
      expect(Array.from(mesh.instanceMatrix.array)).toEqual(firstData[i]);
    });
    expect(sharedGeometry.getAttribute('position').array).toBe(sharedPositionBuffer);
    sharedMaterials.forEach((material, i) => {
      [material.map, material.normalMap, material.roughnessMap].forEach((texture, j) =>
        expect(texture).toBe(textureMaps[i][j])
      );
    });
    await render(null);
    expect(scene.children).toHaveLength(0);
    expect(sharedGeometryDispose).not.toHaveBeenCalled();
    [...sharedMaterialDisposes, ...sharedTextureDisposes].forEach((dispose) =>
      expect(dispose).not.toHaveBeenCalled()
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });
});

describe('emitted support contact and clearance', () => {
  it('seats all 66 brackets on the frame ledge while clearing the belt, drive details and cargo', async () => {
    const previousGraphics = useGraphicsStore.getState().graphics;
    const { render } = await mountedRoot();
    const epsilon = 1e-5;
    const geometryBounds = (geometry: THREE.BufferGeometry) => {
      geometry.computeBoundingBox();
      return geometry.boundingBox!.clone();
    };
    const bounds = (mesh: THREE.Mesh, inverseRun: THREE.Matrix4, instance?: number) => {
      const transform = new THREE.Matrix4().multiplyMatrices(inverseRun, mesh.matrixWorld);
      if (instance !== undefined) {
        const matrix = new THREE.Matrix4();
        (mesh as THREE.InstancedMesh).getMatrixAt(instance, matrix);
        transform.multiply(matrix);
      }
      return geometryBounds(mesh.geometry).applyMatrix4(transform);
    };
    const isBox = (mesh: THREE.Mesh, width: number, height: number, depth: number) => {
      const parameters = (mesh.geometry as THREE.BoxGeometry).parameters;
      return (
        mesh.geometry.type === 'BoxGeometry' &&
        parameters.width === width &&
        parameters.height === height &&
        parameters.depth === depth
      );
    };
    const overlap = (a: THREE.Box3, b: THREE.Box3, axis: 'x' | 'y' | 'z') =>
      Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
    const gap = (a: THREE.Box3, b: THREE.Box3, axis: 'x' | 'y' | 'z') =>
      Math.max(a.min[axis] - b.max[axis], b.min[axis] - a.max[axis]);

    try {
      // Low hides the generated motor. The independently reachable detail flag
      // mounts real drum/cap/bearing meshes without an asset loader or mock.
      useGraphicsStore.setState({
        graphics: {
          ...sanitizeGraphicsSettings({ quality: 'low', enableProceduralTextures: true }),
          enableMachineTextures: false,
        },
      });
      const store = await render(runTree(0, true));
      const scene = store.getState().scene;
      scene.updateMatrixWorld(true);
      checkMatrices(brackets(scene));

      // These narrow source contracts make the continuous bounds below valid:
      // only the first drive group rotates, its rotation is in XY, and cargo
      // stays in its lane with fixed yaw in [-.05,.05] while moving along X.
      expect(sourceText.match(/ref=\{i === 0 \? driveRollerRef : undefined\}/g)).toHaveLength(1);
      expect(sourceText.match(/driveRollerRef\.current\.rotation\.z\s*=/g)).toHaveLength(1);
      expect(sourceText).not.toMatch(/driveRollerRef\.current\.rotation\.[xy]\s*=/);
      expect(sourceText).toMatch(/rotation:\s*\(Math\.random\(\) - 0\.5\) \* 0\.1/);
      expect(sourceText).toContain(
        'position: [getFlourBagStartX(i, bagCount), FLOUR_BAG_BASE_Y, 0]'
      );
      expect(sourceText).toContain('const x = positionsRef.current[index];');
      expect(sourceText).toContain('groupPosition.set(x, bag.position[1], bag.position[2])');
      expect(sourceText).toContain(
        'bagScale.setScalar(occupiedRef.current[index] ? bagEdgeScale(x) : BAG_MIN_SCALE)'
      );
      expect(sourceText).toContain('groupMatrix.compose(groupPosition, groupRotation, bagScale)');
      // Current sacks scale in and out at the belt ends. Full size is a
      // conservative clearance envelope for every one of those smaller poses.
      expect(BAG_MIN_SCALE).toBeGreaterThan(0);
      for (let x = -30; x <= 30; x += 0.05) {
        expect(bagEdgeScale(x)).toBeGreaterThanOrEqual(BAG_MIN_SCALE);
        expect(bagEdgeScale(x)).toBeLessThanOrEqual(1);
      }
      const cargo = geometryBounds(getFlourSackGeometry())
        .applyMatrix4(BAG_BODY_OFFSET)
        .union(geometryBounds(FLOUR_SACK_PRINT_GEOMETRY).applyMatrix4(BAG_STRIPE_OFFSET));
      const cargoHalfX = Math.max(Math.abs(cargo.min.x), Math.abs(cargo.max.x));
      const cargoHalfZ = Math.max(Math.abs(cargo.min.z), Math.abs(cargo.max.z));
      // |sin(yaw)| <= |yaw| and |cos(yaw)| <= 1 cover the whole interval.
      const cargoLateralEnvelope = cargoHalfZ + cargoHalfX * 0.05;
      let checked = 0;
      for (const run of runs) {
        const group = scene.getObjectByName(run.id)!;
        const inverseRun = group.matrixWorld.clone().invert();
        const meshes = rails(group);
        const one = (entries: THREE.Mesh[]) => {
          expect(entries).toHaveLength(1);
          return entries[0];
        };
        const frame = bounds(
          one(meshes.filter((mesh) => isBox(mesh, run.length, 0.5, 2.2))),
          inverseRun
        );
        const belt = bounds(
          one(meshes.filter((mesh) => isBox(mesh, run.length, 0.1, 2))),
          inverseRun
        );
        const railBoxes = meshes
          .filter((mesh) => isBox(mesh, run.length - 4, 0.1, 0.15))
          .map((mesh) => bounds(mesh, inverseRun));
        expect(railBoxes).toHaveLength(2);
        const caps = meshes.filter((mesh) => {
          const parameters = (mesh.geometry as THREE.CylinderGeometry).parameters;
          return (
            mesh.geometry.type === 'CylinderGeometry' &&
            parameters.radiusTop === 0.15 &&
            parameters.radiusBottom === 0.15 &&
            parameters.height === 0.05
          );
        });
        const bearings = meshes.filter((mesh) => isBox(mesh, 0.15, 0.15, 0.08));
        const driveCount = Math.max(1, Math.floor((run.length - 4) / 4) + 1);
        expect(caps).toHaveLength(driveCount * 2);
        expect(bearings).toHaveLength(driveCount * 2);
        const driveGroups = [...new Set(bearings.map((mesh) => mesh.parent!))].sort(
          (a, b) => a.position.x - b.position.x
        );
        expect(driveGroups).toHaveLength(driveCount);
        const instance = brackets(group)[0];
        for (let index = 0; index < instance.count; index++) {
          const post = bounds(instance, inverseRun, index);
          const positive = post.getCenter(new THREE.Vector3()).z > 0;
          const rail = railBoxes.find(
            (box) => box.getCenter(new THREE.Vector3()).z > 0 === positive
          )!;
          // The complete foot must sit on the exposed frame ledge. The old
          // elevated/inboard box fails this contact assertion, not the harness.
          expect(post.min.y, `${run.id} bracket ${index}: frame seating`).toBeLessThanOrEqual(
            frame.max.y + epsilon
          );
          expect(post.min.y).toBeGreaterThan(frame.max.y - 0.02 - epsilon);
          expect(post.min.x).toBeGreaterThanOrEqual(frame.min.x - epsilon);
          expect(post.max.x).toBeLessThanOrEqual(frame.max.x + epsilon);
          if (positive) {
            expect(post.min.z - belt.max.z).toBeGreaterThanOrEqual(0.035 - epsilon);
            expect(frame.max.z - post.max.z).toBeGreaterThanOrEqual(0.005 - epsilon);
          } else {
            expect(belt.min.z - post.max.z).toBeGreaterThanOrEqual(0.035 - epsilon);
            expect(post.min.z - frame.min.z).toBeGreaterThanOrEqual(0.005 - epsilon);
          }
          expect(overlap(post, rail, 'x')).toBeGreaterThanOrEqual(
            post.max.x - post.min.x - epsilon
          );
          expect(overlap(post, rail, 'y')).toBeGreaterThanOrEqual(0.05 - epsilon);
          expect(overlap(post, rail, 'z')).toBeGreaterThanOrEqual(0.04 - epsilon);
          expect(post.intersectsBox(belt)).toBe(false);
          for (const cap of caps) {
            // Z separation is unchanged throughout the first group's XY spin.
            expect(gap(post, bounds(cap, inverseRun), 'z')).toBeGreaterThanOrEqual(0.01 - epsilon);
          }
          for (const bearing of bearings) {
            if (bearing.parent !== driveGroups[0]) {
              expect(post.min.y - bounds(bearing, inverseRun).max.y).toBeGreaterThanOrEqual(
                0.015 - epsilon
              );
            } else {
              const half = geometryBounds(bearing.geometry)
                .getSize(new THREE.Vector3())
                .multiplyScalar(0.5);
              const radius =
                Math.hypot(half.x, half.y) + Math.hypot(bearing.position.x, bearing.position.y);
              const centre = new THREE.Vector3().setFromMatrixPosition(
                new THREE.Matrix4().multiplyMatrices(inverseRun, bearing.parent!.matrixWorld)
              );
              const sweepGap = Math.max(
                post.min.x - (centre.x + radius),
                centre.x - radius - post.max.x
              );
              expect(sweepGap).toBeGreaterThanOrEqual(0.35 - epsilon);
            }
          }
          if (run.id === CONVEYOR_LAYOUT.shipping.id) {
            const innerEdge = positive ? post.min.z : -post.max.z;
            expect(innerEdge - cargoLateralEnvelope).toBeGreaterThanOrEqual(0.56 - epsilon);
          }
          checked += 1;
        }
      }
      expect(checked).toBe(66);
    } finally {
      try {
        await render(null);
      } finally {
        useGraphicsStore.setState({ graphics: previousGraphics });
      }
    }
    expect(useGraphicsStore.getState().graphics).toBe(previousGraphics);
  });
});

// This is an explicitly synthetic mixed group, not the shipping conveyor tree.
// It exercises the real batch functions and the real R3F useFrame/ref contract.
// ConveyorSystem has no StaticMeshBatch ancestor; no production batching claim
// is inferred from this positive control.
describe('positive ordinary static-batch control', () => {
  it('batches two ordinary boxes while mounted moving InstancedMesh refs keep updating', async () => {
    const { render } = await mountedRoot();
    const groupRef = createRef<THREE.Group>();
    const boxRefs = [createRef<THREE.Mesh>(), createRef<THREE.Mesh>()];
    const movingRefs = [createRef<THREE.InstancedMesh>(), createRef<THREE.InstancedMesh>()];
    const geometry = new THREE.BoxGeometry(1, 2, 3);
    const material = new THREE.MeshStandardMaterial({ color: '#778899', roughness: 0.7 });
    const matrix = new THREE.Matrix4();
    let frames = 0;
    function MixedControl() {
      useFrame(() => {
        frames += 1;
        movingRefs.forEach((ref, index) => {
          if (!ref.current) throw new Error('A retained moving ref was cleared');
          ref.current.setMatrixAt(0, matrix.makeTranslation(frames + index, 0, 0));
          ref.current.instanceMatrix.needsUpdate = true;
        });
      });
      return (
        <group ref={groupRef} position={[7, 2, 11]}>
          <mesh ref={boxRefs[0]} geometry={geometry} material={material} position={[-2, 0, 0]} />
          <mesh ref={boxRefs[1]} geometry={geometry} material={material} position={[3, 0, 0]} />
          <instancedMesh ref={movingRefs[0]} args={[geometry, material, 2]} />
          <instancedMesh ref={movingRefs[1]} args={[geometry, material, 2]} />
        </group>
      );
    }
    let batches: ReturnType<typeof createStaticMeshBatches> = [];
    try {
      const store = await render(<MixedControl />);
      const root = groupRef.current!;
      root.updateWorldMatrix(true, true);
      const originals = boxRefs.map((ref) => ref.current!);
      const expectedWorld = originals.map((mesh) => mesh.matrixWorld.clone());
      const retained = movingRefs.map((ref) => ref.current!);
      const buffers = retained.map((mesh) => mesh.instanceMatrix);
      const parents = retained.map((mesh) => mesh.parent);
      const candidates = collectStaticBatchCandidates(root);
      expect(candidates.map((candidate) => candidate.mesh)).toEqual(originals);
      expect(root.userData.staticBatchStats.exclusions.instanced).toBe(2);
      batches = createStaticMeshBatches(root, candidates, 'lifecycle-positive-control', 2);
      expect(batches).toHaveLength(1);
      const batch = batches[0].mesh;
      expect(batch).toBeInstanceOf(THREE.InstancedMesh);
      expect((batch as THREE.InstancedMesh).count).toBe(2);
      expect(root.userData.staticBatchStats.optimizedOriginals).toBe(2);
      expect(root.userData.staticBatchStats.instancedBatches).toBe(1);
      originals.forEach((mesh) => expect(mesh.parent).toBeNull());
      root.updateWorldMatrix(true, true);
      expectedWorld.forEach((expected, i) => {
        const local = new THREE.Matrix4();
        (batch as THREE.InstancedMesh).getMatrixAt(i, local);
        const world = new THREE.Matrix4().multiplyMatrices(batch.matrixWorld, local);
        world.elements.forEach((value, j) => expect(value).toBeCloseTo(expected.elements[j], 6));
      });
      advance(0, false, store.getState());
      const previous = retained.map((mesh) => Array.from(mesh.instanceMatrix.array));
      advance(0.1, false, store.getState());
      expect(frames).toBe(2);
      movingRefs.forEach((ref, i) => {
        expect(ref.current).toBe(retained[i]);
        expect(ref.current!.parent).toBe(parents[i]);
        expect(ref.current!.instanceMatrix).toBe(buffers[i]);
        expect(Array.from(ref.current!.instanceMatrix.array)).not.toEqual(previous[i]);
        expect(ref.current!.userData.staticBatch).not.toBe(true);
      });
    } finally {
      // Clean up objects created by the standalone functions before React
      // unmounts its own source objects. This is test cleanup, not an assertion
      // about StaticMeshBatch component effect cleanup.
      for (const batch of batches) {
        batch.mesh.removeFromParent();
        if (batch.mesh instanceof THREE.InstancedMesh) batch.mesh.dispose();
        if (batch.ownsGeometry) batch.mesh.geometry.dispose();
        if (batch.ownsMaterial) {
          const materials = Array.isArray(batch.mesh.material)
            ? batch.mesh.material
            : [batch.mesh.material];
          materials.forEach((entry) => entry.dispose());
        }
        batch.originals.forEach(({ mesh, parent, visible }) => {
          mesh.visible = visible;
          parent.add(mesh);
        });
      }
      await render(null);
      expect(movingRefs.every((ref) => ref.current === null)).toBe(true);
      geometry.dispose();
      material.dispose();
    }
  });
});
