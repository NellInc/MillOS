// @vitest-environment node
import { beforeAll, afterAll, expect, test } from 'vitest';
import { readFile, writeFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
  INPUT,
  SOURCE,
  INPUT_SHA256,
  SOURCE_SHA256,
  RESTORED,
  PRESERVED_ROOF,
  DONORS,
  CONTINUATIONS,
  hash,
  primitive,
  face,
  signature,
  normal,
  bounds,
  angle,
  dot,
  roofPlanes,
  clearances,
  refine,
  safeOutput,
} from './restore-farmhouse-walls.mjs';
const io = new NodeIO(),
  eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let inputBytes,
  sourceBytes,
  outputBytes,
  before,
  after,
  source,
  report,
  temp,
  b,
  a,
  s,
  edges,
  fanReport;
function mesh(doc) {
  const p = primitive(doc),
    P = p.getAttribute('POSITION'),
    N = p.getAttribute('NORMAL'),
    U = p.getAttribute('TEXCOORD_0'),
    F = Array.from({ length: p.getIndices().getCount() / 3 }, (_, f) =>
      [0, 1, 2].map((k) => p.getIndices().getScalar(f * 3 + k))
    ),
    pos = (v) => P.getElement(v, []),
    n = (v) => N.getElement(v, []),
    uv = (v) => U.getElement(v, []),
    refs = new Map(),
    faces = new Map(),
    edges = new Map();
  for (const [f, vs] of F.entries()) {
    const sig = signature(vs.map(pos));
    faces.set(sig, [...(faces.get(sig) ?? []), f]);
    for (const v of vs) refs.set(v, [...(refs.get(v) ?? []), f]);
    for (const [x, y] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const e = JSON.stringify(
        [pos(vs[x]), pos(vs[y])].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
      );
      edges.set(e, [...(edges.get(e) ?? []), f]);
    }
  }
  return { p, F, pos, n, uv, refs, faces, edges, G: F.map((vs) => normal(vs.map(pos))) };
}
const corner = (m, f, pt) => m.F[f].find((v) => eq(m.pos(v), pt));
function audit() {
  const rows = [];
  for (const [edge, fs] of a.edges)
    for (let i = 0; i < fs.length; i++)
      for (const g of fs.slice(i + 1)) {
        const f = fs[i],
          points = JSON.parse(edge),
          kind =
            f < 5595 && g < 5595 ? 'retained' : f >= 5595 && g >= 5595 ? 'restored' : 'boundary';
        const corners = points.map((pt) => {
          const v = corner(a, f, pt),
            w = corner(a, g, pt);
          return {
            v,
            w,
            before: kind === 'retained' ? angle(b.n(v), b.n(w)) : null,
            after: angle(a.n(v), a.n(w)),
            uvSeam: !eq(a.uv(v), a.uv(w)),
          };
        });
        rows.push({ f, g, kind, faceAngle: angle(a.G[f], a.G[g]), corners });
      }
  return rows;
}
function inspectFans() {
  const fans = new Map(),
    donorKeys = new Map(),
    unknown = new Map();
  for (const [f, vs] of b.F.entries()) {
    const sf = s.faces.get(signature(vs.map(b.pos))) ?? [];
    for (const v of vs) {
      if (sf.length !== 1) {
        unknown.set(v, [...(unknown.get(v) ?? []), f]);
        continue;
      }
      const sv = corner(s, sf[0], b.pos(v)),
        key = JSON.stringify([b.pos(v), s.n(sv)]);
      if (!fans.has(key)) fans.set(key, new Set());
      fans.get(key).add(v);
      if (!donorKeys.has(v)) donorKeys.set(v, new Set());
      donorKeys.get(v).add(key);
    }
  }
  const seeds = new Set();
  for (const f of RESTORED)
    for (const sv of s.F[f]) {
      const key = JSON.stringify([s.pos(sv), s.n(sv)]);
      if (fans.has(key)) seeds.add(key);
    }
  const eligible = [],
    blocked = [];
  for (const key of seeds) {
    const vs = [...fans.get(key)],
      values = new Set(vs.map((v) => JSON.stringify(b.n(v))));
    if (values.size !== 1 || vs.some((v) => donorKeys.get(v).size !== 1 || unknown.has(v))) {
      blocked.push({ position: JSON.parse(key)[0], vertices: vs });
      continue;
    }
    eligible.push(...vs);
  }
  return { eligible: eligible.sort((x, y) => x - y), blocked, fans, donorKeys, unknown };
}
beforeAll(async () => {
  sourceBytes = await readFile(SOURCE);
  inputBytes = await readFile('src/test/fixtures/farm-model-reconciliation/farmhouse.baseline.glb');
  before = await io.readBinary(inputBytes);
  source = await io.readBinary(sourceBytes);
  const d = await io.readBinary(inputBytes);
  report = refine(d, source, hash(inputBytes), hash(sourceBytes));
  outputBytes = Buffer.from(await io.writeBinary(d));
  after = await io.readBinary(outputBytes);
  temp = await mkdtemp(path.join(tmpdir(), 'farmhouse-wall-test-'));
  b = mesh(before);
  a = mesh(after);
  s = mesh(source);
  edges = audit();
  fanReport = inspectFans();
  if (process.env.FARMHOUSE_WALL_REGRESSION_REPORT) {
    const summary = {
      candidateSHA256: hash(outputBytes),
      triangles: a.F.length,
      attributeVertices: a.p.getAttribute('POSITION').getCount(),
      normalDonors: DONORS,
      blockedFans: fanReport.blocked,
      continuations: report.newCornerNormalContinuations,
    };
    for (const kind of ['retained', 'boundary', 'restored']) {
      const rr = edges.filter((r) => r.kind === kind);
      summary[kind] = {
        edgePairs: rr.length,
        uvSeamPairs: rr.filter((r) => r.corners.some((q) => q.uvSeam)).length,
        maxNormalAngle: Math.max(...rr.flatMap((r) => r.corners.map((q) => q.after))),
        cornersOver1Degree: rr.flatMap((r) => r.corners).filter((q) => q.after > 1).length,
        changedExistingAngles: rr
          .flatMap((r) => r.corners)
          .filter((q) => q.before !== null && Math.abs(q.before - q.after) > 1e-5),
      };
    }
    summary.allRestoredCornerMinDot = Math.min(
      ...a.F.slice(5595).flatMap((vs, j) => vs.map((v) => dot(a.n(v), a.G[5595 + j])))
    );
    summary.retainedNormalIncidentFaces = [...new Set(DONORS.flatMap(([v]) => b.refs.get(v)))];
    summary.minimumRoofClearance = Math.min(
      ...RESTORED.flatMap((f) => clearances(face(s.p, f), roofPlanes(b.p)))
    );
    await writeFile(
      process.env.FARMHOUSE_WALL_REGRESSION_REPORT,
      JSON.stringify(summary, null, 2) + '\n'
    );
  }
});
afterAll(async () => {
  if (temp) await rm(temp, { recursive: true, force: true });
});
test('pins accepted and source bytes; deterministic433424-byte candidate', async () => {
  expect(hash(inputBytes)).toBe(INPUT_SHA256);
  expect(hash(sourceBytes)).toBe(SOURCE_SHA256);
  expect(() => refine(before, source, 'wrong', SOURCE_SHA256)).toThrow('Pinned accepted');
  expect(() => refine(before, source, INPUT_SHA256, 'wrong')).toThrow('Pinned immutable');
  expect(hash(outputBytes)).toBe(
    '479f3dfc58e220edfa6bcd7962dd12ac00b8ba84f8559e5706e13840a75a9a1a'
  );
  expect(outputBytes.length).toBe(433424);
  const d = await io.readBinary(inputBytes);
  refine(d, source, INPUT_SHA256, SOURCE_SHA256);
  expect(Buffer.from(await io.writeBinary(d))).toEqual(outputBytes);
});
test('adds exactly14 source triangles with original winding and UVs; every retained index and position/UV is exact', () => {
  expect(a.F.length).toBe(5609);
  expect(a.p.getAttribute('POSITION').getCount()).toBe(6142);
  expect(a.F.slice(0, 5595)).toEqual(b.F);
  for (const semantic of ['POSITION', 'TEXCOORD_0']) {
    const old = b.p.getAttribute(semantic).getArray(),
      next = a.p.getAttribute(semantic).getArray();
    expect(next.slice(0, old.length)).toEqual(old);
  }
  for (const [j, f] of RESTORED.entries())
    for (let k = 0; k < 3; k++) {
      const sv = s.F[f][k],
        v = a.F[5595 + j][k];
      expect(a.pos(v)).toEqual(s.pos(sv));
      expect(a.uv(v)).toEqual(s.uv(sv));
    }
  expect(bounds(a.p)).toEqual(bounds(b.p));
  expect(a.p.getIndices().getCount()).toBe(16827);
});
test('preserves all14 current roof faces and excludes roof/chimney and generated geometry edits', () => {
  for (const f of PRESERVED_ROOF) {
    expect(b.faces.has(signature(face(s.p, f)))).toBe(true);
    expect(a.faces.has(signature(face(s.p, f)))).toBe(true);
  }
  for (const [f, vs] of b.F.entries()) {
    const sf = s.faces.get(signature(vs.map(b.pos))) ?? [];
    if (sf.length !== 1) for (const v of vs) expect(a.n(v)).toEqual(b.n(v));
  }
  for (const f of RESTORED) {
    const pts = face(s.p, f),
      n = normal(pts);
    expect(Math.abs(n[0])).toBeGreaterThan(0.999);
    expect(
      pts.every((p) => p[0] > -0.465 && p[0] < -0.461) ||
        pts.every((p) => p[0] > 0.382 && p[0] < 0.386)
    ).toBe(true);
    expect(pts.every((p) => Math.abs(p[0] - 0.429) > 0.01)).toBe(true);
  }
});
test('copies precisely13 retained normals; all selected incident triangles are source-exact unambiguous fans', () => {
  expect(fanReport.eligible).toEqual(DONORS.map(([v]) => v));
  expect(fanReport.blocked).toHaveLength(5);
  const changes = new Map(DONORS);
  for (let v = 0; v < 6100; v++) {
    if (changes.has(v)) {
      expect(a.n(v)).toEqual(s.n(changes.get(v)));
      expect(a.n(v)).not.toEqual(b.n(v));
      expect(fanReport.donorKeys.get(v).size).toBe(1);
      expect(fanReport.unknown.has(v)).toBe(false);
      for (const f of b.refs.get(v)) expect(dot(a.n(v), a.G[f])).toBeGreaterThan(0.63);
    } else expect(a.n(v)).toEqual(b.n(v));
  }
});
test('preserves every retained hard edge and UV seam; introduces no boundary seam above.253degrees', () => {
  const retained = edges.filter((r) => r.kind === 'retained');
  for (const r of retained)
    for (const q of r.corners) expect(Math.abs(q.before - q.after)).toBeLessThan(1e-5);
  const boundary = edges.filter((r) => r.kind === 'boundary');
  expect(boundary).toHaveLength(12);
  expect(Math.max(...boundary.flatMap((r) => r.corners.map((q) => q.after)))).toBeLessThan(0.253);
  expect(boundary.filter((r) => r.corners.some((q) => q.uvSeam)).length).toBeGreaterThan(0);
  const restored = edges.filter((r) => r.kind === 'restored');
  expect(restored.length).toBeGreaterThan(0);
  for (const r of restored) for (const q of r.corners) expect(q.after).toBeLessThan(0.00001);
});
test('documents exactly2 hard-fan continuation exceptions; all40 other appended normals are source-exact and all restored corners point outward', () => {
  const continuation = new Map(
    report.newCornerNormalContinuations.map((r) => [r.candidateVertex, r])
  );
  expect(continuation.size).toBe(2);
  for (const [j, f] of RESTORED.entries())
    for (let k = 0; k < 3; k++) {
      const sv = s.F[f][k],
        v = a.F[5595 + j][k];
      if (continuation.has(v)) {
        const c = continuation.get(v);
        expect(a.n(v)).toEqual(b.n(c.retainedVertex));
        expect(a.n(v)).not.toEqual(s.n(sv));
        expect(CONTINUATIONS.some((x) => x.sourceFace === f && x.sourceVertex === sv)).toBe(true);
        const samePositionRestored = a.F.slice(5595).filter((vs) =>
          vs.some((w) => eq(a.pos(w), a.pos(v)))
        );
        expect(samePositionRestored).toHaveLength(1);
      } else expect(a.n(v)).toEqual(s.n(sv));
      expect(dot(a.n(v), a.G[5595 + j])).toBeGreaterThan(0.1613);
      if (continuation.has(v)) expect(dot(a.n(v), a.G[5595 + j])).toBeGreaterThan(0.217);
    }
  expect(report.newCornerNormalContinuations.map((r) => r.deviationFromGeometricDegrees)).toEqual(
    expect.arrayContaining([expect.any(Number)])
  );
});
test('whole restored triangles stay at least.0108055 below both actual closed-roof underside planes', () => {
  const planes = roofPlanes(b.p);
  expect(planes.map((r) => r.triangle)).toEqual([4441, 4963]);
  for (const f of RESTORED)
    for (const clearance of clearances(face(s.p, f), planes))
      expect(clearance).toBeGreaterThan(0.0108055);
});
test('all images, materials, scene/node transforms and mesh contracts remain exact', async () => {
  const bj = await io.writeJSON(before),
    aj = await io.writeJSON(after);
  for (const key of [
    'nodes',
    'scenes',
    'scene',
    'materials',
    'textures',
    'samplers',
    'images',
    'extensionsUsed',
    'extensionsRequired',
  ])
    expect(aj.json[key]).toEqual(bj.json[key]);
  const bt = before.getRoot().listTextures(),
    at = after.getRoot().listTextures();
  expect(at).toHaveLength(3);
  for (let i = 0; i < bt.length; i++) {
    expect(at[i].getImage()).toEqual(bt[i].getImage());
    expect(at[i].getMimeType()).toBe(bt[i].getMimeType());
  }
  expect(a.p.listSemantics()).toEqual(b.p.listSemantics());
  expect(a.p.getMode()).toBe(b.p.getMode());
});
test('output guard rejects runtime/source,existing files,file symlinks and directory aliases', async () => {
  for (const target of [INPUT, SOURCE, 'public/new.glb', 'assets/new.glb', 'public', 'assets'])
    await expect(safeOutput(target)).rejects.toThrow('outside');
  const ordinary = path.join(temp, 'exists.glb');
  await writeFile(ordinary, 'immutable');
  await expect(safeOutput(ordinary)).rejects.toThrow('immutable');
  const alias = path.join(temp, 'link.glb');
  await symlink(ordinary, alias);
  await expect(safeOutput(alias)).rejects.toThrow('symlink');
  const dir = path.join(temp, 'public-alias');
  await symlink(path.resolve('public'), dir);
  await expect(safeOutput(path.join(dir, 'new.glb'))).rejects.toThrow('outside');
  expect(await safeOutput(path.join(temp, 'new', 'candidate.glb'))).toBe(
    path.join(temp, 'new', 'candidate.glb')
  );
  expect(await readFile(ordinary, 'utf8')).toBe('immutable');
});
