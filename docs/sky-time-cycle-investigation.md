## Sky Color Freeze Investigation

### Status: FIXED (2025-12-28)

The root cause was identified and fixed by adding `CoreGameTimeSystem` which runs **unconditionally** in `MillScene.tsx`, independent of the `FactoryEnvironment` component.

### The Fix

**Problem:** `GameTimeTicker` was inside `FactoryEnvironment`, which is conditionally rendered based on `perfDebug.disableEnvironment`. When disabled, game time stopped advancing and the sky froze.

**Solution:** Created `CoreGameTimeSystem` (`src/components/Environment.tsx`) which:
1. `CoreGameTimeAnimationManager` - Minimal useFrame loop that only handles game time
2. `CoreGameTimeTicker` - Registers game time + production metrics ticker

This is mounted **unconditionally** in `MillScene.tsx:765`:
```tsx
{/* Core Game Time System - ALWAYS runs to prevent sky freeze */}
<CoreGameTimeSystem />
```

The original `GameTimeTicker` inside `FactoryEnvironment` was renamed to `OrphanedStoresTicker` and now only handles supplemental store integrations (BAS history, breakdowns, emergent cooperation) via setInterval, not the game time registry.

---

### Original Investigation Notes (kept for reference)

### Summary
- `SkySystem` animates the dome, stars, lights, and sun/moon by reading `gameTime` and `weather` from `useGameSimulationStore` and pushing computed gradient values into the shader uniforms via `SkyAnimationManager` every frame (`src/components/SkySystem.tsx:253`). The scene background is also driven by the same time-based palette (`src/App.tsx`, not shown here), so both the dome and the clear color will only update when `gameTime` changes.
- `gameTime` is **not** advanced inside `SkySystem`; instead, the dedicated `CoreGameTimeSystem` component (always-on) registers a callback with `CoreGameTimeAnimationManager` so that `useGameSimulationStore().tickGameTime()` is called every ~0.5 seconds.

### Key Flow (Post-Fix)
1. `CoreGameTimeTicker` registers `tickGameTime` with `gameTimeRegistry` on mount (`src/components/Environment.tsx`).
2. `CoreGameTimeAnimationManager` (mounted unconditionally in `MillScene.tsx`) runs every frame; when `gameTimeRegistry.size > 0` it invokes `tickGameTime(0.5)` once per 0.5 seconds, which modifies `useGameSimulationStore().gameTime`.
3. `SkyAnimationManager` (included in `SkySystem`) samples that store value and re-computes gradient colors, cloud density, and `sunAngle` for the shader, ensuring the dome and lighting match the current hour (`src/components/SkySystem.tsx:253-304`).

### Remaining Potential Issues
If the sky still freezes after this fix, check:
- `useGameSimulationStore().isTabVisible` — the animation manager skips when tab is hidden
- `gameSpeed` is zero — `tickGameTime` early-returns when paused
- `skyDomeRegistry.size` — if the sky mesh didn't register, shader updates won't apply

### Verification Steps
1. With the app running, open the dev console and paste `window.useGameSimulationStore.getState().gameTime` repeatedly to watch it advance.
2. Verify `graphics.perfDebug.disableEnvironment` can be toggled without freezing the sky.
3. Check that `gameTimeRegistry.size` is 1 (the 'core' entry from `CoreGameTimeTicker`).
