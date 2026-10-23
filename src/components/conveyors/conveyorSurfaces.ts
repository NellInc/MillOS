/**
 * Surface finish for the LIVE conveyor renderer (`src/components/ConveyorSystem.tsx`).
 *
 * `src/components/conveyors/CompactConveyorSystem.tsx` is unreachable dead code -
 * nothing imports it - so anything authored there renders nothing. Confirmed by
 * `npm run validate:reachability`, which lists it with a reason. This module is
 * the single owner of the conveyor branch's analytic surface treatment.
 *
 * ===========================================================================
 * WHY THIS BRANCH NEEDED ITS OWN MODULE
 * ===========================================================================
 *
 * `world-conveyors` was the only branch in the scene at **0% shader** after
 * pass 4 finished every other one - 163 meshes of belts, rollers, frames and
 * guard rails threading through `interior`, `milling`, `packing` and `silos`.
 * It was not a texturing job: three quarters of those meshes already carry a
 * normal and a roughness map from `utils/sharedMaterials.ts`. What they lacked
 * was the metre-scale variation that stops a 55 m belt run and its 25 identical
 * rollers reading as one extruded colour.
 *
 * THE MATERIALS ARE CLONED RATHER THAN TREATED IN PLACE. `METAL_MATERIALS`,
 * `SAFETY_MATERIALS` and `MACHINE_MATERIALS` in `utils/sharedMaterials.ts` are
 * module-level singletons, and the only LIVE consumer of those three is the
 * conveyor system (every other importer of that file takes `WALL_MATERIALS`,
 * `OUTDOOR_MATERIALS`, `PROCEDURAL_TEXTURES` or `SHARED_GEOMETRIES`; the
 * machines have their own set in `machines/machineSurfaces.ts`). Treating the
 * singletons in place would therefore work today and become an invisible trap
 * the moment something else imports one - a component picking up conveyor grime
 * because of an import it never made. Clones cost eleven material objects and
 * no draw calls: `clone()` copies map REFERENCES, and every profile shares one
 * `customProgramCacheKey`, so the program count is unchanged.
 *
 * Cloning FIRST and injecting SECOND is the safe order. The reverse - cloning a
 * material that already carries the treatment - produces the JSON ghost
 * `worldSurface` guards against: `THREE.Material.copy()` runs userData through
 * `JSON.parse(JSON.stringify(...))` and does not copy `onBeforeCompile`.
 *
 * ===========================================================================
 * COORDINATE SPACE: THE ROLLERS SPIN, SO THEY CANNOT USE THE WORLD FIELD
 * ===========================================================================
 *
 * `RollerConveyor` recomposes all of its instance matrices every frame with a fresh
 * `_tempEuler.set(Math.PI / 2, rotation, 0)`. A world-space detail field is
 * nailed to the world, so a rotating surface sliding through it makes the
 * detail SWIM across the roller - the same failure the worker bodies have, for
 * the same reason. The roller profile therefore overrides `objectSpace` to 1,
 * which welds the field to the geometry.
 *
 * The trade is that all the instances then sample IDENTICALLY, because object
 * space is taken from the shared `position` attribute rather than from
 * `transformed`. For rollers cut from one drum that is correct - they are
 * identical parts. Do NOT copy the override onto the frames or the rails: those
 * are static, and the world field is exactly what stops two identical 30 m
 * frame boxes reading as two copies of one prefab.
 *
 * ===========================================================================
 * HOW A CHANGE HERE IS VERIFIED
 * ===========================================================================
 *
 * NOT by `audit-scene-models.mjs`. That instrument scores a mesh as finished on
 * the MERE PRESENCE of a shader injection, so this file could be inert and the
 * branch would still leave the work list. The paired control is
 *
 *   npm run measure:surfaces -- --label=<name> --scenes=interior,milling,packing,silos
 *
 * and an exactly-zero changed fraction means the term is not there.
 */
import * as THREE from 'three';
import { METAL_MATERIALS, SAFETY_MATERIALS, MACHINE_MATERIALS } from '../../utils/sharedMaterials';
import { applyWorldSurface } from '../../utils/worldSurface';
import type { WorldSurfaceOverrides, WorldSurfaceProfileName } from '../../utils/worldSurface';

/**
 * Clone a shared singleton and finish the clone.
 *
 * `name` is set so the material is identifiable in `audit-scene-models.mjs`
 * output; without it every clone reports as `MeshStandardMaterial #<hex>` and
 * the flat/shaded tables cannot tell one conveyor part from another.
 */
const finish = (
  source: THREE.Material,
  name: string,
  profile: WorldSurfaceProfileName,
  overrides: WorldSurfaceOverrides = {}
): THREE.MeshStandardMaterial => {
  const clone = source.clone() as THREE.MeshStandardMaterial;
  clone.name = name;
  return applyWorldSurface(clone, profile, overrides);
};

/**
 * Every conveyor part stands on the mill floor - the belts run at y 0.5 and the
 * side rails at y 1.3, with nothing in this branch on the elevated sifter deck.
 * So the default datum of 0 is correct here and the grime gradient does real
 * work rather than saturating, which is the failure `machineSurfaces.ts`
 * records for the plansifters at y 9.
 */
