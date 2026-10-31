// @vitest-environment node
// Actual source/GLB/native-font regression. No renderer or lifecycle simulation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { NodeIO } from '@gltf-transform/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const THREE = require('three'),
  React = require('react'),
  ts = require('typescript');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const source = read('src/components/TruckBay.tsx');
const geometries = new Set();
const AST = (file, text) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(file, name) {
  const a = AST(file, read(file));
  for (const node of a.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      return node.getText(a).replace(/^export\s+/, '');
    if (ts.isVariableStatement(node)) {
      const d = node.declarationList.declarations.find((d) => d.name.getText(a) === name);
      if (d) return 'const ' + d.getText(a) + ';';
    }
  }
  throw Error('Missing actual source declaration: ' + name);
}
function evaluate(code, bindings, result) {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return new Function(
    ...Object.keys(bindings),
    'return (function(){\n' + js + '\nreturn ' + result + ';})();'
  )(...Object.values(bindings));
}
const fixtureSource = declaration('src/components/TruckBay.tsx', 'CardboardCompactor');
function TextMarker() {
  throw Error('Source inspection does not mount text');
}
function BodyMarker() {
  throw Error('Source inspection does not mount a loader');
}
function BoundaryMarker() {
  throw Error('Source inspection chooses one boundary arm');
}
const sourceMath = Object.create(Math);
sourceMath.random = () => 0.5; // One stable local scrap sample; global Math is unchanged.
const layers = evaluate(
  declaration('src/constants/renderLayers.ts', 'FLOOR_LAYERS') +
    '\n' +
    declaration('src/constants/renderLayers.ts', 'POLYGON_OFFSET'),
  {},
  '{FLOOR_LAYERS,POLYGON_OFFSET}'
);
const fixture = evaluate(
  fixtureSource,
  {
    React,
    THREE,
    Math: sourceMath,
    ...layers,
    useRef: (value) => ({ current: value }),
    useMemo: (fn) => fn(),
    useEffect: () => {},
    Text: TextMarker,
    GeneratedModel: BodyMarker,
    GeneratedBoundary: BoundaryMarker,
  },
  'CardboardCompactor'
);
function transform(p = {}) {
  // These are actual JSX Object3D props, never the component's scalar yaw prop.
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(p.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(
      ...(Array.isArray(p.scale) ? p.scale : [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1])
    )
  );
}
function attributes(open, a) {
  return Object.fromEntries(
    open.attributes.properties.map((p) => {
      assert(ts.isJsxAttribute(p));
      return [
        p.name.text,
        !p.initializer
          ? true
          : ts.isStringLiteral(p.initializer)
            ? p.initializer.text
            : evaluate('', { Math }, '(' + p.initializer.expression.getText(a) + ')'),
      ];
    })
  );
}
function consumers() {
  const a = AST('TruckBay.tsx', source),
    found = [];
  function visit(n) {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(a) === 'CardboardCompactor') {
      const parents = [];
      for (let p = n.parent; p; p = p.parent)
        if (ts.isJsxElement(p) && p.openingElement.tagName.getText(a) === 'group')
          parents.unshift(p.openingElement);
      const parent = new THREE.Matrix4();
      for (const p of parents) parent.multiply(transform(attributes(p, a)));
      found.push({ props: attributes(n, a), parent });
    }
    ts.forEachChild(n, visit);
  }
  visit(a);
  assert.equal(found.length, 2);
  return found;
}
function triangles(g, matrix) {
  const p = g.getAttribute('position'),
    index = g.getIndex();
  return Array.from({ length: (index?.count ?? p.count) / 3 }, (_, i) =>
    [0, 1, 2].map((k) =>
      new THREE.Vector3()
        .fromBufferAttribute(p, index ? index.getX(i * 3 + k) : i * 3 + k)
        .applyMatrix4(matrix)
    )
  );
}
let delivered, layout, font, cases;
function inspect(consumer, mode) {
  const result = { meshes: [], labels: [] };
  function walk(node, parent, body = false) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, parent, body));
      return;
    }
    if (!React.isValidElement(node)) return;
    const p = node.props,
      matrix = parent.clone().multiply(transform(p));
    if (node.type === TextMarker) {
      result.labels.push({ ...p, matrix });
      return;
    }
    if (node.type === BoundaryMarker) {
      walk(mode === 'loaded' ? p.children : p.fallback, parent, true);
      return;
    }
    if (node.type === BodyMarker) {
      assert.equal(p.asset, 'yardCompactorBody');
      for (const d of delivered)
        result.meshes.push({
          body: true,
          triangles: triangles(d.geometry, matrix.clone().multiply(d.matrix)),
        });
      return;
    }
    if (node.type === 'mesh') {
      let geometry, materialProps;
      for (const child of [p.children].flat(Infinity)) {
        if (!React.isValidElement(child)) continue;
        if (typeof child.type === 'string' && child.type.endsWith('Geometry')) {
          const name = child.type[0].toUpperCase() + child.type.slice(1);
          assert(
            ['BoxGeometry', 'PlaneGeometry', 'CylinderGeometry', 'CircleGeometry'].includes(name)
          );
          geometry = new THREE[name](...child.props.args);
          geometries.add(geometry);
        }
        if (child.type === 'meshStandardMaterial') materialProps = child.props;
      }
      assert(geometry && materialProps);
      result.meshes.push({
        body,
        triangles: triangles(geometry, matrix),
        materialProps,
        geometryType: geometry.type,
      });
      return;
    }
    walk(p.children, matrix, body);
  }
  // The actual component converts its scalar rotation into the group Euler.
  walk(fixture(consumer.props), consumer.parent);
  assert.equal(result.labels.length, 1);
  return result;
}

