import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { Group, Mesh, MeshStandardMaterial, WebGLRenderer } from 'three';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { EXTERIOR_LAYERS } from '../constants/renderLayers';
import { sampleTerrainGroundHeight } from './terrain/splatMapGenerator';
import type { CreatureRigHandle } from './models/RiggedCreatureModel';

const THREE = createRequire(import.meta.url)('three') as typeof import('three');
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  CylinderGeometry: THREE.CylinderGeometry,
  SphereGeometry: THREE.SphereGeometry,
  ConeGeometry: THREE.ConeGeometry,
  BoxGeometry: THREE.BoxGeometry,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
});

const source = readFileSync('src/components/FarmArea.tsx', 'utf8');
const ast = ts.createSourceFile(
  'FarmArea.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const declaration = (name: string) => {
  const statement = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((d) => d.name.getText(ast) === name)
  );
  if (!statement) throw new Error(`Missing live source declaration ${name}`);
  return statement.getText(ast);
};
const compiled = ts.transpileModule(
  [
    declaration('HORSE_FALLBACK_CONTACT'),
    declaration('HorsePrimitiveBody'),
    declaration('Horse'),
  ].join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }
).outputText;
let call: ts.JsxSelfClosingElement | undefined;
const farmAst = ts.createSourceFile(
  'FarmArea.tsx',
  declaration('FarmArea'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const visit = (node: ts.Node) => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(farmAst) === 'Horse') call = node;
  ts.forEachChild(node, visit);
};
visit(farmAst);
const prop = (name: string) => {
  const value = call?.attributes.properties.find(
    (p) => ts.isJsxAttribute(p) && p.name.getText(farmAst) === name
  );
  if (!value || !ts.isJsxAttribute(value) || !value.initializer)
    throw new Error(`Missing live horse prop ${name}`);
  return ts.isJsxExpression(value.initializer)
    ? new Function(`return (${value.initializer.expression!.getText(farmAst)});`)()
    : value.initializer.text;
};
const liveProps = {
  position: prop('position') as [number, number, number],
  rotation: prop('rotation') as number,
  color: prop('color') as string,
  isPaint: prop('isPaint') as boolean,
};
const TOLERANCE_METRES = 1e-7;

