// @vitest-environment node
import { beforeAll, afterAll, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GENERATED_ASSETS } from './normalize-model-assets.mjs';
import {
  RECONCILED_FARM_MODELS,
  BASELINE_COMMIT,
  BASELINE_DIRECTORY,
  AUTHORING_SCRIPT,
  hash,
  deriveFarmModel,
  assertFarmDependencies,
  assertFarmCurrentOutput,
  assertFarmNormalization,
} from './reconcile-farm-models.mjs';
import { applyFarmWindows } from '../src/components/models/GeneratedOfficeModel.tsx';

const repo = process.cwd();
// The three real-pipeline tests spawn the normalizer and provenance writer
// (up to five child processes each). At ~61 runnable per core (2026-10-20,
// --maxWorkers=1) they took 149 s and 301 s, and one child alone passed 120 s,
// where the lead's gate at ~30-44 per core passed them inside 120 s. The budget
// is a hang guard, so it sits well above the worst loaded run.
const REAL_PIPELINE_CHILD_MS = 600_000;
const REAL_PIPELINE_TEST_MS = 1_200_000;
const io = new NodeIO();
const rows = new Map();
const clone = (value) => JSON.parse(JSON.stringify(value));
let temporary, manifest, author, farmProvenance, generated;
const fixture = (slug) => `${BASELINE_DIRECTORY}/${slug}.baseline.glb`;
const provider = (slug) => `assets/source/models/farm/${slug}-tripo-original.glb`;
const preparedFile = (slug) => `assets/source/models/farm/${slug}-crafted.glb`;
const runtimeFile = (slug) => `public/models/farm/${slug}.glb`;
function reportFor(pack) {
  return {
    ...pack.normalization,
    id: pack.id,
    file: pack.runtimeDerivative.file.replace(/^public\/models\//, ''),
    sourceSha256: pack.sha256,
    outputSha256: pack.runtimeDerivative.sha256,
    outputBytes: pack.runtimeDerivative.bytes,
    blenderPreparation: pack.blenderPreparation,
    geometryRefinement: pack.geometryRefinement,
    facingYaw: pack.normalization.facingYawRadians,
  };
}
beforeAll(async () => {
  manifest = JSON.parse(await readFile('public/models/asset-manifest.json', 'utf8'));
  author = await readFile(AUTHORING_SCRIPT);
  farmProvenance = JSON.parse(await readFile('assets/source/models/farm/PROVENANCE.json', 'utf8'));
  const packs = [];
  for (const area of [...new Set(GENERATED_ASSETS.map((entry) => entry.area))]) {
    packs.push(
      ...JSON.parse(await readFile(`assets/source/models/${area}/PROVENANCE.json`, 'utf8'))
        .sourcePacks
    );
  }
  // A real normalization report is JSON in GENERATED_ASSETS table order.
  // Keep that original contract when synthesizing untouched rows from provenance.
  generated = clone(
    GENERATED_ASSETS.map((spec) => reportFor(packs.find((pack) => pack.id === spec.id)))
  );
  for (const [id, spec] of Object.entries(RECONCILED_FARM_MODELS)) {
    const [baseline, source, prepared, runtime] = await Promise.all([
      readFile(fixture(spec.slug)),
      readFile(provider(spec.slug)),
      readFile(preparedFile(spec.slug)),
      readFile(runtimeFile(spec.slug)),
    ]);
    const result = await deriveFarmModel(id, baseline, source, prepared, author, manifest);
    rows.set(id, { spec, baseline, source, prepared, runtime, result });
  }
  temporary = await mkdtemp(path.join(tmpdir(), 'millos-current-wall-repair-'));
});
afterAll(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

for (const id of Object.keys(RECONCILED_FARM_MODELS)) {
  test(`${id}: installed runtime is exactly the deterministic reviewed derivative`, async () => {
    const { spec, baseline, source, prepared, runtime, result } = rows.get(id);
    expect(hash(baseline)).toBe(spec.inputSHA256);
    expect(hash(runtime)).toBe(spec.outputSHA256);
    expect(result.bytes.equals(runtime)).toBe(true);
    expect(result.bytes.equals(baseline)).toBe(false);
    expect(
      (await deriveFarmModel(id, baseline, source, prepared, author, manifest)).bytes.equals(
        runtime
      )
    ).toBe(true);
    expect(result.receipt.baselineCommit).toBe(BASELINE_COMMIT);
    const entry = manifest.assets.find((row) => row.id === id);
    expect(runtime.length).toBeLessThanOrEqual(entry.maxFileBytes);
    const primitive = (await io.readBinary(runtime)).getRoot().listMeshes()[0].listPrimitives()[0];
    expect(primitive.getIndices().getCount()).toBeLessThanOrEqual(entry.maxRenderVertices);
  });

  test(`${id}: rejects unknown dependencies, producer drift, repeat derivation and manifest weakening`, async () => {
    const { spec, baseline, source, prepared, runtime } = rows.get(id);
    const changed = Buffer.from(baseline);
    changed[changed.length - 1] ^= 1;
    await expect(deriveFarmModel(id, changed, source, prepared, author, manifest)).rejects.toThrow(
      'exact accepted'
    );
    await expect(deriveFarmModel(id, runtime, source, prepared, author, manifest)).rejects.toThrow(
      'exact accepted'
    );
    for (const [args, message] of [
      [[Buffer.from('changed'), prepared, author, manifest], 'exact immutable'],
      [[source, Buffer.from('changed'), author, manifest], 'changed prepared'],
      [[source, prepared, Buffer.from('changed'), manifest], 'changed architecture'],
    ])
      expect(() => assertFarmDependencies(id, ...args)).toThrow(message);
    for (const mutate of [
      (value) => {
        value.assets.find((row) => row.id === id).maxFileBytes *= 2;
      },
      (value) => {
        value.assets.find((row) => row.id === id).file = 'farm/unreviewed.glb';
      },
      (value) => {
        value.assets.push(value.assets.find((row) => row.id === id));
      },
      (value) => {
        value.assets = value.assets.filter((row) => row.id !== id);
      },
      (value) => {
        value.units = 'feet';
      },
    ]) {
      const altered = clone(manifest);
      mutate(altered);
      expect(() => assertFarmDependencies(id, source, prepared, author, altered)).toThrow();
    }
    expect(() => assertFarmCurrentOutput(id, changed)).toThrow('unknown current');
    expect(() => assertFarmCurrentOutput(id, baseline)).not.toThrow();
    expect(() => assertFarmCurrentOutput(id, runtime)).not.toThrow();
    expect(hash(baseline)).toBe(spec.inputSHA256);
  });
}

test('composition retains only two current-main wall repairs with no roof or coop-normal cleanup stage', async () => {
  expect(Object.keys(RECONCILED_FARM_MODELS)).toEqual(['farm-coop', 'farm-farmhouse']);
  for (const id of ['farm-barn', 'farm-windmill'])
    await expect(deriveFarmModel(id)).rejects.toThrow('Unknown reconciled farm model');
  const coop = rows.get('farm-coop');
  expect(coop.result.receipt.steps).toHaveLength(1);
  expect(coop.result.receipt.steps[0].restoredFaces).toHaveLength(105);
  expect(coop.result.receipt.intermediateSHA256).toBeUndefined();
  const cp = (bytes) =>
    io.readBinary(bytes).then((d) => d.getRoot().listMeshes()[0].listPrimitives()[0]);
  const before = await cp(coop.baseline),
    after = await cp(coop.runtime);
  expect(
    after
      .getAttribute('NORMAL')
      .getArray()
      .slice(0, before.getAttribute('NORMAL').getArray().length)
  ).toEqual(before.getAttribute('NORMAL').getArray());
  const farmhouse = rows.get('farm-farmhouse');
  expect(farmhouse.result.receipt.steps).toHaveLength(1);
  expect(farmhouse.result.receipt.intermediateSHA256).toBeUndefined();
  const step = farmhouse.result.receipt.steps[0];
  expect(step.restoredFaces).toHaveLength(14);
  expect(step.retainedNormalChanges).toHaveLength(13);
  expect(step.newCornerNormalContinuations).toHaveLength(2);
  expect(step.preservedOriginalRoofFaces).toHaveLength(14);
  expect(step.removedTriangles).toBeUndefined();
});

async function isolatedRoot(name) {
  const root = path.join(temporary, name);
  const files = [
    AUTHORING_SCRIPT,
    'public/models/asset-manifest.json',
    'assets/source/models/farm/PROVENANCE.json',
    'assets/source/models/forklift/forklift-original.glb',
    'assets/source/models/machines/silo-unity-original.glb',
  ];
  for (const { spec } of rows.values())
    files.push(
      fixture(spec.slug),
      provider(spec.slug),
      preparedFile(spec.slug),
      runtimeFile(spec.slug)
    );
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await copyFile(path.join(repo, file), path.join(root, file));
  }
  await mkdir(path.join(root, 'test-results/assets'), { recursive: true });
  await writeFile(
    path.join(root, 'test-results/assets/normalization.json'),
    JSON.stringify({ generated })
  );
  return root;
}
function normalizerScript(ids, change = '') {
  return `
    import { NodeIO } from ${JSON.stringify(path.join(repo, 'node_modules/@gltf-transform/core/dist/index.js'))};
    import { ALL_EXTENSIONS } from ${JSON.stringify(path.join(repo, 'node_modules/@gltf-transform/extensions/dist/index.js'))};
    import { readFile, writeFile } from 'node:fs/promises';
    import { createHash } from 'node:crypto';
    const hash = b => createHash('sha256').update(b).digest('hex');
    const { GENERATED_ASSETS, normalizeGeneratedAsset } = await import(${JSON.stringify(path.join(repo, 'scripts/normalize-model-assets.mjs'))});
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const report = JSON.parse(await readFile('test-results/assets/normalization.json', 'utf8'));
    for (const id of ${JSON.stringify(ids)}) {
      const spec = { ...GENERATED_ASSETS.find(s => s.id === id) };
      ${change}
      const result = await normalizeGeneratedAsset(io, spec);
      result.sourceSha256 = hash(await readFile('assets/source/models/farm/' + spec.slug + '-tripo-original.glb'));
      result.outputSha256 = hash(await readFile('public/models/' + result.file));
      report.generated = report.generated.map(row => row.id === id ? result : row);
    }
    await writeFile('test-results/assets/normalization.json', JSON.stringify(report));
  `;
}
function runNormalizer(root, ids = Object.keys(RECONCILED_FARM_MODELS), change) {
  execFileSync(process.execPath, ['--input-type=module', '-e', normalizerScript(ids, change)], {
    cwd: root,
    stdio: 'pipe',
    timeout: REAL_PIPELINE_CHILD_MS,
  });
}
function runWriter(root) {
  execFileSync(
    process.execPath,
    [path.join(repo, 'scripts/write-model-provenance.mjs'), '--area=farm'],
    {
      cwd: root,
      stdio: 'pipe',
      timeout: REAL_PIPELINE_CHILD_MS,
    }
  );
}

test(
  'actual current normalizer and writer rebuild both outputs exactly in an isolated root',
  async () => {
    const root = await isolatedRoot('real-normalizer-writer');
    // Start from exact current-main asset bytes, then rerun over the final candidate to prove idempotence.
    for (const { spec, baseline } of rows.values())
      await writeFile(path.join(root, runtimeFile(spec.slug)), baseline);
    for (let pass = 0; pass < 2; pass++) {
      execFileSync(
        process.execPath,
        [
          path.join(repo, 'scripts/normalize-model-assets.mjs'),
          '--only=' + Object.keys(RECONCILED_FARM_MODELS).join(','),
        ],
        {
          cwd: root,
          stdio: 'pipe',
          timeout: REAL_PIPELINE_CHILD_MS,
        }
      );
      runWriter(root);
      const report = JSON.parse(
        await readFile(path.join(root, 'test-results/assets/normalization.json'), 'utf8')
      );
      const provenance = JSON.parse(
        await readFile(path.join(root, 'assets/source/models/farm/PROVENANCE.json'), 'utf8')
      );
      for (const [id, { spec, baseline, runtime, source, prepared, result }] of rows) {
        expect((await readFile(path.join(root, runtimeFile(spec.slug)))).equals(runtime)).toBe(
          true
        );
        expect((await readFile(runtimeFile(spec.slug))).equals(runtime)).toBe(true);
        expect((await readFile(path.join(root, provider(spec.slug)))).equals(source)).toBe(true);
        expect((await readFile(path.join(root, preparedFile(spec.slug)))).equals(prepared)).toBe(
          true
        );
        const row = report.generated.find((value) => value.id === id);
        await expect(
          assertFarmNormalization(id, row, runtime, baseline, source, prepared, author, manifest)
        ).resolves.toBeUndefined();
        expect(row.geometryRefinement).toEqual(clone(result.receipt));
        expect(provenance.sourcePacks.find((pack) => pack.id === id)).toEqual(
          farmProvenance.sourcePacks.find((pack) => pack.id === id)
        );
      }
      // Every unrelated farm record, including animals and windmill, remains exactly the same.
      const unrelated = (p) => ({
        ...p,
        sourcePacks: p.sourcePacks.filter((pack) => !RECONCILED_FARM_MODELS[pack.id]),
      });
      expect(unrelated(provenance)).toEqual(unrelated(farmProvenance));
      expect(report.generated.filter((row) => !RECONCILED_FARM_MODELS[row.id])).toEqual(
        generated.filter((row) => !RECONCILED_FARM_MODELS[row.id])
      );
    }
  },
  REAL_PIPELINE_TEST_MS
);

test(
  'actual normalizer fails before writing on changed dependencies, manifest, current bytes or producer output',
  async () => {
    const root = await isolatedRoot('normalizer-fail-closed');
    for (const file of [
      provider('coop'),
      preparedFile('coop'),
      AUTHORING_SCRIPT,
      'public/models/asset-manifest.json',
      runtimeFile('coop'),
    ]) {
      const target = path.join(root, file),
        original = await readFile(target);
      const changed = file.endsWith('.json')
        ? Buffer.from(JSON.stringify({ ...manifest, units: 'feet' }))
        : Buffer.from('changed');
      await writeFile(target, changed);
      const before = await readFile(path.join(root, runtimeFile('coop')));
      const report = await readFile(path.join(root, 'test-results/assets/normalization.json'));
      expect(() => runNormalizer(root, ['farm-coop'])).toThrow();
      expect(await readFile(path.join(root, runtimeFile('coop')))).toEqual(before);
      expect(await readFile(path.join(root, 'test-results/assets/normalization.json'))).toEqual(
        report
      );
      await writeFile(target, original);
    }
    const before = await readFile(path.join(root, runtimeFile('coop')));
    expect(() => runNormalizer(root, ['farm-coop'], 'spec.target = 9;')).toThrow(
      'exact accepted normalized input'
    );
    expect(await readFile(path.join(root, runtimeFile('coop')))).toEqual(before);
  },
  REAL_PIPELINE_TEST_MS
);

test(
  'actual provenance writer fails before any write on stale hashes, paths, metrics, chain, missing or duplicate rows',
  async () => {
    const root = await isolatedRoot('writer-fail-closed');
    const before = await readFile(path.join(root, 'assets/source/models/farm/PROVENANCE.json'));
    for (const mutate of [
      (row) => {
        row.outputSha256 = 'stale';
      },
      (row) => {
        row.sourceSha256 = 'stale';
      },
      (row) => {
        row.outputBytes += 4;
      },
      (row) => {
        row.file = 'farm/farmhouse.glb';
      },
      (row) => {
        row.blenderPreparation.sha256 = 'stale';
      },
      (row) => {
        row.blenderPreparation.file = 'wrong';
      },
      (row) => {
        row.blenderPreparation.script = 'wrong';
      },
      (row) => {
        row.renderVertices += 3;
      },
      (row) => {
        row.bounds.height += 1;
      },
      (row) => {
        row.geometryRefinement.steps.push(clone(row.geometryRefinement.steps[0]));
      },
      (row) => {
        row.geometryRefinement.baselineCommit = 'wrong';
      },
    ]) {
      const changed = clone(generated);
      mutate(changed.find((row) => row.id === 'farm-coop'));
      await writeFile(
        path.join(root, 'test-results/assets/normalization.json'),
        JSON.stringify({ generated: changed })
      );
      expect(() => runWriter(root)).toThrow();
      expect(await readFile(path.join(root, 'assets/source/models/farm/PROVENANCE.json'))).toEqual(
        before
      );
    }
    for (const changed of [
      generated.filter((row) => row.id !== 'farm-coop'),
      [...generated, generated.find((row) => row.id === 'farm-coop')],
    ]) {
      await writeFile(
        path.join(root, 'test-results/assets/normalization.json'),
        JSON.stringify({ generated: changed })
      );
      expect(() => runWriter(root)).toThrow();
      expect(await readFile(path.join(root, 'assets/source/models/farm/PROVENANCE.json'))).toEqual(
        before
      );
    }
  },
  REAL_PIPELINE_TEST_MS
);

test('farmhouse source-face changes and all normal donors stay above the current runtime window aperture', async () => {
  const { baseline, source, runtime, result } = rows.get('farm-farmhouse');
  const body = (doc) => doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const a = body(await io.readBinary(baseline)),
    b = body(await io.readBinary(runtime)),
    provider = body(await io.readBinary(source));
  const positions = (primitive, id) =>
    [0, 1, 2].map((corner) =>
      primitive
        .getAttribute('POSITION')
        .getElement(primitive.getIndices().getScalar(id * 3 + corner), [])
    );
  for (const row of result.receipt.steps[0].restoredFaces) {
    for (const point of positions(provider, row.sourceFace))
      expect(point[1]).toBeGreaterThan(-0.139);
  }
  const { DONORS, CONTINUATIONS } = await import('./restore-farmhouse-walls.mjs');
  for (const [vertex] of DONORS)
    expect(b.getAttribute('POSITION').getElement(vertex, [])[1]).toBeGreaterThan(-0.139);
  for (const row of CONTINUATIONS)
    expect(b.getAttribute('POSITION').getElement(row.retainedVertex, [])[1]).toBeGreaterThan(
      -0.139
    );
  expect(b.getIndices().getArray().slice(0, a.getIndices().getCount())).toEqual(
    a.getIndices().getArray()
  );
  for (const name of ['POSITION', 'TEXCOORD_0'])
    expect(
      b.getAttribute(name).getArray().slice(0, a.getAttribute(name).getArray().length)
    ).toEqual(a.getAttribute(name).getArray());
  const material = new THREE.MeshStandardMaterial();
  applyFarmWindows(material, 'farmhouse');
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader, {});
  expect(material.customProgramCacheKey()).toBe('millos-farm-window-farmhouse-v1');
  expect(shader.fragmentShader).toContain('step(-0.247, vFarmPosition.y)');
  expect(shader.fragmentShader).toContain('step(-0.139, vFarmPosition.y)');
  material.dispose();
});