// Installed native Troika parser/typesetter, matching the existing AIR and
// dumpster patterns. No alternative font metrics, window or SDF worker.
function libraryFunction(file, name) {
  const a = AST(file, read(file));
  const fn = a.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert(fn);
  return new Function(fn.getText(a).replace(/^export\s+/, '') + '; return ' + name + ';')();
}
function libraryDefault(file) {
  const exports = {};
  new Function(
    'exports',
    ts.transpileModule(read(file), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText
  )(exports);
  return exports.default;
}
const selfDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'self');
function restoreSelf() {
  if (selfDescriptor) Object.defineProperty(globalThis, 'self', selfDescriptor);
  else delete globalThis.self;
}
beforeAll(async () => {
  try {
    if (!selfDescriptor)
      Object.defineProperty(globalThis, 'self', {
        configurable: true,
        writable: true,
        value: globalThis,
      });
    const parse = libraryFunction(
      'node_modules/troika-three-text/src/FontParser.js',
      'parserFactory'
    )(
      libraryDefault('node_modules/troika-three-text/libs/typr.factory.js')(),
      libraryDefault('node_modules/troika-three-text/libs/woff2otf.factory.js')()
    );
    const bytes = fs.readFileSync(path.join(root, 'public/fonts/Inter-Regular.ttf'));
    expect(hash(bytes)).toBe('6debf0c231cf9a9d4552db02d3ca9515d841b37f2a6fe9881a74fe906f61b645');
    font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    font.src = 'local-Inter-Regular.ttf';
    const setter = libraryFunction(
      'node_modules/troika-three-text/src/Typesetter.js',
      'createTypesetter'
    )(() => {
      throw Error('External font resolution forbidden');
    }, require('bidi-js')());
    layout = (label) => {
      let result;
      setter.typeset(
        {
          text: label.children,
          fontSize: label.fontSize,
          anchorX: label.anchorX ?? 'center',
          anchorY: label.anchorY ?? 'middle',
          preResolvedFonts: { chars: new Uint8Array(label.children.length), fonts: [font] },
        },
        (r) => {
          result = r;
        }
      );
      assert(result, 'Actual native typesetter did not complete');
      return Array.from(result.glyphIds)
        .map((id, i) => {
          const b = result.glyphData[font.src][id].pathBounds,
            scale = label.fontSize / font.unitsPerEm;
          const x = result.glyphPositions[i * 2],
            y = result.glyphPositions[i * 2 + 1];
          return [x + b[0] * scale, y + b[1] * scale, x + b[2] * scale, y + b[3] * scale];
        })
        .filter((b) => b[2] > b[0] && b[3] > b[1]);
    };
    const paths = evaluate(
      declaration('src/utils/modelLoader.ts', 'GENERATED_ASSET_PATHS'),
      { BASE: '' },
      'GENERATED_ASSET_PATHS'
    );
    const file = 'public/' + paths.yardCompactorBody.replace(/^\//, '');
    const bytesGLB = fs.readFileSync(path.join(root, file));
    const provenance = JSON.parse(
      read('assets/source/models/world/PROVENANCE.json')
    ).sourcePacks.find((p) => p.id === 'world-yard-compactor-body');
    expect(hash(bytesGLB)).toBe(provenance.runtimeDerivative.sha256);
    const doc = await new NodeIO().readBinary(bytesGLB);
    expect(doc.getRoot().listSkins()).toHaveLength(0);
    expect(doc.getRoot().listAnimations()).toHaveLength(0);
    delivered = [];
    for (const node of doc.getRoot().listNodes())
      for (const p of node.getMesh()?.listPrimitives() ?? []) {
        const positions = p.getAttribute('POSITION'),
          geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            Array.from({ length: positions.getCount() }, (_, i) =>
              positions.getElement(i, [])
            ).flat(),
            3
          )
        );
        const index = p.getIndices();
        if (index)
          geometry.setIndex(Array.from({ length: index.getCount() }, (_, i) => index.getScalar(i)));
        geometries.add(geometry);
        delivered.push({ geometry, matrix: new THREE.Matrix4().fromArray(node.getWorldMatrix()) });
      }
    cases = consumers().map((consumer) => ({
      loaded: inspect(consumer, 'loaded'),
      fallback: inspect(consumer, 'fallback'),
    }));
  } catch (error) {
    restoreSelf();
    throw error;
  }
});
afterAll(() => {
  for (const geometry of geometries) geometry.dispose();
  restoreSelf();
  expect(Object.getOwnPropertyDescriptor(globalThis, 'self')).toEqual(selfDescriptor);
});

