// @vitest-environment node
import { test, expect } from 'vitest';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Document } from '@gltf-transform/core';
import {
  multiplyScale,
  indexGeneratedGeometry,
  GENERATED_ASSETS,
} from './normalize-model-assets.mjs';

test('uniform normalization scales translated root nodes as well as their geometry', () => {
  const node = new Document().createNode().setTranslation([2, -3, 4]).setScale([1, 2, 3]);
  multiplyScale(node, 2);
  expect(node.getTranslation()).toEqual([4, -6, 8]);
  expect(node.getScale()).toEqual([2, 4, 6]);
  expect(() => multiplyScale(node, NaN)).toThrow('Invalid model scale');
});
test('world mascot records the actual source task and preserves a compact texture budget', () => {
  const spec = GENERATED_ASSETS.find((s) => s.id === 'world-dino-mascot');
  expect(spec.taskId).toBe('09017288-088f-4811-85e4-fefc3660fc71');
  expect(spec.texture).toBe(512);
  expect(spec.target).toBe(1.9558);
});

test('shelter derivative keeps the authored envelope for live glass and advertising', () => {
  const spec = GENERATED_ASSETS.find((s) => s.id === 'world-bus-shelter');
  expect(spec.fitDimensions).toEqual([4.4, 2.99, 2.3]);
  expect(spec.taskId).toBe('ea364612-95ec-42f3-a771-36dbecbd0bb9');
  expect(spec.texture).toBe(512);
});

test('lossless indexing keeps triangle corners, UV seams and animation accessors', () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const attribute = (type, values) =>
    document.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const positions = attribute('VEC3', [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0]);
  const uv = attribute('VEC2', [0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0]);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', positions)
    .setAttribute('TEXCOORD_0', uv);
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);
  const times = attribute('SCALAR', [0, 1]);
  const translation = attribute('VEC3', [0, 0, 0, 0, 1, 0]);
  const sampler = document.createAnimationSampler().setInput(times).setOutput(translation);
  const channel = document
    .createAnimationChannel()
    .setTargetNode(node)
    .setTargetPath('translation')
    .setSampler(sampler);
  document.createAnimation().addSampler(sampler).addChannel(channel);
  attribute('SCALAR', [42]); // Orphaned exporter data should not ship.
  const before = Object.fromEntries(
    primitive
      .listSemantics()
      .map((semantic) => [semantic, Array.from(primitive.getAttribute(semantic).getArray())])
  );

  indexGeneratedGeometry(document);

  expect(primitive.getIndices().getCount()).toBe(6);
  expect(primitive.getAttribute('POSITION').getCount()).toBe(5);
  for (const semantic of primitive.listSemantics()) {
    const accessor = primitive.getAttribute(semantic);
    const values = [];
    for (const index of primitive.getIndices().getArray()) {
      const size = accessor.getElementSize();
      values.push(...accessor.getArray().slice(index * size, (index + 1) * size));
    }
    expect(values).toEqual(before[semantic]);
  }
  expect(sampler.getInput()).toBe(times);
  expect(sampler.getOutput()).toBe(translation);
  expect(document.getRoot().listAccessors()).toHaveLength(5);
});

test('imported asset specifications do not parse a provenance command flag', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `process.argv = ['node', 'scripts/write-model-provenance.mjs', '--area=world']; const { GENERATED_ASSETS } = await import(${JSON.stringify(pathToFileURL(process.cwd() + '/scripts/normalize-model-assets.mjs').href)}); console.log(GENERATED_ASSETS.length);`,
    ],
    { encoding: 'utf8', timeout: 120000 }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(Number(result.stdout.trim())).toBe(GENERATED_ASSETS.length);
});

test('a direct normalization command rejects unknown flags before writing assets', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/normalize-model-assets.mjs', '--invalid-probe'],
    { encoding: 'utf8', timeout: 120000 }
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Unsupported arguments: --invalid-probe');
  expect(result.stdout).toBe('');
});
