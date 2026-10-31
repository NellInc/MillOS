import React, { act, useLayoutEffect, useState } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import { useGraphicsStore, type GraphicsQuality } from '../../stores/graphicsStore';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { ExteriorLampPool, EXTERIOR_LAMP_LENS_MATERIAL } from './ExteriorLighting';
import {
  createWestRiverLampGrounding,
  WEST_RIVER_LAMP_POOL_RADIUS,
  type WestRiverLampGrounding,
} from './westRiverLampGrounding';

extend({ Group: THREE.Group, Mesh: THREE.Mesh });

/** Mount the exact source declarations. Only generated-body asset I/O is omitted.
 * The actual PathLamp group, ExteriorLampPool and grounding wrapper are reconciled.
 */
function actualGroundingWrapper(
  createGrounding: (segments: number) => WestRiverLampGrounding
): React.ComponentType {
  const file = 'src/components/FactoryExterior.tsx';
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const names = ['PathLamp', 'WestRiverPathLamp'];
  const declarations: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)) {
        declarations.push(`const ${declaration.getText(source)};`);
      }
    }
  }
  expect(declarations).toHaveLength(2);
  const javascript = ts.transpileModule(declarations.join('\n'), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const bindings = {
    React,
    useState,
    useLayoutEffect,
    useGraphicsStore,
    getTerrainGridSegments,
    ExteriorLampPool,
    EXTERIOR_LAMP_LENS_MATERIAL,
    WEST_RIVER_LAMP_POOL_RADIUS,
    createWestRiverLampGrounding: createGrounding,
    GeneratedBoundary: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    GeneratedLampModel: () => null,
  };
  return new Function(
    'exports',
    ...Object.keys(bindings),
    javascript + '\nreturn WestRiverPathLamp;'
  )({}, ...Object.values(bindings)) as React.ComponentType;
}

type Allocation = { grounding: WestRiverLampGrounding; disposals: number };
type PoolElement = React.ReactElement<{
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
}>;

function canonicalResources() {
  // This stateless component returns the same shared resources that R3F mounts.
  // Observe them before the first commit, including StrictMode's initial effects.
  const element = (ExteriorLampPool as (props: { radius: number }) => PoolElement)({
    radius: WEST_RIVER_LAMP_POOL_RADIUS,
  });
  return element.props;
}