async function mount(fallback: boolean) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const observed: Array<{ creature: string; ref: React.ForwardedRef<CreatureRigHandle> }> = [];
  const Body = React.forwardRef<CreatureRigHandle, { creature: string; fallback: React.ReactNode }>(
    ({ creature, fallback: primitive }, ref) => {
      observed.push({ creature, ref });
      return fallback ? primitive : <group name="retained-loaded-horse" />;
    }
  );
  const Horse = new Function(
    'React',
    'EXTERIOR_LAYERS',
    'CreatureBody',
    'setPointerCursor',
    'resetCursor',
    `${compiled}\nreturn Horse;`
  )(
    React,
    EXTERIOR_LAYERS,
    Body,
    () => undefined,
    () => undefined
  ) as React.ComponentType<
    typeof liveProps & { rigRef: React.RefObject<CreatureRigHandle | null>; onClick: () => void }
  >;
  const rigRef = React.createRef<CreatureRigHandle>();
  const onClick = vi.fn();
  const element = () => (
    <group
      position={[...SITE_LAYOUT.landmarks.farm.position]}
      rotation={[...SITE_LAYOUT.landmarks.farm.rotation]}
      scale={SITE_LAYOUT.landmarks.farm.scale}
    >
      <Horse {...liveProps} rigRef={rigRef} onClick={onClick} />
    </group>
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
  await act(async () => {
    store = root.render(element());
  });
  const allMeshes = () => {
    const result: Mesh[] = [];
    store!.getState().scene.updateMatrixWorld(true);
    store!.getState().scene.traverse((o) => {
      if ((o as Mesh).isMesh) result.push(o as Mesh);
    });
    return result;
  };
  return {
    root,
    renderer,
    observed,
    rigRef,
    onClick,
    element,
    allMeshes,
    get world() {
      return store!.getState().scene.children[0] as Group;
    },
    async finish() {
      await act(async () => root.unmount());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

const worldVertices = (mesh: Mesh) =>
  Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
    new THREE.Vector3()
      .fromBufferAttribute(mesh.geometry.attributes.position, i)
      .applyMatrix4(mesh.matrixWorld)
  );
const worldBounds = (mesh: Mesh) => new THREE.Box3().setFromPoints(worldVertices(mesh));

// Body loading is substituted; the actual private JSX, source anchor/props and R3F
// resource lifecycle run unchanged. No renderer frame or GLB/network request runs.
describe('horse loading/error fallback contact', () => {
  it('seats all four actual world soles on source terrain and joins lower legs while preserving their upper endpoints', async () => {
    const mounted = await mount(true);
    try {
      const meshes = mounted.allMeshes();
      expect(meshes).toHaveLength(30);
      expect(
        meshes.reduce(
          (sum, mesh) =>
            sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3,
          0
        )
      ).toBe(1788);
      const legs: Group[] = [];
      mounted.world.traverse((object) => {
        if (
          Math.abs(object.position.x) === 0.35 &&
          object.position.y === 1.4 &&
          Math.abs(object.position.z) === 0.7
        )
          legs.push(object as Group);
      });
      expect(legs).toHaveLength(4);
      const wrapper = mounted.world.children[0];
      expect(wrapper.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([67, 0, 121]);
      expect(EXTERIOR_LAYERS.ground).toBe(-0.02);
      for (const leg of legs) {
        const [upper, lower, hoof] = leg.children as Mesh[];
        const lo = worldBounds(lower),
          ho = worldBounds(hoof);
        expect(Math.abs(ho.min.y - EXTERIOR_LAYERS.ground)).toBeLessThanOrEqual(TOLERANCE_METRES);
        expect(Math.abs(ho.max.y - 0.07)).toBeLessThanOrEqual(TOLERANCE_METRES);
        expect(Math.abs(lo.min.y - ho.max.y)).toBeLessThanOrEqual(TOLERANCE_METRES);
        expect(Math.abs(lo.max.y - (leg.position.z > 0 ? 0.39 : 0.48))).toBeLessThanOrEqual(
          TOLERANCE_METRES
        );
        expect(Math.abs(ho.max.y - ho.min.y - 0.09)).toBeLessThanOrEqual(TOLERANCE_METRES);
        expect(
          (hoof.geometry as InstanceType<typeof THREE.CylinderGeometry>).parameters
        ).toMatchObject({ radiusTop: 0.12, radiusBottom: 0.15, height: 0.15, radialSegments: 8 });
        expect([upper.castShadow, lower.castShadow, hoof.castShadow]).toEqual([
          false,
          false,
          false,
        ]);
        const lowerParameters = (lower.geometry as InstanceType<typeof THREE.CylinderGeometry>)
          .parameters;
        expect(lowerParameters.radiusBottom).toBeLessThanOrEqual(0.12);
        expect(lowerParameters.radialSegments).toBe(8);
        for (const vertex of worldVertices(hoof))
          for (const segments of [64, 128]) {
            const terrain =
              SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(vertex.x, vertex.z, segments);
            expect(vertex.y - terrain).toBeGreaterThanOrEqual(-TOLERANCE_METRES);
          }
      }
      for (const mesh of meshes) {
        const p = mesh.geometry.attributes.position,
          ix = mesh.geometry.index;
        for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
          const v = [0, 1, 2].map((k) =>
            new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k)
          );
          expect(v[1].sub(v[0]).cross(v[2].sub(v[0])).length()).toBeGreaterThan(1e-14);
        }
      }
      expect(mounted.renderer.render).not.toHaveBeenCalled();
    } finally {
      await mounted.finish();
    }
  });

  it('retains the loaded horse path, rig ref, picking wrapper and zero primitive allocations when loading succeeds', async () => {
    const mounted = await mount(false);
    try {
      expect(mounted.allMeshes()).toHaveLength(0);
      expect(mounted.world.getObjectByName('retained-loaded-horse')).toBeDefined();
      expect(mounted.observed).toEqual([{ creature: 'horse', ref: mounted.rigRef }]);
      const wrapper = mounted.world.children[0] as Group & {
        __r3f: { handlers: { onClick: (event: { stopPropagation: () => void }) => void } };
      };
      expect(wrapper.position.toArray()).toEqual(liveProps.position);
      expect(wrapper.rotation.y).toBe(liveProps.rotation);
      const stopPropagation = vi.fn();
      wrapper.__r3f.handlers.onClick({ stopPropagation });
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(mounted.onClick).toHaveBeenCalledOnce();
      expect(mounted.renderer.render).not.toHaveBeenCalled();
    } finally {
      await mounted.finish();
    }
  });

  it('keeps resource counts stable on rerender and disposes only its 30 geometries/materials exactly once per mount', async () => {
    const mounted = await mount(true);
    try {
      const first = mounted.allMeshes();
      const resources = (meshes: Mesh[]) =>
        meshes.flatMap((mesh) => [mesh.geometry, mesh.material as MeshStandardMaterial]);
      const owned = resources(first);
      expect(new Set(first.map((m) => m.geometry)).size).toBe(30);
      expect(new Set(first.map((m) => m.material)).size).toBe(30);
      first.forEach((m) => {
        const material = m.material as MeshStandardMaterial;
        expect([
          material.map,
          material.normalMap,
          material.roughnessMap,
          material.metalnessMap,
        ]).toEqual([null, null, null, null]);
      });
      const disposal = owned.map((r) => vi.spyOn(r, 'dispose'));
      await act(async () => {
        mounted.root.render(mounted.element());
      });
      expect(resources(mounted.allMeshes())).toEqual(owned);
      disposal.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      await act(async () => {
        mounted.root.render(null);
      });
      disposal.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
      await act(async () => {
        mounted.root.render(mounted.element());
      });
      const remounted = resources(mounted.allMeshes());
      expect(remounted).toHaveLength(60);
      remounted.forEach((resource, i) => expect(resource).not.toBe(owned[i]));
      const nextDisposal = remounted.map((r) => vi.spyOn(r, 'dispose'));
      await act(async () => {
        mounted.root.render(null);
      });
      nextDisposal.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
      disposal.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
      expect(mounted.renderer.render).not.toHaveBeenCalled();
    } finally {
      await mounted.finish();
    }
  });
});
