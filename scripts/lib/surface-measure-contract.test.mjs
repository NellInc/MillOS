// @vitest-environment node
//
// `npm run measure:surfaces` is the paired control CLAUDE.md requires for
// surface work, and it stopped reaching runtime-ready without any error of its
// own: it served a `VERSION=v0.40` build from the site root, so every bundle
// 404'd and the page never booted. These tests hold each claim the tool makes
// about the app against the app's real source, the way `validSceneNames()` in
// capture-art-review.mjs reads BENCHMARK_SCENES rather than copying it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_SURFACE_SCENES,
  READINESS_STAGES,
  parseBenchmarkScenes,
  previewPlan,
} from './surface-measure-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (relative) => readFile(path.join(ROOT, relative), 'utf8');

describe('scenes', () => {
  test('every default scene is one the runtime knows', async () => {
    // The runtime coerces an unknown scene to `overview` without a word, so a
    // stale name measures the wrong camera and reports it under the right one.
    const valid = parseBenchmarkScenes(await source('src/runtime/runtimeMode.ts'));
    expect(valid.length).toBeGreaterThan(10);
    expect(DEFAULT_SURFACE_SCENES.filter((scene) => !valid.includes(scene))).toEqual([]);
  });
});

describe('preview plan', () => {
  test('a versioned build is served under its own base', () => {
    const html =
      '<script type="module" crossorigin src="/v0.40/assets/main-abc.js"></script>' +
      '<link rel="stylesheet" href="/v0.40/assets/main-abc.css">';
    expect(previewPlan(html)).toEqual({ version: 'v0.40', basePath: '/v0.40' });
  });

  test('an unversioned build is served from the root', () => {
    const html = '<script type="module" crossorigin src="/assets/main-abc.js"></script>';
    expect(previewPlan(html)).toEqual({ version: '', basePath: '' });
  });

  test('the base rule it mirrors is still the one vite.config.ts applies', async () => {
    // The plan hands VERSION back to `vite preview` and navigates to /<VERSION>.
    // That is only right while the config turns VERSION into /<VERSION>/.
    const config = await source('vite.config.ts');
    expect(config).toContain('const version = process.env.VERSION;');
    expect(config).toContain("const basePath = version ? `/${version}/` : '/';");
  });
});

describe('readiness', () => {
  test.each(READINESS_STAGES.map((stage) => [stage.name, stage]))(
    '%s is a signal the app actually emits',
    async (_name, stage) => {
      const emitter = await source(stage.emitter);
      for (const literal of stage.emits) expect(emitter).toContain(literal);
    }
  );

  test('every signal the working benchmark waits on before sampling is waited on here', async () => {
    // run-performance-benchmark.mjs (which capture-art-review drives) reaches a
    // complete frame on the same build. Each readiness signal it observes must
    // also gate the first surface shot, or the shot can land on the loader.
    const benchmark = await source('scripts/run-performance-benchmark.mjs');
    const signals = new Set([
      ...[...benchmark.matchAll(/dataset\.(millos\w+Ready) === 'true'/g)].map((m) => m[1]),
      ...[...benchmark.matchAll(/\[aria-label="([^"]+)"\]/g)].map((m) => m[1]),
    ]);
    if (benchmark.includes('__MILLOS_RUNTIME__?.ready === true')) signals.add('__MILLOS_RUNTIME__');
    expect(signals.size).toBeGreaterThanOrEqual(3);
    const waited = READINESS_STAGES.map((stage) => stage.predicate.toString()).join('\n');
    expect([...signals].filter((signal) => !waited.includes(signal))).toEqual([]);
  });

  test('the loader the stages wait out is labelled the way the app labels it', async () => {
    const messages = await source('src/components/LoadingScreen.messages.ts');
    const waited = READINESS_STAGES.map((stage) => stage.predicate.toString()).join('\n');
    const label = waited.match(/\[aria-label="([^"]+)"\]/)?.[1];
    expect(label).toBeTruthy();
    expect(messages).toContain(`dialogLabel: '${label}'`);
  });
});
