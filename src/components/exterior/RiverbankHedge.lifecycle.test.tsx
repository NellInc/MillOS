import React, { act, useMemo } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { NodeIO, type Accessor } from '@gltf-transform/core';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type * as ThreeTypes from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { getRiverbankHedgePosition } from './riverbankHedgeGrounding';
import { HedgeFoliage, HEDGE_CROWN_GEOMETRY, hedgeCrownTransforms } from './HedgeFoliage';
import { BROADLEAF_MATERIAL, BROADLEAF_DEPTH } from '../scenery/InstancedFoliage';
import { WIND_UNIFORMS } from '../scenery/WindDriver';
import { WORLD_SURFACE_STRENGTH } from '../../utils/worldSurface';

// Loader transport is controlled; the source GeneratedBoundary, BoxSurface,
// strict envelope/UV restoration, cloned normal layer and React/R3F lifecycle
// all execute unchanged. Embedded image bytes are retained as metadata here;
// neither browser image decoding nor GPU uploads/shading are claimed.
const delivery = vi.hoisted(() => ({
  phase: 'loaded' as 'loaded' | 'pending',
  scene: null as unknown,
  pending: null as Promise<void> | null,
}));
vi.mock('../../utils/dracoLoader', () => ({
  useDracoGLTF: () => {
    if (delivery.phase === 'pending') throw delivery.pending;
    return { scene: delivery.scene };
  },
  preloadDracoModel: vi.fn(),
}));
const THREE = createRequire(import.meta.url)('three') as typeof import('three');
extend({ Group: THREE.Group, Mesh: THREE.Mesh, InstancedMesh: THREE.InstancedMesh });
const factory = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
const ast = ts.createSourceFile(
  'FactoryExterior.tsx',
  factory,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
function declaration(name: string) {
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const found = statement.declarationList.declarations.find((d) => d.name.getText(ast) === name);
    if (found) return 'const ' + found.getText(ast) + ';';
  }
  throw new Error('Missing actual owner ' + name);
}
const compiled = ts.transpileModule(['HedgeRow', 'RiverbankHedge'].map(declaration).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const { HedgeRow, RiverbankHedge } = new Function(
  'React',
  'useMemo',
  'useGraphicsStore',
  'getTerrainGridSegments',
  'getRiverbankHedgePosition',
  'HedgeFoliage',
  compiled + '\nreturn { HedgeRow, RiverbankHedge };'
)(
  React,
  useMemo,
  useGraphicsStore,
  getTerrainGridSegments,
  getRiverbankHedgePosition,
  HedgeFoliage
) as {
  HedgeRow: React.ComponentType<{
    start: [number, number, number];
    end: [number, number, number];
    height: number;
    width: number;
  }>;
  RiverbankHedge: React.ComponentType;
};

// These pinned GLBs use non-normalized FLOAT attributes and UNSIGNED_SHORT
// indices. Narrow the loader union by the actual accessor contract, retaining
// the exact array object/bytes rather than converting coordinates or indices.
function floatAttribute(accessor: Accessor | null, itemSize: number) {
  if (
    !accessor ||
    accessor.getComponentType() !== 5126 ||
    accessor.getElementSize() !== itemSize ||
    accessor.getNormalized()
  )
    throw new Error('Expected the delivered non-normalized FLOAT accessor');
  const values = accessor.getArray();
  if (!(values instanceof Float32Array))
    throw new Error('FLOAT accessor must retain its Float32Array constructor');
  const attribute = new THREE.BufferAttribute(values, itemSize, accessor.getNormalized());
  expect(attribute.array).toBe(values);
  expect(attribute.normalized).toBe(false);
  return attribute;
}

function indexAttribute(accessor: Accessor | null) {
  if (
    !accessor ||
    accessor.getComponentType() !== 5123 ||
    accessor.getElementSize() !== 1 ||
    accessor.getNormalized()
  )
    throw new Error('Expected the delivered non-normalized UNSIGNED_SHORT indices');
  const values = accessor.getArray();
  if (!(values instanceof Uint16Array))
    throw new Error('UNSIGNED_SHORT indices must retain their Uint16Array constructor');
  const attribute = new THREE.BufferAttribute(values, 1, accessor.getNormalized());
  expect(attribute.array).toBe(values);
  expect(attribute.normalized).toBe(false);
  return attribute;
}

async function deliveredCore() {
  const bytes = readFileSync('public/models/world/hedge-unit.glb');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '808a45bf2a900a731887ef2605cec8a8de691b6c15e8440a3f82d64b0d8cf81b'
  );
  const document = await new NodeIO().read('public/models/world/hedge-unit.glb');
  const root = new THREE.Group();
  for (const node of document.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, name, size] of [
        ['POSITION', 'position', 3],
        ['NORMAL', 'normal', 3],
        ['TEXCOORD_0', 'uv', 2],
      ] as const)
        geometry.setAttribute(name, floatAttribute(primitive.getAttribute(semantic), size));
      if (primitive.getAttribute('COLOR_0'))
        geometry.setAttribute('color', floatAttribute(primitive.getAttribute('COLOR_0'), 3));
      geometry.setIndex(indexAttribute(primitive.getIndices()));
      const delivered = primitive.getMaterial()!;
      const texture = new THREE.Texture();
      texture.flipY = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.userData.encodedImageSHA256 = createHash('sha256')
        .update(delivered.getNormalTexture()!.getImage()!)
        .digest('hex');
      const info = delivered.getNormalTextureInfo()!;
      const wrap = {
        10497: THREE.RepeatWrapping,
        33071: THREE.ClampToEdgeWrapping,
        33648: THREE.MirroredRepeatWrapping,
      } as const;
      const minFilter = {
        9728: THREE.NearestFilter,
        9729: THREE.LinearFilter,
        9984: THREE.NearestMipmapNearestFilter,
        9985: THREE.LinearMipmapNearestFilter,
        9986: THREE.NearestMipmapLinearFilter,
        9987: THREE.LinearMipmapLinearFilter,
      } as const;
      texture.wrapS = wrap[info.getWrapS()];
      texture.wrapT = wrap[info.getWrapT()];
      texture.minFilter = minFilter[info.getMinFilter() ?? 9987];
      texture.magFilter = info.getMagFilter() === 9728 ? THREE.NearestFilter : THREE.LinearFilter;
      texture.channel = info.getTexCoord();
      const material = new THREE.MeshStandardMaterial({
        normalMap: texture,
        normalScale: new THREE.Vector2(delivered.getNormalScale(), delivered.getNormalScale()),
        roughness: delivered.getRoughnessFactor(),
        metalness: delivered.getMetallicFactor(),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      root.add(mesh);
    }
  }
  expect(root.children).toHaveLength(1);
  return root;
}

