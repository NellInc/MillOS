# Graphics Rendering System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

MillOS uses React Three Fiber, Drei, and a four-tier Zustand graphics profile.
Every tier renders the same authored world. Tiers change cost, effects, density,
resolution, and shadows rather than replacing the scene.

## Quality presets

| Level  | Current default characteristics                                         |
| ------ | ----------------------------------------------------------------------- |
| Low    | No composer, renderer-side Neutral tone mapping, minimal effects        |
| Medium | Composer tone mapping, colour grade, vignette, and SMAA; no AO or bloom |
| High   | Adds half-resolution N8AO and bloom, with higher scene detail           |
| Ultra  | Full-resolution N8AO, larger shadows, and the highest density           |

`GRAPHICS_PRESETS` and `isPostProcessingActive` live in
`src/stores/graphicsStore.ts`. The renderer and composer share the same tone
curve and exposure so adaptive changes do not create a tonal jump.

## Guarded contracts

- Shader program cache keys are deterministic. Time and random values are banned.
- Procedural albedo textures declare sRGB colour space; normals, ORM, height, and
  masks declare linear space.
- Exterior ground surfaces share a plane and use the constants in
  `src/constants/renderLayers.ts` for depth order.
- `PlaneGeometry` receives two dimensions unless integer segment counts are
  intentional.
- Tailwind global base rules stay inside cascade layers so utilities retain
  their spacing and layout behavior.
- External machine texture maps remain disabled until sampling, colour-space,
  and authored-material override requirements are met.

Source validators cover depth relations, shader keys, assets, and bundle
budgets. `npm run benchmark:runtime` is the candidate-bound timing gate. Native
captures and human review remain distinct from static validation.

## Provenance

- Sources: `src/stores/graphicsStore.ts`, `src/components/MillScene.tsx`,
  `src/components/PostProcessing.tsx`, `src/constants/renderLayers.ts`,
  `src/utils/textureGenerator.ts`
- Last verified: 2026-08-13

## See Also

- [[millos:systems/scene-zones]]
- [[millos:systems/build-deployment]]
