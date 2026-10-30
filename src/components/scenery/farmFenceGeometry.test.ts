import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { AUTHORED_PROP_TRIM, AUTHORED_PROP_TRIM_MATERIALS } from './AuthoredPropTrim';
import { FarmFenceRun } from './FarmFenceRun';
import { createFarmFenceRun } from './farmFenceGeometry';

const fenceLoaderFixture = vi.hoisted(() => ({ scene: undefined as THREE.Group | undefined }));
vi.mock('../../utils/dracoLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/dracoLoader')>()),
  useDracoGLTF: () => fenceLoaderFixture,
}));

let source: THREE.BufferGeometry;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const decoder = await require('draco3dgltf').createDecoderModule({
    wasmBinary: readFileSync(require.resolve('draco3dgltf/draco_decoder_gltf.wasm')),
  });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': decoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.readBinary(new Uint8Array(readFileSync('public/models/farm/fence.glb')));
  const node = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getMesh())!;
  const primitive = node.getMesh()!.listPrimitives()[0];
  source = new THREE.BufferGeometry();
  for (const [semantic, name] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
    ['TEXCOORD_0', 'uv'],
  ] as const) {
    const attribute = primitive.getAttribute(semantic)!;
    source.setAttribute(
      name,
      new THREE.Float32BufferAttribute(
        Array.from(attribute.getArray()!),
        attribute.getElementSize()
      )
    );
  }
  source.setIndex(Array.from(primitive.getIndices()!.getArray()!));
  source.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
}, 60000);

function ray(geometry: THREE.BufferGeometry, x: number, y: number) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  const result = new THREE.Raycaster(
    new THREE.Vector3(x, y, 1),
    new THREE.Vector3(0, 0, -1)
  ).intersectObject(mesh);
  material.dispose();
  return result;
}

describe('farm-local shared fence supports from the immutable delivery', () => {
  it.each([4, 5, 6])(
    'retains %i m endpoints, post sections, three rail levels and authored colors/UVs',
    (length) => {
      const input = Array.from(source.getAttribute('position').array);
      const trimInput = Array.from(AUTHORED_PROP_TRIM.fence.getAttribute('position').array);
      const result = createFarmFenceRun(source, AUTHORED_PROP_TRIM.fence, length);
      try {
        expect(result.postCentres).toHaveLength(result.bays + 1);
        expect(result.body.boundingBox!.min.x).toBeCloseTo(-length / 2, 5);
        expect(result.body.boundingBox!.max.x).toBeCloseTo(length / 2, 5);
        expect(result.body.boundingBox!.min.y).toBeCloseTo(0, 6);
        expect(result.body.boundingBox!.max.y).toBeCloseTo(1.05, 6);
        expect(result.body.boundingBox!.max.z).toBeCloseTo(0.098, 6);
        const p = result.body.getAttribute('position');
        for (const x of result.postCentres) {
          const foot = [];
          for (let i = 0; i < p.count; i++)
            if (Math.abs(p.getY(i)) < 1e-6 && Math.abs(p.getX(i) - x) < 0.11) foot.push(p.getX(i));
          expect(Math.max(...foot) - Math.min(...foot)).toBeCloseTo(0.196, 5);
          expect(ray(result.body, x, 1.02).length).toBeGreaterThan(0); // Original cap remains.
          for (const y of [0.28, 0.59, 0.87])
            expect(ray(result.trim, x, y).length).toBeGreaterThan(0);
        }
        for (let bay = 0; bay < result.bays; bay++) {
          for (let step = 0; step <= 20; step++) {
            const x =
              result.postCentres[bay] +
              ((result.postCentres[bay + 1] - result.postCentres[bay]) * step) / 20;
            for (const y of [0.28, 0.59, 0.87])
              expect(ray(result.body, x, y).length).toBeGreaterThan(0);
          }
          const centre = (result.postCentres[bay] + result.postCentres[bay + 1]) / 2;
          expect(ray(result.body, centre, 0.44)).toHaveLength(0); // Open between rails, no invented support.
        }
        // Inspect actual derived long rail triangles, independently of the
        // helper's claimed span: all three levels enter both supporting posts.
        for (let bay = 0; bay < result.bays; bay++) {
          const middle = (result.postCentres[bay] + result.postCentres[bay + 1]) / 2;
          for (const y of [0.28, 0.59, 0.87]) {
            const railX: number[] = [];
            for (let i = 0; i < p.count; i += 3) {
              const xs = [0, 1, 2].map((k) => p.getX(i + k));
              if (Math.max(...xs) - Math.min(...xs) < 0.5) continue;
              if (Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - middle) > 0.05) continue;
              if (![0, 1, 2].every((k) => Math.abs(p.getY(i + k) - y) < 0.046)) continue;
              railX.push(...xs);
            }
            expect(railX.length).toBeGreaterThan(0);
            expect(Math.min(...railX)).toBeLessThan(result.postCentres[bay]);
            expect(Math.max(...railX)).toBeGreaterThan(result.postCentres[bay + 1]);
            expect(Math.min(...railX)).toBeGreaterThan(result.postCentres[bay] - 0.098);
            expect(Math.max(...railX)).toBeLessThan(result.postCentres[bay + 1] + 0.098);
          }
        }
        const originalUv = source.getAttribute('uv');
        const uvSet = new Set(
          Array.from(
            { length: originalUv.count },
            (_, i) => `${originalUv.getX(i)},${originalUv.getY(i)}`
          )
        );
        const uv = result.body.getAttribute('uv');
        for (let i = 0; i < uv.count; i++)
          expect(uvSet.has(`${uv.getX(i)},${uv.getY(i)}`)).toBe(true);
        const originalColors = AUTHORED_PROP_TRIM.fence.getAttribute('color');
        const colorSet = new Set(
          Array.from(
            { length: originalColors.count },
            (_, i) =>
              `${originalColors.getX(i)},${originalColors.getY(i)},${originalColors.getZ(i)}`
          )
        );
        const colors = result.trim.getAttribute('color');
        for (let i = 0; i < colors.count; i++)
          expect(colorSet.has(`${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`)).toBe(true);
        expect(
          (result.body.getAttribute('position').count +
            result.trim.getAttribute('position').count) /
            3
        ).toBeLessThan(result.bays * (412 + 576));
        expect(Array.from(source.getAttribute('position').array)).toEqual(input);
        expect(Array.from(AUTHORED_PROP_TRIM.fence.getAttribute('position').array)).toEqual(
          trimInput
        );
      } finally {
        result.body.dispose();
        result.trim.dispose();
      }
    }
  );
  it('rejects an unexpected delivery topology and invalid length instead of deforming unrelated parts', () => {
    expect(() => createFarmFenceRun(new THREE.BoxGeometry(), AUTHORED_PROP_TRIM.fence, 4)).toThrow(
      'topology'
    );
    expect(() => createFarmFenceRun(source, AUTHORED_PROP_TRIM.fence, NaN)).toThrow('length');
  });
});

