/**
 * The app contract `measure-surface-contrast.mjs` depends on, kept apart from
 * the script so it can be tested against the real source.
 *
 * The script runs `main()` on import, so nothing in it can be exercised by a
 * test. Everything here is a claim about something the APP owns - which scenes
 * exist, where the built bundle is served, and which signals mean "the world
 * is on screen" - and each of those claims has drifted silently before.
 */

/**
 * Scenes whose frames are mostly the surfaces this work touches.
 *
 * `yard`, `shipping` and `receiving` are the truck-yard and logistics merges;
 * `overview` and `village` carry the exterior shell and the village; `interior`
 * is the control that should barely move (its walls are the shell, its machines
 * are already surfaced); `forklift` is the moving branch, which takes the
 * rest-space profile rather than the world one.
 *
 * `personnel-close` used to sit here as the skinned branch. The v0.40 uncrewed
 * release removed that camera, after which the runtime quietly served
 * `overview` under its name: a second overview reading reported as personnel.
 */
export const DEFAULT_SURFACE_SCENES = [
  'overview',
  'yard',
  'shipping',
  'receiving',
  'village',
  'farm',
  'interior',
  'forklift',
];

/**
 * Scene names out of `src/runtime/runtimeMode.ts`, parsed the way
 * `validSceneNames()` in capture-art-review.mjs does, because the runtime
 * silently coerces an unknown scene to `overview`.
 *
 * @param {string} runtimeModeSource
 * @returns {string[]}
 */
export function parseBenchmarkScenes(runtimeModeSource) {
  const block = runtimeModeSource.match(
    /const BENCHMARK_SCENES[^=]*=\s*new Set<BenchmarkScene>\(\[([^\]]*)\]/
  );
  if (!block) {
    throw new Error(
      'Could not parse BENCHMARK_SCENES from src/runtime/runtimeMode.ts. The declaration ' +
        'moved or changed shape; update scripts/lib/surface-measure-contract.mjs to match.'
    );
  }
  const names = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (names.length === 0) throw new Error('BENCHMARK_SCENES parsed as empty.');
  return names;
}

/**
 * How to serve `dist/` and where to point the browser.
 *
 * `VERSION=v0.40 npm run build` emits `/v0.40/assets/...` URLs (vite.config.ts:
 * `base = /${VERSION}/`). Served from the root by a preview that was not given
 * the same VERSION, every bundle 404s, `__MILLOS_RUNTIME__` never appears, and
 * the first readiness wait times out with no error of its own. That was the
 * whole of why `measure:surfaces` never reached runtime-ready. The base is read
 * from the built index, exactly as run-performance-benchmark.mjs does, so the
 * tool follows whatever the build was told rather than what the caller's shell
 * happens to export.
 *
 * @param {string} indexHtml contents of dist/index.html
 * @returns {{ version: string, basePath: string }}
 */
export function previewPlan(indexHtml) {
  const version = indexHtml.match(/(?:src|href)=["']\/(v\d+\.\d+)\/assets\//)?.[1] ?? '';
  return { version, basePath: version ? `/${version}` : '' };
}

/**
 * The stages a page must pass before the first shot, in order. `emitter` is the
 * app file that sets the signal and `emits` the literal assignment there, so a
 * test can hold the two sides of the contract against each other.
 *
 * The same three stages run-performance-benchmark.mjs waits on. `millosWorldReady`
 * alone is not enough: it is set in a layout effect BEFORE the world's first
 * draw ("assets, batching and settled frames still gate access", App.tsx), and
 * measured on a v0.40 build it fired at 6 s with the loading overlay still up.
 * A shot taken then photographs the loader, or the unbatched originals. The
 * startup latch is what certifies the revealed, batched world.
 */
export const READINESS_STAGES = [
  {
    name: 'MillOS runtime',
    emitter: 'src/components/RuntimeController.tsx',
    emits: ['window.__MILLOS_RUNTIME__.ready = true'],
    predicate: () => window.__MILLOS_RUNTIME__?.ready === true,
  },
  {
    name: 'Complete, animation-ready first reveal',
    emitter: 'src/utils/startupReadiness.ts',
    emits: ["document.documentElement.dataset.millosStartupReady = 'true'"],
    predicate: () =>
      document.documentElement.dataset.millosStartupReady === 'true' &&
      document.querySelector('[aria-label="Loading MillOS"]') === null,
  },
  {
    name: 'Complete authored world',
    emitter: 'src/App.tsx',
    emits: ["document.documentElement.dataset.millosWorldReady = 'true'"],
    predicate: () => document.documentElement.dataset.millosWorldReady === 'true',
  },
];
