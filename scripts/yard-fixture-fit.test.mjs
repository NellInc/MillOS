// @vitest-environment node
/** Fixed yard geometry and actual-source fallback/contact regressions. No renderer. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { test } from 'vitest';
import {
  FIXTURES,
  derive,
  inspect,
  hash,
  assertSourceInputs,
  assertCurrentOutput,
} from './refine-yard-fixture-fit.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json')),
  ts = require('typescript'),
  THREE = require('three');
const bytes = (f) => fs.readFileSync(path.join(root, f));
const source = bytes('src/components/TruckBay.tsx').toString();
const near = (a, b) => Math.abs(a - b) < 0.000001;
function declaration(sourceText, name) {
  const ast = ts.createSourceFile(
    'TruckBay.tsx',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  for (const s of ast.statements)
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations)
        if (d.name.getText(ast) === name)
          return { text: d.getText(ast), start: d.getStart(ast), end: d.end };
  throw Error('Missing actual declaration ' + name);
}
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'fragment',
};
const Text = Symbol('Text'),
  GeneratedBoundary = Symbol('GeneratedBoundary'),
  GeneratedModel = Symbol('GeneratedModel');
function matrix(p = {}) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(p.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(
      ...(Array.isArray(p.scale) ? p.scale : [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1])
    )
  );
}
function capture(text, name) {
  const d = declaration(text, name);
  const js = ts.transpileModule('const ' + d.text + '; return ' + name + ';', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const component = new Function(
    'React',
    'THREE',
    'Text',
    'GeneratedBoundary',
    'GeneratedModel',
    'useRef',
    'useEffect',
    js
  )(
    React,
    THREE,
    Text,
    GeneratedBoundary,
    GeneratedModel,
    () => ({ current: null }),
    () => {}
  );
  const meshes = [],
    texts = [];
  function walk(n, parent) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach((x) => walk(x, parent));
      return;
    }
    if (typeof n !== 'object') return;
    const { type, props: p, children } = n;
    if (type === GeneratedBoundary) {
      walk(p.fallback, parent);
      return;
    }
    const world = parent.clone().multiply(matrix(p));
    if (type === Text) {
      texts.push({ text: children.flat(Infinity).join(''), props: p, matrix: world.toArray() });
      return;
    }
    if (type === 'mesh') {
      const shape = children.find(
        (c) => typeof c?.type === 'string' && c.type.endsWith('Geometry')
      );
      const material = children.find(
        (c) => typeof c?.type === 'string' && c.type.endsWith('Material')
      );
      assert(shape && material);
      const g = new THREE[shape.type[0].toUpperCase() + shape.type.slice(1)](
        ...shape.props.args
      ).applyMatrix4(world);
      g.computeBoundingBox();
      meshes.push({
        geometry: g,
        kind: shape.type,
        args: shape.props.args,
        material: material.props,
        matrix: world.toArray(),
        bounds: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()],
      });
      return;
    }
    walk(children, world);
  }
  walk(component({ position: [0, 0, 0], rotation: 0 }), new THREE.Matrix4());
  return { meshes, texts };
}

for (const [key, spec] of Object.entries(FIXTURES)) {
  const baseline = bytes('src/test/fixtures/' + spec.slug + '.baseline.glb');
  test(spec.slug + ': final-stage producer exactly reproduces reviewed public bytes', () => {
    assertSourceInputs(
      key,
      bytes('assets/source/models/world/' + spec.slug + '-tripo-original.glb'),
      bytes('assets/source/models/world/' + spec.slug + '-crafted-surface.glb')
    );
    const a = derive(baseline, key),
      b = derive(baseline, key);
    assert(a.bytes.equals(b.bytes));
    assert(a.bytes.equals(bytes('public/models/world/' + spec.slug + '.glb')));
    assert.equal(hash(a.bytes), spec.output);
    assert.equal(a.bytes.length, baseline.length);
    assert.equal(a.receipt.selectedTriangles, 12);
    assert.equal(a.receipt.changedTriangles, key === 'intercom' ? 10 : 12);
    assert.equal(a.receipt.changedVertices.length, key === 'intercom' ? 12 : 24);
    assert.equal(a.receipt.allOtherFileBytesExact, true);
    assert.equal(a.receipt.unchangedEnvelope, true);
    assert.deepEqual(inspect(a.bytes, key).j, inspect(baseline, key).j);
    assertCurrentOutput(key, baseline, a.bytes);
    assertCurrentOutput(key, a.bytes, a.bytes);
  });
  test(spec.slug + ': wrong, modified, derived or caller-selected inputs fail closed', () => {
    const a = derive(baseline, key),
      altered = Buffer.from(baseline);
    altered[altered.length - 1] ^= 1;
    assert.throws(() => derive(altered, key));
    assert.throws(() => derive(a.bytes, key));
    assert.throws(() => derive(baseline, key === 'intercom' ? 'tire' : 'intercom'));
    assert.throws(() => derive(baseline, key, { delta: 0 }));
    assert.throws(() => assertCurrentOutput(key, altered, a.bytes));
    assert.throws(() => assertSourceInputs(key, altered, altered));
  });
  test(spec.slug + ': report uses normalized delivery bounds, not restoration offsets', () => {
    const r = derive(baseline, key).receipt,
      b = r.actualFinalBounds;
    assert(near(b.min[1], 0));
    assert(near((b.min[0] + b.max[0]) / 2, 0));
    assert(near((b.min[2] + b.max[2]) / 2, 0));
    for (const side of ['min', 'max'])
      for (let axis = 0; axis < 3; axis++)
        assert(near(r.bounds[side][axis] - spec.offset[axis], b[side][axis]));
    assert(near(b.max[1] - b.min[1], key === 'intercom' ? 1.55 : 2.6));
  });
}
test('actual intercom fallback and loaded casing enclose the unchanged centered keypad', () => {
  const f = capture(source, 'IntercomCallBox'),
    loaded = derive(bytes('src/test/fixtures/yard-intercom-body.baseline.glb'), 'intercom').receipt;
  const casing = f.meshes.find(
    (m) => m.kind === 'boxGeometry' && JSON.stringify(m.args) === '[0.3,0.4675,0.15]'
  );
  assert(casing);
  for (let s = 0; s < 2; s++)
    for (let a = 0; a < 3; a++)
      assert(near(casing.bounds[s][a], loaded.afterBox[s ? 'max' : 'min'][a]));
  assert(near(casing.bounds[0][1], 1.0325));
  assert(near(casing.bounds[1][1], 1.5));
  assert(near(casing.bounds[0][2], 0.005));
  assert(near(casing.bounds[1][2], 0.155));
  const keys = f.meshes.filter(
    (m) => m.kind === 'boxGeometry' && JSON.stringify(m.args) === '[0.025,0.025,0.01]'
  );
  assert.equal(keys.length, 9);
  const centres = keys.map((m) => m.matrix.slice(12, 15));
  assert.deepEqual(
    centres.map((p) => p[0]),
    [-0.04, 0, 0.04, -0.04, 0, 0.04, -0.04, 0, 0.04]
  );
  for (let i = 0; i < 9; i++) {
    assert(near(centres[i][1], [1.14, 1.1, 1.06][Math.floor(i / 3)]));
    assert.equal(centres[i][2], 0.16);
  }
  for (const k of keys) {
    assert(k.bounds[0][1] > casing.bounds[0][1]);
    assert(k.bounds[1][1] < casing.bounds[1][1]);
    assert(near(k.bounds[0][2], casing.bounds[1][2]));
    assert(k.bounds[1][2] > casing.bounds[1][2]);
  }
  assert(near(Math.min(...keys.map((k) => k.bounds[0][1])) - casing.bounds[0][1], 0.015));
  assert.equal(f.texts.length, 1);
  assert.equal(f.texts[0].text, 'CALL FOR ENTRY');
  assert.deepEqual(f.texts[0].props.position, [0, 1.52, 0.17]);
  assert(
    !inspect(bytes('public/models/world/yard-intercom-body.glb'), 'intercom').j.materials[0]
      .pbrMetallicRoughness.baseColorTexture
  );
  const button = f.meshes.find((m) => m.material.color === '#ef4444');
  assert(button);
  assert(near(button.matrix[13], 1.2));
  assert(near(button.matrix[14], 0.16));
  const speaker = f.meshes.find(
    (m) => m.kind === 'circleGeometry' && JSON.stringify(m.args) === '[0.08,16]'
  );
  assert(speaker);
  assert(near(speaker.matrix[13], 1.35));
  const pole = f.meshes.find(
    (m) => m.kind === 'cylinderGeometry' && JSON.stringify(m.args) === '[0.05,0.06,1.5,8]'
  );
  assert(pole);
  assert(pole.bounds[1][2] > casing.bounds[0][2]);
  assert(pole.bounds[0][1] < casing.bounds[0][1]);
});
test('actual tire fallback, fixed post and both text planes preserve the mounted sign contract', () => {
  const f = capture(source, 'TireInspectionArea'),
    loaded = derive(
      bytes('src/test/fixtures/yard-tire-inspection-body.baseline.glb'),
      'tire'
    ).receipt;
  const board = f.meshes.find(
    (m) => m.kind === 'boxGeometry' && JSON.stringify(m.args) === '[1.2,0.6,0.05]'
  );
  assert(board);
  const pole = f.meshes.find(
    (m) => m.kind === 'cylinderGeometry' && JSON.stringify(m.args) === '[0.04,0.04,2.4,8]'
  );
  assert(pole);
  for (let s = 0; s < 2; s++)
    for (let a = 0; a < 3; a++)
      assert(near(board.bounds[s][a], loaded.afterBox[s ? 'max' : 'min'][a]));
  assert.deepEqual(pole.matrix.slice(12, 15), [3, 1.2, 0]);
  assert(near(pole.bounds[1][2] - board.bounds[0][2], 0.005));
  assert(
    near(
      Math.min(pole.bounds[1][1], board.bounds[1][1]) -
        Math.max(pole.bounds[0][1], board.bounds[0][1]),
      0.4
    )
  );
  assert.deepEqual(
    f.texts.map((t) => t.text),
    ['TIRE CHECK', 'REQUIRED']
  );
  for (let i = 0; i < 2; i++) {
    const t = f.texts[i];
    assert.deepEqual(t.props.position, [0, i === 0 ? 2.35 : 2.2, 0.09]);
    assert(near(t.matrix[14] - board.bounds[1][2], 0.005));
    assert(t.matrix[14] > pole.bounds[1][2]);
    assert.equal(t.props.fontSize, i === 0 ? 0.12 : 0.08);
    assert.equal(t.props.anchorX, 'center');
    assert.equal(t.props.anchorY, 'middle');
    assert.equal(t.props.depthOffset, undefined);
  }
  const deck = f.meshes.find(
    (m) => m.kind === 'boxGeometry' && JSON.stringify(m.args) === '[4,0.1,8]'
  );
  assert(deck);
  assert.deepEqual(deck.matrix.slice(12, 15), [0, 0.05, 0]);
});
