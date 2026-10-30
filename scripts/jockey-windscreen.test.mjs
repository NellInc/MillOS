// Portable static source/contact checks. No browser, renderer or animation callback.
// node --test scripts/jockey-windscreen.test.mjs
// @vitest-environment node
import { test, afterAll as after } from 'vitest';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(
  process.env.MILLOS_SOURCE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
);
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript'),
  THREE = require('three');
const { NodeIO } = require('@gltf-transform/core');
const file = process.env.MILLOS_JOCKEY_SOURCE ?? path.join(root, 'src/components/TruckBay.tsx');
const source = fs.readFileSync(file, 'utf8');
const correctedPane = '<mesh position={[0, 1.55, 1.26]} rotation={[0, 0, 0]}>';
const oldPane = '<mesh position={[0, 1.8, 1.1]} rotation={[0.2, 0, 0]}>';
assert.equal(source.split(correctedPane).length, 2, 'One local windshield correction');
const baseline = process.env.MILLOS_JOCKEY_BASELINE_SOURCE
  ? fs.readFileSync(process.env.MILLOS_JOCKEY_BASELINE_SOURCE, 'utf8')
  : source.replace(correctedPane, oldPane);
const geometries = new Set();
const AST = (text) =>
  ts.createSourceFile('TruckBay.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expr = (text) => new Function('Math', 'return (' + text + ');')(Math);
const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x == null || x === false ? [] : [x]);
function transform(p = {}) {
  const r = typeof p.rotation === 'number' ? [0, p.rotation, 0] : (p.rotation ?? [0, 0, 0]);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(p.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
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
            : expr(p.initializer.expression.getText(a)),
      ];
    })
  );
}
function declaration(text) {
  const a = AST(text);
  assert.equal(a.parseDiagnostics.length, 0);
  const n = a.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) => d.name.getText(a) === 'YardJockey')
  );
  assert(n);
  return n.getText(a);
}
function consumers(text) {
  const a = AST(text),
    out = [];
  function visit(n) {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(a) === 'YardJockey') {
      const groups = [];
      for (let p = n.parent; p; p = p.parent)
        if (ts.isJsxElement(p) && p.openingElement.tagName.getText(a) === 'group')
          groups.unshift(p.openingElement);
      const parent = new THREE.Matrix4();
      groups.forEach((g) => parent.multiply(transform(attributes(g, a))));
      out.push({
        props: attributes(n, a),
        parent,
        source: n.getText(a),
        ancestors: groups.map((g) => g.getText(a)),
      });
    }
    ts.forEachChild(n, visit);
  }
  visit(a);
  assert.equal(out.length, 2);
  return out;
}
const Boundary = 'boundary',
  Body = 'body',
  Text = 'text';