describe('west river lamp real R3F pool ownership', () => {
  it.each([false, true])(
    'retains shared pool resources through real quality changes and remount (StrictMode=%s)',
    async (strict) => {
      const originalGraphics = useGraphicsStore.getState().graphics;
      const shared = canonicalResources();
      const sharedMap = shared.material.map;
      if (!sharedMap) throw new Error('Canonical source pool requires its radial map');
      const sharedDisposals = [
        vi.spyOn(shared.geometry, 'dispose'),
        vi.spyOn(shared.material, 'dispose'),
        vi.spyOn(sharedMap, 'dispose'),
      ];
      const allocations: Allocation[] = [];
      const Subject = actualGroundingWrapper((segments) => {
        const grounding = createWestRiverLampGrounding(segments);
        const allocation = { grounding, disposals: 0 };
        grounding.poolGeometry.addEventListener('dispose', () => {
          allocation.disposals += 1;
        });
        allocations.push(allocation);
        return grounding;
      });
      const view = (showSubject = true, key = 'first') => (
        <group>
          <group name="canonical-pool-control">
            <ExteriorLampPool radius={WEST_RIVER_LAMP_POOL_RADIUS} />
          </group>
          <group name="grounded-pool-subject">
            {showSubject ? (
              strict ? (
                <React.StrictMode>
                  <Subject key={key} />
                </React.StrictMode>
              ) : (
                <Subject key={key} />
              )
            ) : null}
          </group>
        </group>
      );
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      useGraphicsStore.getState().setGraphicsQuality('low');
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
      let store: ReturnType<typeof root.render>;
      let closed = false;
      const draw = async (showSubject = true, key = 'first') => {
        await act(async () => {
          store = root.render(view(showSubject, key));
        });
      };
      const quality = async (next: GraphicsQuality) => {
        await act(async () => {
          useGraphicsStore.getState().setGraphicsQuality(next);
        });
      };
      const canonicalMesh = () => {
        const group = store!.getState().scene.getObjectByName('canonical-pool-control');
        const mesh = group?.children[0];
        expect(mesh).toBeInstanceOf(THREE.Mesh);
        return mesh as THREE.Mesh;
      };
      const selectedPool = () => {
        const scene = store!.getState().scene;
        scene.updateMatrixWorld(true);
        const group = scene.getObjectByName('grounded-pool-subject');
        const meshes: THREE.Mesh[] = [];
        group?.traverse((object) => {
          if (object instanceof THREE.Mesh) meshes.push(object);
        });
        // No body substitute is drawn; this is the actual single source pool mesh.
        expect(meshes).toHaveLength(1);
        const mesh = meshes[0];
        expect(mesh.geometry).not.toBe(shared.geometry);
        expect(mesh.geometry.index!.count / 3).toBe(34);
        expect(mesh.material).toBe(shared.material);
        expect((mesh.material as THREE.MeshBasicMaterial).map).toBe(sharedMap);
        expect(mesh.position.toArray()).toEqual([0, 0.045, 0]);
        expect(mesh.scale.toArray()).toEqual([4.8, 4.8, 1]);
        expect(mesh.rotation.x).toBe(-Math.PI / 2);
        const allocation = allocations.find(
          (item) => item.grounding.poolGeometry === mesh.geometry
        );
        expect(allocation).toBeDefined();
        expect(mesh.parent!.position.toArray()).toEqual(allocation!.grounding.position);
        return mesh;
      };
      const assertOwnership = (active?: THREE.BufferGeometry) => {
        for (const allocation of allocations) {
          expect(allocation.disposals).toBe(allocation.grounding.poolGeometry === active ? 0 : 1);
        }
        for (const disposed of sharedDisposals) expect(disposed).not.toHaveBeenCalled();
      };
      const closeRoot = async () => {
        await act(async () => {
          root.unmount();
        });
        closed = true;
        // Fiber's root teardown has a documented 500 ms deferred scene cleanup.
        // Include it in ownership observations, rather than restoring spies early.
        await new Promise((resolve) => setTimeout(resolve, 550));
      };
      try {
        await draw();
        const canonical = canonicalMesh();
        expect(canonical.geometry).toBe(shared.geometry);
        expect(canonical.material).toBe(shared.material);
        expect(shared.geometry.index!.count / 3).toBe(28);
        const low = selectedPool().geometry;
        expect(allocations.length).toBeGreaterThan(0);
        assertOwnership(low);

        let count = allocations.length;
        await quality('medium');
        expect(allocations).toHaveLength(count);
        expect(selectedPool().geometry).toBe(low);
        expect(canonicalMesh()).toBe(canonical);
        assertOwnership(low);

        await quality('high');
        const high = selectedPool().geometry;
        expect(high).not.toBe(low);
        expect(allocations.length).toBeGreaterThan(count);
        expect(canonicalMesh()).toBe(canonical);
        assertOwnership(high);

        count = allocations.length;
        await quality('ultra');
        expect(allocations).toHaveLength(count);
        expect(selectedPool().geometry).toBe(high);
        assertOwnership(high);

        await quality('low');
        const returnedLow = selectedPool().geometry;
        expect(returnedLow).not.toBe(low);
        expect(returnedLow).not.toBe(high);
        assertOwnership(returnedLow);

        await draw(false);
        expect(canonicalMesh()).toBe(canonical);
        assertOwnership();
        await quality('high');
        await draw(true, 'remount');
        const remounted = selectedPool().geometry;
        expect(remounted).not.toBe(high);
        expect(canonicalMesh()).toBe(canonical);
        assertOwnership(remounted);

        await act(async () => {
          root.render(null);
        });
        assertOwnership();
        await closeRoot();
        assertOwnership();
        expect(renderer.render).not.toHaveBeenCalled();
      } finally {
        if (!closed) await closeRoot();
        useGraphicsStore.setState({ graphics: originalGraphics });
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    }
  );
});
