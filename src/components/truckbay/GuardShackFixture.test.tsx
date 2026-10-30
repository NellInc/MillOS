import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { NodeIO } from '@gltf-transform/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { BoxGeometry, Group, Mesh, MeshStandardMaterial, WebGLRenderer } from 'three';
import ErrorBoundary from '../ErrorBoundary';
import { SURFACE_WETNESS, WET_GROUND_GLSL } from '../../shaders/surfaceWetness';
import { SHELTER_GLSL } from '../../simulation/rainShelters';
import { CONCRETE_SLAB_GLSL, SLAB_JOINT_PITCH, SLAB_JOINT_WIDTH } from '../../utils/concreteSlab';

// One Three identity for R3F and unchanged source declarations. No GPU is created.
const THREE = createRequire(import.meta.url)('three') as typeof import('three');
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  BoxGeometry: THREE.BoxGeometry,
  PlaneGeometry: THREE.PlaneGeometry,
  CylinderGeometry: THREE.CylinderGeometry,
});
const sourcePath = process.env.MILLOS_GUARD_SHACK_SOURCE ?? 'src/components/TruckBay.tsx';
function declarations(file: string, names?: string[]) {
  const s = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(
    file,
    s,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const statements = names
    ? names.map((name) => {
        const n = ast.statements.find((n) =>
          ts.isFunctionDeclaration(n)
            ? n.name?.text === name
            : ts.isVariableStatement(n) &&
              n.declarationList.declarations.some((d) => d.name.getText(ast) === name)
        );
        if (!n) throw Error(`Missing ${file}: ${name}`);
        return n;
      })
    : ast.statements.filter((n) => !ts.isImportDeclaration(n));
  return statements
    .map((n) =>
      n
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
  return new Function(...Object.keys(bindings), `${js}\nreturn ${result};`)(
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
const layer = evaluate(
  declarations('src/constants/renderLayers.ts', ['POLYGON_OFFSET', 'RENDER_ORDER']),
  {},
  '{POLYGON_OFFSET,RENDER_ORDER}'
);
const exteriorLamp = evaluate(
  declarations('src/components/exterior/ExteriorLighting.tsx', [
    'createLampPoolTexture',
    'EXTERIOR_LAMP_LENS_MATERIAL',
    'LAMP_POOL_MATERIAL',
    'LAMP_POOL_GEOMETRY',
    'ExteriorLampPool',
  ]),
  { React, THREE, ...layer },
  '{EXTERIOR_LAMP_LENS_MATERIAL,ExteriorLampPool}'
);
const sites = [
  { name: 'shipping', position: [45, 0, 110], rotation: -Math.PI / 2, trafficX: 20 },
  { name: 'receiving', position: [-45, 0, -110], rotation: Math.PI / 2, trafficX: -20 },
] as const;
async function body() {
  const doc = await new NodeIO().read('public/models/world/yard-guard-shack-body.glb');
  const g = new THREE.Group();
  for (const node of doc.getRoot().listNodes())
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const geo = new THREE.BufferGeometry();
      for (const [semantic, key, size] of [
        ['POSITION', 'position', 3],
        ['NORMAL', 'normal', 3],
        ['TEXCOORD_0', 'uv', 2],
        ['COLOR_0', 'color', 3],
      ] as const) {
        const a = p.getAttribute(semantic);
        if (a)
          geo.setAttribute(
            key,
            new THREE.Float32BufferAttribute(
              Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, [])).flat(),
              size
            )
          );
      }
      if (p.getIndices()) geo.setIndex(Array.from(p.getIndices()!.getArray()!));
      const mat = new THREE.MeshStandardMaterial({
        roughness: 1,
        metalness: 0,
        vertexColors: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'retained-loaded-guard-body';
      mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      g.add(mesh);
    }
  return g;
}
type LoadPhase = 'pending' | 'success' | 'error';
async function mount(site: (typeof sites)[number], initial: LoadPhase = 'success') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const shared = await body();
  let phase = initial,
    resolve!: () => void;
  const pending = new Promise<void>((r) => (resolve = r));
  let frame: (state: { clock: { elapsedTime: number } }, delta: number) => void = () => {
    throw Error('Frame callback absent');
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
    '{animationRegistry,getAnimationDampingAlpha,registerAnimation,unregisterAnimation,TruckAnimationManager}'
  );
  const source = evaluate(
    [
      declarations('src/components/models/GeneratedModel.tsx', ['GeneratedBoundary']),
      declarations(sourcePath, ['labelGroups', 'labelsVisible', 'Text', 'GuardShack']),
    ].join('\n'),
    {
      React,
      THREE,
      ErrorBoundary,
      useEffect,
      useId,
      useLayoutEffect,
      useRef,
      applyWorldSurface: surfaces.applyWorldSurface,
      ...animation,
      ...exteriorLamp,
      SceneText: ({ children, ...props }: { children: string }) => (
        <group {...props} name={`source-label-${children}`} />
      ),
      GeneratedModel: ({ asset }: { asset: string }) => {
        expect(asset).toBe('yardGuardShackBody');
        if (phase === 'pending') throw pending;
        if (phase === 'error') throw Error('Controlled missing guard-shack delivery');
        return <primitive object={shared.clone(true)} />;
      },
    },
    '{GuardShack,labelGroups}'
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
  const draw = (open: boolean, show = true) => {
    store = root.render(
      show ? (
        <>
          <source.GuardShack
            key={key}
            position={[...site.position]}
            rotation={site.rotation}
            gateOpen={open}
          />
          <animation.TruckAnimationManager />
        </>
      ) : null
    );
  };
  await act(async () => draw(false));
  const group = () => store!.getState().scene.children[0] as Group;
  const meshes = () => {
    const list: Mesh[] = [];
    group().traverse((o) => {
      if ((o as Mesh).isMesh) list.push(o as Mesh);
    });
    return list;
  };
  const bar = () =>
    meshes().find(
      (m) =>
        m.geometry.type === 'BoxGeometry' && (m.geometry as BoxGeometry).parameters?.width === 5
    )!;
  const owner = () => [...animation.animationRegistry.values()][0]?.mesh as Group;
  return {
    root,
    group,
    meshes,
    bar,
    owner,
    animation,
    source,
    shared,
    renderer,
    simulation,
    tick: (delta = 1 / 60) => {
      frame({ clock: { elapsedTime: 0 } }, delta);
      group().updateMatrixWorld(true);
    },
    async render(open: boolean) {
      await act(async () => draw(open));
      group().updateMatrixWorld(true);
    },
    async phase(next: LoadPhase, remount = false) {
      phase = next;
      if (remount) key++;
      await act(async () => {
        if (next === 'success') resolve();
        draw(false);
        if (next === 'success') await pending;
      });
    },
    async remove() {
      await act(async () => draw(false, false));
    },
    async finish() {
      await act(async () => {
        draw(false, false);
        root.unmount();
      });
      shared.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as MeshStandardMaterial).dispose();
        }
      });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}
const point = (bar: Mesh, x: number, z = 0) =>
  new THREE.Vector3(x, 0, z).applyMatrix4(bar.matrixWorld);
const hinge = (root: Group) => root.localToWorld(new THREE.Vector3(3, 1.1, 0));

describe.each(sites)('$name source-exact guard-shack pivot', (site) => {
  it('preserves the closed bar and controller contract while owning motion at the support hinge', async () => {
    const m = await mount(site);
    try {
      await m.render(false);
      const bar = m.bar(),
        owner = m.owner();
      expect(owner.isGroup).toBe(true);
      expect(owner.userData).toMatchObject({ dynamic: true, noStaticBatch: true });
      expect(bar.parent).toBe(owner);
      expect(owner.position.toArray()).toEqual([3, 1.1, 0]);
      expect(bar.position.toArray()).toEqual([2.5, 0, 0]);
      expect((bar.geometry as BoxGeometry).parameters).toMatchObject({
        width: 5,
        height: 0.15,
        depth: 0.1,
      });
      expect(point(bar, -2.5).distanceTo(hinge(m.group()))).toBeLessThan(1e-10);
      const far = m.group().localToWorld(new THREE.Vector3(8, 1.1, 0));
      expect(point(bar, 2.5).distanceTo(far)).toBeLessThan(1e-10);
      expect((bar.material as MeshStandardMaterial).color.getHexString()).toBe('dc2626');
      expect((bar.material as MeshStandardMaterial).roughness).toBe(0.6);
      expect([...m.animation.animationRegistry.values()][0].data).toEqual({
        target: 0,
        speed: 0.07,
        property: 'rotation',
        axis: 'y',
      });
      expect(m.group().position.toArray()).toEqual([...site.position]);
      expect(m.group().rotation.y).toBe(site.rotation);
      expect(m.source.labelGroups.size).toBe(2);
      expect(m.renderer.render).not.toHaveBeenCalled();
    } finally {
      await m.finish();
    }
  });
  it('keeps the hinge endpoint fixed for the entire swing and confines housing overlap to the original joint', async () => {
    const m = await mount(site);
    try {
      await m.render(false);
      const bar = m.bar(),
        owner = m.owner(),
        root = m.group();
      const fixed = hinge(root);
      let drift = 0,
        penetrations = 0,
        minimumTrafficGap = Infinity;
      for (let step = 0; step <= 180; step++) {
        owner.rotation.y = ((-Math.PI / 2) * step) / 180;
        root.updateMatrixWorld(true);
        drift = Math.max(drift, point(bar, -2.5).distanceTo(fixed));
        // The unchanged post is x[2.8,3.2], z[-.2,.2]. Beyond0.30m along
        // the bar, rotation preserves radius>=0.30 > sqrt(.2²+.2²).
        for (const t of [0.3, 0.31, 0.4, 1, 2, 3, 4, 5])
          for (const z of [-0.05, 0, 0.05]) {
            const p = root.worldToLocal(point(bar, t - 2.5, z));
            if (p.x >= 2.8 - 1e-7 && p.x <= 3.2 + 1e-7 && Math.abs(p.z) <= 0.2 + 1e-7)
              penetrations++;
          }
        const positions = bar.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(bar.matrixWorld);
          minimumTrafficGap = Math.min(minimumTrafficGap, Math.abs(p.x - site.trafficX) - 5);
        }
      }
      expect(drift).toBeLessThan(1e-10);
      expect(penetrations).toBe(0);
      expect(0.3).toBeGreaterThan(Math.hypot(0.2, 0.2));
      expect(minimumTrafficGap).toBeGreaterThan(14.9);
      const openBounds = new THREE.Box3().setFromPoints(
        Array.from({ length: bar.geometry.getAttribute('position').count }, (_, i) =>
          root.worldToLocal(
            new THREE.Vector3()
              .fromBufferAttribute(bar.geometry.getAttribute('position'), i)
              .applyMatrix4(bar.matrixWorld)
          )
        )
      );
      expect(openBounds.max.x).toBeLessThan(3.2);
      expect(openBounds.min.x).toBeGreaterThan(2.8);
      expect(openBounds.max.x).toBeCloseTo(3.05, 6);
      expect(openBounds.max.z).toBeCloseTo(5, 6);
    } finally {
      await m.finish();
    }
  });
  it('runs the actual manager through opening, reversal, pause and visibility without replacing owned resources', async () => {
    const m = await mount(site);
    try {
      const bar = m.bar(),
        owner = m.owner(),
        geometry = bar.geometry,
        material = bar.material;
      await m.render(true);
      expect(m.animation.animationRegistry.size).toBe(1);
      expect([...m.animation.animationRegistry.values()][0].data).toEqual({
        target: -Math.PI / 2,
        speed: 0.07,
        property: 'rotation',
        axis: 'y',
      });
      m.tick();
      expect(owner.rotation.y).toBeCloseTo(
        THREE.MathUtils.lerp(0, -Math.PI / 2, m.animation.getAnimationDampingAlpha(0.07, 1 / 60)),
        12
      );
      m.simulation.gameSpeed = 0;
      m.simulation.safetyHoldActive = true;
      const prior = owner.rotation.y;
      m.tick();
      expect(owner.rotation.y).toBeLessThan(prior);
      m.simulation.isTabVisible = false;
      await m.render(true);
      const hiddenAngle = owner.rotation.y;
      m.tick();
      expect(owner.rotation.y).toBe(hiddenAngle);
      m.simulation.isTabVisible = true;
      await m.render(true);
      for (let i = 0; i < 200; i++) m.tick();
      expect(Math.abs(owner.rotation.y + Math.PI / 2)).toBeLessThanOrEqual(0.001);
      await m.render(false);
      for (let i = 0; i < 200; i++) m.tick();
      expect(Math.abs(owner.rotation.y)).toBeLessThanOrEqual(0.001);
      expect(m.owner()).toBe(owner);
      expect(m.bar()).toBe(bar);
      expect(bar.geometry).toBe(geometry);
      expect(bar.material).toBe(material);
      expect(point(bar, -2.5).distanceTo(hinge(m.group()))).toBeLessThan(1e-10);
    } finally {
      await m.finish();
    }
  });
  it('excludes the live moving bar from the actual batcher while ordinary static controls still batch', async () => {
    const m = await mount(site);
    const originalAtlas = civic.CIVIC_SHADOW_ATLAS.value;
    const atlas = new THREE.Texture();
    let batches: any[] = [];
    try {
      // Enable the real clone-composition path without starting a renderer or bake load.
      civic.CIVIC_SHADOW_ATLAS.value = atlas;
      await m.render(false);
      const bar = m.bar(),
        owner = m.owner(),
        root = m.group();
      const controls = [1, 2].map((i) => {
        const c = new THREE.Mesh(bar.geometry, bar.material);
        c.position.set(15 + i * 6, 1.1, 0);
        root.add(c);
        return c;
      });
      root.updateMatrixWorld(true);
      for (const angle of [0, -Math.PI / 4, -Math.PI / 2]) {
        owner.rotation.y = angle;
        root.updateMatrixWorld(true);
        const candidates = batching.collectStaticBatchCandidates(root, true);
        expect(candidates.some((c: any) => c.mesh === bar)).toBe(false);
        expect(controls.every((control) => candidates.some((c: any) => c.mesh === control))).toBe(
          true
        );
      }
      batches = batching.createStaticMeshBatches(
        root,
        batching.collectStaticBatchCandidates(root, true),
        'guard-pivot-proof',
        2,
        surfaces.applyBatchWorldSurface
      );
      expect(batches.some((b) => b.originals.some((o: any) => controls.includes(o.mesh)))).toBe(
        true
      );
      expect(batches.every((b) => b.originals.every((o: any) => o.mesh !== bar))).toBe(true);
      for (const batch of batches.filter((b) =>
        b.originals.some((o: any) => controls.includes(o.mesh))
      )) {
        const material = batch.mesh.material as MeshStandardMaterial;
        expect(material).not.toBe(bar.material);
        expect(civic.civicUnderlyingHooks(material)).toBeDefined();
        expect(material.customProgramCacheKey()).toBe(
          `${surfaces.WORLD_SURFACE_CACHE_KEY}|${civic.CIVIC_SHADOW_KEY}`
        );
        const shader = {
          vertexShader: THREE.ShaderLib.standard.vertexShader,
          fragmentShader: THREE.ShaderLib.standard.fragmentShader,
          uniforms: {},
        };
        material.onBeforeCompile(shader as any, {} as WebGLRenderer);
        expect((shader.uniforms as any).uSurfStrength).toBe(surfaces.WORLD_SURFACE_STRENGTH);
        expect((shader.uniforms as any).civicDepthAtlas).toBe(civic.CIVIC_SHADOW_ATLAS);
        expect(shader.fragmentShader).toContain(
          'if (directLight.visible) directLight.color *= civicVisibility(pointLight.position, geometryPosition, nonPerturbedNormal);'
        );
      }
      expect((bar.material as MeshStandardMaterial).customProgramCacheKey()).toBe(
        surfaces.WORLD_SURFACE_CACHE_KEY
      );
      expect(bar.parent).toBe(owner);
      expect(bar.visible).toBe(true);
      expect((bar.material as MeshStandardMaterial).userData.millosWorldSurfaceProfile).toBe(
        'painted'
      );
      expect(
        (bar.material as MeshStandardMaterial).userData.millosWorldSurface.uSurfSpan.value.w
      ).toBe(1);
      const before = owner.rotation.y;
      await m.render(false);
      m.tick();
      expect(owner.rotation.y).toBeGreaterThan(before);
      expect(point(bar, -2.5).distanceTo(hinge(root))).toBeLessThan(1e-10);
      batching.restoreBatches(root, batches);
      batches = [];
      controls.forEach((c) => root.remove(c));
    } finally {
      if (batches.length) batching.restoreBatches(m.group(), batches);
      civic.CIVIC_SHADOW_ATLAS.value = originalAtlas;
      atlas.dispose();
      await m.finish();
    }
  });
  it('preserves the mounted gate across pending-body resolution and releases only owned bar resources on unmount', async () => {
    const m = await mount(site, 'pending');
    try {
      expect(m.meshes()).toHaveLength(12);
      const bar = m.bar(),
        owner = m.owner();
      const gd = vi.spyOn(bar.geometry, 'dispose'),
        md = vi.spyOn(bar.material as MeshStandardMaterial, 'dispose');
      const sharedMesh = m.shared.children[0] as Mesh;
      const sg = vi.spyOn(sharedMesh.geometry, 'dispose'),
        sm = vi.spyOn(sharedMesh.material as MeshStandardMaterial, 'dispose');
      await m.render(true);
      m.tick();
      const angle = owner.rotation.y;
      const uniforms = (bar.material as MeshStandardMaterial).userData.millosWorldSurface;
      await m.phase('success');
      expect((bar.material as MeshStandardMaterial).userData.millosWorldSurface).toBe(uniforms);
      expect(m.meshes()).toHaveLength(7);
      expect(m.bar()).toBe(bar);
      expect(m.owner()).toBe(owner);
      expect(owner.rotation.y).toBe(angle);
      expect(m.animation.animationRegistry.size).toBe(1);
      await m.remove();
      expect(m.animation.animationRegistry.size).toBe(0);
      expect(m.source.labelGroups.size).toBe(0);
      expect(gd).toHaveBeenCalledOnce();
      expect(md).toHaveBeenCalledOnce();
      expect(sg).not.toHaveBeenCalled();
      expect(sm).not.toHaveBeenCalled();
      expect(m.renderer.render).not.toHaveBeenCalled();
    } finally {
      await m.finish();
    }
  });
  it('keeps the complete fallback gate operable on a body error, then cleans its animation on remount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = await mount(site, 'error');
    try {
      expect(m.meshes()).toHaveLength(12);
      const old = m.owner();
      await m.render(true);
      for (let i = 0; i < 160; i++) m.tick();
      expect(Math.abs(old.rotation.y + Math.PI / 2)).toBeLessThanOrEqual(0.001);
      expect(point(m.bar(), -2.5).distanceTo(hinge(m.group()))).toBeLessThan(1e-10);
      await m.phase('success', true);
      expect(m.meshes()).toHaveLength(7);
      expect(m.owner()).not.toBe(old);
      expect(m.animation.animationRegistry.size).toBe(1);
      expect([...m.animation.animationRegistry.values()].every((a: any) => a.mesh !== old)).toBe(
        true
      );
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      await m.finish();
    }
  });
  it('uses the unchanged painted shader in rest coordinates with stable cache and shared strength', async () => {
    const m = await mount(site);
    const priorStrength = surfaces.WORLD_SURFACE_STRENGTH.value;
    try {
      await m.render(false);
      const bar = m.bar(),
        owner = m.owner(),
        mat = bar.material as MeshStandardMaterial;
      expect(mat.userData.millosWorldSurfaceProfile).toBe('painted');
      const uniforms = mat.userData.millosWorldSurface;
      expect(uniforms.uSurfSpan.value.w).toBe(1);
      expect(uniforms.uSurfStrength).toBe(surfaces.WORLD_SURFACE_STRENGTH);
      const beforeHook = mat.onBeforeCompile,
        beforeKey = mat.customProgramCacheKey();
      expect(beforeKey).toBe(surfaces.WORLD_SURFACE_CACHE_KEY);
      surfaces.applyWorldSurface(mat, 'painted', { objectSpace: 1 });
      expect(mat.onBeforeCompile).toBe(beforeHook);
      expect(mat.userData.millosWorldSurface).toBe(uniforms);
      const shader = {
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        uniforms: {},
      };
      mat.onBeforeCompile(shader as any, {} as WebGLRenderer);
      expect(shader.vertexShader).toContain('vSurfObject = position * vec3(');
      expect(shader.fragmentShader).toContain('mix( vSurfWorld, vSurfObject, uSurfSpan.w )');
      expect((shader.uniforms as any).uSurfStrength).toBe(surfaces.WORLD_SURFACE_STRENGTH);
      const attr = bar.geometry.getAttribute('position'),
        local = new THREE.Vector3().fromBufferAttribute(attr, 0);
      const restSamples: number[][] = [],
        worldSamples: number[][] = [];
      for (const angle of [0, -Math.PI / 6, -Math.PI / 3, -Math.PI / 2]) {
        owner.rotation.y = angle;
        m.group().updateMatrixWorld(true);
        const cols = [0, 1, 2].map((c) =>
          new THREE.Vector3().setFromMatrixColumn(bar.matrixWorld, c).length()
        );
        restSamples.push(local.toArray().map((v, i) => v * cols[i]));
        worldSamples.push(local.clone().applyMatrix4(bar.matrixWorld).toArray());
        expect(point(bar, -2.5).distanceTo(hinge(m.group()))).toBeLessThan(1e-10);
      }
      for (const v of restSamples)
        for (let i = 0; i < 3; i++) expect(v[i]).toBeCloseTo(restSamples[0][i], 12);
      expect(worldSamples[0]).not.toEqual(worldSamples[3]);
      for (const strength of [0, 0.4, 1]) {
        surfaces.WORLD_SURFACE_STRENGTH.value = strength;
        expect(uniforms.uSurfStrength.value).toBe(strength);
        expect(mat.customProgramCacheKey()).toBe(beforeKey);
        expect(mat.onBeforeCompile).toBe(beforeHook);
      }
      const untouched = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 });
      expect(surfaces.resolveSurfaceProfile(untouched)).toBe('signage');
      expect(surfaces.resolveBatchSurfaceProfile(untouched)).toBe('painted');
      expect(surfaces.WORLD_SURFACE_PROFILES.painted.objectSpace).toBe(0);
      expect(untouched.userData.millosWorldSurface).toBeUndefined();
      untouched.dispose();
    } finally {
      surfaces.WORLD_SURFACE_STRENGTH.value = priorStrength;
      await m.finish();
    }
  });
});

it('owns two separate site materials while sharing only the existing treatment strength', async () => {
  const a = await mount(sites[0]),
    b = await mount(sites[1]);
  try {
    const ma = a.bar().material as MeshStandardMaterial,
      mb = b.bar().material as MeshStandardMaterial;
    expect(ma).not.toBe(mb);
    expect(ma.userData.millosWorldSurface).not.toBe(mb.userData.millosWorldSurface);
    expect(ma.userData.millosWorldSurface.uSurfStrength).toBe(
      mb.userData.millosWorldSurface.uSurfStrength
    );
    expect(ma.userData.millosWorldSurface.uSurfStrength).toBe(surfaces.WORLD_SURFACE_STRENGTH);
    const ad = vi.spyOn(ma, 'dispose'),
      bd = vi.spyOn(mb, 'dispose');
    await a.remove();
    expect(ad).toHaveBeenCalledOnce();
    expect(bd).not.toHaveBeenCalled();
    await b.render(true);
    b.tick();
    expect(b.owner().rotation.y).toBeLessThan(0);
    await b.remove();
    expect(bd).toHaveBeenCalledOnce();
  } finally {
    await a.finish();
    await b.finish();
  }
});
