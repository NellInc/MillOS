// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  RECONCILED_YARD_MODELS,
  deriveYardModel,
  assertYardNormalization,
  replaceYardRecords,
} from './reconcile-yard-models.mjs';

const provenance = JSON.parse(await readFile('assets/source/models/world/PROVENANCE.json'));
describe.each(Object.keys(RECONCILED_YARD_MODELS))('%s retained source chain', (id) => {
  const slug = id.slice('world-'.length);
  it('replays the installed model and rejects changed source or unknown current geometry', async () => {
    const [baseline, provider, prepared, current] = await Promise.all([
      readFile(`src/test/fixtures/${slug}.baseline.glb`),
      readFile(`assets/source/models/world/${slug}-tripo-original.glb`),
      readFile(`assets/source/models/world/${slug}-crafted-surface.glb`),
      readFile(`public/models/world/${slug}.glb`),
    ]);
    const result = deriveYardModel(id, baseline, provider, prepared, current);
    expect(result.bytes.equals(current)).toBe(true);
    const bad = Buffer.from(current);
    bad[bad.length - 1] ^= 1;
    expect(() => deriveYardModel(id, baseline, provider, prepared, bad)).toThrow(
      'unknown current delivery'
    );
    expect(() => deriveYardModel(id, baseline, bad, prepared, current)).toThrow(
      'immutable provider changed'
    );
    expect(() => deriveYardModel(id, current, provider, prepared, current)).toThrow(
      'normalized input changed'
    );
    const pack = provenance.sourcePacks.find((entry) => entry.id === id);
    const row = {
      id,
      file: pack.runtimeDerivative.file.replace('public/models/', ''),
      ...pack.normalization,
      sourceSha256: pack.sha256,
      outputSha256: pack.runtimeDerivative.sha256,
      outputBytes: pack.runtimeDerivative.bytes,
      blenderPreparation: pack.blenderPreparation,
      geometryRefinement: pack.geometryRefinement,
    };
    await assertYardNormalization(id, row, current, baseline, provider, prepared);
    const stale = structuredClone(row);
    stale.bounds.height += 1;
    await expect(
      assertYardNormalization(id, stale, current, baseline, provider, prepared)
    ).rejects.toThrow('stale measured bounds');
    stale.bounds = row.bounds;
    stale.outputSha256 = 'stale';
    await expect(
      assertYardNormalization(id, stale, current, baseline, provider, prepared)
    ).rejects.toThrow('stale normalization output');
  });
});

it('preserves unrelated record text, top-level metadata and compact array formatting', () => {
  const input = `{
  "note": ${JSON.stringify('brace } and escaped " quote')},
  "assets": [
    {"id":"other","array":[1,2]},
    {"id":"target","array":[3,4]}
  ]
}
`;
  const output = replaceYardRecords(
    input,
    'assets',
    new Map([['target', { id: 'target', array: [5, 6] }]])
  );
  expect(output).toContain('{"id":"other","array":[1,2]}');
  expect(output.slice(0, output.indexOf('    {\n'))).toBe(
    input.slice(0, input.indexOf('    {"id":"target"'))
  );
  expect(JSON.parse(output).assets[1].array).toEqual([5, 6]);
  expect(() =>
    replaceYardRecords(input, 'assets', new Map([['missing', { id: 'missing' }]]))
  ).toThrow('exactly one existing record');
  expect(() => replaceYardRecords(input, 'assets', new Map([['target', { id: 'other' }]]))).toThrow(
    'Replacement identity changed'
  );
});
