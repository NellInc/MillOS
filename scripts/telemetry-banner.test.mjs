// @vitest-environment node
/** Fixed full-chain delivery and source-owned mounting contract; no rendering. */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import {
  SPEC,
  deriveBanner,
  bannerOwnership,
  inspect,
  hash,
  assertCurrentOutput,
  composeFinalReceipt,
  assertFinalReceipt,
} from './refine-telemetry-banner.mjs';
import { derive as deriveAntenna, SPEC as ANTENNA } from './refine-telemetry-antenna.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file));
const original = read('src/test/fixtures/yard-telemetry-body.baseline.glb');
const intermediate = read('src/test/fixtures/yard-telemetry-body.antenna-seated.glb');
const published = read('public/models/world/yard-telemetry-body.glb');
const finalRow = JSON.parse(read('src/test/fixtures/telemetry-normalization.final.json'));
const near = (a, b, why) => assert(Math.abs(a - b) < 1e-6, why);

function literal(n) {
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(literal);
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken)
    return -literal(n.operand);
  if (ts.isStringLiteral(n)) return n.text;
  throw Error('Unanticipated literal in scoped banner JSX');
}
function props(open) {
  const result = {};
  for (const a of open.attributes.properties) {
    assert(ts.isJsxAttribute(a));
    const name = a.name.text;
    if (!a.initializer) result[name] = true;
    else
      result[name] = ts.isJsxExpression(a.initializer)
        ? literal(a.initializer.expression)
        : literal(a.initializer);
  }
  return result;
}
function children(node, tag) {
  return node.children.filter(
    (n) =>
      (ts.isJsxElement(n) && n.openingElement.tagName.getText() === tag) ||
      (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === tag)
  );
}
function open(n) {
  return ts.isJsxElement(n) ? n.openingElement : n;
}
function boxBounds(args, position) {
  const geometry = new THREE.BoxGeometry(...args);
  geometry.translate(...position);
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  const result = { min: b.min.toArray(), max: b.max.toArray() };
  geometry.dispose();
  return result;
}