const CONVEYOR_GRIME: WorldSurfaceOverrides = {
  // Belt lines are the dustiest part of a mill: flour escapes at every transfer
  // point. Slightly above the `painted` default of 0.15.
  dust: 0.2,
  // Frames are waist-high, so the climb should read across the whole part
  // rather than fading out in the first 30 cm of a 2.2 m ramp.
  grimeHeight: 1.4,
};

/**
 * Painted steel structure: frames, rails, guards, housings, support legs.
 *
 * All of these are DIELECTRICS at metalness 0 in the shared set, so `painted`
 * is the right family - its budget sits in albedo and roughness, where a
 * dielectric actually shows it.
 */
export const CONVEYOR_MATERIALS = {
  /** Primed industrial steel: the tension mechanism's head pulley. */
  steel: finish(METAL_MATERIALS.steel, 'conveyor-pulley', 'painted', CONVEYOR_GRIME),
  steelDark: finish(METAL_MATERIALS.steelDark, 'conveyor-frame-dark', 'painted', CONVEYOR_GRIME),
  paintedSlate: finish(METAL_MATERIALS.paintedSlate, 'conveyor-rail', 'painted', CONVEYOR_GRIME),
  paintedDarkGray: finish(
    METAL_MATERIALS.paintedDarkGray,
    'conveyor-housing',
    'painted',
    CONVEYOR_GRIME
  ),
  paintedMediumGray: finish(
    METAL_MATERIALS.paintedMediumGray,
    'conveyor-guard',
    'painted',
    CONVEYOR_GRIME
  ),
  paintedBlack: finish(METAL_MATERIALS.paintedBlack, 'conveyor-trim', 'painted', CONVEYOR_GRIME),
  industrialBlue: finish(
    METAL_MATERIALS.industrialBlue,
    'conveyor-motor',
    'painted',
    CONVEYOR_GRIME
  ),
  /**
   * Brass fittings are CONDUCTORS (metalness 1), where the diffuse term is zero
   * and a grime tint has nothing to tint. `metal` puts the budget in roughness
   * and the edge term instead - which is also what makes a metal silhouette
   * read at the `interior` camera's distance.
   */
  brass: finish(METAL_MATERIALS.brass, 'conveyor-fitting-brass', 'metal'),
  /**
   * The drive shaft takes `metal` too, but for a different reason: it is
   * authored at metalness 0 as an OILED/BLUED shaft rather than bare bright
   * steel (see its note in `sharedMaterials.ts`), so it does have a diffuse.
   * The profile is chosen for its LOW grime - a running shaft wipes itself
   * clean where it turns - not for the conductor argument above.
   */
  shaft: finish(MACHINE_MATERIALS.shaft, 'conveyor-drive-shaft', 'metal'),
  /**
   * Hazard paint. `signage` is the family that is DELIBERATELY the least
   * weathered: a warning that has been aged until it stops reading has been
   * broken, not finished.
   */
  warningRed: finish(SAFETY_MATERIALS.warningRed, 'conveyor-stop-block', 'signage'),
  warningYellow: finish(SAFETY_MATERIALS.warningYellow, 'conveyor-hazard', 'signage'),
  /**
   * The idler rollers. Galvanised drums, so `metal` - and OBJECT space, because
   * they spin. See the coordinate-space note at the top of this file.
   *
   * This was the branch's one entry in FLAT MATERIALS BY WORLD SIZE:
   * `MeshStandardMaterial #c8ccd0`, 25 m over one mesh and 25 instances. The
   * colour is kept rather than reset to white because this material carries no
   * albedo map, so `color` IS its albedo and, at metalness 0.85, its F0 tint.
   */
  roller: applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'conveyor-roller',
      color: '#c8ccd0',
      metalness: 0.85,
      roughness: 0.28,
      envMapIntensity: 1.15,
    }),
    'metal',
    { objectSpace: 1 }
  ),
} as const;

/**
 * The belt surface itself.
 *
 * The belt is STATIC geometry whose texture scrolls, so the field stays in
 * world space: the detail belongs to the installation, not to the rubber, and a
 * 55 m run is exactly the length at which one uniform tone reads as a decal.
 * `vehicle` would be wrong here for the same reason - it is the profile for
 * things that translate.
 *
 * `mesoFadeMetres` is pulled in to 30 m. The belt already carries a normal map
 * at its own scale, and the `interior` camera sits far enough back that a
 * second sub-metre term at full strength is two competing periods in the same
 * pixels.
 *
 * Takes the maps rather than creating them: they are quality-dependent and the
 * caller owns that decision.
 */
export const createBeltMaterial = (maps: {
  map: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  normalScale: THREE.Vector2;
}): THREE.MeshStandardMaterial =>
  applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'conveyor-belt',
      // No `color`: the albedo map is correctly tagged sRGB, so a tint here
      // would multiply the same hue in twice.
      map: maps.map,
      normalMap: maps.normal,
      normalScale: maps.normalScale,
      roughnessMap: maps.roughness,
      // 1.0 so the roughness map is the sole authority (three multiplies).
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.55,
    }),
    'painted',
    { ...CONVEYOR_GRIME, mesoFadeMetres: 30, meso: 0.09, reliefMetres: 0.01 }
  );
