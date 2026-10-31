import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO, type Accessor } from '@gltf-transform/core';
import ts from 'typescript';
import * as THREE from 'three';
import {
  SITE_LAYOUT,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_LANDINGS,
  nearRiverFootbridge,
} from '../../constants/siteLayout';
import { EXTERIOR_LAYERS, RENDER_ORDER, POLYGON_OFFSET } from '../../constants/renderLayers';
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
import {
  getRiverbankHedgePosition,
  riverbankHedgeSupportPieces,
  RIVERBANK_HEDGE_FOOTPRINT,
} from './riverbankHedgeGrounding';
import { hedgeCrownTransforms, HEDGE_CROWN_GEOMETRY } from './HedgeFoliage';

// The source declarations and delivered geometry are used directly. The inert
// record adapter below is only a support/raycast fixture, not a React mount or
// visual renderer; real R3F lifecycle coverage lives in the companion test.
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

async function deliveredScene(slug: string) {
  const document = await new NodeIO().read('public/models/world/' + slug + '.glb');
  const group = new THREE.Group();
  for (const node of document.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', floatAttribute(primitive.getAttribute('POSITION'), 3));
      geometry.setIndex(indexAttribute(primitive.getIndices()));
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
      );
      mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      group.add(mesh);
    }
  }
  return group;
}

const factoryFile = 'src/components/FactoryExterior.tsx';
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
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && matches(node.getText(tree)))
      texts.push(node.getText(tree));
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

async function supportFixture(quality: string) {
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
    // Actual back-yard parent position, with unchanged source bytes guarded below.
    mesh.position.z -= 50;
    mesh.name = owner;
    full.add(mesh);
  }
  const path = declarations(factoryFile, ['createGroundPathGeometry'], {
    sampleTerrainGroundHeight,
  });
  const pathOwner = declarations(factoryFile, ['GravelPath'], {
    React: recordReact,
    EXTERIOR_LAYERS,
    POLYGON_OFFSET,
    TARMAC_PATH_MAP: null,
    TARMAC_PATH_ROUGHNESS: null,
    GroundPathGeometry: (p: Record<string, number>) =>
      recordReact.createElement('primitive', {
        attach: 'geometry',
        object: path.createGroundPathGeometry(
          p.width,
          p.length,
          p.originX,
          p.originZ,
          p.yaw,
          segments
        ),
      }),
  });
  const approach = objectFromRecord(
    expression(
      factoryFile,
      (text) => text.startsWith('<GravelPath {...RIVER_FOOTBRIDGE_APPROACH}'),
      {
        ...pathOwner,
        ...declarations(factoryFile, ['RIVER_FOOTBRIDGE_APPROACH'], {
          RIVER_FOOTBRIDGE_DECK,
          RIVER_FOOTBRIDGE_LANDINGS,
        }),
      }
    )
  )!;
  approach.name = 'complete-river-approach';
  full.add(approach);
  const bench = await deliveredScene('park-bench');
  const benchOwner = declarations(
    'src/components/exterior/ExteriorVegetation.tsx',
    ['MAIN_EXTERIOR_BENCHES', 'generatedBenchSource', 'useInstances'],
    {
      useMemo: (fn: () => unknown) => fn(),
      useLayoutEffect: (fn: () => unknown) => fn(),
      useRef: () => ({
        current: {
          captured: new THREE.Matrix4(),
          setMatrixAt(_i: number, m: THREE.Matrix4) {
            this.captured.copy(m);
          },
          instanceMatrix: {},
          computeBoundingBox() {},
          computeBoundingSphere() {},
        },
      }),
    }
  );
  const benchData = benchOwner.MAIN_EXTERIOR_BENCHES.filter(
    (entry: any) => JSON.stringify(entry.position) === '[3,0,-112]'
  );
  expect(benchData).toHaveLength(1);
  const benchMesh = benchOwner.generatedBenchSource(bench);
  const benchTransform = benchOwner.useInstances(1, benchData, benchMesh.matrixWorld).current
    .captured;
  const placedBench = new THREE.Mesh(benchMesh.geometry, benchMesh.material);
  placedBench.applyMatrix4(benchTransform);
  placedBench.name = 'loaded-nearby-park-bench';
  full.add(placedBench);
  const sign = await deliveredScene('info-sign');
  const signOwner = declarations(factoryFile, ['InfoSign'], {
    React: recordReact,
    GeneratedBoundary: (p: any) => p.children,
    GeneratedModel: () => recordReact.createElement('loaded-sign', {}),
    Text: () => null,
  });
  const signRecord = expression(
    factoryFile,
    (text) => text.startsWith('<InfoSign position={[10, 0, -110]}'),
    signOwner
  );
  // GeneratedBoundary selects the actual delivered scene; live text is not a support owner.
  sign.position.fromArray(signRecord.props.position);
  sign.rotation.fromArray(signRecord.props.rotation);
  sign.name = 'protected-RIVER-sign';
  full.add(sign);
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