describe('farm fence run resource ownership', () => {
  it('releases derived geometry on length changes and remounts without disposing cached assets', async () => {
    const runtimeThree = createRequire(import.meta.url)('three') as typeof THREE;
    extend({ Group: runtimeThree.Group, Mesh: runtimeThree.Mesh });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const scene = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: '#8b7355' });
    scene.add(new THREE.Mesh(source, material));
    fenceLoaderFixture.scene = scene;
    const sourcePositions = Array.from(source.attributes.position.array);
    const trimPositions = Array.from(AUTHORED_PROP_TRIM.fence.attributes.position.array);
    const protectedDisposals = [
      source,
      material,
      AUTHORED_PROP_TRIM.fence,
      AUTHORED_PROP_TRIM_MATERIALS.fence,
    ].map((resource) => vi.spyOn(resource, 'dispose'));
    const canvas = document.createElement('canvas');
    const renderer = {
      render: vi.fn(),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      domElement: canvas,
    } as unknown as THREE.WebGLRenderer;
    const root = createRoot(canvas);
    await root.configure({
      gl: renderer,
      frameloop: 'never',
      size: { width: 1, height: 1, top: 0, left: 0 },
    });
    const runs: THREE.BufferGeometry[][] = [];
    const ownedDisposals: ReturnType<typeof vi.spyOn>[] = [];
    try {
      for (const length of [4, 5, 4]) {
        let store: ReturnType<typeof root.render>;
        await act(async () => {
          store = root.render(createElement(FarmFenceRun, { length }));
        });
        const meshes = store!.getState().scene.children[0].children as THREE.Mesh[];
        expect(meshes).toHaveLength(2);
        expect(meshes[0].material).toBe(material);
        expect(meshes[1].material).toBe(AUTHORED_PROP_TRIM_MATERIALS.fence);
        const geometries = meshes.map((mesh) => mesh.geometry);
        for (const previous of runs) {
          expect(geometries[0]).not.toBe(previous[0]);
          expect(geometries[1]).not.toBe(previous[1]);
        }
        for (const dispose of ownedDisposals) expect(dispose).toHaveBeenCalledOnce();
        runs.push(geometries);
        ownedDisposals.push(...geometries.map((geometry) => vi.spyOn(geometry, 'dispose')));
        if (length === 5)
          await act(async () => {
            root.render(null);
          });
      }
      await act(async () => {
        root.render(null);
      });
      for (const dispose of ownedDisposals) expect(dispose).toHaveBeenCalledOnce();
      for (const dispose of protectedDisposals) expect(dispose).not.toHaveBeenCalled();
      expect(Array.from(source.attributes.position.array)).toEqual(sourcePositions);
      expect(Array.from(AUTHORED_PROP_TRIM.fence.attributes.position.array)).toEqual(trimPositions);
      expect(material.color.getHexString()).toBe('8b7355');
      expect(renderer.render).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      material.dispose();
      fenceLoaderFixture.scene = undefined;
    }
  });
});
