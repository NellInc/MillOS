import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { NodeIO } from '@gltf-transform/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { Group, Mesh, MeshStandardMaterial, WebGLRenderer } from 'three';
import ErrorBoundary from '../ErrorBoundary';
import { SURFACE_WETNESS, WET_GROUND_GLSL } from '../../shaders/surfaceWetness';
import { SHELTER_GLSL } from '../../simulation/rainShelters';
import { CONCRETE_SLAB_GLSL, SLAB_JOINT_PITCH, SLAB_JOINT_WIDTH } from '../../utils/concreteSlab';

// Execute current source declarations, actual manager and actual batcher on one
// Three identity. R3F reconciles resources; the renderer never draws. Controlled
// loader states do not prove GLTFLoader/network, shader or GPU behavior.
const THREE = createRequire(import.meta.url)('three') as typeof import('three');
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  BoxGeometry: THREE.BoxGeometry,
  PlaneGeometry: THREE.PlaneGeometry,
  CylinderGeometry: THREE.CylinderGeometry,
  ConeGeometry: THREE.ConeGeometry,
});
function declarations(file: string, names?: string[]) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const statements = names
    ? names.map((name) => {
        const node = ast.statements.find((n) =>
          ts.isFunctionDeclaration(n)
            ? n.name?.text === name
            : ts.isVariableStatement(n) &&
              n.declarationList.declarations.some((d) => d.name.getText(ast) === name)
        );
        if (!node) throw Error(`Missing actual declaration ${file}: ${name}`);
        return node;
      })
    : ast.statements.filter((node) => !ts.isImportDeclaration(node));
  return statements
    .map((node) =>
      node
        .getText(ast)
        .replace(/^export\s+/, '')
        .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'))
    )
    .join('\n');
}
function evaluate(code: string, bindings: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn (${result});`)(
    ...Object.values(bindings)
  );
}
const surfaces = evaluate(
  declarations('src/utils/worldSurface.ts'),
  {
    THREE,
    SURFACE_WETNESS,
    WET_GROUND_GLSL,
    SHELTER_GLSL,
    CONCRETE_SLAB_GLSL,
    SLAB_JOINT_PITCH,
    SLAB_JOINT_WIDTH,
  },
  '{pinnedSurfaceProfile,applyWorldSurface,applyDeclinedWorldSurface,ownsOnlyWorldSurface,applyBatchWorldSurface,WORLD_SURFACE_STRENGTH,WORLD_SURFACE_CACHE_KEY,resolveSurfaceProfile,resolveBatchSurfaceProfile,WORLD_SURFACE_PROFILES}'
);
const layout = evaluate(
  declarations('src/constants/siteLayout.ts'),
  {},
  '{SITE_LAYOUT,landmarkLocalToWorld}'
);
const lighting = evaluate(
  declarations('src/constants/civicSquareLighting.ts'),
  layout,
  '{CIVIC_WORLD_LIGHTS,CIVIC_SHADOW_FACE_SIZE,CIVIC_SHADOW_ATLAS_SIZE,CIVIC_CUBE_FACE_BASES,CIVIC_SHADOW_CONVENTION,CIVIC_SOURCE_LOOKUP}'
);
const civic = evaluate(
  declarations('src/shaders/civicLampShadows.ts'),
  { THREE, ...lighting },
  '{civicUnderlyingHooks,applyCivicLampShadows,CIVIC_SHADOW_ATLAS,CIVIC_SHADOW_KEY}'
);
const lamp = evaluate(
  declarations('src/components/models/GeneratedLampModel.tsx', [
    'lampHooks',
    'lampLensStyle',
    'LAMP_LENS_HEIGHTS',
    'applyLampLens',
  ]),
  { THREE, ...civic },
  '{lampLensStyle,applyLampLens}'
);
const batching = evaluate(
  declarations('src/components/performance/StaticMeshBatch.tsx'),
  { React, THREE, useEffect, useRef, mergeGeometries, ...surfaces, ...civic, ...lamp },
  '{collectStaticBatchCandidates,createStaticMeshBatches,restoreBatches}'
);
async function deliveredBody() {
  const doc = await new NodeIO().read('public/models/world/yard-truck-wash-body.glb');
  const group = new THREE.Group();
  for (const node of doc.getRoot().listNodes())
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, key, size] of [
        ['POSITION', 'position', 3],
        ['NORMAL', 'normal', 3],
        ['TEXCOORD_0', 'uv', 2],
        ['COLOR_0', 'color', 3],
      ] as const) {
        const a = p.getAttribute(semantic);
        if (a)
          geometry.setAttribute(
            key,
            new THREE.Float32BufferAttribute(
              Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, [])).flat(),
              size
            )
          );
      }
      if (p.getIndices()) geometry.setIndex(Array.from(p.getIndices()!.getArray()!));
      const input = p.getMaterial()!;
      const mat = new THREE.MeshStandardMaterial({
        roughness: input.getRoughnessFactor(),
        metalness: input.getMetallicFactor(),
        vertexColors: true,
      });
      if (input.getNormalTexture()) mat.normalMap = new THREE.Texture();
      if (input.getMetallicRoughnessTexture()) mat.roughnessMap = new THREE.Texture();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = 'delivered-wash-body';
      mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      group.add(mesh);
    }
  return group;
}
type Phase = 'pending' | 'success' | 'error';
async function mount(initial: Phase = 'success', strict = false, instances = 1) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const shared = await deliveredBody();
  let phase = initial,
    resolve!: () => void;
  const pending = new Promise<void>((r) => {
    resolve = r;
  });
  let frame: (state: { clock: { elapsedTime: number } }, delta: number) => void = () => {
    throw Error('Missing actual frame');
  };
  const simulation = { isTabVisible: true, gameSpeed: 1, safetyHoldActive: false };
  const simulationHook = Object.assign((f: (s: typeof simulation) => unknown) => f(simulation), {
    getState: () => simulation,
  });
  const animation = evaluate(
    declarations('src/components/truckbay/animationSystem.ts', [
      'animationRegistry',
      'getAnimationDampingAlpha',
      'registerAnimation',
      'unregisterAnimation',
      'particleRegistry',
      'truckComponentsRegistry',
      'isYardEquipmentRunning',
      'yardPulseIntensity',
      'truckMarkerLightIntensity',
      'TruckAnimationManager',
    ]),
    {
      React,
      THREE,
      useFrame: (f: typeof frame) => {
        frame = f;
      },
      useGameSimulationStore: simulationHook,
      selectSafetyHoldActive: (s: typeof simulation) => s.safetyHoldActive,
      useGraphicsStore: (f: (s: unknown) => unknown) => f({ graphics: { quality: 'ultra' } }),
      shouldRunThisFrame: () => true,
      useReducedMotion: () => false,
    },
    '{animationRegistry,registerAnimation,unregisterAnimation,TruckAnimationManager}'
  );
  const component = evaluate(
    [
      declarations('src/components/models/GeneratedModel.tsx', ['GeneratedBoundary']),
      declarations('src/components/TruckBay.tsx', [
        'labelGroups',
        'labelsVisible',
        'Text',
        'TruckWashStation',
      ]),
    ].join('\n'),
    {
      React,
      THREE,
      ErrorBoundary,
      useEffect,
      useId,
      useLayoutEffect,
      useRef,
      ...animation,
      SceneText: ({ children, ...props }: { children: string }) => (
        <group {...props} name={`label-${children}`} />
      ),
      GeneratedModel: ({ asset }: { asset: string }) => {
        expect(asset).toBe('yardTruckWashBody');
        if (phase === 'pending') throw pending;
        if (phase === 'error') throw Error('Controlled missing truck-wash delivery');
        return <primitive object={shared.clone(true)} />;
      },
    },
    '{TruckWashStation,labelGroups}'
  );
  const canvas = document.createElement('canvas');
  const renderer = {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    domElement: canvas,
  } as unknown as WebGLRenderer;
  const root = createRoot(canvas);
  await root.configure({
    gl: renderer,
    frameloop: 'never',
    size: { width: 1, height: 1, top: 0, left: 0 },
  });
  let store: ReturnType<typeof root.render>;
  let key = 0;
  const draw = (show = true) => {
    const content = show ? (
      <>
        {Array.from({ length: instances }, (_, i) => (
          <component.TruckWashStation key={`${key}-${i}`} position={[i * 20, 0, 0]} />
        ))}
        <animation.TruckAnimationManager />
      </>
    ) : null;
    store = root.render(strict ? <React.StrictMode>{content}</React.StrictMode> : content);
  };
  await act(async () => draw());
  const group = () => store!.getState().scene.children[0] as Group;
  const owners = () =>
    [...animation.animationRegistry.values()].map((entry: any) => entry.mesh as Group);
  const owner = () => owners()[0];
  const meshes = () => {
    const out: Mesh[] = [];
    group().traverse((o) => {
      if ((o as Mesh).isMesh) out.push(o as Mesh);
    });
    return out;
  };
  return {
    group,
    owner,
    owners,
    meshes,
    simulation,
    animation,
    renderer,
    component,
    tick(delta = 1 / 60) {
      frame({ clock: { elapsedTime: 0 } }, delta);
      group().updateMatrixWorld(true);
    },
    async render(show = true) {
      await act(async () => draw(show));
      if (show) group().updateMatrixWorld(true);
    },
    async remount() {
      key++;
      await act(async () => draw());
    },
    async phase(next: Phase, reset = false) {
      phase = next;
      if (reset) key++;
      await act(async () => {
        if (next === 'success') resolve();
        draw();
        if (next === 'success') await pending;
      });
    },
    async finish(preserveGlobals = false) {
      await act(async () => {
        draw(false);
        root.unmount();
      });
      shared.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as MeshStandardMaterial;
          mat.normalMap?.dispose();
          mat.roughnessMap?.dispose();
          mat.dispose();
        }
      });
      if (!preserveGlobals) {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    },
  };
}
const brushMeshes = (owner: Group) => owner.children as Mesh[];
const parameters = (mesh: Mesh) => (mesh.geometry as any).parameters;

describe('source-exact truck-wash ownership regression', () => {
  it('registers rotation on the supported X shaft with stable useId ownership', async () => {
    const m = await mount();
    try {
      expect([...m.animation.animationRegistry.values()][0].data).toEqual({ axis: 'x', speed: 2 });
      const source = declarations('src/components/TruckBay.tsx', ['TruckWashStation']);
      expect(source).toContain('useId()');
      expect(source).not.toContain('Math.random');
      const id = [...m.animation.animationRegistry.keys()][0];
      await m.render();
      expect([...m.animation.animationRegistry.keys()]).toEqual([id]);
    } finally {
      await m.finish();
    }
  });
  it('fits the complete brush sweep beneath the canopy and between retained rear supports', async () => {
    const m = await mount();
    try {
      const owner = m.owner(),
        parts = brushMeshes(owner),
        drum = parts[0];
      expect(owner.position.toArray()).toEqual([0, 4.15, 5]);
      expect(parameters(drum)).toMatchObject({
        radiusTop: 0.5,
        radiusBottom: 0.5,
        height: 6.6,
        radialSegments: 16,
      });
      expect(parts).toHaveLength(7);
      expect(parts.slice(1).map((p) => p.position.x)).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
      // At 45 degrees a transformed cylinder AABB invents radius sqrt(.5²+.5²),
      // giving the false roof gap 4.8 - 4.15 - sqrt(.5²+.5²) = -.057106781.
      // Measure actual transformed vertices, never rotated geometry boxes.
      m.group().updateMatrixWorld(true);
      const inverseOwner = m.owner().matrixWorld.clone().invert();
      let sweepRadius = 0;
      for (const part of parts) {
        const position = part.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          const point = new THREE.Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(part.matrixWorld)
            .applyMatrix4(inverseOwner);
          sweepRadius = Math.max(sweepRadius, Math.hypot(point.y, point.z));
        }
      }
      expect(sweepRadius).toBeCloseTo(Math.hypot(0.6, 0.05), 6);
      // The radial envelope proves clearance continuously, between sampled frames.
      expect(4.8 - owner.position.y - sweepRadius).toBeGreaterThan(0.0478);
      expect(owner.position.z - sweepRadius - 2.05).toBeGreaterThan(2.3478);
      expect(owner.position.z - sweepRadius - Math.hypot(0.7, 0.05)).toBeGreaterThan(3.696);
      let roofGap = Infinity,
        pipeGap = Infinity,
        sideGap = Infinity;
      for (let i = 0; i <= 360; i++) {
        owner.rotation.x = (i * Math.PI) / 180;
        m.group().updateMatrixWorld(true);
        const bounds = new THREE.Box3();
        for (const part of parts) {
          const position = part.geometry.getAttribute('position');
          for (let vertex = 0; vertex < position.count; vertex++)
            bounds.expandByPoint(
              new THREE.Vector3()
                .fromBufferAttribute(position, vertex)
                .applyMatrix4(part.matrixWorld)
            );
        }
        roofGap = Math.min(roofGap, 4.8 - bounds.max.y);
        pipeGap = Math.min(pipeGap, bounds.min.z - 2.05);
        sideGap = Math.min(sideGap, bounds.min.z - Math.hypot(0.7, 0.05));
        expect(bounds.min.x).toBeCloseTo(-3.3, 5);
        expect(bounds.max.x).toBeCloseTo(3.3, 5);
      }
      expect(roofGap).toBeGreaterThan(0.0478);
      expect(pipeGap).toBeGreaterThan(2.3478);
      expect(sideGap).toBeGreaterThan(3.696);
    } finally {
      await m.finish();
    }
  });
  it('keeps all seven moving meshes out of a real paused static-batch pass and resumes them', async () => {
    const m = await mount();
    let batches: any[] = [];
    try {
      m.simulation.gameSpeed = 0;
      m.tick();
      const owner = m.owner(),
        original = [...owner.children];
      const controls = [0, 1].map((i) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.4, metalness: 0.5 })
        );
        mesh.position.set(12 + i * 2, 0, 0);
        m.group().add(mesh);
        return mesh;
      });
      m.group().updateMatrixWorld(true);
      const candidates = batching.collectStaticBatchCandidates(m.group(), true);
      batches = batching.createStaticMeshBatches(
        m.group(),
        candidates,
        'wash-pause-reproduction',
        2,
        surfaces.applyBatchWorldSurface
      );
      expect(batches.some((b) => b.originals.some((o: any) => controls.includes(o.mesh)))).toBe(
        true
      );
      expect(owner.children).toEqual(original);
      expect(owner.userData).toMatchObject({ dynamic: true, noStaticBatch: true });
      expect(candidates.some((c: any) => original.includes(c.mesh))).toBe(false);
      m.simulation.gameSpeed = 1;
      m.tick();
      expect(owner.rotation.x).toBeGreaterThan(0);
      batching.restoreBatches(m.group(), batches);
      batches = [];
      controls.forEach((c) => {
        m.group().remove(c);
        c.geometry.dispose();
        (c.material as MeshStandardMaterial).dispose();
      });
    } finally {
      if (batches.length) batching.restoreBatches(m.group(), batches);
      await m.finish();
    }
  });
  it('keeps equipment pause, safety hold and hidden-tab gates without resetting the X angle', async () => {
    const m = await mount();
    try {
      const owner = m.owner();
      m.tick(0.125);
      expect(owner.rotation.x).toBeCloseTo(0.25, 10);
      for (const state of [
        { gameSpeed: 0 },
        { gameSpeed: 1, safetyHoldActive: true },
        { safetyHoldActive: false, isTabVisible: false },
      ]) {
        Object.assign(m.simulation, state);
        await m.render();
        const angle = owner.rotation.x;
        m.tick(0.125);
        expect(owner.rotation.x).toBe(angle);
      }
      m.simulation.isTabVisible = true;
      await m.render();
      m.tick(0.125);
      expect(owner.rotation.x).toBeCloseTo(0.5, 10);
      expect(owner.rotation.y).toBe(0);
    } finally {
      await m.finish();
    }
  });
  it('reconciles fallback pipe and nozzle mounting geometry before and after a load failure', async () => {
    // R3F captures console.error while creating the root; scope the exact expected
    // error before mount, and forward every other error instead of hiding it.
    const originalError = console.error;
    const isExpected = (args: unknown[]) =>
      args.some(
        (arg) => arg instanceof Error && arg.message === 'Controlled missing truck-wash delivery'
      );
    const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (!isExpected(args)) originalError(...args);
    });
    const m = await mount('pending');
    try {
      const check = () => {
        const pipes = m.meshes().filter((mesh) => parameters(mesh)?.radiusTop === 0.05);
        expect(pipes).toHaveLength(3);
        expect(pipes.map((p) => p.parent!.position.z)).toEqual([-2, 1, 2]);
        for (const pipe of pipes) {
          expect(pipe.rotation.z).toBeCloseTo(Math.PI / 2, 12);
          const nozzles = pipe.parent!.children.filter(
            (p) => (p as Mesh).geometry.type === 'ConeGeometry'
          );
          expect(nozzles).toHaveLength(5);
          expect(nozzles.map((p) => p.position.y)).toEqual(Array(5).fill(-0.08));
        }
      };
      check();
      await m.phase('error', true);
      check();
      expect(error).toHaveBeenCalled();
      expect(error.mock.calls.every(isExpected)).toBe(true);
      expect(m.animation.animationRegistry.size).toBe(1);
    } finally {
      error.mockRestore();
      await m.finish();
    }
  });
  it('retains one common brush during pending-to-loaded transitions and cleans StrictMode instances', async () => {
    const m = await mount('pending', true, 2);
    try {
      const owners = m.owners();
      expect(owners).toHaveLength(2);
      expect(new Set(m.animation.animationRegistry.keys()).size).toBe(2);
      await m.phase('success');
      expect(m.owners()).toEqual(owners);
      await m.render(false);
      expect(m.animation.animationRegistry.size).toBe(0);
      await m.render();
      expect(m.owners()).toHaveLength(2);
      expect(m.owners().every((owner) => !owners.includes(owner))).toBe(true);
      await m.remount();
      expect(m.animation.animationRegistry.size).toBe(2);
      expect(m.component.labelGroups.size).toBe(6);
    } finally {
      await m.finish();
    }
    expect(m.animation.animationRegistry.size).toBe(0);
    expect(m.component.labelGroups.size).toBe(0);
  });
  it('matches fallback triangles to the actual final GLB and measures full-sweep clearances against its parts', async () => {
    const fallback = await mount('pending');
    let loaded: Awaited<ReturnType<typeof mount>> | undefined;
    try {
      loaded = await mount('success');
      fallback.group().updateMatrixWorld(true);
      loaded.group().updateMatrixWorld(true);
      const body = loaded.meshes().find((mesh) => mesh.name === 'delivered-wash-body')!;
      expect(body).toBeDefined();
      const attribute = body.geometry.getAttribute('position');
      const points = Array.from({ length: attribute.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(body.matrixWorld)
      );
      const index = body.geometry.getIndex()!;
      expect(index.count).toBe(2040);
      const triangles = Array.from({ length: index.count / 3 }, (_, i) => [
        index.getX(i * 3),
        index.getX(i * 3 + 1),
        index.getX(i * 3 + 2),
      ]);
      const pointKey = (point: import('three').Vector3) =>
        point
          .toArray()
          .map((value) => Math.round(value * 1e4))
          .join(',');
      const triangleKey = (vertices: import('three').Vector3[]) => {
        const keys = vertices.map(pointKey);
        return [keys, [keys[1], keys[2], keys[0]], [keys[2], keys[0], keys[1]]]
          .map((keys) => keys.join('/'))
          .sort()[0];
      };
      const available = new Map<string, number[]>();
      triangles.forEach((ids, i) => {
        const key = triangleKey(ids.map((id) => points[id]));
        available.set(key, [...(available.get(key) ?? []), i]);
      });
      const brush = new Set(fallback.owner().children);
      const staticParts = fallback
        .meshes()
        .filter((mesh) => !brush.has(mesh) && mesh.geometry.type !== 'PlaneGeometry');
      expect(staticParts).toHaveLength(38);
      const measured = new Map<
        Mesh,
        { points: import('three').Vector3[]; bounds: import('three').Box3 }
      >();
      for (const part of staticParts) {
        const positions = part.geometry.getAttribute('position');
        const vertices = Array.from({ length: positions.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld)
        );
        const indices = part.geometry.getIndex();
        const count = indices?.count ?? positions.count;
        const matched = new Set<number>();
        for (let i = 0; i < count; i += 3) {
          const expected = [0, 1, 2].map(
            (offset) => vertices[indices ? indices.getX(i + offset) : i + offset]
          );
          const candidates = available.get(triangleKey(expected));
          expect(
            candidates?.length,
            `Missing actual ${part.geometry.type} triangle ${i / 3}`
          ).toBeGreaterThan(0);
          const ids = triangles[candidates!.pop()!];
          // Rounded keys only select candidates; actual coordinates must agree
          // within 2 micrometres with one winding-preserving cyclic alignment.
          const residual = Math.min(
            ...[0, 1, 2].map((offset) =>
              Math.max(
                ...expected.map((point, corner) =>
                  point.distanceTo(points[ids[(corner + offset) % 3]])
                )
              )
            )
          );
          expect(residual).toBeLessThan(0.000002);
          ids.forEach((id) => matched.add(id));
        }
        const actual = [...matched].map((id) => points[id]);
        measured.set(part, { points: actual, bounds: new THREE.Box3().setFromPoints(actual) });
      }
      expect([...available.values()].reduce((sum, ids) => sum + ids.length, 0)).toBe(0);
      // Identify semantic parts from real fallback geometry, then measure only
      // their matched final GLB vertices. No corrected envelope is invented here.
      const canopy = staticParts.find(
        (part) => part.geometry.type === 'BoxGeometry' && parameters(part).width === 8
      )!;
      const canopyBounds = measured.get(canopy)!.bounds;
      const pipes = staticParts.filter((part) => parameters(part)?.radiusTop === 0.05);
      const nozzles = staticParts.filter((part) => part.geometry.type === 'ConeGeometry');
      const sideDrums = staticParts.filter((part) => parameters(part)?.radiusTop === 0.6);
      const rearPosts = staticParts.filter(
        (part) =>
          part.geometry.type === 'BoxGeometry' &&
          parameters(part).width === 0.4 &&
          part.position.z > 0
      );
      expect(pipes).toHaveLength(3);
      expect(nozzles).toHaveLength(15);
      expect(sideDrums).toHaveLength(2);
      expect(rearPosts).toHaveLength(2);
      const centralPipe = pipes.find((pipe) => pipe.parent!.position.z === 1)!;
      expect(centralPipe).toBeDefined();
      expect(measured.get(centralPipe)!.bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(1, 5);
      const sideEnvelopes = sideDrums.map((drum) => {
        const cylinder = measured.get(drum)!.bounds;
        const center = cylinder.getCenter(new THREE.Vector3());
        const sidePoints = staticParts
          .filter((part) => part.parent === drum.parent)
          .flatMap((part) => measured.get(part)!.points);
        const radius = Math.max(
          ...sidePoints.map((point) => Math.hypot(point.x - center.x, point.z - center.z))
        );
        return { minZ: center.z - radius, maxZ: center.z + radius };
      });
      const intervalGap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
        Math.max(bMin - aMax, aMin - bMax);
      for (const pipe of pipes) {
        const b = measured.get(pipe)!.bounds;
        expect(b.max.y - canopyBounds.min.y).toBeCloseTo(0.05, 5); // Intended canopy mounting.
        for (const side of sideEnvelopes)
          expect(intervalGap(b.min.z, b.max.z, side.minZ, side.maxZ)).toBeGreaterThan(0.2481);
      }
      for (const nozzle of nozzles) {
        const b = measured.get(nozzle)!.bounds;
        const pipe = pipes.find((pipe) => pipe.parent === nozzle.parent)!;
        const pipeBounds = measured.get(pipe)!.bounds;
        expect(b.max.y - pipeBounds.min.y).toBeCloseTo(0.02, 5); // Intended seating.
        expect(b.min.x).toBeGreaterThan(pipeBounds.min.x);
        expect(b.max.x).toBeLessThan(pipeBounds.max.x);
        expect(b.getCenter(new THREE.Vector3()).z).toBeCloseTo(
          pipeBounds.getCenter(new THREE.Vector3()).z,
          5
        );
        for (const side of sideEnvelopes)
          expect(intervalGap(b.min.z, b.max.z, side.minZ, side.maxZ)).toBeGreaterThan(0.2581);
      }
      const owner = loaded.owner(),
        moving = brushMeshes(owner);
      expect(owner.position.toArray()).toEqual(fallback.owner().position.toArray());
      const inverse = owner.matrixWorld.clone().invert();
      let radius = 0;
      const movingPoints = moving.flatMap((part, i) => {
        const counterpart = brushMeshes(fallback.owner())[i];
        expect(Array.from(part.geometry.getAttribute('uv').array)).toEqual(
          Array.from(counterpart.geometry.getAttribute('uv').array)
        );
        expect((part.material as MeshStandardMaterial).normalMap).toBe(
          (counterpart.material as MeshStandardMaterial).normalMap
        );
        const positions = part.geometry.getAttribute('position');
        return Array.from({ length: positions.count }, (_, vertex) => {
          const point = new THREE.Vector3()
            .fromBufferAttribute(positions, vertex)
            .applyMatrix4(part.matrixWorld);
          const local = point.clone().applyMatrix4(inverse);
          radius = Math.max(radius, Math.hypot(local.y, local.z));
          return point;
        });
      });
      const center = owner.getWorldPosition(new THREE.Vector3());
      const minZ = center.z - radius,
        maxZ = center.z + radius;
      expect(canopyBounds.min.y - center.y - radius).toBeGreaterThan(0.0478);
      expect(canopyBounds.max.z - maxZ).toBeGreaterThan(0.3978);
      for (const part of [...pipes, ...nozzles]) {
        const b = measured.get(part)!.bounds;
        expect(intervalGap(minZ, maxZ, b.min.z, b.max.z)).toBeGreaterThan(2.3478);
      }
      for (const side of sideEnvelopes)
        expect(intervalGap(minZ, maxZ, side.minZ, side.maxZ)).toBeGreaterThan(3.696);
      const movingBounds = new THREE.Box3().setFromPoints(movingPoints);
      expect(movingBounds.min.x - canopyBounds.min.x).toBeGreaterThan(0.69);
      expect(canopyBounds.max.x - movingBounds.max.x).toBeGreaterThan(0.69);
      const core = moving.find((part) => part.geometry.type === 'CylinderGeometry')!;
      const corePositions = core.geometry.getAttribute('position');
      const coreBounds = new THREE.Box3().setFromPoints(
        Array.from({ length: corePositions.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(corePositions, i).applyMatrix4(core.matrixWorld)
        )
      );
      const coreCenter = coreBounds.getCenter(new THREE.Vector3());
      for (const post of rearPosts) {
        const b = measured.get(post)!.bounds;
        const inner = b.getCenter(new THREE.Vector3()).x < center.x ? b.max.x : b.min.x;
        const end = inner < coreCenter.x ? coreBounds.min.x : coreBounds.max.x;
        expect(Math.abs(inner - end)).toBeLessThan(0.000002);
        // The shaft-axis cap center lies inside the actual support face at every X angle.
        expect(coreCenter.y).toBeGreaterThan(b.min.y);
        expect(coreCenter.y).toBeLessThan(b.max.y);
        expect(coreCenter.z).toBeGreaterThan(b.min.z);
        expect(coreCenter.z).toBeLessThan(b.max.z);
      }
    } finally {
      try {
        await loaded?.finish(true);
      } finally {
        await fallback.finish();
      }
    }
  });
});