const polygonArea = (points: readonly (readonly [number, number])[]) =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0)
  ) / 2;

// Independently clip actual world-space water triangles by four rectangle half
// planes. This intentionally does not call the production terrain clip helper.
function waterOverlap(meshes: THREE.Mesh[]) {
  let total = 0;
  const planes = [
    (p: THREE.Vector3) => p.x - 4.5,
    (p: THREE.Vector3) => 24.5 - p.x,
    (p: THREE.Vector3) => p.z + 116.2,
    (p: THREE.Vector3) => -115.8 - p.z,
  ];
  for (const mesh of meshes) {
    const p = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      let polygon = [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, index ? index.getX(i + k) : i + k)
          .applyMatrix4(mesh.matrixWorld)
      );
      if (
        Math.max(...polygon.map((v) => v.x)) < 4.5 ||
        Math.min(...polygon.map((v) => v.x)) > 24.5 ||
        Math.max(...polygon.map((v) => v.z)) < -116.2 ||
        Math.min(...polygon.map((v) => v.z)) > -115.8
      )
        continue;
      for (const plane of planes) {
        const input = polygon;
        polygon = [];
        for (let j = 0; j < input.length; j++) {
          const a = input[j],
            b = input[(j + 1) % input.length];
          const fa = plane(a),
            fb = plane(b);
          if (fa >= 0) polygon.push(a);
          if (fa >= 0 !== fb >= 0) polygon.push(a.clone().lerp(b, fa / (fa - fb)));
        }
      }
      total += polygonArea(polygon.map((v) => [v.x, v.z]));
    }
  }
  return total;
}

const xzDistance = (a: THREE.Box3, b: THREE.Box3) =>
  Math.hypot(
    Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
    Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0)
  );

function calls(name: string) {
  const tree = ast(factoryFile),
    found: ts.JsxSelfClosingElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { tree, found };
}

it('mounts one target-only owner beside the current path hedges and river approach', () => {
  const { tree, found } = calls('RiverbankHedge');
  expect(found).toHaveLength(1);
  const factory = tree.statements
    .flatMap((s) => (ts.isVariableStatement(s) ? [...s.declarationList.declarations] : []))
    .find((d) => d.name.getText(tree) === 'FactoryExterior')!;
  const returned = ((factory.initializer as ts.ArrowFunction).body as ts.Block).statements.find(
    ts.isReturnStatement
  )!.expression!;
  const root = ts.isParenthesizedExpression(returned) ? returned.expression : returned;
  expect(found[0].parent).toBe(root);
  const rows = calls('HedgeRow').found.map((node) => node.getText());
  expect(rows).toHaveLength(2);
  expect(rows.some((row) => row.includes('start={[-10, 0, -128]}'))).toBe(true);
  expect(rows.some((row) => row.includes('start={hedge.start}'))).toBe(true);
  expect(source(factoryFile)).toContain('PATH_HEDGES.map((hedge) => (');
  expect(source(factoryFile)).toContain('Riverbank path removed - was crossing through river');
  expect(source(factoryFile)).toContain(
    '<InfoSign position={[10, 0, -110]} text="RIVER" rotation={0} />'
  );
  expect(source(factoryFile)).toContain(
    '<GravelPath {...RIVER_FOOTBRIDGE_APPROACH} type="paved" />'
  );
  expect(source('src/components/TruckBay.tsx')).toContain('<group position={[0, 0, -50]}>');
  const culverts = calls('RiverTunnel').found.map((n) => n.getText());
  expect(culverts).toHaveLength(2);
  expect(culverts[0]).toContain('position={[-length / 2 - 2, 0, startZ]}');
  expect(culverts[1]).toContain('position={[length / 2 + 2, 0, endZ]}');
});

