/** Offline, source-pinned gardener precinct trial. No runtime dependency or schedule mutation.
 * Input is actual visible world triangles exported by the existing art fixture.
 * node scripts/recast-pedestrian-trial.mjs --input=<capture.json> [--out=<directory>]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {
  init,
  exportNavMesh,
  importNavMesh,
  NavMeshQuery,
  getNavMeshPositionsAndIndices,
} from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';

const root = process.cwd();
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return [a.slice(2, i), a.slice(i + 1)];
  })
);
if (!args.input) throw new Error('Required: --input=<actual-world-triangles.json>');
const out = path.resolve(args.out ?? 'test-results/eq-tool-pilots-20261029/navigation');
const sha = (data) => createHash('sha256').update(data).digest('hex');
const sourcePaths = [
  'src/constants/communityLayout.ts',
  'src/constants/siteLayout.ts',
  'src/simulation/communityLife.ts',
  'src/components/scenery/VillageGardens.tsx',
  'src/components/VillageArea.tsx',
];
const sourceHashes = Object.fromEntries(sourcePaths.map((p) => [p, sha(readFileSync(p))]));
// Evaluate the existing pure layout modules, rather than copying authored coordinates.
const cache = new Map();
function loadPure(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`, {}, { filename: file })(
    (specifier) => {
      if (!specifier.startsWith('.'))
        throw new Error(`Unexpected pure layout dependency ${specifier}`);
      return loadPure(path.relative(root, path.resolve(path.dirname(file), specifier + '.ts')));
    },
    module,
    module.exports
  );
  return module.exports;
}
const layout = loadPure('src/constants/communityLayout.ts');
const life = readFileSync('src/simulation/communityLife.ts', 'utf8');
const ast = ts.createSourceFile('communityLife.ts', life, ts.ScriptTarget.Latest, true);
let actorText;
function visit(node) {
  if (
    ts.isObjectLiteralExpression(node) &&
    node.properties.some(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name.getText(ast) === 'id' &&
        ts.isStringLiteral(p.initializer) &&
        p.initializer.text === 'village-gardener'
    )
  )
    actorText = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
if (!actorText) throw new Error('Existing gardener schedule was not found');
const helpers = ['stop', 'via']
  .map((name) => {
    let declaration;
    function find(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
        declaration = node.getText(ast);
      ts.forEachChild(node, find);
    }
    find(ast);
    if (!declaration) throw new Error(`Source route helper missing: ${name}`);
    return `const ${declaration};`;
  })
  .join('\n');
const helperJs = ts.transpileModule(helpers, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeHelpers = vm.runInNewContext(`(function(){${helperJs}; return {stop,via};})()`);
const actor = vm.runInNewContext(`(${actorText})`, {
  A: layout.COMMUNITY_ANCHORS,
  COMMUNITY_ACTIVITY_HOURS: layout.COMMUNITY_ACTIVITY_HOURS,
  PI: Math.PI,
  ...routeHelpers,
});
const inputBytes = readFileSync(args.input);
const input = JSON.parse(inputBytes);
for (const p of sourcePaths) {
  if (input.sourceHashes?.[p] !== sourceHashes[p])
    throw new Error(`Capture missing/stale source pin: ${p}`);
}
const { positions, indices } = input;
if (
  !Array.isArray(positions) ||
  !Array.isArray(indices) ||
  positions.length % 3 ||
  indices.length % 3 ||
  !positions.every(Number.isFinite) ||
  !indices.every((i) => Number.isInteger(i) && i >= 0 && i < positions.length / 3)
)
  throw new Error('Invalid captured triangle arrays');
const roi = { minX: -220, maxX: -203, minZ: 7, maxZ: 14 };
const config = {
  cs: 0.05,
  ch: 0.02,
  walkableSlopeAngle: 35,
  walkableHeight: 90,
  walkableClimb: 4,
  walkableRadius: 6,
  minRegionArea: 4,
  mergeRegionArea: 12,
  maxEdgeLen: 100,
  maxSimplificationError: 0.5,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
  bounds: [
    [-220, -0.2, 7],
    [-203, 4, 14],
  ],
};
const radius = config.cs * config.walkableRadius;
const triangles = [];
for (let i = 0; i < indices.length; i += 3) {
  const vertices = indices
    .slice(i, i + 3)
    .map((index) => positions.slice(index * 3, index * 3 + 3));
  triangles.push(vertices);
}
// Clip obstacle facets to the standing body's vertical span, then measure exact
// XZ distance to their projection. The original 8.1cm support exclusion and
// 1.8m body height are relative to EACH sample's actual foot position.
function clipY(poly, level, above) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      insideA = above ? a[1] >= level : a[1] <= level,
      insideB = above ? b[1] >= level : b[1] <= level;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (level - a[1]) / (b[1] - a[1]);
      result.push(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  return result;
}
function bodyFacet(poly, footY) {
  return clipY(clipY(poly, footY + 0.081, true), footY + 1.8, false);
}
// Keep complete facets until the per-sample clip. Pre-clipping at an absolute
// ceiling would lose raised-foot headroom obstructions before the query.
const obstacles = triangles.map((poly) => ({
  poly,
  minX: Math.min(...poly.map((p) => p[0])),
  maxX: Math.max(...poly.map((p) => p[0])),
  minY: Math.min(...poly.map((p) => p[1])),
  maxY: Math.max(...poly.map((p) => p[1])),
  minZ: Math.min(...poly.map((p) => p[2])),
  maxZ: Math.max(...poly.map((p) => p[2])),
}));
function edgeDistance(p, a, b) {
  const dx = b[0] - a[0],
    dz = b[2] - a[2],
    d = dx * dx + dz * dz;
  const t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / d)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[2] - a[2] - t * dz);
}
function projectedDistance(p, poly) {
  let positive = false,
    negative = false,
    distance = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      cross = (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
    positive ||= cross > 1e-10;
    negative ||= cross < -1e-10;
    distance = Math.min(distance, edgeDistance(p, a, b));
  }
  // Degenerate vertical facets have no projected interior.
  const area = Math.abs(
    poly.reduce(
      (sum, a, i) =>
        sum + a[0] * poly[(i + 1) % poly.length][2] - poly[(i + 1) % poly.length][0] * a[2],
      0
    )
  );
  return area > 1e-10 && !(positive && negative) ? 0 : distance;
}
// Minimal regression proof for the demonstrated verifier blind spot, not a
// replacement scene or navmesh input: raised paving puts this facet at head level.
const ceilingProof = {
  foot: [0, 0.049, 0],
  triangle: [
    [-1, 1.825, -1],
    [1, 1.825, -1],
    [0, 1.825, 1],
  ],
};
const oldFacet = clipY(clipY(ceilingProof.triangle, 0.081, true), 1.8, false);
const relativeFacet = bodyFacet(ceilingProof.triangle, ceilingProof.foot[1]);
assert.equal(oldFacet.length, 0, 'Old absolute ceiling must miss this obstruction');
assert.equal(relativeFacet.length, 3, 'Raised-foot ceiling must retain the obstruction');
assert.equal(
  projectedDistance(ceilingProof.foot, relativeFacet),
  0,
  'Obstruction overlaps the body'
);
ceilingProof.oldAbsoluteSpanMisses = true;
ceilingProof.relativeSpanDetects = true;
ceilingProof.clearance = 0;
function supportHeight(p) {
  let highest = -Infinity;
  for (const [a, b, c] of triangles) {
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-10) continue;
    const u = ((b[2] - c[2]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[2] - c[2])) / d;
    const v = ((c[2] - a[2]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[2] - c[2])) / d;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) {
      const y = u * a[1] + v * b[1] + (1 - u - v) * c[1];
      if (y >= -0.08 && y <= 0.08) highest = Math.max(highest, y);
    }
  }
  return highest;
}
function checkRoute(points) {
  let samples = 0,
    minClearance = Infinity,
    maxGroundError = 0,
    forbiddenSamples = 0,
    unsupportedSamples = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      steps = Math.max(1, Math.ceil(Math.hypot(...a.map((v, j) => v - b[j])) / 0.02));
    for (let n = 0; n <= steps; n++) {
      const p = a.map((v, j) => v + ((b[j] - v) * n) / steps);
      samples++;
      if (
        p[0] < roi.minX + radius ||
        p[0] > roi.maxX - radius ||
        p[2] < roi.minZ + radius ||
        p[2] > roi.maxZ - radius ||
        p[1] > 0.12
      )
        forbiddenSamples++;
      const ground = supportHeight(p);
      if (!Number.isFinite(ground)) unsupportedSamples++;
      else maxGroundError = Math.max(maxGroundError, Math.abs(p[1] - ground));
      for (const o of obstacles) {
        if (p[0] < o.minX - 1 || p[0] > o.maxX + 1 || p[2] < o.minZ - 1 || p[2] > o.maxZ + 1)
          continue;
        if (o.maxY < p[1] + 0.081 || o.minY > p[1] + 1.8) continue;
        const facet = bodyFacet(o.poly, p[1]);
        if (facet.length >= 3) minClearance = Math.min(minClearance, projectedDistance(p, facet));
      }
    }
  }
  // Sampling error is <=1cm, so clearance must include that margin.
  return {
    samples,
    minClearance: Number.isFinite(minClearance) ? minClearance : null,
    maxGroundError,
    forbiddenSamples,
    unsupportedSamples,
    pass:
      minClearance >= radius + 0.01 &&
      maxGroundError <= 0.06 &&
      forbiddenSamples === 0 &&
      unsupportedSamples === 0,
  };
}
function conformToCapturedGround(points) {
  const conformed = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      steps = Math.max(1, Math.ceil(Math.hypot(...a.map((v, j) => v - b[j])) / 0.02));
    for (let n = 0; n < steps; n++) {
      const p = a.map((v, j) => v + ((b[j] - v) * n) / steps);
      const ground = supportHeight(p);
      if (!Number.isFinite(ground)) throw new Error('Queried route leaves captured ground support');
      conformed.push([p[0], ground, p[2]]);
    }
  }
  if (points.length) {
    conformed.push([...points.at(-1)]);
    // Entry and work anchors retain their authored vertical datum as well.
    conformed[0] = [...points[0]];
  }
  return conformed;
}
await init();
const generated = generateSoloNavMesh(positions, indices, config);
if (!generated.success) throw new Error(`Recast generation failed: ${generated.error}`);
mkdirSync(out, { recursive: true });
const binary = exportNavMesh(generated.navMesh);
writeFileSync(path.join(out, 'gardener.navmesh.bin'), binary);
generated.navMesh.destroy();
// All measured routes query the exported/imported artifact, never the builder.
const { navMesh } = importNavMesh(
  new Uint8Array(readFileSync(path.join(out, 'gardener.navmesh.bin')))
);
const query = new NavMeshQuery(navMesh);
const [navPositions, navIndices] = getNavMeshPositionsAndIndices(navMesh);
writeFileSync(
  path.join(out, 'gardener.navmesh.json'),
  JSON.stringify({ positions: navPositions, indices: navIndices })
);
const vec = (p) => ({ x: p[0], y: p[1], z: p[2] });
const points = [
  { name: 'shed-door', position: actor.day.door },
  ...actor.day.approach.map((position, i) => ({ name: `entry-approach-${i}`, position })),
  ...actor.stops.map((stop, i) => ({ name: `scheduled-stop-${i}`, position: stop.position })),
  { name: 'cycle-return-to-first', position: actor.stops[0].position },
  ...[...actor.day.approach]
    .reverse()
    .map((position, i) => ({ name: `exit-approach-${i}`, position })),
  { name: 'exit-shed-door', position: actor.day.door },
];
// Consecutive original endpoints remain in their authored order and retain all
// original timings. This is an offline geometric comparison, not a replacement.
const requests = points
  .slice(0, -1)
  .map((from, i) => ({ from, to: points[i + 1], kind: 'authored-segment' }));
// A second query between existing endpoints tests Recast avoidance of the real
// vegetable beds. It is a preview, never a new scheduled leg.
requests.push({
  from: points[0],
  to: { name: 'existing-rest-endpoint', position: actor.stops[3].position },
  kind: 'obstacle-detour-preview',
});
const routes = [];
for (const { from, to, kind } of requests) {
  const result = query.computePath(vec(from.position), vec(to.position), {
    halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
  });
  const rawPath = result.path.map((p) => [p.x, p.y, p.z]);
  const rawChecks = rawPath.length > 1 ? checkRoute(rawPath) : null;
  const route = conformToCapturedGround(rawPath);
  const startError = route.length
    ? Math.hypot(...route[0].map((v, j) => v - from.position[j]))
    : null;
  const endError = route.length
    ? Math.hypot(...route.at(-1).map((v, j) => v - to.position[j]))
    : null;
  const checks = route.length > 1 ? checkRoute(route) : null;
  routes.push({
    kind,
    from: from.name,
    to: to.name,
    authoredStart: from.position,
    authoredEnd: to.position,
    success: result.success,
    error: result.error,
    rawPath,
    rawChecks,
    path: route,
    lengthMetres: route.reduce(
      (sum, p, j) => (j ? sum + Math.hypot(...p.map((v, k) => v - route[j - 1][k])) : 0),
      0
    ),
    authoredStraightLengthMetres: Math.hypot(...from.position.map((v, j) => v - to.position[j])),
    startError,
    endError,
    checks,
    pass: result.success && startError <= 0.00002 && endError <= 0.00002 && checks?.pass === true,
  });
}
query.destroy();
navMesh.destroy();
const report = {
  schema: 1,
  scope: 'offline imported-navmesh gardener precinct only',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  recastVersion: JSON.parse(readFileSync('node_modules/recast-navigation/package.json', 'utf8'))
    .version,
  input: path.relative(root, path.resolve(args.input)),
  inputSha256: sha(inputBytes),
  generatorSha256: sha(readFileSync('scripts/recast-pedestrian-trial.mjs')),
  captureFilter: input.filter,
  compiledIdentity: input.compiledIdentity,
  sourceHashes,
  roi,
  config,
  agent: { radius, height: 1.8, climb: 0.08 },
  endpointToleranceXYZMetres: 0.00002,
  ceilingProof,
  originalSchedule: actor,
  scheduleSha256: sha(actorText),
  navmeshSha256: sha(binary),
  navmeshBytes: binary.length,
  navmeshTriangles: navIndices.length / 3,
  capturedTriangles: indices.length / 3,
  routes,
  pass: routes.every((r) => r.pass),
  limits: [
    'No schedules, duties, endpoints or timings changed.',
    'No runtime WASM or production navigation integration.',
    'Clearance measured against captured geometry from each actual sample footY + 8.1cm to footY + 1.8m, sampled every 2cm with 1cm safety margin.',
    'Route samples are conformed to actual captured ground; raw Detour straight-path heights and checks are retained. Endpoints remain unchanged.',
    'Ground support is captured triangles within 8cm of ground datum. Shader-discarded surfaces require capture metadata review.',
    'ROI excludes water, railway, port and mountain; no off-mesh connections.',
    'Acceptance additionally requires root visual comparison.',
  ],
};
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(
  path.join(out, 'README.md'),
  `# Offline Recast gardener precinct\n\nReproduce: \`node scripts/recast-pedestrian-trial.mjs --input=${report.input}\`\n\nImported artifact: ${report.navmeshBytes} bytes, SHA256 ${report.navmeshSha256}.\n\n${routes.filter((r) => r.pass).length}/${routes.length} queries pass geometric checks (12 original entry/circuit/exit segments plus one bed-avoidance preview between existing endpoints). See report.json for measured lengths, clearance, ground error, endpoint errors, source pins and unchanged authored schedule.\n\nActual captured triangles only. Preview remains a prototype; root visual review is required. Any failed original endpoint is a failed acceptance condition, never silently moved.\n`
);
console.log(
  JSON.stringify(
    {
      pass: report.pass,
      navmeshBytes: report.navmeshBytes,
      routes: routes.map((r) => ({
        from: r.from,
        to: r.to,
        pass: r.pass,
        length: r.lengthMetres,
        clearance: r.checks?.minClearance,
        ground: r.checks?.maxGroundError,
        error: r.error,
      })),
    },
    null,
    2
  )
);
if (!report.pass) process.exitCode = 1;