function clip(poly, distance) {
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
const area = (poly) =>
  Math.abs(
    poly.reduce(
      (sum, p, i) =>
        sum + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y,
      0
    )
  ) / 2;
function rectangle(poly, b) {
  for (const d of [(v) => v.x - b[0], (v) => b[2] - v.x, (v) => v.y - b[1], (v) => b[3] - v.y])
    poly = clip(poly, d);
  return poly;
}
function proof(caseIndex, mode, shift = [0, 0, 0]) {
  const c = cases[caseIndex],
    actual = c[mode],
    label = actual.labels[0];
  const inverse = label.matrix.clone().invert();
  const convert = (triangles) =>
    triangles.map((t) => t.map((v) => v.clone().applyMatrix4(inverse)));
  const panel = c.fallback.meshes.filter((m) => m.body && m.materialProps?.color === '#1f2937');
  assert.equal(panel.length, 1);
  const panelTriangles = convert(panel[0].triangles),
    frontZ = Math.max(...panelTriangles.flat().map((v) => v.z));
  const fallbackFace = panelTriangles.filter(
    (t) =>
      t.every((v) => Math.abs(v.z - frontZ) < 3e-6) &&
      t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])).z > 1e-9
  );
  assert.equal(fallbackFace.length, 2);
  const all = convert(actual.meshes.flatMap((m) => m.triangles));
  const face =
    mode === 'fallback'
      ? fallbackFace
      : fallbackFace.map((triangle) => {
          const matches = all.filter(
            (t) =>
              t.every((v) => triangle.some((w) => v.distanceTo(w) < 3e-6)) &&
              triangle.every((v) => t.some((w) => v.distanceTo(w) < 3e-6))
          );
          assert.equal(
            matches.length,
            1,
            'Actual loaded front triangle must match source fallback'
          );
          return matches[0];
        });
  const bounds = new THREE.Box3().setFromPoints(face.flat());
  const glyphs = layout(label).map((g) => {
    const b = [g[0] + shift[0], g[1] + shift[1], g[2] + shift[0], g[3] + shift[1]];
    const requiredArea = (b[2] - b[0]) * (b[3] - b[1]);
    const covered = face.reduce(
      (n, t) =>
        n +
        area(
          rectangle(
            t.map((v) => v.clone()),
            b
          )
        ),
      0
    );
    const forward = all.filter(
      (t) =>
        area(
          clip(
            rectangle(
              t.map((v) => v.clone()),
              b
            ),
            (v) => v.z - shift[2] - 1e-6
          )
        ) > 1e-10
    );
    return {
      contained: covered >= requiredArea - 1e-9,
      forward: forward.length,
      margin: Math.min(
        b[0] - bounds.min.x,
        bounds.max.x - b[2],
        b[1] - bounds.min.y,
        bounds.max.y - b[3]
      ),
    };
  });
  return {
    contained: glyphs.every((g) => g.contained),
    minimumMargin: Math.min(...glyphs.map((g) => g.margin)),
    clearance: shift[2] - bounds.max.z,
    forward: glyphs.reduce((n, g) => n + g.forward, 0),
  };
}

