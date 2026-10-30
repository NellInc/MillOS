import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act, useEffect, useMemo, useRef } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { NodeIO } from '@gltf-transform/core';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  WebGLRenderer,
} from 'three';
import { createCheckpointGateState, stepCheckpointGate } from './checkpointLogic';
import { EXTERIOR_LAYERS, RENDER_ORDER, POLYGON_OFFSET } from '../../constants/renderLayers';

// Mount the actual private component without importing the entire terrain/world.
// The source declaration is evaluated unchanged; only GLTF loading, text glyphs
// and frame scheduling are replaced. R3F owns every ordinary JSX resource here.
const THREE = createRequire(import.meta.url)('three') as typeof import('three');
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  BoxGeometry: THREE.BoxGeometry,
  PlaneGeometry: THREE.PlaneGeometry,
  CircleGeometry: THREE.CircleGeometry,
  CylinderGeometry: THREE.CylinderGeometry,
});
const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
const ast = ts.createSourceFile('FactoryExterior.tsx', source, ts.ScriptTarget.Latest, true);
const declaration = (name: string) => {
  const node = ast.statements.find(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some((entry) => entry.name.getText(ast) === name)
  );
  if (!node) throw new Error(`Missing actual source declaration: ${name}`);
  return node.getText(ast);
};
const compiled = ts.transpileModule(
  `${declaration('ROAD_PAINT_WHITE')}\n${declaration('CheckpointBarrier')}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }
).outputText;

async function delivery() {
  const document = await new NodeIO().read('public/models/world/checkpoint-booth.glb');
  const group = new THREE.Group();
  for (const node of document.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
      );
      geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices()!.getArray()!, 1));
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
      );
      mesh.name = 'shared-delivery';
      mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      group.add(mesh);
    }
  }
  return group;
}

const sites = [
  { dock: 'shipping', position: [20, 0, 110], rotation: 0, outward: 1 },
  { dock: 'receiving', position: [-20, 0, -110], rotation: Math.PI, outward: -1 },
] as const;

async function mount(site: (typeof sites)[number]) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const shared = await delivery();
  const vehicles = new Map<string, { id: string; x: number; z: number }>();
  let frame: (state: { clock: { elapsedTime: number } }, delta: number) => void;
  const bindings = {
    React,
    THREE,
    useMemo,
    useRef,
    useEffect,
    PlotGeometry,
    useFrame: (callback: typeof frame) => {
      frame = callback;
    },
    createCheckpointGateState,
    stepCheckpointGate,
    positionRegistry: { get: (id: string) => vehicles.get(id) },
    EXTERIOR_LAYERS,
    RENDER_ORDER,
    POLYGON_OFFSET,
    GeneratedBoundary: ({ children }: { children: React.ReactNode }) => children,
    GeneratedModel: ({ asset }: { asset: string }) => {
      expect(asset).toBe('checkpointBooth');
      return <primitive object={shared.clone(true)} />;
    },
    Text: ({ children, ...props }: { children: string }) => (
      <group {...props} name={`fixture-label-${children}`} />
    ),
  };
  const Checkpoint = new Function(
    ...Object.keys(bindings),
    `${compiled}\nreturn CheckpointBarrier;`
  )(...Object.values(bindings)) as React.ComponentType<{
    position: number[];
    rotation: number;
    checkpointType: string;
    label: string;
  }>;
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
    store = root.render(
      <Checkpoint
        position={[...site.position]}
        rotation={site.rotation}
        checkpointType={site.dock}
        label={site.dock.toUpperCase()}
      />
    );
  });
  const group = store!.getState().scene.children[0] as Group;
  group.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  group.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  const lamps = meshes.filter((mesh) => mesh.geometry.type === 'CircleGeometry');
  const arms = ['inbound', 'outbound'].map(
    (lane) => group.getObjectByName(`${site.dock}-checkpoint-${lane}-arm`) as Group
  );
  return {
    group,
    meshes,
    lamps,
    arms,
    renderer,
    shared,
    vehicles,
    root,
    tick: (time: number, delta: number) => frame({ clock: { elapsedTime: time } }, delta),
    async finish() {
      await act(async () => root.unmount());
      shared.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

describe.each(sites)('$dock checkpoint mounted assembly', (site) => {
  it('faces both traffic approaches with whole disks clear of housings in every arm state', async () => {
    const mounted = await mount(site);
    try {
      expect(mounted.lamps).toHaveLength(2);
      for (const [index, lamp] of mounted.lamps.entries()) {
        const side = (index === 0 ? 1 : -1) * site.outward;
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(lamp.matrixWorld);
        const centre = lamp.getWorldPosition(new THREE.Vector3());
        expect(normal.dot(new THREE.Vector3(0, 0, side))).toBeCloseTo(1, 12);
        const housing = lamp.parent!.children.find(
          (child) =>
            (child as Mesh).isMesh &&
            (child as Mesh).geometry.type === 'BoxGeometry' &&
            (child as Mesh).position.y === 3.2
        ) as Mesh;
        const box = new THREE.Box3().setFromObject(housing);
        const positions = lamp.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i += 1) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i);
          point.applyMatrix4(lamp.matrixWorld);
          expect(point.x).toBeGreaterThan(box.min.x);
          expect(point.x).toBeLessThan(box.max.x);
          expect(point.y).toBeGreaterThan(box.min.y);
          expect(point.y).toBeLessThan(box.max.y);
          expect(side > 0 ? point.z - box.max.z : box.min.z - point.z).toBeCloseTo(0.01, 6);
        }
        expect((lamp.material as MeshBasicMaterial).side).toBe(THREE.FrontSide);
        for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
          mounted.arms.forEach((arm) => (arm.rotation.z = angle));
          mounted.group.updateMatrixWorld(true);
          const eye = new THREE.Vector3(site.position[0], 3.2, centre.z + side * 24);
          expect(normal.dot(eye.clone().sub(centre).normalize())).toBeGreaterThan(0.9);
          const ray = new THREE.Raycaster(eye, centre.clone().sub(eye).normalize());
          expect(ray.intersectObjects(mounted.meshes, false)[0]?.object).toBe(lamp);
          const reverse = new THREE.Raycaster(centre.clone().addScaledVector(normal, -1), normal);
          expect(reverse.intersectObjects(mounted.meshes, false)[0]?.object).not.toBe(lamp);
        }
      }
    } finally {
      await mounted.finish();
    }
  });

  it('connects the fixed sign without moving its board, text, roof or world placement', async () => {
    const mounted = await mount(site);
    try {
      expect(mounted.group.position.toArray()).toEqual([...site.position]);
      expect(mounted.group.rotation.y).toBe(site.rotation);
      expect(mounted.group.userData).not.toHaveProperty('noStaticBatch');
      for (const moving of [...mounted.arms, ...mounted.lamps])
        expect(moving.userData).toMatchObject({ noStaticBatch: true, dynamic: true });
      const supports = mounted.meshes.filter((mesh) => {
        const parameters = (mesh.geometry as BoxGeometry).parameters;
        return parameters?.width === 0.08 && parameters.height === 0.24;
      });
      expect(supports).toHaveLength(2);
      const body = mounted.meshes.find((mesh) => mesh.name === 'shared-delivery')!;
      const board = mounted.meshes.find(
        (mesh) => (mesh.geometry as BoxGeometry).parameters?.width === 3.9
      )!;
      expect(board.position.toArray()).toEqual([0, 4.7, 0]);
      const roofBounds = new THREE.Box3().setFromObject(body);
      const boardBounds = new THREE.Box3().setFromObject(board);
      expect(roofBounds.max.y).toBeCloseTo(4.15, 5);
      expect(boardBounds.min.y).toBeCloseTo(4.35, 5);
      for (const support of supports) {
        const bounds = new THREE.Box3().setFromObject(support);
        expect(roofBounds.max.y - bounds.min.y).toBeCloseTo(0.02, 5);
        expect(bounds.max.y - boardBounds.min.y).toBeCloseTo(0.02, 5);
        expect(boardBounds.intersectsBox(bounds)).toBe(true);
        const material = support.material as MeshStandardMaterial;
        expect(material.color.getHexString()).toBe('1f2937');
        expect(material.roughness).toBe(0.5);
        expect(material.map).toBeNull();
      }
      const labels = board.parent!.children.filter((child) =>
        child.name.startsWith('fixture-label-')
      );
      expect(labels.map((label) => label.name)).toEqual([
        `fixture-label-${site.dock.toUpperCase()}`,
        `fixture-label-${site.dock.toUpperCase()}`,
      ]);
      expect(labels.map((label) => label.position.toArray())).toEqual([
        [0, 4.7, 0.12],
        [0, 4.7, -0.12],
      ]);
    } finally {
      await mounted.finish();
    }
  });

  it('keeps live gate timing and stable lamp refs, then disposes only mount-owned JSX resources', async () => {
    const mounted = await mount(site);
    try {
      const materials = mounted.lamps.map((lamp) => lamp.material as MeshBasicMaterial);
      const put = (part: string, distance: number) => {
        const id = `${site.dock}-truck-${part}`;
        mounted.vehicles.set(id, {
          id,
          x: site.position[0],
          z: site.position[2] + site.outward * distance,
        });
      };
      mounted.tick(0, 0);
      expect(materials.map((material) => material.color.getHex())).toEqual([0xef2929, 0xef2929]);
      put('cab', 30);
      mounted.tick(0.1, 0.1);
      expect(mounted.group.userData.gatePhase).toBe('opening');
      expect(materials.map((material) => material.color.getHex())).toEqual([0xffb000, 0xffb000]);
      mounted.tick(0.6, 0.1);
      expect(materials.map((material) => material.color.getHex())).toEqual([0x4a2600, 0x4a2600]);
      for (let i = 0; i < 30; i += 1) mounted.tick(1 + i * 0.1, 0.1);
      expect(mounted.group.userData.gatePhase).toBe('open');
      expect(materials.map((material) => material.color.getHex())).toEqual([0x35d46f, 0x35d46f]);
      expect(mounted.arms[0].rotation.z).toBeCloseTo(Math.PI / 2, 6);
      expect(mounted.arms[1].rotation.z).toBe(mounted.arms[0].rotation.z);
      expect(mounted.arms[1].rotation.y).toBe(Math.PI);
      put('cab', 80);
      put('trailer', 40);
      mounted.tick(5, 0.1);
      expect(mounted.group.userData.gateOpen).toBe(true);
      put('trailer', 80);
      mounted.tick(6, 1.24);
      expect(mounted.group.userData.clearanceSecondsRemaining).toBeCloseTo(0.01, 8);
      expect(mounted.group.userData.gateOpen).toBe(true);
      mounted.tick(7, 0.02);
      expect(mounted.group.userData.gatePhase).toBe('closing');
      const angle = mounted.arms[0].rotation.z;
      mounted.tick(8, 10);
      expect(mounted.arms[0].rotation.z).toBeCloseTo(THREE.MathUtils.damp(angle, 0, 5.2, 0.1), 12);
      for (let i = 0; i < 30; i += 1) mounted.tick(9 + i * 0.1, 0.1);
      expect(mounted.group.userData.gatePhase).toBe('closed');
      expect(materials.map((material) => material.color.getHex())).toEqual([0xef2929, 0xef2929]);
      expect(mounted.lamps.map((lamp) => lamp.material)).toEqual(materials);
      const owned = mounted.meshes.filter((mesh) => mesh.name !== 'shared-delivery');
      const geometries = [...new Set(owned.map((mesh) => mesh.geometry))];
      const ownedMaterials = [
        ...new Set(owned.map((mesh) => mesh.material as MeshStandardMaterial)),
      ];
      const disposals = [...geometries, ...ownedMaterials].map((resource) =>
        vi.spyOn(resource, 'dispose')
      );
      const sharedMesh = mounted.shared.children[0] as Mesh;
      const sharedGeometryDisposal = vi.spyOn(sharedMesh.geometry, 'dispose');
      const sharedMaterialDisposal = vi.spyOn(
        sharedMesh.material as MeshStandardMaterial,
        'dispose'
      );
      await act(async () => {
        mounted.root.render(null);
      });
      disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
      expect(sharedGeometryDisposal).not.toHaveBeenCalled();
      expect(sharedMaterialDisposal).not.toHaveBeenCalled();
      expect(mounted.renderer.render).not.toHaveBeenCalled();
    } finally {
      await mounted.finish();
    }
  });
});