it('retains HedgeRow endpoint-Y behavior, exact dimensions, yaw and all144 relative forms/tints', () => {
  const { HedgeRow } = declarations(factoryFile, ['HedgeRow'], {
    React: recordReact,
    HedgeFoliage: (props: Record<string, unknown>) => props,
  });
  const row = { start: [-10, 0, -128], end: [10, 0, -128], height: 0.5, width: 0.4 };
  expect(HedgeRow(row)).toMatchObject({
    size: [0.4, 0.5, 20],
    position: [0, 0.25, -128],
    rotation: [0, Math.PI / 2, 0],
  });
  expect(HedgeRow({ ...row, start: [-10, 999, -128], end: [10, -999, -128] })).toEqual(
    HedgeRow(row)
  );
  const crowns = hedgeCrownTransforms(0.4, 0.5, 20);
  expect(crowns).toHaveLength(144);
  expect(HEDGE_CROWN_GEOMETRY.attributes.position.count / 3).toBe(32);
  expect((crowns.length * HEDGE_CROWN_GEOMETRY.attributes.position.count) / 3 + 12).toBe(4620);
  const parent = new THREE.Matrix4().makeTranslation(14.5, -0.05714509803921565, 12);
  const owner = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0.25, -128),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI / 2),
    new THREE.Vector3(1, 1, 1)
  );
  crowns.forEach((crown, i) => {
    const station = Math.floor(i / 2),
      lower = i % 2 === 0;
    const height = 0.5 * (lower ? 0.68 : 0.92 + 0.08 * (0.5 + 0.5 * Math.sin(station * 2.37)));
    expect(crown).toEqual({
      position: [0, (height - 0.5) / 2, (station / 71 - 0.5) * (20 - 0.4 * 1.4)],
      scale: [0.4 * (0.93 + 0.07 * Math.sin(station * 1.71) ** 2), height, 0.4 * 1.4],
      tint: 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(station * 3.13)),
    });
    const instance = new THREE.Matrix4().compose(
      new THREE.Vector3(...crown.position),
      new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (i % 2) * Math.PI),
      new THREE.Vector3(...crown.scale)
    );
    const before = owner.clone().multiply(instance),
      after = parent.clone().multiply(before);
    for (let j = 0; j < HEDGE_CROWN_GEOMETRY.attributes.position.count; j++) {
      const p = new THREE.Vector3().fromBufferAttribute(
        HEDGE_CROWN_GEOMETRY.attributes.position,
        j
      );
      const difference = p.clone().applyMatrix4(after).sub(p.applyMatrix4(before));
      expect(difference.x).toBeCloseTo(14.5, 12);
      expect(difference.y).toBeCloseTo(parent.elements[13], 12);
      expect(difference.z).toBeCloseTo(12, 12);
    }
  });
});

