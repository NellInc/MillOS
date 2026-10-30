// @vitest-environment node
// Actual source/GLB/native-font face-alignment regression; no renderer or lifecycle simulation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, test } from 'vitest';

async function computeScaleFaceProof() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const require = createRequire(path.join(root, 'package.json'));
  const THREE = require('three'),
    React = require('react'),
    ts = require('typescript');
  const { NodeIO } = require('@gltf-transform/core');
  const sourcePath = path.resolve(
    root,
    process.env.MILLOS_SCALE_SOURCE || 'src/components/TruckBay.tsx'
  );
  const source = fs.readFileSync(sourcePath, 'utf8');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const ast = (text) =>
    ts.createSourceFile('source.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function declaration(text, name) {
    const a = ast(text);
    for (const n of a.statements) {
      if (ts.isFunctionDeclaration(n) && n.name?.text === name)
        return n.getText(a).replace(/^export\s+/, '');
      if (ts.isVariableStatement(n)) {
        const d = n.declarationList.declarations.find((d) => d.name.getText(a) === name);
        if (d) return 'const ' + d.getText(a) + ';';
      }
    }
    throw Error('Missing source declaration: ' + name);
  }
  function evaluate(code, bindings, result) {
    const js = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    }).outputText;
    return new Function(...Object.keys(bindings), js + '\nreturn ' + result + ';')(
      ...Object.values(bindings)
    );
  }
  const constants = evaluate(
    ['SHIPPING_SCALE_WEIGHT_KG', 'RECEIVING_SCALE_WEIGHT_KG', 'formatScaleWeight']
      .map((n) => declaration(source, n))
      .join('\n'),
    {},
    '{SHIPPING_SCALE_WEIGHT_KG, RECEIVING_SCALE_WEIGHT_KG, formatScaleWeight}'
  );
  const a = ast(source),
    callers = [];
  function visit(n) {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(a) === 'WeightScale') {
      const attr = n.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.text === 'weightKg'
      );
      assert(attr && ts.isJsxExpression(attr.initializer) && attr.initializer.expression);
      const expression = attr.initializer.expression.getText(a);
      callers.push({ expression, weightKg: evaluate('', constants, expression) });
    }
    ts.forEachChild(n, visit);
  }
  visit(a);
  assert.deepEqual(
    callers.map((c) => c.weightKg),
    [38460, 41920]
  );
  const polygonOffset = evaluate(
    declaration(read('src/constants/renderLayers.ts'), 'POLYGON_OFFSET'),
    {},
    'POLYGON_OFFSET'
  );
  function TextMarker() {
    throw Error('Text is inspected, never mounted');
  }
  function BodyMarker() {
    throw Error('Body marker is inspected, never mounted');
  }
  function BoundaryMarker() {
    throw Error('Boundary is inspected, never mounted');
  }
  const fixture = evaluate(
    declaration(source, 'WeightScale'),
    {
      React,
      THREE,
      Text: TextMarker,
      GeneratedModel: BodyMarker,
      GeneratedBoundary: BoundaryMarker,
      POLYGON_OFFSET: polygonOffset,
      formatScaleWeight: constants.formatScaleWeight,
      useRef: (value) => ({ current: value }),
      useEffect: () => {},
    },
    'WeightScale'
  );
  const geometries = new Set();
  const selfDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const near = (actual, expected, message) =>
    assert(Math.abs(actual - expected) <= 3e-6, `${message}: ${actual} vs ${expected}`);
  function transform(p) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.position || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation || [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1)
    );
  }
  function triangles(g, m) {
    const p = g.getAttribute('position'),
      ix = g.getIndex();
    return Array.from({ length: (ix?.count || p.count) / 3 }, (_, i) =>
      [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, ix ? ix.getX(i * 3 + k) : i * 3 + k)
          .applyMatrix4(m)
      )
    );
  }
  const normal = (t) => t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])).normalize();
  const bounds = (ts) => new THREE.Box3().setFromPoints(ts.flat());
  const boxJSON = (b) => ({ min: b.min.toArray(), max: b.max.toArray() });
  try {
    const assets = evaluate(
      declaration(read('src/utils/modelLoader.ts'), 'GENERATED_ASSET_PATHS'),
      { BASE: '' },
      'GENERATED_ASSET_PATHS'
    );
    const modelPath = path.join(root, 'public', assets.yardWeightScaleBody.replace(/^\//, ''));
    const doc = await new NodeIO().read(modelPath);
    assert.equal(doc.getRoot().listSkins().length, 0);
    assert.equal(doc.getRoot().listAnimations().length, 0);
    const delivered = [];
    for (const n of doc.getRoot().listNodes())
      for (const p of n.getMesh()?.listPrimitives() || []) {
        const positions = p.getAttribute('POSITION');
        const g = new THREE.BufferGeometry();
        geometries.add(g);
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            Array.from({ length: positions.getCount() }, (_, i) =>
              positions.getElement(i, [])
            ).flat(),
            3
          )
        );
        const ix = p.getIndices();
        if (ix) g.setIndex(Array.from(ix.getArray()));
        delivered.push({ geometry: g, matrix: new THREE.Matrix4().fromArray(n.getWorldMatrix()) });
      }
    function inspect(weightKg, mode) {
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
          assert.equal(p.asset, 'yardWeightScaleBody');
          for (const d of delivered)
            result.meshes.push({
              body: true,
              triangles: triangles(d.geometry, matrix.clone().multiply(d.matrix)),
            });
          return;
        }
        if (node.type === 'mesh') {
          let geometry, material;
          for (const c of [p.children].flat(Infinity)) {
            if (!React.isValidElement(c)) continue;
            if (typeof c.type === 'string' && c.type.endsWith('Geometry')) {
              const name = c.type[0].toUpperCase() + c.type.slice(1);
              assert(['BoxGeometry', 'PlaneGeometry', 'RingGeometry'].includes(name));
              geometry = new THREE[name](...c.props.args);
              geometries.add(geometry);
            }
            if (c.type === 'meshStandardMaterial') material = c.props;
          }
          assert(geometry && material);
          result.meshes.push({
            body,
            material,
            props: p,
            matrix,
            triangles: triangles(geometry, matrix),
          });
          return;
        }
        walk(p.children, matrix, body);
      }
      walk(fixture({ position: [0, 0, 0], rotation: 0, weightKg }), new THREE.Matrix4());
      return result;
    }
    const fallback = inspect(callers[0].weightKg, 'fallback');
    const loaded = inspect(callers[0].weightKg, 'loaded');
    const select = (scene, color) => {
      const found = scene.meshes.filter((m) => m.material?.color === color);
      assert.equal(found.length, 1, 'Unique source mesh ' + color);
      return found[0];
    };
    function westFace(mesh) {
      const b = bounds(mesh.triangles);
      const face = mesh.triangles.filter(
        (t) => t.every((p) => Math.abs(p.x - b.min.x) < 3e-6) && normal(t).x < -0.999999
      );
      assert.equal(face.length, 2);
      return face;
    }
    function loadedMatches(face) {
      const all = loaded.meshes.filter((m) => m.body).flatMap((m) => m.triangles);
      return face.map((t) => {
        const matches = all.filter(
          (other) =>
            t.every((p) => other.some((q) => p.distanceTo(q) < 3e-6)) &&
            other.every((p) => t.some((q) => p.distanceTo(q) < 3e-6))
        );
        assert.equal(matches.length, 1, 'Loaded triangle matches actual fallback face');
        assert(normal(matches[0]).x < -0.999999, 'Loaded winding faces west');
        return matches[0];
      });
    }
    const hut = select(fallback, '#e2e8f0'),
      backing = select(fallback, '#1f2937');
    const sourceFaces = { hut: westFace(hut), backing: westFace(backing) };
    const deliveredFaces = {
      hut: loadedMatches(sourceFaces.hut),
      backing: loadedMatches(sourceFaces.backing),
    };
    const window = select(fallback, '#1e3a5f'),
      display = select(fallback, '#22c55e');
    assert.deepEqual(window.props.rotation, [0, -Math.PI / 2, 0]);
    assert.deepEqual(display.props.rotation, [0, -Math.PI / 2, 0]);
    for (const mesh of [window, display])
      for (const t of mesh.triangles) assert(normal(t).x < -0.999999);
    function faceProof(face, plane, expected) {
      const b = bounds(face),
        p = bounds(plane.triangles);
      const result = {
        faceBounds: boxJSON(b),
        planeBounds: boxJSON(p),
        normal: normal(plane.triangles[0]).toArray(),
        standoff: b.min.x - p.min.x,
        margins: {
          zMin: p.min.z - b.min.z,
          zMax: b.max.z - p.max.z,
          yMin: p.min.y - b.min.y,
          yMax: b.max.y - p.max.y,
        },
      };
      near(result.standoff, 0.01, 'Face standoff');
      for (const key of Object.keys(expected))
        near(result.margins[key], expected[key], key + ' margin');
      return result;
    }
    const faces = Object.fromEntries(
      [
        ['fallback', sourceFaces],
        ['loaded', deliveredFaces],
      ].map(([mode, f]) => [
        mode,
        {
          window: faceProof(f.hut, window, { zMin: 0.35, zMax: 0.35, yMin: 1.2, yMax: 0.6 }),
          display: faceProof(f.backing, display, { zMin: 0.1, zMax: 0.1, yMin: 0.05, yMax: 0.05 }),
        },
      ])
    );
    // The installed native Troika parser/Typesetter pattern from DumpsterLabelFixture.
    function libraryFunction(file, name) {
      const a = ast(read(file));
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
    if (!selfDescriptor)
      Object.defineProperty(globalThis, 'self', {
        configurable: true,
        writable: true,
        value: globalThis,
      });
    const sceneText = read('src/components/shared/SceneText.tsx');
    assert(
      sceneText.includes('fonts/Inter-Regular.ttf') &&
        sceneText.includes('font={font ?? DEFAULT_3D_FONT}')
    );
    const parser = libraryFunction(
      'node_modules/troika-three-text/src/FontParser.js',
      'parserFactory'
    )(
      libraryDefault('node_modules/troika-three-text/libs/typr.factory.js')(),
      libraryDefault('node_modules/troika-three-text/libs/woff2otf.factory.js')()
    );
    const fontBytes = fs.readFileSync(path.join(root, 'public/fonts/Inter-Regular.ttf'));
    const font = parser(
      fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength)
    );
    font.src = 'local-Inter-Regular.ttf';
    const typesetter = libraryFunction(
      'node_modules/troika-three-text/src/Typesetter.js',
      'createTypesetter'
    )(() => {
      throw Error('External font resolution forbidden');
    }, require('bidi-js')());
    const captions = callers.map((caller) => {
      const scene = inspect(caller.weightKg, 'fallback');
      const label = scene.labels.find(
        (l) => l.children === constants.formatScaleWeight(caller.weightKg)
      );
      assert(label);
      assert.deepEqual(label.position, [-1.38, 2.5, 0]);
      assert.deepEqual(label.rotation, [0, -Math.PI / 2, 0]);
      assert.equal(label.fontSize, 0.15);
      assert.equal(label.anchorX, 'center');
      assert.equal(label.anchorY, 'middle');
      assert.equal(label.color, '#000000');
      assert.equal(label.font, undefined);
      const inverse = label.matrix.clone().invert();
      const panel = bounds(
        display.triangles.map((t) => t.map((p) => p.clone().applyMatrix4(inverse)))
      );
      near(-panel.max.z, 0.02, 'Caption outward offset from green display');
      let layout;
      typesetter.typeset(
        {
          text: label.children,
          fontSize: label.fontSize,
          anchorX: label.anchorX,
          anchorY: label.anchorY,
          preResolvedFonts: { chars: new Uint8Array(label.children.length), fonts: [font] },
        },
        (r) => {
          layout = r;
        }
      );
      assert(layout, 'Native installed Typesetter completed');
      const glyphs = Array.from(layout.glyphIds)
        .map((id, i) => {
          const b = layout.glyphData[font.src][id].pathBounds,
            s = label.fontSize / font.unitsPerEm;
          const x = layout.glyphPositions[2 * i],
            y = layout.glyphPositions[2 * i + 1];
          return { id, bounds: [x + b[0] * s, y + b[1] * s, x + b[2] * s, y + b[3] * s] };
        })
        .filter((g) => g.bounds[2] > g.bounds[0] && g.bounds[3] > g.bounds[1]);
      assert(glyphs.length > 0);
      const extent = [
        Math.min(...glyphs.map((g) => g.bounds[0])),
        Math.min(...glyphs.map((g) => g.bounds[1])),
        Math.max(...glyphs.map((g) => g.bounds[2])),
        Math.max(...glyphs.map((g) => g.bounds[3])),
      ];
      const margins = {
        left: extent[0] - panel.min.x,
        right: panel.max.x - extent[2],
        bottom: extent[1] - panel.min.y,
        top: panel.max.y - extent[3],
      };
      const minimumMargin = Math.min(...Object.values(margins));
      assert(minimumMargin > 0, 'Every actual native glyph bound fits the green display');
      return {
        ...caller,
        text: label.children,
        fontSize: label.fontSize,
        outwardStandoff: -panel.max.z,
        glyphBounds: glyphs,
        glyphExtent: extent,
        margins,
        minimumMargin,
        contained: true,
      };
    });
    return {
      sourcePath,
      modelPath,
      coordinateSystem:
        'Scale-local metres, including the source hut offset and loaded origin restoration',
      evidence:
        'Actual JSX geometry, loaded GLB triangle positions/winding, installed Troika FontParser and Typesetter with bundled Inter-Regular.ttf',
      faces,
      captions,
      currentLiveWeightRangeKg: [38460, 41920],
      scope:
        'Two fixed source callers only; no universal formatter fit, lifecycle, renderer, or performance claim.',
    };
  } finally {
    for (const g of geometries) g.dispose();
    if (selfDescriptor) Object.defineProperty(globalThis, 'self', selfDescriptor);
    else delete globalThis.self;
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
  }
}

