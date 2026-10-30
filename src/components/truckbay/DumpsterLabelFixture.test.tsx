import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { NodeIO } from '@gltf-transform/core';
import { Text as TroikaText } from 'troika-three-text';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { Group, Mesh, WebGLRenderer } from 'three';
import ErrorBoundary from '../ErrorBoundary';

// One Three identity for source, loaded delivery and R3F. No GPU or SDF is created.
const require = createRequire(import.meta.url);
const THREE = require('three') as typeof import('three');
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  BoxGeometry: THREE.BoxGeometry,
  CylinderGeometry: THREE.CylinderGeometry,
  RingGeometry: THREE.RingGeometry,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
});
const sourceFile = 'src/components/TruckBay.tsx';
const source = readFileSync(sourceFile, 'utf8');
function declarations(file: string, names: string[]) {
  const text = file === sourceFile ? source : readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names
    .map((name) => {
      for (const node of ast.statements) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name)
          return node.getText(ast).replace(/^export\s+/, '');
        if (ts.isVariableStatement(node)) {
          const found = node.declarationList.declarations.find((d) => d.name.getText(ast) === name);
          if (found)
            return `${node.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'const'} ${found.getText(ast)};`;
        }
      }
      throw Error(`Missing actual source declaration ${file}:${name}`);
    })
    .join('\n');
}
function evaluate(code: string, bindings: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn ${result};`)(
    ...Object.values(bindings)
  );
}
const yard = evaluate(
  declarations(sourceFile, ['createYardBollardGeometry', 'YARD_BOLLARD']),
  { THREE },
  '{YARD_BOLLARD}'
);
function TextMarker() {
  throw Error('Element audit does not mount text');
}
function BoundaryMarker() {
  throw Error('Element audit does not mount loader');
}
function ModelMarker() {
  throw Error('Element audit does not mount model');
}
const fixture = evaluate(
  declarations(sourceFile, ['DumpsterArea']),
  {
    React,
    THREE,
    Text: TextMarker,
    GeneratedBoundary: BoundaryMarker,
    GeneratedModel: ModelMarker,
    YARD_BOLLARD: yard.YARD_BOLLARD,
  },
  'DumpsterArea'
);
const element = fixture({ position: [0, 0, 0], rotation: 0 });
function transform(p: any) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(p.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(
      ...(Array.isArray(p.scale) ? p.scale : [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1])
    )
  );
}
const labels: any[] = [],
  fallbackMeshes: Mesh[] = [];
function inspect(node: any, parent = new THREE.Matrix4(), fallback = false) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => inspect(n, parent, fallback));
    return;
  }
  if (!React.isValidElement(node)) return;
  const el = node as React.ReactElement<any>,
    p = el.props,
    matrix = parent.clone().multiply(transform(p));
  if (el.type === TextMarker) {
    labels.push({ ...p, matrix });
    return;
  }
  if (el.type === BoundaryMarker) {
    inspect(p.fallback, parent, true);
    return;
  }
  if (el.type === 'mesh') {
    let geometry = p.geometry,
      material: any;
    for (const child of [p.children].flat(Infinity)) {
      if (!React.isValidElement(child)) continue;
      const c = child as React.ReactElement<any>;
      if (typeof c.type === 'string' && c.type.endsWith('Geometry')) {
        const Constructor = (THREE as any)[c.type[0].toUpperCase() + c.type.slice(1)];
        geometry = new Constructor(...c.props.args);
      }
      if (c.type === 'meshStandardMaterial') material = new THREE.MeshStandardMaterial(c.props);
    }
    if (!geometry || !material) throw Error('Incomplete actual source fallback mesh');
    if (fallback) {
      const mesh = new THREE.Mesh(geometry.clone().applyMatrix4(matrix), material);
      mesh.updateMatrixWorld(true);
      fallbackMeshes.push(mesh);
    }
    return;
  }
  inspect(p.children, matrix, fallback);
}
inspect(element);
const label = (text: string) => labels.find((l) => l.children === text);
const panelMesh = fallbackMeshes.filter(
  (m) => (m.material as any).color.getHexString() === '14532d'
);
if (panelMesh.length !== 1) throw Error('Expected one source green-container caption panel');
const panel = new THREE.Box3().setFromObject(panelMesh[0]);
async function deliveredBody() {
  const doc = await new NodeIO().read('public/models/world/yard-dumpster-body.glb');
  const group = new THREE.Group();
  for (const node of doc.getRoot().listNodes())
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, key, size] of [
        ['POSITION', 'position', 3],
        ['NORMAL', 'normal', 3],
        ['TEXCOORD_0', 'uv', 2],
        ['COLOR_0', 'color', 3],
      ] as const) {
        const a = primitive.getAttribute(semantic);
        if (a)
          geometry.setAttribute(
            key,
            new THREE.Float32BufferAttribute(
              Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, [])).flat(),
              size
            )
          );
      }
      if (primitive.getIndices())
        geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      group.add(mesh);
    }
  return group;
}
function triangles(meshes: Mesh[]) {
  return meshes.flatMap((m) => {
    const p = m.geometry.attributes.position,
      ix = m.geometry.index;
    return Array.from({ length: (ix?.count ?? p.count) / 3 }, (_, i) =>
      [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, ix ? ix.getX(i * 3 + k) : i * 3 + k)
          .applyMatrix4(m.matrixWorld)
      )
    );
  });
}
async function loadedTriangles() {
  const group = await deliveredBody();
  // The actual loaded child restores its authored lower datum by this source offset.
  const ast = ts.createSourceFile(
    sourceFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let offset: number[] | undefined;
  function visit(n: ts.Node) {
    if (
      ts.isJsxSelfClosingElement(n) &&
      n.tagName.getText(ast) === 'GeneratedModel' &&
      n.attributes.properties.some(
        (p) =>
          ts.isJsxAttribute(p) &&
          p.name.getText(ast) === 'asset' &&
          p.initializer?.getText(ast) === '"yardDumpsterBody"'
      )
    ) {
      const owner = n.parent;
      if (ts.isJsxElement(owner)) {
        const p = owner.openingElement.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(ast) === 'position'
        ) as ts.JsxAttribute;
        offset = evaluate(
          `const p = ${(p.initializer as ts.JsxExpression).expression!.getText(ast)};`,
          {},
          'p'
        );
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
  if (!offset) throw Error('Loaded source origin restoration absent');
  group.position.fromArray(offset);
  group.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  group.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  return triangles(meshes);
}
// Actual installed Troika parser and Typesetter, not a substitute font metric library.
function libraryFunction(file: string, name: string) {
  const text = readFileSync(file, 'utf8'),
    ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  return new Function(`${fn.getText(ast).replace(/^export\s+/, '')}; return ${name};`)();
}
function defaultFactory(file: string) {
  const exports = {};
  new Function(
    'exports',
    ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
  )(exports);
  return (exports as any).default;
}
const parseFont = libraryFunction(
  'node_modules/troika-three-text/src/FontParser.js',
  'parserFactory'
)(
  defaultFactory('node_modules/troika-three-text/libs/typr.factory.js')(),
  defaultFactory('node_modules/troika-three-text/libs/woff2otf.factory.js')()
);
const fontBytes = readFileSync('public/fonts/Inter-Regular.ttf');
const font = parseFont(
  fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength)
);
font.src = 'local-Inter-Regular.ttf';
const typesetter = libraryFunction(
  'node_modules/troika-three-text/src/Typesetter.js',
  'createTypesetter'
)(() => {
  throw Error('External font resolution forbidden');
}, require('bidi-js')());
function layout(l: any) {
  let result: any;
  typesetter.typeset(
    {
      text: l.children,
      fontSize: l.fontSize,
      anchorX: 'center',
      anchorY: 'middle',
      preResolvedFonts: { chars: new Uint8Array(l.children.length), fonts: [font] },
    },
    (r: any) => {
      result = r;
    }
  );
  if (!result) throw Error('Actual local typesetter did not complete');
  return result;
}
function envelope(l: any) {
  const b = layout(l).visibleBounds;
  return new THREE.Box3().setFromPoints(
    [
      [b[0], b[1], 0],
      [b[0], b[3], 0],
      [b[2], b[1], 0],
      [b[2], b[3], 0],
    ].map((p) => new THREE.Vector3(...p).applyMatrix4(l.matrix))
  );
}
function clip(poly: any[], distance: (p: any) => number) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = distance(a),
      db = distance(b);
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) result.push(a.clone().lerp(b, da / (da - db)));
  }
  return result;
}
function occluders(all: any[][], l: any) {
  const b = layout(l).visibleBounds,
    inverse = l.matrix.clone().invert();
  return all.filter((triangle) => {
    let p = triangle.map((v) => v.clone().applyMatrix4(inverse));
    for (const d of [
      (v: any) => v.x - b[0],
      (v: any) => b[2] - v.x,
      (v: any) => v.y - b[1],
      (v: any) => b[3] - v.y,
      (v: any) => v.z - 1e-6,
    ])
      p = clip(p, d);
    let area = 0;
    for (let i = 0; i < p.length; i++)
      area += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
    return Math.abs(area) / 2 > 1e-10;
  });
}
describe('actual dumpster panel caption and native glyph depth', () => {
  it('keeps both captions on the existing panel and preserves the recycling label', () => {
    expect(labels.map((l) => l.children)).toEqual(['WASTE', 'SERVICES', 'RECYCLING']);
    expect(label('WASTE').position).toEqual([0, 1.26, 1.295]);
    expect(label('SERVICES').position).toEqual([0, 1, 1.295]);
    expect(label('RECYCLING').position).toEqual([0, 1.1, 0.76]);
    expect(labels.map((l) => [l.fontSize, l.color, l.anchorX])).toEqual([
      [0.3, '#fef3c7', 'center'],
      [0.2, '#fef3c7', 'center'],
      [0.15, '#ffffff', 'center'],
    ]);
  });
  it('contains complete actual Troika glyph paths with10mm clearance and separated lines', () => {
    for (const name of ['WASTE', 'SERVICES']) {
      const b = envelope(label(name));
      expect(b.min.x - panel.min.x).toBeGreaterThan(0.05);
      expect(panel.max.x - b.max.x).toBeGreaterThan(0.05);
      expect(b.min.y - panel.min.y).toBeGreaterThan(0.05);
      expect(panel.max.y - b.max.y).toBeGreaterThan(0.05);
      expect(b.min.z - panel.max.z).toBeCloseTo(0.01, 6);
    }
    expect(envelope(label('WASTE')).min.y - envelope(label('SERVICES')).max.y).toBeGreaterThan(
      0.05
    );
  });
  it('retains native depth testing without a shader, render-order or font substitute', () => {
    const text = new TroikaText();
    expect(text.material.depthTest).toBe(true);
    expect(text.material.depthWrite).toBe(true);
    expect(text.material.side).toBe(THREE.DoubleSide);
    expect(text.material.transparent).toBe(true);
    expect(text.depthOffset).toBe(0);
    expect(text.renderOrder).toBe(0);
    expect(text.material.polygonOffset).toBe(false);
    text.dispose();
    expect(declarations(sourceFile, ['DumpsterArea'])).not.toMatch(
      /depthOffset|depthTest|depthWrite|renderOrder|useFrame|registerAnimation/
    );
    const wrapper = readFileSync('src/components/shared/SceneText.tsx', 'utf8');
    expect(wrapper).toContain('fonts/Inter-Regular.ttf');
    expect(wrapper).toContain("surface = 'unlit'");
  });
  it('has no loaded body, lid or edge in front of either whole glyph envelope', async () => {
    const all = await loadedTriangles();
    for (const name of ['WASTE', 'SERVICES']) expect(occluders(all, label(name))).toHaveLength(0);
    // Reproduce the old15mm buried-plane bug using its historical two positions.
    for (const [name, y] of [
      ['WASTE', 1.5],
      ['SERVICES', 1.15],
    ] as const) {
      const current = label(name),
        old = { ...current, matrix: current.matrix.clone() };
      old.matrix.elements[13] += y - current.position[1];
      old.matrix.elements[14] += 1.27 - current.position[2];
      expect(occluders(all, old).length).toBeGreaterThan(0);
    }
  });
  it('keeps loading/error fallback body, static lid and panel clear too', () => {
    const all = triangles(fallbackMeshes);
    for (const name of ['WASTE', 'SERVICES']) expect(occluders(all, label(name))).toHaveLength(0);
    expect(fallbackMeshes).toHaveLength(14);
    expect(declarations(sourceFile, ['DumpsterArea'])).not.toMatch(/useState|useEffect|useRef/);
  });
});

async function mountFixture() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const shared = await deliveredBody();
  let phase: 'pending' | 'success' | 'error' = 'pending',
    resolve!: () => void;
  const pending = new Promise<void>((r) => {
    resolve = r;
  });
  const generated = evaluate(
    declarations('src/components/models/GeneratedModel.tsx', [
      'VILLAGE_GLAZING',
      'VESSEL_SHELLS',
      'VESSEL_SHELL_ROUGHNESS',
      'GeneratedModel',
      'GeneratedBoundary',
    ]),
    {
      React,
      THREE,
      useEffect,
      useMemo,
      ErrorBoundary,
      GENERATED_ASSET_PATHS: { yardDumpsterBody: 'models/world/yard-dumpster-body.glb' },
      CLOSED_DOUBLE_FACED_ASSETS: new Set(),
      applyVillageWindows: () => {
        throw Error('Dumpster must not enter protected glazing path');
      },
      useDracoGLTF: () => {
        if (phase === 'pending') throw pending;
        if (phase === 'error') throw Error('Controlled missing dumpster delivery');
        return { scene: shared };
      },
    },
    '{GeneratedModel,GeneratedBoundary}'
  );
  const live = evaluate(
    declarations(sourceFile, [
      'labelGroups',
      'labelsVisible',
      'setLabelsVisible',
      'Text',
      'DumpsterArea',
    ]),
    {
      React,
      THREE,
      useRef,
      useLayoutEffect,
      ...generated,
      YARD_BOLLARD: yard.YARD_BOLLARD,
      // Geometry/layout is tested above with real Troika; lifecycle keeps the actual
      // source registry/parent transforms while avoiding asynchronous SDF/GPU work.
      SceneText: ({ children, position, rotation }: any) => (
        <group name={`caption-${children}`} position={position} rotation={rotation} />
      ),
    },
    '{DumpsterArea,labelGroups,setLabelsVisible}'
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
  let store: ReturnType<typeof root.render>,
    key = 0;
  const draw = (show = true) => {
    store = root.render(
      show ? <live.DumpsterArea key={key} position={[65, 0, -75]} rotation={-Math.PI / 2} /> : null
    );
  };
  await act(async () => draw());
  const meshes = () => {
    const result: Mesh[] = [];
    store!.getState().scene.traverse((o) => {
      if ((o as Mesh).isMesh) result.push(o as Mesh);
    });
    return result;
  };
  return {
    shared,
    live,
    renderer,
    meshes,
    async setPhase(next: typeof phase, remount = false) {
      phase = next;
      if (remount) key++;
      await act(async () => {
        if (next === 'success') resolve();
        draw();
        if (next === 'success') await pending;
      });
      store!.getState().scene.updateMatrixWorld(true);
    },
    labels() {
      return [...live.labelGroups] as Group[];
    },
    async remove() {
      await act(async () => draw(false));
    },
    async finish() {
      await act(async () => {
        draw(false);
        root.unmount();
      });
      shared.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as any).dispose();
        }
      });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}
describe('dumpster actual boundary, label registry and shared-resource lifecycle', () => {
  it('preserves three caption owners through pending, loaded, hidden, error and remount paths', async () => {
    const m = await mountFixture();
    try {
      const shared = m.shared.children[0] as Mesh;
      const geometryDispose = vi.spyOn(shared.geometry, 'dispose'),
        materialDispose = vi.spyOn(shared.material as any, 'dispose');
      expect(m.live.labelGroups.size).toBe(3);
      expect(m.meshes()).toHaveLength(15);
      await m.setPhase('success');
      expect(m.meshes()).toHaveLength(2);
      expect(m.live.labelGroups.size).toBe(3);
      const body = m.meshes().find((mesh) => mesh.geometry === shared.geometry)!;
      expect(body.material).toBe(shared.material);
      for (const visible of [false, true]) {
        m.live.setLabelsVisible(visible);
        expect(m.labels().every((g) => g.visible === visible)).toBe(true);
        expect(m.meshes()).toHaveLength(2);
      }
      const log = console.error;
      vi.spyOn(console, 'error').mockImplementation((...args) => {
        if (args.some((v) => String(v).includes('Controlled missing dumpster delivery'))) return;
        log(...args);
      });
      await m.setPhase('error', true);
      expect(m.meshes()).toHaveLength(15);
      expect(m.live.labelGroups.size).toBe(3);
      await m.setPhase('success', true);
      expect(m.meshes()).toHaveLength(2);
      expect(m.live.labelGroups.size).toBe(3);
      expect(m.meshes().find((mesh) => mesh.geometry === shared.geometry)?.material).toBe(
        shared.material
      );
      await m.remove();
      expect(m.live.labelGroups.size).toBe(0);
      expect(geometryDispose).not.toHaveBeenCalled();
      expect(materialDispose).not.toHaveBeenCalled();
      expect(m.renderer.render).not.toHaveBeenCalled();
    } finally {
      await m.finish();
    }
  });
});