const element = (type, props, ...children) => ({
  type,
  props: { ...props, children: children.length ? children : props?.children },
});
const React = { createElement: element, Fragment: 'fragment' };
function component(text) {
  const js = ts.transpileModule(declaration(text) + '\nreturn YardJockey;', {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return new Function(
    'React',
    'THREE',
    'useRef',
    'useEffect',
    'GeneratedBoundary',
    'GeneratedModel',
    'Text',
    js
  )(
    React,
    THREE,
    (v) => ({ current: v }),
    () => {},
    Boundary,
    Body,
    Text
  );
}
const pathsSource = fs.readFileSync(path.join(root, 'src/utils/modelLoader.ts'), 'utf8');
const pa = ts.createSourceFile('modelLoader.ts', pathsSource, ts.ScriptTarget.Latest, true);
const pathStatement = pa.statements.find(
  (n) =>
    ts.isVariableStatement(n) &&
    n.declarationList.declarations.some((d) => d.name.getText(pa) === 'GENERATED_ASSET_PATHS')
);
assert(pathStatement);
const pathsJS = ts.transpileModule(
  pathStatement.getText(pa).replace(/^export\s+/, '') + '\nreturn GENERATED_ASSET_PATHS;',
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }
).outputText;
const paths = new Function('BASE', pathsJS)('');
const bodyBytes = fs.readFileSync(
  path.join(root, 'public', paths.yardJockeyBody.replace(/^\//, ''))
);
const doc = await new NodeIO().readBinary(bodyBytes),
  delivered = [];
assert.equal(doc.getRoot().listSkins().length, 0);
assert.equal(doc.getRoot().listAnimations().length, 0);
for (const node of doc.getRoot().listNodes())
  for (const p of node.getMesh()?.listPrimitives() ?? []) {
    const positions = p.getAttribute('POSITION'),
      g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        Array.from({ length: positions.getCount() }, (_, i) => positions.getElement(i, [])).flat(),
        3
      )
    );
    const index = p.getIndices();
    if (index) g.setIndex(Array.from({ length: index.getCount() }, (_, i) => index.getScalar(i)));
    geometries.add(g);
    delivered.push({
      geometry: g,
      matrix: new THREE.Matrix4().fromArray(node.getWorldMatrix()),
    });
  }
function triangles(g, matrix) {
  const p = g.getAttribute('position'),
    idx = g.index;
  return Array.from({ length: (idx?.count ?? p.count) / 3 }, (_, i) =>
    [0, 1, 2].map((k) =>
      new THREE.Vector3()
        .fromBufferAttribute(p, idx ? idx.getX(i * 3 + k) : i * 3 + k)
        .applyMatrix4(matrix)
    )
  );
}
function inspect(text, consumer, mode) {
  const result = { body: [], panes: [], labels: [], others: [] };
  function walk(n, parent, inBody = false, owners = []) {
    if (Array.isArray(n)) {
      n.forEach((x) => walk(x, parent, inBody, owners));
      return;
    }
    if (!n || typeof n !== 'object') return;
    const p = n.props ?? {},
      matrix = parent.clone().multiply(transform(p));
    if (n.type === Boundary) {
      walk(mode === 'loaded' ? p.children : p.fallback, parent, true, owners);
      return;
    }
    if (n.type === Body) {
      assert.equal(p.asset, 'yardJockeyBody');
      for (const d of delivered)
        result.body.push(...triangles(d.geometry, matrix.clone().multiply(d.matrix)));
      return;
    }
    if (n.type === Text) {
      result.labels.push({
        text: flat(p.children).join(''),
        props: p,
        matrix: matrix.toArray(),
        owners,
      });
      return;
    }
    if (n.type === 'mesh') {
      const children = flat(p.children),
        geo = children.find((c) => typeof c?.type === 'string' && c.type.endsWith('Geometry')),
        mat = children.find((c) => c?.type === 'meshStandardMaterial');
      assert(geo && mat);
      const ctor = geo.type[0].toUpperCase() + geo.type.slice(1);
      const g = new THREE[ctor](...geo.props.args);
      geometries.add(g);
      const record = {
        kind: ctor,
        args: geo.props.args,
        material: mat.props,
        triangles: triangles(g, matrix),
        matrix,
        owners,
      };
      if (inBody) result.body.push(...record.triangles);
      else if (ctor === 'PlaneGeometry') result.panes.push(record);
      else result.others.push(record);
      return;
    }
    const next = p.ref ? [...owners, p.ref] : owners;
    walk(p.children, matrix, inBody, next);
  }
  walk(component(text)(consumer.props), consumer.parent);
  assert.equal(result.panes.length, 1);
  return result;
}
const actualConsumers = consumers(source);
const cases = actualConsumers.flatMap((consumer, i) =>
  ['loaded', 'fallback'].map((mode) => ({
    consumerIndex: i,
    mode,
    consumer,
    actual: inspect(source, consumer, mode),
  }))
);
function areaXY(t) {
  return (
    Math.abs((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y)) / 2
  );
}
function insideXY(p, t, epsilon = 1e-6) {
  const signs = t.map((a, i) => {
    const b = t[(i + 1) % 3];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  });
  return signs.every((s) => s >= -epsilon) || signs.every((s) => s <= epsilon);
}
function contact(actual) {
  const pane = actual.panes[0],
    inverse = pane.matrix.clone().invert(),
    body = actual.body.map((t) => t.map((p) => p.clone().applyMatrix4(inverse))),
    corners = pane.triangles.flat().map((p) => p.clone().applyMatrix4(inverse));
  const front = body.filter((t) => t.every((p) => Math.abs(p.z + 0.01) < 2e-6) && areaXY(t) > 1e-5);
  return { front, corners, area: front.reduce((n, t) => n + areaXY(t), 0) };
}
for (const c of cases)
  test(`windshield clears and fits actual ${c.mode} front at consumer ${c.consumerIndex}`, () => {
    const proof = contact(c.actual);
    assert.equal(proof.front.length, 2, 'Two real front face triangles required');
    assert(Math.abs(proof.area - 3.2) < 2e-5, 'Complete 2 x 1.6 cab face required');
    for (const corner of proof.corners) {
      assert(Math.abs(corner.z) < 1e-6);
      assert(
        proof.front.some((t) => insideXY(corner, t)),
        'Pane corner must lie within actual face triangles'
      );
      for (const triangle of proof.front)
        assert(
          triangle.every((p) => p.z < -0.00999),
          'Opaque front face must stay behind every pane corner'
        );
    }
    const ys = proof.front.flat().map((p) => p.y),
      xs = proof.front.flat().map((p) => p.x);
    assert(Math.abs(Math.max(...ys) - 0.55) < 2e-6);
    assert(Math.abs(Math.min(...ys) + 1.05) < 2e-6);
    assert(Math.abs(Math.min(...xs) + 1) < 2e-6 && Math.abs(Math.max(...xs) - 1) < 2e-6);
  });
test('both current source callers retain actual yard ancestors and front direction', () => {
  const anchors = actualConsumers.map((c) =>
    new THREE.Vector3().applyMatrix4(c.parent.clone().multiply(transform(c.props))).toArray()
  );
  assert.deepEqual(anchors, [
    [-35, 0, 90],
    [35, 0, -92],
  ]);
  for (const c of cases) {
    const pane = c.actual.panes[0],
      normal = new THREE.Vector3(0, 0, 1).transformDirection(pane.matrix);
    assert(Math.abs(normal.y) < 1e-8);
    assert(Math.abs(normal.x - (c.consumerIndex === 0 ? 1 : -1)) < 1e-8);
    assert.equal(pane.owners.length, 1);
    assert.equal(c.actual.labels.length, 1);
    assert.equal(c.actual.labels[0].text, 'YARD');
    assert.equal(c.actual.labels[0].owners[0], pane.owners[0]);
    assert.equal(c.actual.others.length, 1);
    assert.equal(c.actual.others[0].owners[0], pane.owners[0]);
  }
});
test('pane dimensions/material and whole-parent source ownership remain local', () => {
  const s = declaration(source);
  assert.match(s, /const jockeyRef = useRef<THREE.Group>\(null\)/);
  assert.match(s, /<group ref=\{jockeyRef\} rotation=\{\[0, Math.PI \/ 2, 0\]\}>/);
  assert.match(s, /jockeyRef\.current\.position\.x = Math\.sin\(time \* 0\.15\) \* 8/);
  assert.match(s, /registerAnimation\(id, 'custom', null, \{\}, \(time\) =>/);
  assert.match(s, /return \(\) => unregisterAnimation\(id\)/);
  for (const c of cases) {
    const p = c.actual.panes[0];
    assert.deepEqual(p.args, [1.7, 1]);
    assert.equal(p.material.color, '#1e3a5f');
    assert.equal(p.material.metalness, 0.9);
    assert.equal(p.material.roughness, 0.1);
    assert.equal(p.material.transparent, undefined);
    assert.equal(p.material.opacity, undefined);
    assert.equal(p.material.side, undefined);
    assert.equal(p.material.map, undefined);
    assert.equal(p.material.alphaMap, undefined);
    const beacon = c.actual.others[0];
    assert.deepEqual(beacon.args, [0.1, 0.1, 0.15, 8]);
    assert.equal(beacon.material.emissive, '#f97316');
  }
});
if (baseline)
  test('original placement demonstrates the buried pane and unchanged non-pane resources', () => {
    const oldConsumers = consumers(baseline);
    assert.deepEqual(
      oldConsumers.map((c) => ({
        props: c.props,
        parent: c.parent.toArray(),
        ancestors: c.ancestors,
      })),
      actualConsumers.map((c) => ({
        props: c.props,
        parent: c.parent.toArray(),
        ancestors: c.ancestors,
      }))
    );
    for (const c of cases) {
      const old = inspect(baseline, oldConsumers[c.consumerIndex], c.mode),
        now = c.actual;
      assert.deepEqual(old.body, now.body);
      assert.deepEqual(
        old.labels.map((x) => ({ props: x.props, matrix: x.matrix })),
        now.labels.map((x) => ({ props: x.props, matrix: x.matrix }))
      );
      assert.deepEqual(
        old.others.map((x) => ({
          args: x.args,
          material: x.material,
          triangles: x.triangles,
        })),
        now.others.map((x) => ({
          args: x.args,
          material: x.material,
          triangles: x.triangles,
        }))
      );
      assert.deepEqual(old.panes[0].args, now.panes[0].args);
      assert.deepEqual(old.panes[0].material, now.panes[0].material);
      assert.equal(old.panes[0].triangles.length, now.panes[0].triangles.length);
      const inverse = now.panes[0].matrix.clone().invert(),
        oldPoints = old.panes[0].triangles.flat().map((p) => p.clone().applyMatrix4(inverse));
      assert(
        oldPoints.every((p) => p.z < -0.06),
        'Every original corner lies behind the corrected face plane'
      );
      assert(
        oldPoints.some((p) => p.y > 0.55),
        'Original upper edge protrudes above the actual roof'
      );
    }
  });
after(() => {
  for (const g of geometries) g.dispose();
});
