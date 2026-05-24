# Graphics Rendering System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS uses React Three Fiber with Drei helpers for 3D rendering, controlled by a four-tier quality preset system (`graphicsStore.ts`). Known performance bugs and z-fighting patterns are documented with prevention rules in `CLAUDE.md`.

## Quality Presets

Managed in `src/stores/graphicsStore.ts`, four tiers:

| Level | Key characteristics |
|-------|-------------------|
| Low | No shadows, `meshBasicMaterial`, minimal effects, no post-processing |
| Medium | Shadows, HDRI environment, standard materials, NO post-processing |
| High | Post-processing, `MeshReflectorMaterial` floor, `AmbientDetails` |
| Ultra | Full effects |

`GRAPHICS_PRESETS` constant exported from `src/stores/graphicsStore.ts`.

## Performance Issues Fixed

### Shader Cache Key Bug (2025-12-29)
Using `Date.now()` in `customProgramCacheKey` forces WebGL shader recompilation every frame. Fix: stable deterministic key based on actual configuration (`CLAUDE.md:477-498`). Rule: never use `Date.now()`, `Math.random()`, or any non-deterministic value in `customProgramCacheKey`.

### GC Pressure
Module-level reusable `THREE.Vector3` instances in `SmartForklift.tsx` and `Environment.tsx` replace per-frame `new THREE.Vector3()` allocations in `useFrame` callbacks (`CLAUDE.md:498-502`).

### Flickering (Medium+ Quality)
Disabled effects that caused flicker (`CLAUDE.md:504-530`):
- `AtmosphericHaze` (BackSide depth sorting) — disabled in MillScene.tsx
- Post-processing Bloom/Vignette — disabled on Medium preset
- ContactShadows raised to y=0.05; shadow bias changed from -0.0001 to -0.001
- Camera near/far changed from 0.1/500 to 0.5/300 (better depth precision)

### useSyncExternalStore Race Condition (2025-12-30)
PA announcements flashed briefly when muted. Pattern: multi-layer defense: prevention in scheduler, render gate checking BOTH hook and direct property, effect gate, cleanup dismissal (`CLAUDE.md:810-857`). Key files: `PAAnnouncementSystem.tsx`, `src/components/game/shared.tsx`.

## Z-Fighting Prevention

### Interior Floor Surfaces
Use `FLOOR_LAYERS.*` (Y positions 0.01–0.16) + `depthWrite={false}` for transparent overlays.

### Exterior Surfaces
All at `EXTERIOR_LAYERS.ground = -0.02`; differentiated by `POLYGON_OFFSET` presets (`src/constants/renderLayers.ts`). Do NOT Y-separate exterior surfaces — creates visible seams (`CLAUDE.md:538-550`).

### PlaneGeometry NaN Prevention
`PlaneGeometry(width, height, widthSegments?, heightSegments?)` — 3rd argument is segment count, NOT depth (`CLAUDE.md:695-710`). Utilities in `src/utils/typeGuards.ts`: `safeDimension()`, `safeDivide()`, `safeFinite()`. Debug hook: `useGeometryNaNDetector()` in `src/components/SafeGeometry.tsx`.

## Tailwind v4 CSS Layer Bug

Tailwind v4 emits utilities inside CSS cascade layers (`@layer`). Unlayered CSS (e.g., `* { margin: 0; padding: 0; }`) overrides all layered rules regardless of specificity. Do not use universal resets in `src/index.css` or `index.html`. Global base styles must go inside `@layer base { }` (`CLAUDE.md:302-333`). Service worker in `public/sw.js` can serve stale CSS; clear site data after production build changes.

## Path Aliases

`@/*` maps to project root (configured in `tsconfig.json` and `vite.config.ts`, `CLAUDE.md:445`).

## Provenance

- Sources consulted: `CLAUDE.md:295-650`, `CLAUDE.md:800-860`, `src/stores/graphicsStore.ts`, `src/constants/renderLayers.ts`, `src/utils/depthMaterials.ts`, `src/utils/typeGuards.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/scene-zones]]