function trees(strict: boolean, visible = true) {
  const content = visible ? (
    <>
      <group name="unchanged-source-row">
        <HedgeRow start={[-10, 0, -128]} end={[10, 0, -128]} height={0.5} width={0.4} />
      </group>
      <group name="candidate-row">
        <RiverbankHedge />
      </group>
    </>
  ) : null;
  return strict ? <React.StrictMode>{content}</React.StrictMode> : content;
}

async function mount(strict: boolean, phase: 'loaded' | 'pending') {
  const originalGraphics = useGraphicsStore.getState().graphics;
  const shared = await deliveredCore();
  delivery.scene = shared;
  delivery.phase = phase;
  let resolve!: () => void;
  delivery.pending = new Promise<void>((r) => {
    resolve = r;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const canvas = document.createElement('canvas');
  const renderer = {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    domElement: canvas,
  } as unknown as ThreeTypes.WebGLRenderer;
  const root = createRoot(canvas);
  await root.configure({
    gl: renderer,
    frameloop: 'never',
    size: { width: 1, height: 1, top: 0, left: 0 },
  });
  let store: ReturnType<typeof root.render>;
  await act(async () => {
    useGraphicsStore.setState({ graphics: { ...originalGraphics, quality: 'low' } });
    store = root.render(trees(strict));
  });
  const scene = () => {
    const scene = store!.getState().scene;
    scene.updateMatrixWorld(true);
    return scene;
  };
  return {
    scene,
    renderer,
    shared,
    async quality(quality: 'low' | 'medium' | 'high' | 'ultra') {
      // Exercise the actual Zustand subscription, without force-rendering the owner.
      await act(async () => {
        useGraphicsStore.setState({ graphics: { ...originalGraphics, quality } });
      });
    },
    async load() {
      await act(async () => {
        delivery.phase = 'loaded';
        resolve();
        await delivery.pending;
      });
    },
    async hide() {
      await act(async () => {
        root.render(trees(strict, false));
      });
    },
    async close() {
      await act(async () => {
        root.render(null);
        root.unmount();
      });
      useGraphicsStore.setState({ graphics: originalGraphics });
      shared.traverse((object) => {
        const mesh = object as ThreeTypes.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material as ThreeTypes.MeshStandardMaterial;
        material.normalMap?.dispose();
        material.dispose();
      });
      delivery.scene = null;
      delivery.pending = null;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

function row(scene: ThreeTypes.Scene, name: string) {
  const group = scene.getObjectByName(name)!;
  const mesh: ThreeTypes.Mesh[] = [];
  group.traverse((object) => {
    if ((object as ThreeTypes.Mesh).isMesh) mesh.push(object as ThreeTypes.Mesh);
  });
  expect(mesh).toHaveLength(2);
  const crown = mesh.find(
    (m) => (m as ThreeTypes.InstancedMesh).isInstancedMesh
  ) as ThreeTypes.InstancedMesh;
  const core = mesh.find((m) => m !== crown)!;
  expect(crown.count).toBe(144);
  expect(crown.geometry).toBe(HEDGE_CROWN_GEOMETRY);
  expect(crown.material).toBe(BROADLEAF_MATERIAL);
  expect(crown.customDepthMaterial).toBe(BROADLEAF_DEPTH);
  expect(crown.castShadow && crown.receiveShadow).toBe(true);
  expect((core.geometry.index?.count ?? core.geometry.attributes.position.count) / 3).toBe(12);
  expect(
    ((crown.geometry.index?.count ?? crown.geometry.attributes.position.count) / 3) * crown.count +
      12
  ).toBe(4620);
  return { group, crown, core };
}

function assertExactLocalCrowns(crown: ThreeTypes.InstancedMesh) {
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion();
  const p = new THREE.Vector3(),
    s = new THREE.Vector3();
  const expected = hedgeCrownTransforms(0.4, 0.5, 20);
  expect(crown.instanceMatrix.count).toBe(expected.length);
  expected.forEach((c, i) => {
    matrix.compose(
      p.fromArray(c.position),
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (i % 2) * Math.PI),
      s.fromArray(c.scale)
    );
    expect(Array.from(crown.instanceMatrix.array.slice(i * 16, (i + 1) * 16))).toEqual(
      Array.from(new Float32Array(matrix.elements))
    );
    expect(Array.from(crown.instanceColor!.array.slice(i * 3, (i + 1) * 3))).toEqual(
      Array.from(new Float32Array([c.tint, c.tint, c.tint]))
    );
  });
}

function assertRigidPair(
  source: ReturnType<typeof row>,
  candidate: ReturnType<typeof row>,
  quality: string
) {
  const delta = getRiverbankHedgePosition(getTerrainGridSegments(quality));
  const owner = candidate.group.getObjectByName('grounded-riverbank-hedge')!;
  expect(owner.position.toArray()).toEqual(delta);
  expect(owner.rotation.toArray()).toEqual([0, 0, 0, 'XYZ']);
  expect(owner.scale.toArray()).toEqual([1, 1, 1]);
  expect(owner.children).toHaveLength(1);
  expect(owner.children[0].position.toArray()).toEqual([0, 0.25, -128]);
  expect(owner.children[0].rotation.y).toBe(Math.PI / 2);
  assertExactLocalCrowns(candidate.crown);
  expect(Array.from(candidate.crown.instanceMatrix.array)).toEqual(
    Array.from(source.crown.instanceMatrix.array)
  );
  expect(Array.from(candidate.crown.instanceColor!.array)).toEqual(
    Array.from(source.crown.instanceColor!.array)
  );
  for (const [before, after] of [
    [source.core, candidate.core],
    [source.crown, candidate.crown],
  ]) {
    expect(after.position.toArray()).toEqual(before.position.toArray());
    expect(after.rotation.toArray()).toEqual(before.rotation.toArray());
    expect(after.scale.toArray()).toEqual(before.scale.toArray());
    const shift = new THREE.Matrix4().makeTranslation(...delta).multiply(before.matrixWorld);
    shift.elements.forEach((n, i) => expect(after.matrixWorld.elements[i]).toBeCloseTo(n, 12));
    for (const key of Object.keys(before.geometry.attributes)) {
      expect(Array.from(after.geometry.getAttribute(key).array)).toEqual(
        Array.from(before.geometry.getAttribute(key).array)
      );
    }
    expect(after.geometry.index ? Array.from(after.geometry.index.array) : null).toEqual(
      before.geometry.index ? Array.from(before.geometry.index.array) : null
    );
    expect(after.castShadow).toBe(before.castShadow);
    expect(after.receiveShadow).toBe(before.receiveShadow);
    expect(after.renderOrder).toBe(before.renderOrder);
  }
  const a = source.core.material as ThreeTypes.MeshStandardMaterial,
    b = candidate.core.material as ThreeTypes.MeshStandardMaterial;
  for (const key of [
    'roughness',
    'metalness',
    'transparent',
    'opacity',
    'alphaTest',
    'side',
    'depthTest',
    'depthWrite',
    'polygonOffset',
    'polygonOffsetFactor',
    'polygonOffsetUnits',
  ] as const)
    expect(b[key]).toBe(a[key]);
  expect(b.color.toArray()).toEqual(a.color.toArray());
  expect(b.customProgramCacheKey()).toBe(a.customProgramCacheKey());
  expect(b.map).toBe(a.map);
  expect(b.roughnessMap).toBe(a.roughnessMap);
  expect(b.normalMap?.source).toBe(a.normalMap?.source);
  expect(b.normalMap?.channel).toBe(a.normalMap?.channel);
  expect(b.normalMap?.flipY).toBe(a.normalMap?.flipY);
}

function resources(meshes: ReturnType<typeof row>) {
  const material = meshes.core.material as ThreeTypes.MeshStandardMaterial;
  const owned = [
    meshes.core.geometry,
    material,
    ...(material.normalMap ? [material.normalMap] : []),
  ];
  const shared = [
    HEDGE_CROWN_GEOMETRY,
    BROADLEAF_MATERIAL,
    BROADLEAF_DEPTH,
    BROADLEAF_MATERIAL.map!,
    BROADLEAF_MATERIAL.normalMap!,
    BROADLEAF_MATERIAL.roughnessMap!,
  ];
  return {
    refs: {
      crown: meshes.crown,
      matrix: meshes.crown.instanceMatrix,
      color: meshes.crown.instanceColor,
      core: meshes.core,
      geometry: meshes.core.geometry,
      material,
      normalMap: material.normalMap,
      normalSource: material.normalMap?.source,
    },
    owned,
    shared,
    disposals: [...owned, ...shared].map((object) => vi.spyOn(object, 'dispose')),
    matrixBytes: Array.from(meshes.crown.instanceMatrix.array),
    colorBytes: Array.from(meshes.crown.instanceColor!.array),
    matrixVersion: meshes.crown.instanceMatrix.version,
    colorVersion: meshes.crown.instanceColor!.version,
    materialVersion: material.version,
    normalVersion: material.normalMap?.version,
  };
}

function assertSameResources(current: ReturnType<typeof row>, saved: ReturnType<typeof resources>) {
  const material = current.core.material as ThreeTypes.MeshStandardMaterial;
  expect(current.crown).toBe(saved.refs.crown);
  expect(current.core).toBe(saved.refs.core);
  expect(current.crown.instanceMatrix).toBe(saved.refs.matrix);
  expect(current.crown.instanceColor).toBe(saved.refs.color);
  expect(current.core.geometry).toBe(saved.refs.geometry);
  expect(material).toBe(saved.refs.material);
  expect(material.normalMap).toBe(saved.refs.normalMap);
  expect(material.normalMap?.source).toBe(saved.refs.normalSource);
  expect(Array.from(current.crown.instanceMatrix.array)).toEqual(saved.matrixBytes);
  expect(Array.from(current.crown.instanceColor!.array)).toEqual(saved.colorBytes);
  expect(current.crown.instanceMatrix.version).toBe(saved.matrixVersion);
  expect(current.crown.instanceColor!.version).toBe(saved.colorVersion);
  expect(material.version).toBe(saved.materialVersion);
  expect(material.normalMap?.version).toBe(saved.normalVersion);
  saved.disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
}

describe.each([false, true])(
  'real source RiverbankHedge R3F lifecycle, StrictMode=%s',
  (strict) => {
    it('keeps loaded core and all crown/resource owners through low→medium→high→ultra→low and releases only its pre-existing owned resources', async () => {
      const mounted = await mount(strict, 'loaded');
      try {
        const source = row(mounted.scene(), 'unchanged-source-row');
        const candidate = row(mounted.scene(), 'candidate-row');
        const saved = resources(candidate);
        expect(
          (candidate.core.material as ThreeTypes.MeshStandardMaterial).normalMap
        ).not.toBeNull();
        expect(
          (candidate.core.material as ThreeTypes.MeshStandardMaterial).normalMap!.channel
        ).toBe(1);
        expect(candidate.core.geometry.attributes.uv1).toBeDefined();
        assertRigidPair(source, candidate, 'low');
        for (const quality of ['medium', 'high', 'ultra', 'low'] as const) {
          await mounted.quality(quality);
          const after = row(mounted.scene(), 'candidate-row');
          assertRigidPair(row(mounted.scene(), 'unchanged-source-row'), after, quality);
          assertSameResources(after, saved);
        }
        await mounted.hide();
        saved.owned.forEach((_object, i) => expect(saved.disposals[i]).toHaveBeenCalledTimes(1));
        saved.shared.forEach((_object, i) =>
          expect(saved.disposals[saved.owned.length + i]).not.toHaveBeenCalled()
        );
        expect(mounted.renderer.render).not.toHaveBeenCalled();
      } finally {
        await mounted.close();
      }
    });

    it('keeps pending fallback at the same grounded transform, then loads the intact core without remounting crowns', async () => {
      const mounted = await mount(strict, 'pending');
      try {
        const first = row(mounted.scene(), 'candidate-row');
        const matrix = first.crown.instanceMatrix,
          colors = first.crown.instanceColor;
        const fallbackGeometry = first.core.geometry;
        const fallbackDispose = vi.spyOn(fallbackGeometry, 'dispose');
        expect((first.core.material as ThreeTypes.MeshStandardMaterial).normalMap).toBeNull();
        for (const quality of ['medium', 'high', 'ultra', 'low'] as const) {
          await mounted.quality(quality);
          const candidate = row(mounted.scene(), 'candidate-row');
          assertRigidPair(row(mounted.scene(), 'unchanged-source-row'), candidate, quality);
          expect(candidate.core.geometry).toBe(fallbackGeometry);
          expect(candidate.crown).toBe(first.crown);
          expect(candidate.crown.instanceMatrix).toBe(matrix);
          expect(candidate.crown.instanceColor).toBe(colors);
          expect(fallbackDispose).not.toHaveBeenCalled();
        }
        await mounted.load();
        const loaded = row(mounted.scene(), 'candidate-row');
        expect(loaded.crown).toBe(first.crown);
        expect(loaded.crown.instanceMatrix).toBe(matrix);
        expect(loaded.crown.instanceColor).toBe(colors);
        expect(loaded.core.geometry).not.toBe(fallbackGeometry);
        expect((loaded.core.material as ThreeTypes.MeshStandardMaterial).normalMap).not.toBeNull();
        expect(fallbackDispose).not.toHaveBeenCalled();
        assertRigidPair(row(mounted.scene(), 'unchanged-source-row'), loaded, 'low');
        await mounted.hide();
        expect(fallbackDispose).toHaveBeenCalledTimes(1);
        expect(mounted.renderer.render).not.toHaveBeenCalled();
      } finally {
        await mounted.close();
      }
    });
  }
);

it('preserves composed world-rest foliage, wind-synced depth, shared uniforms, and fixed program routes', () => {
  const make = (key: 'standard' | 'depth') => ({
    uniforms: {},
    vertexShader: THREE.ShaderLib[key].vertexShader,
    fragmentShader: THREE.ShaderLib[key].fragmentShader,
  });
  const color = make('standard'),
    depth = make('depth');
  const renderer = {} as ThreeTypes.WebGLRenderer;
  BROADLEAF_MATERIAL.onBeforeCompile(
    color as unknown as ThreeTypes.WebGLProgramParametersWithUniforms,
    renderer
  );
  BROADLEAF_DEPTH.onBeforeCompile(
    depth as unknown as ThreeTypes.WebGLProgramParametersWithUniforms,
    renderer
  );
  const colorUniforms = color.uniforms as Record<string, unknown>,
    depthUniforms = depth.uniforms as Record<string, unknown>;
  for (const [name, uniform] of Object.entries(WIND_UNIFORMS)) {
    expect(colorUniforms[name]).toBe(uniform);
    expect(depthUniforms[name]).toBe(uniform);
  }
  expect(colorUniforms.uSurfStrength).toBe(WORLD_SURFACE_STRENGTH);
  expect(color.vertexShader).toContain('millosWindLocal = instanceMatrix * millosWindLocal');
  expect(color.vertexShader).toContain('modelMatrix * millosWindLocal');
  expect(color.vertexShader).toContain('surfObjectMatrix = surfObjectMatrix * instanceMatrix');
  expect(color.vertexShader).toContain(
    'vSurfWorld = ( surfObjectMatrix * vec4( position, 1.0 ) ).xyz'
  );
  expect(depth.vertexShader).toContain('modelMatrix * millosWindLocal');
  expect(BROADLEAF_MATERIAL.customProgramCacheKey()).toBe(
    'millos_foliage_broadleaf_v1_millos_world_surface_v11'
  );
  expect(BROADLEAF_DEPTH.customProgramCacheKey()).toBe('millos_foliage_broadleaf_v1_depth');
  expect(BROADLEAF_MATERIAL.map).toBe(BROADLEAF_DEPTH.map);
  expect(BROADLEAF_MATERIAL.alphaTest).toBe(0.4);
  expect(BROADLEAF_DEPTH.alphaTest).toBe(0.4);
  expect(BROADLEAF_MATERIAL.side).toBe(THREE.FrontSide);
  expect(BROADLEAF_MATERIAL.transparent).toBe(false);
  expect(BROADLEAF_MATERIAL.vertexColors).toBe(false);
});