describe.each(['low', 'medium', 'high', 'ultra'])('intact riverbank hedge %s', (quality) => {
  it('derives the exact complete20x.4 clipped-triangle minimum without rounded Y or extra sinking', () => {
    const segments = getTerrainGridSegments(quality),
      pieces = riverbankHedgeSupportPieces(segments);
    const vertices = pieces.flat();
    const [x, baseY, z] = getRiverbankHedgePosition(segments);
    const maximum = Math.max(...vertices.map((p) => p.y));
    expect([x, z]).toEqual([14.5, 12]);
    expect(RIVERBANK_HEDGE_FOOTPRINT).toEqual([
      [4.5, -116.2],
      [24.5, -116.2],
      [24.5, -115.8],
      [4.5, -115.8],
    ]);
    expect(pieces.length).toBe(segments === 64 ? 3 : 5);
    expect(vertices.length).toBe(segments === 64 ? 12 : 20);
    expect(pieces.reduce((sum, p) => sum + polygonArea(p.map((v) => [v.x, v.z])), 0)).toBeCloseTo(
      8,
      10
    );
    expect(baseY).toBe(Math.min(...vertices.map((p) => p.y)));
    expect(baseY).toBeCloseTo(segments === 64 ? -0.32025620915032615 : -0.05714509803921565, 12);
    expect(maximum - baseY).toBeCloseTo(
      segments === 64 ? 0.037981699346401665 : 0.03162352941176463,
      12
    );
    expect(0.075 - (maximum - baseY)).toBeGreaterThan(0.037);
    expect(0.34 - (maximum - baseY)).toBeGreaterThan(0.302);
    expect(baseY - MILLOS_RIVER_CONFIG.waterLevel).toBeGreaterThan(1.67);
  });

  it('uses highest actual solid support and clears all complete neighboring owners and actual clipped water', async () => {
    const segments = getTerrainGridSegments(quality),
      pieces = riverbankHedgeSupportPieces(segments);
    const [, baseY] = getRiverbankHedgePosition(segments);
    const fixture = await supportFixture(quality);
    try {
      const samples: { x: number; z: number; y: number }[] = [];
      for (const piece of pieces) {
        samples.push(...piece);
        piece.forEach((a, i) => {
          const b = piece[(i + 1) % piece.length];
          samples.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 });
        });
        samples.push({
          x: piece.reduce((n, p) => n + p.x, 0) / piece.length,
          z: piece.reduce((n, p) => n + p.z, 0) / piece.length,
          y: piece.reduce((n, p) => n + p.y, 0) / piece.length,
        });
      }
      for (const sample of samples) {
        const { hit, water } = fixture.query(sample.x, sample.z);
        expect(hit?.object.name).toBe('actual-displaced-terrain');
        expect(hit!.point.y).toBeCloseTo(sample.y, 5);
        expect(baseY - hit!.point.y).toBeLessThan(2e-6);
        expect(hit!.point.y - baseY).toBeLessThan(0.038);
        expect(water).toBeUndefined();
        expect(nearRiverFootbridge(sample.x, sample.z)).toBe(false);
      }
      expect(waterOverlap(fixture.water)).toBe(0);
      const footprint = new THREE.Box3(
        new THREE.Vector3(4.5, baseY, -116.2),
        new THREE.Vector3(24.5, baseY + 0.5, -115.8)
      );
      const bridge = fixture.full.getObjectByName('river-footbridge-deck')!.parent!;
      for (const [owner, lowerBound] of [
        [fixture.full.getObjectByName('complete-road-bridge')!, 15.499],
        [bridge, 1.1624],
        [fixture.full.getObjectByName('complete-river-approach')!, 2.8249],
        [fixture.full.getObjectByName('loaded-nearby-park-bench')!, 3.546],
        [fixture.full.getObjectByName('protected-RIVER-sign')!, 5.7028],
        [fixture.full.getObjectByName('receiving-yard')!, 5.7999],
        [fixture.full.getObjectByName('receiving-road')!, 19.499],
      ] as const) {
        expect(owner).toBeDefined();
        expect(xzDistance(footprint, new THREE.Box3().setFromObject(owner))).toBeGreaterThan(
          lowerBound
        );
      }
      const navEast = RIVER_FOOTBRIDGE_DECK.centre[0] + RIVER_FOOTBRIDGE_DECK.size[0] / 2 + 0.5;
      expect(4.5 - navEast).toBe(0.8125);
      expect(nearRiverFootbridge(navEast - 1e-7, -116)).toBe(true);
      expect(nearRiverFootbridge(navEast + 1e-7, -116)).toBe(false);
    } finally {
      fixture.dispose();
    }
  });
});

it('rejects unsupported grid densities without a geometry or renderer allocation', () => {
  for (const value of [0, 32, 256, NaN, Infinity])
    expect(() => getRiverbankHedgePosition(value)).toThrow();
  const helper = source('src/components/exterior/riverbankHedgeGrounding.ts');
  expect(helper).not.toMatch(/new\s+THREE|BufferGeometry|new\s+.*Material|useFrame|setMatrixAt/);
});