test('keeps the source label/font contract and fixed-face ownership', () => {
  expect(cases).toHaveLength(2);
  for (const c of cases)
    for (const mode of ['loaded', 'fallback']) {
      const label = c[mode].labels[0];
      expect(label.position).toEqual([0, 2.435, 1.071]);
      expect(label.children).toBe('CARDBOARD ONLY');
      expect(label.fontSize).toBe(0.12);
      expect(label.color).toBe('#ffffff');
      expect(label.anchorX).toBe('center');
      for (const key of [
        'font',
        'material',
        'surface',
        'depthOffset',
        'renderOrder',
        'outlineWidth',
        'strokeWidth',
      ])
        expect(label[key]).toBeUndefined();
      expect(c[mode].meshes).toHaveLength(mode === 'loaded' ? 9 : 13);
      expect(c[mode].meshes.reduce((n, m) => n + m.triangles.length, 0)).toBe(228);
    }
  expect([...fixtureSource.matchAll(/\bref=\{([^}]+)\}/g)].map((m) => m[1])).toEqual(['ramRef']);
  expect(fixtureSource).toContain("registerAnimation(id, 'custom', null, {}, (time)");
  expect(fixtureSource).toContain('ramRef.current.position.y =');
  const textSource = read('src/components/shared/SceneText.tsx');
  expect(textSource).toContain('fonts/Inter-Regular.ttf');
  expect(textSource).toContain('font={font ?? DEFAULT_3D_FONT}');
  expect(textSource).toContain("surface = 'unlit'");
  const drei = read('node_modules/@react-three/drei/core/Text.js');
  expect(drei).toMatch(/anchorX\s*=\s*'center'/);
  expect(drei).toMatch(/anchorY\s*=\s*'middle'/);
});
test('retains the actual native text depth contract', () => {
  const text = new (require('troika-three-text').Text)();
  try {
    expect(text.material.depthTest).toBe(true);
    expect(text.material.depthWrite).toBe(true);
    expect(text.depthOffset).toBe(0);
    expect(text.renderOrder).toBe(0);
    expect(text.material.polygonOffset).toBe(false);
    expect(text.material.transparent).toBe(true);
    expect(text.material.side).toBe(THREE.DoubleSide);
  } finally {
    text.dispose();
  }
});
test.each([
  [0, 'loaded'],
  [0, 'fallback'],
  [1, 'loaded'],
  [1, 'fallback'],
])('contains native glyphs on consumer %i %s with real face/depth margin', (consumer, mode) => {
  const p = proof(consumer, mode);
  expect(p.contained).toBe(true);
  expect(p.minimumMargin).toBeGreaterThanOrEqual(0.02 - 3e-6);
  expect(p.clearance).toBeGreaterThanOrEqual(0.01 - 3e-6);
  expect(p.forward).toBe(0);
});
test('rejects the original buried label and merely moving it forward above the panel edge', () => {
  for (let consumer = 0; consumer < 2; consumer++)
    for (const mode of ['loaded', 'fallback']) {
      const old = proof(consumer, mode, [0, 0.065, -0.051]);
      expect(old.forward).toBeGreaterThan(0);
      expect(old.contained).toBe(false);
      const onlyForward = proof(consumer, mode, [0, 0.065, 0]);
      expect(onlyForward.forward).toBe(0);
      expect(onlyForward.contained).toBe(false);
    }
});
