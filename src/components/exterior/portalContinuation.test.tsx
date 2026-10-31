import React, { act, useEffect, useMemo } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import type { Mesh, MeshStandardMaterial, WebGLRenderer } from 'three';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

// Render the current private owners through real React/R3F with a CPU renderer.
// Source evaluation avoids instantiating the unrelated full exterior scene.
const THREE = createRequire(import.meta.url)('three') as typeof import('three');
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  PlaneGeometry: THREE.PlaneGeometry,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
});
const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
const ast = ts.createSourceFile(
  'FactoryExterior.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const names = [
  'cloneTiledTexture',
  'TARMAC_ROAD_MAP',
  'TARMAC_ROAD_ROUGHNESS',
  'ROAD_PAINT_WHITE',
  'ROAD_PAINT_YELLOW',
  'EastPortalRoadContinuation',
  'ConnectingRoad',
];
const declarations = ast.statements
  .flatMap((s) => (ts.isVariableStatement(s) ? [...s.declarationList.declarations] : []))
  .filter((d) => names.includes(d.name.getText(ast)))
  .map((d) => 'const ' + d.getText(ast) + ';');
const code = ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const { EastPortalRoadContinuation: Continuation, ConnectingRoad: Road } = new Function(
  'React',
  'useMemo',
  'useEffect',
  'THREE',
  'EXTERIOR_LAYERS',
  'POLYGON_OFFSET',
  'PROCEDURAL_TEXTURES',
  code + '\nreturn {EastPortalRoadContinuation,ConnectingRoad};'
)(React, useMemo, useEffect, THREE, EXTERIOR_LAYERS, POLYGON_OFFSET, PROCEDURAL_TEXTURES);
it('closes only the grass gap with continuous texture/dash phase and current depth ownership', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const canvas = document.createElement('canvas');
  const root = createRoot(canvas);
  await root.configure({
    gl: {
      render: vi.fn(),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      domElement: canvas,
    } as unknown as WebGLRenderer,
    frameloop: 'never',
    size: { width: 1, height: 1, top: 0, left: 0 },
  });
  let store: ReturnType<typeof root.render>;
  await act(async () => {
    store = root.render(
      <>
        <Continuation />
        <Road start={[147, 0, 50]} end={[135, 0, 50]} width={6} />
      </>
    );
  });
  const scene = store!.getState().scene;
  scene.updateMatrixWorld(true);
  const group = scene.getObjectByName('east-portal-road-continuation')!;
  const meshes = group.children as Mesh[];
  expect(meshes).toHaveLength(4);
  const surface = meshes[0];
  const bounds = new THREE.Box3().setFromObject(surface);
  expect(bounds.min.x).toBeCloseTo(147, 6);
  expect(bounds.max.x).toBeCloseTo(151.5, 6);
  expect(bounds.min.z).toBeCloseTo(47, 6);
  expect(bounds.max.z).toBeCloseTo(53, 6);
  expect(bounds.min.y).toBeCloseTo(EXTERIOR_LAYERS.ground, 6);
  const old: Mesh[] = [];
  scene.traverse((o) => {
    if ((o as Mesh).isMesh && !meshes.includes(o as Mesh)) old.push(o as Mesh);
  });
  const oldMaterial = old[0].material as MeshStandardMaterial,
    material = surface.material as MeshStandardMaterial;
  expect(material.depthWrite).toBe(true);
  expect(oldMaterial.depthWrite).toBe(true);
  expect(material.map).toBe(oldMaterial.map);
  expect(material.roughnessMap).toBe(oldMaterial.roughnessMap);
  const p = surface.geometry.getAttribute('position'),
    uv = surface.geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const world = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(surface.matrixWorld);
    expect(uv.getX(i) * 12).toBeCloseTo((world.z - 47) * 2, 6);
    expect(uv.getY(i) * 12).toBeCloseTo(world.x - 135, 6);
  }
  expect(material.polygonOffsetFactor).toBe(POLYGON_OFFSET.moderate.factor);
  for (const m of meshes.slice(1)) {
    expect((m.material as MeshStandardMaterial).polygonOffsetFactor).toBe(
      POLYGON_OFFSET.carriagewayMarking.factor
    );
    expect(new THREE.Box3().setFromObject(m).min.y).toBeCloseTo(EXTERIOR_LAYERS.groundOverlay, 6);
  }
  expect(meshes[3].position.x - old.at(-1)!.position.x).toBe(12); // 149 vs old final dash137, four-metre lattice
  let calls = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(ast) === 'EastPortalRoadContinuation'
    )
      calls++;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(calls).toBe(1);
  const disposal = vi.spyOn(surface.geometry, 'dispose');
  await act(async () => root.unmount());
  expect(disposal).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
