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
 * are already surfaced); `personnel-close` and `forklift` are the two skinned /
 * moving branches, which take the rest-space profile rather than the world one.
 */
export const DEFAULT_SURFACE_SCENES = [
  'overview',
  'yard',
  'shipping',
  'receiving',
  'village',
  'farm',
  'interior',
  'personnel-close',
  'forklift',
];

/**
 * How to serve `dist/` and where to point the browser.
 *
 * Always the site root: the built base is not consulted.
 *
 * @returns {{ version: string, basePath: string }}
 */
export function previewPlan() {
  return { version: '', basePath: '' };
}

/**
 * The stages a page must pass before the first shot, in order. `emitter` is the
 * app file that sets the signal and `emits` the literal assignment there, so a
 * test can hold the two sides of the contract against each other.
 */
export const READINESS_STAGES = [
  {
    name: 'MillOS runtime',
    emitter: 'src/components/RuntimeController.tsx',
    emits: ['window.__MILLOS_RUNTIME__.ready = true'],
    predicate: () => window.__MILLOS_RUNTIME__?.ready === true,
  },
  {
    name: 'Complete authored world',
    emitter: 'src/App.tsx',
    emits: ["document.documentElement.dataset.millosWorldReady = 'true'"],
    predicate: () => document.documentElement.dataset.millosWorldReady === 'true',
  },
];
