import { useEffect } from 'react';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { WORLD_SURFACE_STRENGTH } from '../../utils/worldSurface';
import { WATER_CAUSTIC_STRENGTH } from '../../utils/waterCaustics';

/**
 * A/B instrument: switch the world surface treatment off without changing
 * anything else about the frame.
 *
 * WHY THIS HAS TO EXIST BEFORE THE TREATMENT IS TRUSTED. Every gate in this
 * repo reports a surface as finished once it carries a shader injection.
 * `audit-scene-models.mjs` does it explicitly -
 *
 *     if (mesh.material.shaderInjected) entry.shaded += 1;
 *     else if (slots.size === 0)        entry.flat  += 1;
 *
 * and its flat work list skips the same meshes. So an injection that compiles
 * and contributes NOTHING scores exactly as well as one that works, and the
 * 3,953 m row at the top of that list disappears either way. CLAUDE.md's rule
 * for this is "an absent term reads as exactly 1.000, and that is the tell";
 * the paired control it demands is `scripts/measure-surface-contrast.mjs`, and
 * this component is the lever that script pulls.
 *
 * WHY A SHARED UNIFORM RATHER THAN UNMOUNTING OR REBUILDING. CLAUDE.md:
 * "Toggle at runtime, not by editing a constant and rebuilding. Two builds
 * differ by more than your variable. One page load, one variable." Every
 * material `worldSurface` touches receives the SAME `WORLD_SURFACE_STRENGTH`
 * object in its uniform map, so one write reaches all of them on the next frame:
 * no recompile, no program-cache churn, no re-batching, identical shader cost in
 * both arms. The arms differ in exactly one float.
 *
 * three re-uploads a material's full uniform list whenever a different material
 * was bound last (`WebGLRenderer.js`, `refreshMaterial = true` on
 * `material.id !== _currentMaterialId`) and resets `_currentMaterialId` to -1
 * after every `render()`, so the write cannot be missed. Verified against the
 * installed three source rather than assumed.
 *
 * HOW TO READ THE RESULT. `measure-surface-contrast.mjs` reports the fraction of
 * pixels that moved and the local-contrast ratio inside that region:
 *
 *   - pixels move and contrast rises: the treatment is doing what it claims.
 *   - pixels move and contrast is flat: it is re-tinting, not adding surface.
 *     Probably grime and dust with the macro and meso terms lost.
 *   - EXACTLY zero pixels move: the term is not there. Not subtle - absent.
 *     Find the inert term before applying the treatment anywhere else.
 */
export function SurfaceTreatmentIsolation() {
  const disableSurfaceTreatment = useGraphicsStore(
    (state) => state.graphics.perfDebug.disableSurfaceTreatment
  );

  useEffect(() => {
    WORLD_SURFACE_STRENGTH.value = disableSurfaceTreatment ? 0 : 1;
  }, [disableSurfaceTreatment]);

  // The bed caustics ride the same instrument shape: one shared uniform. Low
  // draws its water opaque, so no bed shows through and the term stays off.
  const disableWaterCaustics = useGraphicsStore(
    (state) => state.graphics.perfDebug.disableWaterCaustics
  );
  const lowQuality = useGraphicsStore((state) => state.graphics.quality === 'low');
  useEffect(() => {
    WATER_CAUSTIC_STRENGTH.value = disableWaterCaustics || lowQuality ? 0 : 1;
  }, [disableWaterCaustics, lowQuality]);

  useEffect(
    () => () => {
      WATER_CAUSTIC_STRENGTH.value = 1;
      // The uniform object outlives this component - it is module state shared
      // by every treated material - so an unmount that left it at 0 would
      // silently strip the finish from the whole app.
      WORLD_SURFACE_STRENGTH.value = 1;
    },
    []
  );

  return null;
}

export default SurfaceTreatmentIsolation;