// Deliberately strict custody guards for this placement-only change. A future
// intentional asset/shared-route edit must be reviewed before updating these.
const unchangedSourceHashes = {
  'src/components/exterior/HedgeFoliage.tsx':
    '127e51627a4e407fd3ea8ca36f568d6aadfca254184b224458fc0c59788ba989',
  'src/components/scenery/InstancedFoliage.tsx':
    'bfded40ab445b3b8e1fd1235a6f2062e95a51a14ec09f2f76a6b65ca5c78eddb',
  'src/components/scenery/WindDriver.tsx':
    '4b9337add2f65164982234a6e6808fe2534665fd09cfca38d7f8c231ac4a034b',
  'src/utils/worldSurface.ts': 'c3e05f3b2158ae4b94c3b25b2c5ab9cdcdf2067e8ba0b88b38e48694402e85ca',
  // Current f8de1b6 delivery preserves its generated-surface and material owners.
  // This placement-only repair must keep those full-file inputs exact.
  'src/components/models/GeneratedGeometrySurface.tsx':
    'e5d1b63f9e14829abe5c98be94235d79f68d6512cf79b4a9d83849df67d6a1b2',
  'src/components/models/GeneratedModel.tsx':
    'c35f00e3956e2dfceeb075fbe3b3885fc61707d56f2db4cde9dcb8e6ecb73dac',
  'src/components/exterior/ExteriorVegetation.tsx':
    '317d7f5f0682eccd9fe4c2273e3a3cc9e1e923bbe5ae0dba97b43595b5c23b08',
  'src/components/terrain/splatMapGenerator.ts':
    '6fde6a92bb780387fa90ca6d498c9d6d2671d850dcd62550640e12d77d9db608',
  'src/components/terrain/terrainTypes.ts':
    '2c9a478e927c018961504c0bbd134f8b619fb7e8fe8b87e0192984443f57faef',
  'src/components/terrain/TerrainGround.tsx':
    'db63cede9939ebe7614004dc60bf21c757e3240c36154e940fc8bf70851da792',
  'src/constants/siteLayout.ts': '64faad27fd58ab12ef16cf64c8b281cbc5481abdeef988a662f2e09cc28bdb00',
  'src/constants/renderLayers.ts':
    '9f264d3c17065e5f23cd6f852f46ec72154195904ac508eba4906e49ad9c7107',
  'src/utils/castleNavigation.ts':
    '745f2f3ee41ba92ac8d9b5185728359613a778175ebfaf0171e98852ca547eba',
  'src/components/TruckBay.tsx': '96535720c39545d1e2cedd0bd3f2617d814a5fea928e356efaf14fdb40cc687f',
  'public/models/world/hedge-unit.glb':
    '808a45bf2a900a731887ef2605cec8a8de691b6c15e8440a3f82d64b0d8cf81b',
  'public/models/world/park-bench.glb':
    'a44763b704605b3c7b0c5389557cb50274a9a23b1eaa2200bf6899ecf2b20bf1',
  'public/models/world/info-sign.glb':
    'fca53f890aaf168c2e931b368a3cdb4a0e492449d7ee7eaa3674d833a607fb99',
};
it('preserves shared foliage, atlas, terrain, bridge, navigation, receiving-road and delivered-asset bytes', () => {
  for (const [file, digest] of Object.entries(unchangedSourceHashes))
    expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(digest);
  // PR62 deliberately adds masonry in the headwall-facing block. Keep the
  // baseline pin for EVERY other byte, including ring, earth, water, shore,
  // footbridge and navigation geometry, rather than re-pinning the whole file.
  // The exception has its own aperture/envelope/normal checks in masonryRecovery.
  const river = source('src/components/exterior/riverGeometry.ts');
  const owner = river.indexOf('export function createRiverCulvertGeometries');
  const start = river.indexOf('  const wall = new THREE.Shape();', owner);
  const end = river.indexOf('  // The backed ring', start);
  expect(owner).toBeGreaterThanOrEqual(0);
  expect(start).toBeGreaterThan(owner);
  expect(end).toBeGreaterThan(start);
  const retained =
    river.slice(0, start) +
    '  /* Reviewed headwall facing; see masonryRecovery.test.ts. */\n\n' +
    river.slice(end);
  expect(createHash('sha256').update(retained).digest('hex')).toBe(
    '2afde6d7c46a8372ece8c1c8cda201f5e7a240ac4737fbfd8acbe169c2aa0ec1'
  );
});