function sourceBanner(source) {
  const ast = ts.createSourceFile(
    'TruckBay.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  assert.equal(ast.parseDiagnostics.length, 0, 'Candidate JSX parse failed');
  const declaration = ast.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'FleetTelemetryHub'
      )
  );
  assert(declaration);
  const groups = [],
    walls = [];
  // Select by literal leading coordinates before reading the selected value.
  // Other JSX includes positions such as [x, 1.62, 3.12]; never evaluate them.
  const startsAt = (array, x, y) =>
    array.elements.length === 3 &&
    ts.isNumericLiteral(array.elements[0]) &&
    Number(array.elements[0].text) === x &&
    ts.isNumericLiteral(array.elements[1]) &&
    Number(array.elements[1].text) === y;
  function visit(n) {
    if (ts.isJsxElement(n) && ['group', 'mesh'].includes(n.openingElement.tagName.getText(ast))) {
      const a = n.openingElement.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.text === 'position'
      );
      if (
        a?.initializer &&
        ts.isJsxExpression(a.initializer) &&
        ts.isArrayLiteralExpression(a.initializer.expression)
      ) {
        const value = a.initializer.expression,
          tag = n.openingElement.tagName.getText(ast);
        if (tag === 'group' && startsAt(value, 0, 3.5))
          groups.push({ n, position: literal(value) });
        if (tag === 'mesh' && startsAt(value, 0, 2)) walls.push({ n, position: literal(value) });
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(declaration);
  assert.equal(groups.length, 2, 'Both separate banner parents must be present');
  assert.equal(walls.length, 1, 'Exactly one selected telemetry wall mesh required');
  assert.deepEqual(walls[0].position, [0, 2, 0]);
  const wallArgs = props(open(children(walls[0].n, 'boxGeometry')[0])).args;
  assert.deepEqual(wallArgs, [8, 4, 6], 'Telemetry wall dimensions changed');
  const boardGroup = groups.find(({ n }) => children(n, 'mesh').length === 1);
  const captionGroup = groups.find(({ n }) => children(n, 'Text').length === 1);
  assert(boardGroup && captionGroup);
  const mesh = children(boardGroup.n, 'mesh')[0];
  assert.deepEqual(props(open(mesh)), {}, 'Fallback board mesh acquired a transform or behavior');
  const box = children(mesh, 'boxGeometry')[0],
    material = children(mesh, 'meshStandardMaterial')[0];
  const args = props(open(box)).args;
  assert.deepEqual(args, [4.8, 0.65, 0.12]);
  assert.deepEqual(props(open(material)), { color: '#0c4a6e', roughness: 0.45, metalness: 0.3 });
  const text = children(captionGroup.n, 'Text')[0],
    textProps = props(open(text));
  assert.deepEqual(textProps, {
    position: [0, 0, 0.07],
    fontSize: 0.24,
    color: '#ecfeff',
    anchorX: 'center',
  });
  const caption = text.children
    .filter(ts.isJsxText)
    .map((n) => n.text)
    .join('')
    .trim();
  assert.equal(caption, 'FLEET TELEMETRY');
  return {
    boardPosition: boardGroup.position,
    captionGroupPosition: captionGroup.position,
    boardBounds: boxBounds(args, boardGroup.position),
    wallBounds: boxBounds(wallArgs, walls[0].position),
    textProps,
    caption,
    captionPosition: captionGroup.position.map((v, k) => v + textProps.position[k]),
    sourceComponentSHA256: hash(declaration.getText(ast)),
  };
}

test('historical antenna intermediate remains exact and full two-stage chain reproduces published delivery', () => {
  const antenna = deriveAntenna(original);
  assert.equal(hash(intermediate), ANTENNA.output);
  assert.deepEqual(antenna.bytes, intermediate);
  assert.deepEqual(antenna.receipt, finalRow.geometryRefinement.stages.antenna);
  assert.equal(antenna.receipt.bannerAndAllNonAntennaPositionsExact, true);
  const banner = deriveBanner(antenna.bytes);
  assert.deepEqual(banner.bytes, published);
  assert.equal(hash(published), SPEC.output);
  assert.equal(published.length, SPEC.outputBytes);
  assert.deepEqual(banner.receipt, finalRow.geometryRefinement.stages.banner);
  const receipt = composeFinalReceipt(antenna.receipt, banner.receipt);
  assert.deepEqual(receipt, finalRow.geometryRefinement);
  assertFinalReceipt(receipt);
  assert.equal(finalRow.outputSha256, SPEC.output);
  assert.equal(finalRow.outputBytes, SPEC.outputBytes);
});

test('banner stage is deterministic and rejects wrong, pre-antenna, repeat and caller-selected inputs', () => {
  const first = deriveBanner(intermediate),
    second = deriveBanner(intermediate);
  assert.deepEqual(first, second);
  assert.throws(() => deriveBanner(original), /accepted post-antenna/);
  assert.throws(() => deriveBanner(first.bytes), /accepted post-antenna/);
  const wrong = Buffer.from(intermediate);
  wrong[wrong.length - 1] ^= 1;
  assert.throws(() => deriveBanner(wrong), /accepted post-antenna/);
  for (const options of [{ deltaZ: 0 }, { deltaZ: -0.2 }, { vertices: [] }])
    assert.throws(() => deriveBanner(intermediate, options), /Caller-selected/);
});

test('twelve complete banner triangles alone own twenty-four modified position-Z entries', () => {
  const result = deriveBanner(intermediate),
    before = inspect(intermediate),
    after = inspect(result.bytes);
  assert.deepEqual(result.receipt.translatedTriangleIds, [
    0,
    1,
    ...Array.from({ length: 10 }, (_, i) => i + 122),
  ]);
  assert.deepEqual(result.receipt.translatedVertexIds, [
    0,
    1,
    2,
    3,
    ...Array.from({ length: 20 }, (_, i) => i + 208),
  ]);
  const allowed = new Set(),
    p = before.meshes[0].position;
  for (const i of result.receipt.translatedVertexIds)
    for (let k = 0; k < 4; k++) allowed.add(p.start + i * p.stride + 8 + k);
  assert.equal(before.binary.length, after.binary.length);
  for (let i = 0; i < before.binary.length; i++)
    if (!allowed.has(i))
      assert.equal(after.binary[i], before.binary[i], 'Unrelated binary byte ' + i);
  const restored = structuredClone(after.json);
  restored.accessors[3].min[2] = before.json.accessors[3].min[2];
  restored.accessors[3].max[2] = before.json.accessors[3].max[2];
  assert.deepEqual(restored, before.json);
  for (let i = 100; i <= 207; i++)
    assert.deepEqual(after.meshes[0].local[i], before.meshes[0].local[i]);
  assert.deepEqual(after.bounds, before.bounds);
  assert.equal(result.receipt.changedPositionBytes, 72);
});

test('current-output guard accepts only known delivery lineage and the reviewed final candidate', () => {
  for (const current of [original, intermediate, published])
    assertCurrentOutput(current, published);
  for (const wrongCandidate of [original, intermediate])
    assert.throws(() => assertCurrentOutput(published, wrongCandidate), /not the reviewed/);
  const bad = Buffer.from(published);
  bad[bad.length - 1] ^= 1;
  assert.throws(() => assertCurrentOutput(bad, published), /current delivery/);
});

test('exact receipt guards retain historical scope and reject false banner or final claims', () => {
  const good = finalRow.geometryRefinement;
  assertFinalReceipt(good);
  for (const change of [
    (r) => (r.stages.antenna.bannerAndAllNonAntennaPositionsExact = false),
    (r) => (r.stages.antenna.outputSha256 = SPEC.output),
    (r) => (r.stages.banner.wallOverlapMetres = 0),
    (r) => (r.stages.banner.translatedVertexIds[0] = 99),
    (r) => (r.stages.banner.antennaPositionEntriesExact = false),
    (r) => (r.outputSha256 = ANTENNA.output),
    (r) => (r.actualFinalBounds.max[1] = 7.6),
    (r) => (r.unexpected = true),
  ]) {
    const row = structuredClone(good);
    change(row);
    assert.throws(() => assertFinalReceipt(row), /Stale or inconsistent/);
  }
  const badStage = structuredClone(good.stages.banner);
  badStage.deltaZ = -0.14;
  assert.throws(() => composeFinalReceipt(good.stages.antenna, badStage), /banner receipt changed/);
  // JSON member ordering does not weaken or invalidate semantic equality.
  const reordered = Object.fromEntries(Object.entries(good).reverse());
  assertFinalReceipt(reordered);
});

test('actual loaded and fallback boards share wall overlap and caption offset at the sole live consumer', () => {
  const source = read('src/components/TruckBay.tsx').toString(),
    fallback = sourceBanner(source);
  assert.deepEqual(fallback.boardPosition, [0, 3.5, 3.05]);
  assert.deepEqual(fallback.captionGroupPosition, fallback.boardPosition);
  const loaded = inspect(published),
    ownership = bannerOwnership(loaded, SPEC.boundsAfter);
  for (const side of ['min', 'max'])
    for (let k = 0; k < 3; k++)
      near(fallback.boardBounds[side][k], ownership.bounds[side][k], 'Loaded/fallback parity');
  near(fallback.captionPosition[2] - ownership.bounds.max[2], 0.01, 'Loaded caption face offset');
  near(
    fallback.captionPosition[2] - fallback.boardBounds.max[2],
    0.01,
    'Fallback caption face offset'
  );
  near(fallback.wallBounds.max[2] - fallback.boardBounds.min[2], 0.01, 'Fallback wall mount');
  const wall = loaded.meshes[1].points;
  near(Math.max(...wall.map((p) => p[2])) - ownership.bounds.min[2], 0.01, 'Loaded wall mount');
  near(fallback.boardBounds.min[1] - 2.85, 0.325, 'Lower server clearance');
  near(4 - fallback.boardBounds.max[1], 0.175, 'Roof underside clearance');
  assert.equal((source.match(/<FleetTelemetryHub\s/g) ?? []).length, 1);
  assert.equal((source.match(/asset="yardTelemetryBody"/g) ?? []).length, 1);
  const site = read('src/constants/siteLayout.ts').toString();
  assert.match(
    site,
    /fleetTelemetryHub:\s*\{\s*id:\s*'fleet-telemetry-hub',\s*position:\s*\[42, 0, 75\],\s*rotation:\s*-Math\.PI \/ 2,/
  );
  const world = new THREE.Matrix4().compose(
    new THREE.Vector3(42, 0, 75),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)),
    new THREE.Vector3(1, 1, 1)
  );
  const board = new THREE.Box3(
    new THREE.Vector3(...fallback.boardBounds.min),
    new THREE.Vector3(...fallback.boardBounds.max)
  ).applyMatrix4(world);
  near(board.min.x, 38.89, 'Inward face world X');
  near(board.max.x, 39.01, 'Wall overlap world X');
  near(board.min.z, 72.6, 'Unchanged lateral bound');
  near(board.max.z, 77.4, 'Unchanged lateral bound');
  assert(board.min.x > 38.7 && board.max.x < 45.3);
});