let proof;
beforeAll(async () => {
  proof = await computeScaleFaceProof();
});
const near = (a, b) => assert(Math.abs(a - b) < 3e-6, `${a} differs from ${b}`);
for (const mode of ['loaded', 'fallback']) {
  test(`${mode}: west-facing window lies 0.01 outside the hut with authored margins`, () => {
    const p = proof.faces[mode].window;
    near(p.normal[0], -1);
    near(p.standoff, 0.01);
    near(p.margins.zMin, 0.35);
    near(p.margins.zMax, 0.35);
    near(p.margins.yMin, 1.2);
    near(p.margins.yMax, 0.6);
  });
  test(`${mode}: landscape display lies 0.01 outside the backing with authored margins`, () => {
    const p = proof.faces[mode].display;
    near(p.normal[0], -1);
    near(p.standoff, 0.01);
    near(p.margins.zMin, 0.1);
    near(p.margins.zMax, 0.1);
    near(p.margins.yMin, 0.05);
    near(p.margins.yMax, 0.05);
  });
}
for (const text of ['38,460 KG', '41,920 KG']) {
  test(`${text}: unchanged native caption has positive glyph margins and 0.02 outward offset`, () => {
    const p = proof.captions.find((c) => c.text === text);
    assert(p);
    assert.equal(p.fontSize, 0.15);
    assert.equal(p.contained, true);
    assert(p.minimumMargin > 0);
    near(p.outwardStandoff, 0.02);
  });
}
test('audits exactly the two actual constant-valued WeightScale callers', () => {
  assert.deepEqual(
    proof.captions.map((c) => [c.expression, c.weightKg]),
    [
      ['SHIPPING_SCALE_WEIGHT_KG', 38460],
      ['RECEIVING_SCALE_WEIGHT_KG', 41920],
    ]
  );
});
