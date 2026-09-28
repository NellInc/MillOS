// @vitest-environment node
import { test, expect } from 'vitest';
import { Document } from '@gltf-transform/core';
import { multiplyScale, GENERATED_ASSETS } from './normalize-model-assets.mjs';

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
