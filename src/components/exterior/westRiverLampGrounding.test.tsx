import React, { useLayoutEffect, useState } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import { SITE_LAYOUT, RIVER_FOOTBRIDGE_DECK } from '../../constants/siteLayout';
import { EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { createDisplacedGeometry } from '../terrain/TerrainGround';
import { getTerrainGridSegments, TERRAIN_BOUNDS } from '../terrain/terrainTypes';
import {
  getRiverHeightfield,
  getRiverCenterZ,
  MILLOS_RIVER_CONFIG,
  sampleTerrainGroundHeight,
} from '../terrain/splatMapGenerator';
import {
  createRiverSurfaceGeometry,
  createRiverFootbridgeAccessGeometry,
  createRiverShoreGeometry,
  createRiverShoreDetails,
  createRiverFootbridgeDeckGeometry,
  createRiverFootbridgeFrameGeometry,
  createRoadRiverBridgeFrameGeometry,
} from './riverGeometry';
import { ExteriorLampPool, getExteriorLampLevel } from './ExteriorLighting';
import {
  createWestRiverLampGrounding,
  WEST_RIVER_LAMP_POOL_RADIUS,
  WEST_RIVER_LAMP_PLINTH,
  type WestRiverLampGrounding,
} from './westRiverLampGrounding';

const factoryFile = 'src/components/FactoryExterior.tsx';
const lightingFile = 'src/components/exterior/ExteriorLighting.tsx';
const source = (file: string) => readFileSync(file, 'utf8');
const ast = (file: string) =>
  ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Evaluate the real declaration/JSX, not a separately copied placement table.
function declarations(file: string, names: string[], bindings: Record<string, unknown>) {
  const tree = ast(file);
  const statements: string[] = [];
  for (const statement of tree.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.includes(statement.name.text)
    ) {
      statements.push(statement.getText(tree));
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)) {
          statements.push('const ' + declaration.getText(tree) + ';');
        }
      }
    }
  }
  expect(statements).toHaveLength(names.length);
  const js = ts.transpileModule(statements.join('\n'), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return new Function(
    'THREE',
    'exports',
    ...Object.keys(bindings),
    js + '\nreturn {' + names.join(',') + '};'
  )(THREE, {}, ...Object.values(bindings));
}

function expression(
  file: string,
  matches: (text: string) => boolean,
  bindings: Record<string, unknown>
) {
  const tree = ast(file);
  const texts: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && matches(node.getText(tree))) texts.push(node.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  expect(texts).toHaveLength(1);
  const js = ts.transpileModule('const result = (' + texts[0] + ');', {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function('React', ...Object.keys(bindings), js + '\nreturn result;')(
    recordReact,
    ...Object.values(bindings)
  );
}

type RecordNode = { type: string; props: Record<string, any>; children: RecordNode[] };
const recordReact = {
  memo: (fn: unknown) => fn,
  createElement: (
    type: string | ((props: Record<string, unknown>) => unknown),
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown =>
    typeof type === 'function'
      ? type({ ...props, children })
      : { type, props: props ?? {}, children },
};

function objectFromRecord(record: RecordNode | RecordNode[] | null): THREE.Object3D | null {
  if (!record) return null;
  if (Array.isArray(record)) {
    const group = new THREE.Group();
    record.forEach((child) => {
      const object = objectFromRecord(child);
      if (object) group.add(object);
    });
    return group;
  }
  if (record.type !== 'group' && record.type !== 'mesh') return null;
  const p = record.props;
  let object: THREE.Object3D;
  if (record.type === 'group') object = new THREE.Group();
  else {
    let geometry = p.geometry as THREE.BufferGeometry | undefined;
    for (const child of record.children.flat(Infinity) as RecordNode[]) {
      if (child?.type === 'boxGeometry')
        geometry = new THREE.BoxGeometry(...(child.props.args as [number, number, number]));
      if (child?.type === 'planeGeometry')
        geometry = new THREE.PlaneGeometry(...(child.props.args as [number, number]));
      if (child?.type === 'primitive' && child.props.attach === 'geometry')
        geometry = child.props.object;
    }
    if (!geometry) throw new Error('Missing actual source geometry for ' + p.name);
    object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  }
  object.name = p.name ?? record.type;
  if (p.position) object.position.fromArray(p.position);
  if (p.rotation) object.rotation.fromArray(p.rotation);
  if (p.scale) {
    if (typeof p.scale === 'number') object.scale.setScalar(p.scale);
    else object.scale.fromArray(p.scale);
  }
  for (const child of record.children.flat(Infinity) as RecordNode[]) {
    const item = objectFromRecord(child);
    if (item) object.add(item);
  }
  return object;
}

function supportFixture(quality: string) {
  const segments = getTerrainGridSegments(quality);
  const access = createRiverFootbridgeAccessGeometry();
  const river = declarations(factoryFile, ['River'], {
    React: recordReact,
    useMemo: (fn: () => unknown) => fn(),
    useEffect: () => {},
    useGraphicsStore: (fn: (state: unknown) => unknown) => fn({ graphics: { quality } }),
    MILLOS_RIVER_CONFIG,
    getTerrainGridSegments,
    getRiverHeightfield,
    createDisplacedGeometry,
    TERRAIN_BOUNDS,
    createRiverSurfaceGeometry,
    createRiverShoreGeometry,
    createRiverShoreDetails,
    SHORE_MINERAL_MAP: null,
    PROCEDURAL_TEXTURES: { concreteRoughness: null },
    LAKE_REED_MATERIAL: null,
    LAKE_STONE_MATERIAL: null,
    MineralFinish: () => null,
    POLYGON_OFFSET,
    RIVER_FOOTBRIDGE_DECK_GEOMETRY: createRiverFootbridgeDeckGeometry(),
    RIVER_FOOTBRIDGE_FRAME_GEOMETRY: createRiverFootbridgeFrameGeometry(),
    SITE_LAYOUT,
    getRiverCenterZ,
    RIVER_FOOTBRIDGE_DECK,
    RENDER_ORDER,
    RIVER_FOOTBRIDGE_ACCESS_GEOMETRY: access,
    UnifiedWaterSurfaceMaterial: () => null,
    // Culverts at the two remote channel ends are outside the bounded fixture.
    // Their source transforms are separately asserted below, not support mocks.
    RiverTunnel: () => null,
  });
  const full = new THREE.Group();
  full.add(objectFromRecord(river.River())!);
  const road = objectFromRecord(
    expression(
      factoryFile,
      (text) => text.startsWith('<group name="road-river-bridge" position={[-20, 0, -145]}>'),
      {
        ROAD_RIVER_BRIDGE_FRAME_GEOMETRY: createRoadRiverBridgeFrameGeometry(),
        TARMAC_ROAD_MAP: null,
        TARMAC_ROAD_ROUGHNESS: null,
      }
    )
  )!;
  road.name = 'complete-road-bridge';
  full.add(road);
  for (const [coordinate, dimensions, owner] of [
    ['[0, EXTERIOR_LAYERS.ground, -30]', '[60, 60]', 'receiving-yard'],
    ['[-20, EXTERIOR_LAYERS.ground, -115]', '[10, 120]', 'receiving-road'],
  ]) {
    const mesh = objectFromRecord(
      expression(
        'src/components/TruckBay.tsx',
        (text) =>
          text.startsWith('<mesh\n') &&
          text.includes('position={' + coordinate + '}') &&
          text.includes('args={' + dimensions + '}'),
        { EXTERIOR_LAYERS, YARD_TARMAC_SURFACE: {}, ROAD_TARMAC_SURFACE: {} }
      )
    )!;
    // Real ReceivingStation parent position, checked against its mount below.
    mesh.position.z -= 50;
    mesh.name = owner;
    full.add(mesh);
  }
  const path = declarations(factoryFile, ['createGroundPathGeometry'], {
    sampleTerrainGroundHeight,
  });
  for (const [x, width] of [
    [0, 3],
    [-1.6, 0.15],
    [1.6, 0.15],
  ]) {
    const mesh = new THREE.Mesh(
      path.createGroundPathGeometry(width, 40, x, -105, 0, segments),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    mesh.position.set(x, SITE_LAYOUT.datum.terrain, -105);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = 'river-approach-and-edging';
    full.add(mesh);
  }
  const field = getRiverHeightfield();
  const terrain = createDisplacedGeometry(
    1200,
    1200,
    segments,
    field.data,
    field.resolution,
    MILLOS_RIVER_CONFIG.depth,
    TERRAIN_BOUNDS
  );
  const ground = new THREE.Mesh(terrain, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ground.position.y = SITE_LAYOUT.datum.terrain;
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'actual-displaced-terrain';
  full.add(ground);
  full.updateMatrixWorld(true);
  const solids: THREE.Mesh[] = [];
  const water: THREE.Mesh[] = [];
  full.traverse((object) => {
    if (object instanceof THREE.Mesh)
      (object.name === 'terrain-fitted-river-water' ? water : solids).push(object);
  });
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  return {
    full,
    ground,
    solids,
    water,
    query(x: number, z: number) {
      const iz = Math.floor((z - TERRAIN_BOUNDS.minZ) / (1200 / segments));
      const first = Math.max(0, iz - 1);
      const last = Math.min(segments - 1, iz + 1);
      terrain.setDrawRange(first * segments * 6, (last - first + 1) * segments * 6);
      ray.ray.origin.set(x, 30, z);
      return {
        hit: ray.intersectObjects(solids, false)[0],
        water: ray.intersectObjects(water, false)[0],
      };
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      full.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
            materials.add(m)
          );
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

function worldPool(grounding: WestRiverLampGrounding) {
  const geometry = grounding.poolGeometry;
  const world = new THREE.Matrix4().compose(
    new THREE.Vector3(grounding.position[0], grounding.position[1] + 0.045, grounding.position[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    new THREE.Vector3(WEST_RIVER_LAMP_POOL_RADIUS, WEST_RIVER_LAMP_POOL_RADIUS, 1)
  );
  const p = geometry.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(world)
  );
}

it('ties the exact plinth contract to the delivered GLB bottom ring', () => {
  const bytes = readFileSync('public/models/world/path-lamp-modern.glb');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'f764ae4b450e2f6d2fb8f3e06dc4ba5ab3ef7fe74cc858821c21f73719018ffa'
  );
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const view = gltf.bufferViews[accessor.bufferView];
  expect(accessor.componentType).toBe(5126);
  expect(accessor.type).toBe('VEC3');
  const bottom = new Map<string, [number, number]>();
  for (let i = 0; i < accessor.count; i += 1) {
    const offset =
      (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 12);
    if (Math.abs(binary.readFloatLE(offset + 4)) < 1e-6) {
      const point: [number, number] = [binary.readFloatLE(offset), binary.readFloatLE(offset + 8)];
      bottom.set(point.join(','), point);
    }
  }
  // GLB stores -0 on the X-axis ring's Z coordinates. Object.is/deep-equal
  // distinguishes that from +0, although the exact geometric coordinate agrees.
  // Normalize only IEEE signed zero; every nonzero coordinate remains exact.
  const canonicalZeros = (points: readonly (readonly number[])[]) =>
    points.map((point) => point.map((coordinate) => (coordinate === 0 ? 0 : coordinate))).sort();
  expect(canonicalZeros([...bottom.values()])).toEqual(canonicalZeros(WEST_RIVER_LAMP_PLINTH));
  expect(bottom.size).toBe(12);
});

describe.each(['low', 'medium', 'high', 'ultra'])('west lamp %s terrain support', (quality) => {
  it('grounds the loaded plinth and contained source fallback without an exposed underside', () => {
    const segments = getTerrainGridSegments(quality);
    const grounding = createWestRiverLampGrounding(segments);
    const fixture = supportFixture(quality);
    const samples = [...WEST_RIVER_LAMP_PLINTH];
    // Actual procedural source cylinder has eight radial segments and radius .1.
    for (let i = 0; i < 8; i += 1)
      samples.push([Math.sin((i * Math.PI) / 4) * 0.1, Math.cos((i * Math.PI) / 4) * 0.1]);
    try {
      const heights = samples.map(([x, z]) => fixture.query(x - 60, z - 110));
      for (const sample of heights) {
        expect(sample.hit?.object.name).toBe('actual-displaced-terrain');
        expect(sample.water).toBeUndefined();
        expect(grounding.position[1] - sample.hit.point.y).toBeLessThan(2e-6);
        expect(sample.hit.point.y - grounding.position[1]).toBeLessThan(
          segments === 64 ? 0.03335 : 0.05586
        );
      }
      expect(Math.min(...heights.map(({ hit }) => hit.point.y))).toBeCloseTo(
        grounding.position[1],
        5
      );
      expect(grounding.position).toEqual([-60, expect.any(Number), -110]);
      expect(grounding.position[1]).toBeCloseTo(
        segments === 64 ? -1.0384998983869382 : -0.9148494813208453,
        9
      );
      // The plinth crosses no grid edge/diagonal; the full convex base is affine.
      // Its extrema are therefore at the actual bottom-ring vertices.
      const step = 1200 / segments;
      const cells = WEST_RIVER_LAMP_PLINTH.map(([x, z]) => {
        const gx = (x - 60 + 600) / step,
          gz = (z - 110 + 600) / step;
        return [Math.floor(gx), Math.floor(gz), (gx % 1) + (gz % 1) <= 1].join(',');
      });
      expect(new Set(cells).size).toBe(1);
    } finally {
      grounding.poolGeometry.dispose();
      fixture.dispose();
    }
  });

  it('preserves the complete pool footprint/UVs and stays 45 mm above each actual terrain triangle', () => {
    const grounding = createWestRiverLampGrounding(getTerrainGridSegments(quality));
    const fixture = supportFixture(quality);
    const geometry = grounding.poolGeometry;
    const world = worldPool(grounding);
    const index = geometry.getIndex()!;
    const uv = geometry.getAttribute('uv');
    const circle = new THREE.CircleGeometry(1, 28);
    try {
      expect(index.count / 3).toBe(34);
      expect(geometry.groups).toEqual([]);
      expect(geometry.boundingSphere!.radius).toBeGreaterThan(1);
      expect(geometry.boundingBox).not.toBeNull();
      let area = 0;
      for (let i = 0; i < world.length; i += 1) {
        expect(uv.getX(i)).toBeCloseTo((world[i].x + 60) / 9.6 + 0.5, 6);
        expect(uv.getY(i)).toBeCloseTo(-(world[i].z + 110) / 9.6 + 0.5, 6);
        expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-7);
        expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-7);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-7);
        expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-7);
      }
      for (let i = 0; i < index.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((j) => world[index.getX(i + j)]);
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        expect(normal.y).toBeGreaterThan(1e-9);
        area += normal.y / 2;
        for (const point of [
          a,
          b,
          c,
          a
            .clone()
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3),
          a.clone().lerp(b, 0.5),
          b.clone().lerp(c, 0.5),
          c.clone().lerp(a, 0.5),
        ]) {
          const support = fixture.query(point.x, point.z);
          // The new sediment film follows the same actual terrain triangles.
          expect(['actual-displaced-terrain', 'terrain-fitted-river-shore']).toContain(
            support.hit?.object.name
          );
          expect(support.water).toBeUndefined();
          expect(point.y - support.hit.point.y).toBeCloseTo(0.045, 5);
          expect(support.hit.point.y).toBeGreaterThan(MILLOS_RIVER_CONFIG.waterLevel + 0.19);
        }
      }
      let canonicalArea = 0;
      const p = circle.getAttribute('position');
      for (let i = 1; i < p.count - 1; i += 1)
        canonicalArea += ((p.getX(i) * p.getY(i + 1) - p.getY(i) * p.getX(i + 1)) * 4.8 * 4.8) / 2;
      expect(area).toBeCloseTo(canonicalArea, 5);
      for (let i = 1; i < p.count - 1; i += 1) {
        const x = -60 + p.getX(i) * 4.8,
          z = -110 - p.getY(i) * 4.8;
        expect(world.some((v) => Math.hypot(v.x - x, v.z - z) < 1e-5)).toBe(true);
      }
      // Whole AABBs of actual bridge/access/roads/path are disjoint in XZ.
      for (const solid of fixture.solids.filter(
        (mesh) =>
          ![
            'actual-displaced-terrain',
            'terrain-fitted-river-shore',
            'river-shore-reeds',
            'river-shore-stones',
            'river-rock-moss',
          ].includes(mesh.name)
      )) {
        const bounds = new THREE.Box3().setFromObject(solid);
        expect(
          bounds.max.x < -64.8 ||
            bounds.min.x > -55.2 ||
            bounds.max.z < -114.8 ||
            bounds.min.z > -105.2
        ).toBe(true);
      }
    } finally {
      geometry.dispose();
      circle.dispose();
      fixture.dispose();
    }
  });
});

it('keeps the source fallback, loaded body, luminous mask and canonical pool contracts', () => {
  const text = source(factoryFile);
  expect(text).toContain('<cylinderGeometry args={[0.08, 0.1, 4, 8]} />');
  expect(text).toContain('<GeneratedLampModel style={style} />');
  expect(text).toContain('<PathLamp position={[0, 0, -110]} style="modern" />');
  expect(text).toContain('<PathLamp position={[60, 0, -110]} style="modern" />');
  expect(text.match(/<WestRiverPathLamp\s*\/>/g)).toHaveLength(1);
  expect(text).not.toContain('<PathLamp position={[-60, 0, -110]}');
  expect(text).toContain('<HedgeRow start={[-10, 0, -128]} end={[10, 0, -128]}');
  expect(text).toContain('position={[-length / 2 - 2, 0, startZ]}');
  expect(text).toContain('position={[length / 2 + 2, 0, endZ]}');
  expect(MILLOS_RIVER_CONFIG.length / 2).toBeGreaterThan(100);
  const lampText = source('src/components/models/GeneratedLampModel.tsx');
  expect(lampText).toContain('modern: [3.76, 3.95]');
  expect(lampText).toContain('vLampRestHeight = position.y');
  expect(lampText).toContain('millos-generated-lamp-lens-v2');
  expect(lampText).toContain('materials.forEach((material) => material.dispose())');
  expect(source('src/components/TruckBay.tsx')).toContain('<group position={[0, 0, -50]}>');
  const canonical = (ExteriorLampPool as (props: { radius?: number }) => React.ReactElement<any>)({
    radius: 4.8,
  });
  const grounding = createWestRiverLampGrounding(128);
  try {
    const candidate = (
      ExteriorLampPool as (props: {
        radius?: number;
        geometry?: THREE.BufferGeometry;
      }) => React.ReactElement<any>
    )({ radius: 4.8, geometry: grounding.poolGeometry });
    expect(candidate.props.geometry).toBe(grounding.poolGeometry);
    expect(candidate.props.material).toBe(canonical.props.material);
    for (const key of ['position', 'rotation', 'scale', 'renderOrder'])
      expect(candidate.props[key]).toEqual(canonical.props[key]);
    expect(canonical.props.geometry.index.count / 3).toBe(28);
    expect(candidate.props.dispose).toBeNull();
    expect(canonical.props.dispose).toBeUndefined();
    const material = candidate.props.material as THREE.MeshBasicMaterial;
    expect(material.isMeshBasicMaterial).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(true);
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(POLYGON_OFFSET.exteriorOverlay.factor);
    expect(material.polygonOffsetUnits).toBe(POLYGON_OFFSET.exteriorOverlay.units);
    expect(material.map).toBe(canonical.props.material.map);
    expect(candidate.props.renderOrder).toBe(RENDER_ORDER.floorMarkings);
    expect(getExteriorLampLevel(12, 'clear')).toBe(0);
    expect(getExteriorLampLevel(23, 'clear')).toBe(1);
    expect(source(lightingFile)).toContain('LAMP_POOL_MATERIAL.opacity = level * 0.24');
    expect(source(lightingFile)).toContain(
      'LAMP_POOL_MATERIAL.visible = LAMP_POOL_MATERIAL.opacity > 0.002'
    );
  } finally {
    grounding.poolGeometry.dispose();
  }
});

it.each([false, true])(
  'owns each committed geometry exactly once through tier changes and unmount (StrictMode=%s)',
  (strict) => {
    let quality = 'low';
    const allocations: {
      grounding: WestRiverLampGrounding;
      dispose: ReturnType<typeof vi.spyOn>;
    }[] = [];
    const captures: { position: [number, number, number]; poolGeometry: THREE.BufferGeometry }[] =
      [];
    const create = (segments: number) => {
      const grounding = createWestRiverLampGrounding(segments);
      allocations.push({ grounding, dispose: vi.spyOn(grounding.poolGeometry, 'dispose') });
      return grounding;
    };
    const { WestRiverPathLamp } = declarations(factoryFile, ['WestRiverPathLamp'], {
      React,
      useState,
      useLayoutEffect,
      getTerrainGridSegments,
      useGraphicsStore: (selector: (state: unknown) => unknown) =>
        selector({ graphics: { quality } }),
      createWestRiverLampGrounding: create,
      WEST_RIVER_LAMP_POOL_RADIUS,
      PathLamp: (props: {
        position: [number, number, number];
        poolGeometry: THREE.BufferGeometry;
      }) => {
        captures.push(props);
        return null;
      },
    });
    const node = () =>
      strict ? (
        <React.StrictMode>
          <WestRiverPathLamp />
        </React.StrictMode>
      ) : (
        <WestRiverPathLamp />
      );
    const mounted = render(node());
    const first = captures.at(-1)!.poolGeometry;
    const count = allocations.length;
    quality = 'medium';
    mounted.rerender(node());
    expect(allocations).toHaveLength(count);
    expect(captures.at(-1)!.poolGeometry).toBe(first);
    quality = 'high';
    mounted.rerender(node());
    expect(allocations).toHaveLength(count + 1);
    expect(
      allocations.find(({ grounding }) => grounding.poolGeometry === first)!.dispose
    ).toHaveBeenCalledTimes(1);
    const high = captures.at(-1)!.poolGeometry;
    quality = 'ultra';
    mounted.rerender(node());
    expect(allocations).toHaveLength(count + 1);
    expect(captures.at(-1)!.poolGeometry).toBe(high);
    quality = 'low';
    mounted.rerender(node());
    expect(allocations).toHaveLength(count + 2);
    mounted.unmount();
    for (const allocation of allocations) expect(allocation.dispose).toHaveBeenCalledTimes(1);
  }
);

it('rejects unsupported grid densities before creating owned geometry', () => {
  for (const segments of [0, 32, 256, NaN])
    expect(() => createWestRiverLampGrounding(segments)).toThrow();
});
