/**
 * Machine surface materials for the LIVE machine renderer
 * (`src/components/machines/CompactMachines.tsx`).
 *
 * `src/components/Machines.tsx` and the `Instanced*.tsx` tree are unreachable
 * dead code - nothing imports them. Anything authored there renders nothing.
 * This module is the single owner of every material the mill's machines use.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS - three failures the previous material set had
 * ---------------------------------------------------------------------------
 *
 * 1. THE ROUGHNESS MAP WAS A MATHEMATICAL NO-OP.
 *    Twelve materials carried `roughnessMap: PROCEDURAL_TEXTURES.brushedMetal`.
 *    `generateBrushedMetal` packs R = roughness, G = metalness, B = AO, but
 *    three samples `roughnessMap.g` (`roughnessmap_fragment.glsl.js:9`). Every
 *    one of those materials was multiplying its roughness by the METALNESS
 *    channel - a flat 0.90-1.00 - so the map contributed nothing but a texture
 *    fetch. `generateMachineORM` packs the glTF order (R = AO, G = roughness,
 *    B = metalness) and its G channel spans 0.35-0.85 with mean ~0.582, so it
 *    is a real multiplier. Base `roughness` is therefore authored at or near 1
 *    here and the MAP is the authority, matching the shell in
 *    `OptimizedFactoryInfrastructure.tsx`.
 *
 * 2. THE NORMAL MAP WAS SUB-PIXEL. `generatePanelNormal(256, 8, 0.02)` makes a
 *    bevel 0.02 x (1/8) = 0.0025 UV wide - 0.64 px at 256 - which the mip chain
 *    erases outright, and it was then applied at normalScale 0.06-0.08.
 *    `generateMachinePanelNormal` specifies the bevel in PIXELS and clamps it
 *    to >= 4 px, so it survives mipping. Applied here at 0.5-0.75.
 *
 * 3. PAINTED EQUIPMENT WAS AUTHORED AS HALF-METAL (0.16-0.48). Painted and
 *    powder-coated steel are DIELECTRICS. The 0.05-0.5 band has neither a full
 *    diffuse albedo nor a real specular; it is what makes colours read chalky.
 *    Metalness here is a hard binary: 0 or 1, nothing between.
 *
 * ---------------------------------------------------------------------------
 * WHICH SURFACES ARE CONDUCTORS
 * ---------------------------------------------------------------------------
 * metalness 1.0 means diffuse is ZERO and the albedo hex becomes F0, the
 * specular reflectance. Real metals have F0 around 0.4-0.95 linear and are
 * NEUTRAL or warm - there is no such thing as a dark blue conductor. Measured
 * linear values of the existing palette:
 *
 *   silo      #c2c9c7 -> 0.539, 0.584, 0.571   galvanised steel      OK
 *   roller    #d0d7d7 -> 0.631, 0.680, 0.680   polished chill roll   OK
 *   hardware  #a8b2b4 -> 0.392, 0.445, 0.456   zinc-plated fittings  OK
 *   siloRoof  #718087 -> 0.165, 0.216, 0.242   far too dark to be a metal
 *   millTrim  #40565b -> 0.056, 0.101, 0.116   far too dark to be a metal
 *
 * So the conductor set is exactly { silo skin, chill rolls, hardware }. Every
 * coloured hex is a painted dielectric. Promoting the dark blue-greys to
 * metalness 1 - as a naive "bare metal is 1.0" pass would - turns them into
 * near-black mirrors.
 *
 * ---------------------------------------------------------------------------
 * ALBEDO RE-BALANCE
 * ---------------------------------------------------------------------------
 * Dropping metalness m -> 0 multiplies the diffuse term by 1/(1-m), which is up
 * to 1.9x on `millPanel`. To hold the tonal design while still letting the
 * colours come up, each painted hex is scaled in LINEAR space by (1 - m)^0.75:
 * full compensation would cancel the whole point of the fix, none of it would
 * blow the palette out. The exponent leaves painted surfaces roughly 10-15%
 * brighter than before, which is wanted - the lighting rebalance (ambient 0.76
 * -> 0.22, hemisphere 0.7 -> 0.22) took about half the fill off interior faces.
 *
 * NOTE ON TINTS: not one material here has an albedo `map:`, so every `color:`
 * IS the albedo and none of them is a compensating tint for the DataTexture
 * colour-space bug. Nothing was reverted to #ffffff; the only hex changes are
 * the deliberate dielectric rebalance above. The ORM and normal maps are
 * linear/NoColorSpace data and do not multiply hue.
 */

import * as THREE from 'three';
import {
  generateMachineORM,
  generateMachinePanelNormal,
  generateProceduralNormal,
} from '../../textures';
import { applyWorldSurface } from '../../utils/worldSurface';
import { POLYGON_OFFSET } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { generateGalvanizedORM, generateGalvanizedNormal } from '../../textures/brushedMetal';
import { generateEnamelORM } from '../../textures/paintedMetal';
import { createColorDataTexture, getTexture } from '../../utils/textureGenerator';

// ===========================================================================
// SOURCE TEXTURES
// ===========================================================================

/**
 * Clone a shared procedural texture and give it its own tiling.
 *
 * `repeat` and `offset` are NOT part of three's `getTextureCacheKey`
 * (`WebGLTextures.js`), so a clone that differs only in tiling resolves to the
 * same `__webglTexture`: free in VRAM, one extra JS object. `anisotropy` IS in
 * that key, so raising it does buy a second upload - only the silo skin, which
 * is a 12.5 m vertical surface always seen at a grazing angle, pays for it.
 *
 * NEVER mutate the shared source. `getTexture` in `textureGenerator.ts` hands
 * the same instance to every caller with the same parameters, and two of these
 * keys are shared with the factory shell.
 */
function band(
  source: THREE.Texture,
  repeatX: number,
  repeatY: number,
  options: { readonly anisotropy?: number } = {}
): THREE.Texture {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.NoColorSpace;
  if (options.anisotropy !== undefined) texture.anisotropy = options.anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Both ORM keys are deliberately identical to the two the factory shell
 * already generates (`STRUCTURAL_ORM` / `DECK_ORM` in
 * `OptimizedFactoryInfrastructure.tsx`), so the texture cache hands back the
 * same objects and the machines add ZERO new ORM texture memory.
 *
 * R = AO, G = roughness, B = metalness (glTF packing).
 */
const SKIN_ORM = generateMachineORM(512, 'vertical', 96);
const HOUSING_ORM = generateMachineORM(512, 'horizontal', 128);
const ENAMEL_ORM = generateEnamelORM();

/** Same key as the shell's `CLADDING_PANEL_NORMAL`; also a free cache hit. */
const PANEL_NORMAL = generateMachinePanelNormal(512, 4, 7);

/**
 * Mean of the ORM green channel. `final roughness = base * this`, so a base of
 * 1.0 lands at ~0.58 with a 0.35-0.85 spread. Exported for the invariant test.
 */
export const MACHINE_ORM_MEAN_ROUGHNESS = 0.582;

/** Extremes of the ORM green channel, for the same reason. */
export const MACHINE_ORM_ROUGHNESS_RANGE = { min: 0.35, max: 0.85 } as const;

// ===========================================================================
// TEXEL DENSITY BANDS
// ===========================================================================
//
// One 256 px tile used to be stretched from the 12.5 m silo body to a 0.065 m
// ladder rung - a 190x range on one `repeat = (1,1)` texture. Each band below
// states the world size of the surface it is cut for and the resulting tile
// size in metres, so the next person can check the arithmetic rather than
// guess. Target is 1.0-1.6 m per ORM tile on large housings and 0.4-0.6 m on
// panels; the panel-relief normal is tiled so its 4-panel grid lands at a
// ~1.2 m pitch, which is roughly one real sheet-metal panel.
//
// Sub-0.25 m members (ladder rails and rungs, vents, guides, guards,
// suspensions, fan grilles) get NO detail maps at all. A grid or a brush streak
// tiled onto a 0.075 m rail is sub-pixel noise that mips to a flat constant -
// the same inert-detail failure this file exists to fix. That follows the
// shell's `steelTrim` precedent.

/** Installed 12 m bins: about 1.5 m of zinc stock per ORM tile.
 * Their corrugation and joints have geometry; cladding's dark grid would add
 * seams where none exist. Working if the same-camera finish loses those seams
 * while the 15.6 cm normal corrugation remains visible in supporting views.
 */
const GALVANIZED_ORM = generateGalvanizedORM();
const SILO_SKIN_ORM = band(GALVANIZED_ORM, 25, 16, { anisotropy: 4 });
const SILO_SKIN_NORMAL = band(generateGalvanizedNormal(true), 25, 8, { anisotropy: 4 });
const SILO_TRIM_ORM = band(GALVANIZED_ORM, 25, 3);
const SILO_TRIM_NORMAL = band(generateGalvanizedNormal(false), 25, 3);

/** Silo legs: 0.24 x 3 m box. Tile ~0.5 m, no relief (too slender). */
const SILO_LEG_ORM = band(SKIN_ORM, 0.5, 6);

/** Cast enamel has fine orange peel; its seams now belong to actual fittings. */
const MILL_SKIN_ORM = band(ENAMEL_ORM, 4, 4);
const MILL_SKIN_NORMAL = band(generateProceduralNormal(256, 0.18, 24), 2, 2);

/** Mill base 5.2 x 4.4 m, hopper cone, sifter inlet. Tile ~1.2 m. */
const MILL_TRIM_ORM = band(HOUSING_ORM, 4, 2);
const MILL_TRIM_NORMAL = band(PANEL_NORMAL, 1.3, 1.1);

/** Enamel control strip: 3.5 x 0.46 m. Tile 0.5 m. Strip - no panel grid. */
const MILL_PANEL_ORM = band(HOUSING_ORM, 7, 1);

/** Recessed inspection panels: 3.65 x 2.7, 2.45 x 1.82, 2.65 x 1.65 m. */
const RECESS_ORM = band(HOUSING_ORM, 5, 3);
const RECESS_NORMAL = band(PANEL_NORMAL, 1.5, 1);

/** Chill rolls: circumference 3.02 m x 3.25 m long. Tile ~0.4 m. */
const ROLLER_ORM = band(SKIN_ORM, 8, 8);

/** Sifter body: 6.5 x 3.35 m face. Satin enamel over the existing panel relief. */
const SIFTER_SKIN_ORM = band(ENAMEL_ORM, 5, 3);
const SIFTER_SKIN_NORMAL = band(PANEL_NORMAL, 1.5, 0.75);

/** Sifter trays 6.8 x 5.95 m and lid 5.6 x 4.8 m. Tile ~1.2 m. */
const SIFTER_TRAY_ORM = band(HOUSING_ORM, 5, 5);

/** Sifter platform deck: 7.8 x 6.8 m. Tile ~1.2 m; plate pitch ~1.2 m. */
const PLATFORM_ORM = band(HOUSING_ORM, 6, 6);
const PLATFORM_NORMAL = band(PANEL_NORMAL, 1.6, 1.4);

/** Packer body: 3.7 x 4.75 m face. Same enamel, independently tiled. */
const PACKER_SKIN_ORM = band(ENAMEL_ORM, 3, 4);
const PACKER_SKIN_NORMAL = band(PANEL_NORMAL, 0.8, 1);

/** Packer base 4.5 x 4.25 m, hopper cone, fill head. Tile ~1.1 m. */
const PACKER_TRIM_ORM = band(HOUSING_ORM, 4, 2);
const PACKER_TRIM_NORMAL = band(PANEL_NORMAL, 1.1, 1.1);

/** Drive motors: circumference 4.27 m x 1.35 m. Tile ~0.6 m. */
const MOTOR_ORM = band(HOUSING_ORM, 7, 2);

/** Hatch plate 0.95 x 1.25 m and the thin accent strips. Tile ~0.5 m. */
const PLATE_ORM = band(HOUSING_ORM, 4, 2);

// ===========================================================================
// GRIME / DUST / EDGE-WEAR SHADER
// ===========================================================================

/**
 * Constant. CLAUDE.md bans `Date.now()` / `Math.random()` in
 * `customProgramCacheKey` - a changing key recompiles the shader every frame,
 * which is a documented 60-recompiles-per-second bug in this repo. Bump the
 * version suffix BY HAND when the injected GLSL below changes.
 *
 * Every machine material injects BYTE-IDENTICAL source and differs only in
 * uniform VALUES, so one key is correct: three folds the parameter defines
 * (USE_ROUGHNESSMAP, USE_AOMAP, USE_NORMALMAP, USE_INSTANCING_COLOR, ...) into
 * the program key alongside this string (`WebGLPrograms.getProgramCacheKey`),
 * so permutations still split properly.
 */
export const MACHINE_WEAR_CACHE_KEY = 'machineWear_v6';

/** Share of the silo drum's 180 streak columns that carry run-off, per ring. */
export const SILO_STREAK_LIVE_FRACTION = 0.16;

/**
 * World-space reflection Y over which the silo's reflected environment goes
 * from the sky band (untouched) to the ground band (neutralised).
 */
export const SILO_GROUND_HORIZON = [0.05, -0.25] as const;

/** How far the silo patina's diffuse bounce is pulled to its own luminance. */
export const SILO_GROUND_BOUNCE = 0.7;

/** TS mirror of the shader's ground weight for a world reflection Y. */
export function siloGroundWeight(reflectY: number, strength = 1): number {
  const [edge0, edge1] = SILO_GROUND_HORIZON;
  const t = THREE.MathUtils.clamp((reflectY - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t) * THREE.MathUtils.clamp(strength, 0, 1);
}

/** TS mirror of the shader's neutralisation: lerp to luminance by `weight`. */
export function neutraliseSiloGround(target: THREE.Color, weight: number): THREE.Color {
  const luminance = 0.2126 * target.r + 0.7152 * target.g + 0.0722 * target.b;
  return target.lerp(new THREE.Color(luminance, luminance, luminance), weight);
}

// ---------------------------------------------------------------------------
// Silo drum corrugation, shaded analytically
// ---------------------------------------------------------------------------

/**
 * The corrugated shell lathe (`createSiloShellGeometry` in CompactMachines):
 * `ridges` waves over the unit height, `depth` of the unit radius. Installed at
 * 6 m x 25 m that is a 0.625 m wave 24 mm deep.
 *
 * That wave keeps the silhouette and is NOT shaded. Its vertex normals carry a
 * 0.12 slope (6.9 degrees), which swung the reflected ray 14 degrees either
 * way: from a camera above the battery that is across the horizon, so every
 * wave flipped between sky and the brown hills and read as smeared horizontal
 * brown bands (final3-med-12 silos; gone with the vertex normals smoothed, one
 * page load). Shaded at a third of that (0.04) the bands were as strong as
 * ever, since the reflection sits on the horizon edge, and under the night
 * floods the same wave striped every grazing scallop (r4 tune probes). The
 * crisp corrugation is the fine one in the normal map, 15.6 cm.
 */
export const SILO_SHELL_PROFILE = { ridges: 40, depth: 0.004 } as const;
/** Installed drum radius and shell height, metres (`SITE_LAYOUT` silo 12 x 32). */
export const SILO_DRUM_RADIUS = 6;
export const SILO_DRUM_SHELL_HEIGHT = 25;
/** Fine corrugation in the skin normal map: 20 ridges per tile, 8 tiles up the drum. */
export const SILO_FINE_RIDGES = 160;

/**
 * Cycles per pixel over which a corrugation term fades to its mean (the plain
 * cylinder normal). Below 0.15 a ridge spans 6+ px and is drawn in full; by
 * 0.45 it spans ~2 px, where it can only alias into moire bands.
 */
export const SILO_CORRUGATION_FADE = [0.15, 0.45] as const;

/** TS mirror of the shader's derivative fade. */
export function siloCorrugationFade(cyclesPerPixel: number): number {
  const [edge0, edge1] = SILO_CORRUGATION_FADE;
  const t = THREE.MathUtils.clamp((cyclesPerPixel - edge0) / (edge1 - edge0), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The galvanised patina as a film: its share of each fragment is
 * mean + spread * (field - 0.5), times the material's patina share. It was
 * smoothstep( 0.2, 0.8, field ), which ran the share from none to all across
 * a few metres, so the drum alternated between sky-mirroring conductor and
 * sunlit matte grey. At 12:00 those patches read as dents and folds in the
 * sheet (r4 fold probe, tune-d4yard12: patina 0 alone gave a rigid cylinder;
 * the maps, axis shading, aureole and ground pull did not).
 */
export const SILO_PATINA_FILM = { mean: 0.7, spread: 0.2 } as const;

/** TS mirror of the shader's patina share for a noise field value in 0-1. */
export function siloPatinaCoverage(field: number, share: number): number {
  return (
    THREE.MathUtils.clamp(SILO_PATINA_FILM.mean + SILO_PATINA_FILM.spread * (field - 0.5), 0, 1) *
    share
  );
}

/**
 * The drum's ribbed read at distance (final4-med-12 overview and farm, low-12:
 * five drums as one flat white plaster block). Once the fine 15.6 cm ribs fade
 * to their mean (SILO_CORRUGATION_FADE) nothing was left to say "corrugated".
 * Their place is taken by a TONE band at the lathe's own 0.625 m wave
 * (SILO_SHELL_PROFILE): the up-facing flank of each wave lighter and glossier,
 * the down-facing flank darker and duller, mean-preserving, box-filtered over
 * the pixel footprint so it converges to the mean before it can alias. No
 * normal is tilted, so the sky-to-horizon flip that smeared final3's bands
 * cannot come back, and close up, where the fine ribs are drawn, it is off.
 *
 *   albedo     crest-to-trough swing on the diffuse colour (and the metal F0)
 *   roughness  the same band on roughness, glossier on the up-facing flank
 */
export const SILO_RIB_TONE = { albedo: 0.12, roughness: 0.14 } as const;
/** Coarse-wave cycles per pixel over which the tone band itself fades out (3.3 px to 2 px). */
export const SILO_RIB_TONE_FADE = [0.3, 0.5] as const;

/**
 * TS mirror of the shader's coarse rib band, -1..1 before its amplitudes: the
 * lathe wave's up-facing flank positive. `phase` in coarse cycles, `cyclesPerPixel`
 * its footprint, `fineFade` the fine ribs' own fade (1 = drawn, 0 = gone).
 */
export function siloRibBand(phase: number, cyclesPerPixel: number, fineFade: number): number {
  const w = Math.max(cyclesPerPixel, 1e-4);
  const box = Math.sin(Math.PI * Math.min(w, 1)) / (Math.PI * w);
  const [edge0, edge1] = SILO_RIB_TONE_FADE;
  const t = THREE.MathUtils.clamp((w - edge0) / (edge1 - edge0), 0, 1);
  const keep = box * (1 - t * t * (3 - 2 * t));
  return Math.sin(2 * Math.PI * phase) * keep * (1 - THREE.MathUtils.clamp(fineFade, 0, 1));
}

/**
 * Run-off stains that survive distance. The ring run-off (`machineGalvRun`)
 * lives in 0.2 m columns and fades with them, so from the overview the drums
 * carried no weathering at all. These sit in 48 columns (0.79 m), a share of
 * them live, each a soft streak running 0.75-3.5 m down from a ring or the
 * eave: darker zinc, duller.
 */
export const SILO_STAIN = { columns: 48, liveFraction: 0.45, strength: 0.16 } as const;

/**
 * The 1 m valley between neighbouring bins. Each drum's face toward its
 * neighbour sees mostly the neighbour's wall, not sky, so its indirect light
 * (sky diffuse and reflection) is occluded. Without it the five drums merged
 * into one white slab at distance. `pitch` is the bin spacing along world Z;
 * the end bins have one neighbour.
 */
export const SILO_VALLEY = { occlusion: 0.5, faceCos: [0.55, 1] as const } as const;

/** The battery's bin axes along world Z (SITE_LAYOUT): first, last, spacing. */
export function siloBatteryExtent(): [number, number, number] {
  const zs = SITE_LAYOUT.machines.silos.map((silo) => silo.position[2]).sort((a, b) => a - b);
  const pitch = zs.length > 1 ? zs[1] - zs[0] : 0;
  return [zs[0] ?? 0, zs[zs.length - 1] ?? 0, pitch];
}

/**
 * TS mirror of the shader's valley occlusion: the factor (1 = open) on the
 * indirect light of a drum face whose outward XZ direction is `outward`, on
 * the bin whose axis is at world Z `axisZ`.
 */
export function siloValleyOcclusion(
  outward: readonly [number, number],
  axisZ: number,
  strength: number = SILO_VALLEY.occlusion
): number {
  const [zMin, zMax, pitch] = siloBatteryExtent();
  if (!(pitch > 0)) return 1;
  const length = Math.hypot(outward[0], outward[1]) || 1;
  const z = outward[1] / length;
  const plus = axisZ + pitch <= zMax + 0.5 ? smoothstepValue(...SILO_VALLEY.faceCos, z) : 0;
  const minus = axisZ - pitch >= zMin - 0.5 ? smoothstepValue(...SILO_VALLEY.faceCos, -z) : 0;
  return 1 - strength * Math.max(plus, minus);
}

function smoothstepValue(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Silo floods, lit through the galvanised BRDF
// ---------------------------------------------------------------------------

/**
 * The ground floods on the battery (`SiloFloodlights`) as a real light on the
 * galvanised materials: a point source per flood head, inverse-square,
 * Lambert-cosine, shaded by three's own `RE_Direct`, so it falls on the skirt,
 * the corrugation and the rings as light on geometry. No scene light is added
 * (a punctual light is a loop iteration on every lit fragment of every
 * material); this runs only on the five drums' own materials, and not at all
 * while the lamps are off.
 *
 * x = lamp level (0 by day), y = head distance from the bin axis, z = head
 * height, w = head standoff from the 6 m wall. `SiloFloodlights` writes it.
 */
export const SILO_FLOOD_LIGHT = { value: new THREE.Vector4(0, 0, 0, 0) };
/** Flood colour, linear. Same warm white as the lamp lenses. */
export const SILO_FLOOD_COLOR = { value: new THREE.Color('#ffd59a') };

/**
 * Where the heads stand round each bin, degrees in XZ from +X toward +Z, each
 * aimed at the axis. A head 0.94 m off a 6 m wall can only see the wall within
 * 30 degrees of its own line (the tangent), so the first pair on +-X alone lit
 * two thin stripes and left the drum the camera faces dark. The diagonals light
 * the quadrants between; 90 and 270 face the neighbouring bin 1 m away.
 */
export const SILO_FLOOD_HEAD_ANGLES = [0, 45, 135, 180, 225, 315] as const;

/** Unit XZ direction from a bin's axis to the head at `degrees`. */
export function siloFloodHeadDirection(degrees: number): [number, number] {
  const radians = THREE.MathUtils.degToRad(degrees);
  // Rounded so the axial heads are exact (cos 90 is 6e-17, not 0).
  const round = (value: number) => Math.round(value * 1e9) / 1e9;
  return [round(Math.cos(radians)), round(Math.sin(radians))];
}

/**
 * The flood's candela distribution, stated as the irradiance it delivers up
 * the line of wall facing it (`h` metres above the head): a rise over the
 * first metre (the head is aimed up, not along the paving), then an
 * exponential decay to a floor, cut off just above the eave. A wall-grazing
 * uplight 1.2 m off a 30 m drum is exactly this shape; pure inverse-square from
 * a bare bulb would light the bottom 3 m and nothing else.
 */
export const SILO_FLOOD_PROFILE = {
  peak: 5,
  floor: 0.14,
  decay: 9,
  rise: [-0.3, 1] as const,
  /** Metres above the head where the beam ends: the eave, not beyond it. */
  top: [30.5, 33] as const,
  /**
   * Most irradiance any surface takes from one head, as a multiple of `peak`.
   * The beam that reaches the top of a grazed wall is near-vertical and very
   * intense; a ring underside or the eave, square to it, would take ~35x the
   * wall beside it. A real head's candela is finite, so the ledges get a
   * bright edge, not a blaze. The wall itself never reaches the cap.
   */
  cap: 1.2,
} as const;

/**
 * World normal Y over which a down-facing face loses the floods: from -0.3
 * (a wall tilted 17 degrees down still takes them) to nothing at -0.6. The
 * only down faces round a head are the roof's eave overhang (the rings are
 * open-ended). Square to the near-vertical beam it took the ledge cap between
 * heads and a sixth of that over each one, where its ray left the beam: a
 * sub-pixel ring 1.4x as bright as the wall, broken into six dashes a bin
 * (final4-med-22 yard). A ground uplight's beam ends at the eave.
 */
export const SILO_FLOOD_LEDGE = [-0.6, -0.3] as const;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Irradiance up the wall line facing a flood, `h` metres above its head. Mirrors GLSL. */
export function siloFloodFacing(h: number): number {
  const p = SILO_FLOOD_PROFILE;
  return (
    p.peak *
    smoothstep(p.rise[0], p.rise[1], h) *
    (1 - smoothstep(p.top[0], p.top[1], h)) *
    (p.floor + (1 - p.floor) * Math.exp(-Math.max(h, 0) / p.decay))
  );
}

/**
 * Flood irradiance (colour units) at a world point with world normal `normal`
 * on the bin whose axis is at `axis` (x, z). Mirrors `machineFloodCandela` and
 * the light body: candela(direction) * max(n.l, 0) / r^2, summed over the heads.
 */
export function siloFloodIrradiance(
  point: readonly [number, number, number],
  normal: readonly [number, number, number],
  axis: readonly [number, number],
  flood: THREE.Vector4 = SILO_FLOOD_LIGHT.value
): number {
  return SILO_FLOOD_HEAD_ANGLES.reduce<number>(
    (sum, degrees) => sum + siloFloodHeadIrradiance(point, normal, axis, degrees, flood),
    0
  );
}

/** One head's share of `siloFloodIrradiance`: the head at `degrees` (SILO_FLOOD_HEAD_ANGLES). */
export function siloFloodHeadIrradiance(
  point: readonly [number, number, number],
  normal: readonly [number, number, number],
  axis: readonly [number, number],
  degrees: number,
  flood: THREE.Vector4 = SILO_FLOOD_LIGHT.value
): number {
  const [level, offset, headY, standoff] = flood.toArray();
  if (!(level > 0)) return 0;
  const [dx, dz] = siloFloodHeadDirection(degrees);
  const toFlood = [
    axis[0] + dx * offset - point[0],
    headY - point[1],
    axis[1] + dz * offset - point[2],
  ];
  const r2 = Math.max(toFlood[0] ** 2 + toFlood[1] ** 2 + toFlood[2] ** 2, 0.25);
  const r = Math.sqrt(r2);
  const q = Math.max(Math.hypot(toFlood[0], toFlood[2]), 1e-3);
  const tanPhi = -toFlood[1] / q;
  // The beam leaves the head toward the axis, -(dx, dz).
  const aim = Math.max((toFlood[0] * dx + toFlood[2] * dz) / q, 0);
  const candela =
    siloFloodFacing(standoff * tanPhi) *
    standoff *
    standoff *
    Math.pow(1 + tanPhi * tanPhi, 1.5) *
    aim;
  const ndl = Math.max(
    (normal[0] * toFlood[0] + normal[1] * toFlood[1] + normal[2] * toFlood[2]) / r,
    0
  );
  return (
    level *
    smoothstep(SILO_FLOOD_LEDGE[0], SILO_FLOOD_LEDGE[1], normal[1]) *
    Math.min((candela * ndl) / r2, SILO_FLOOD_PROFILE.cap * SILO_FLOOD_PROFILE.peak)
  );
}

const WEAR_VERTEX_PARS = /* glsl */ `
varying vec3 vMachineWorldPos;
varying vec3 vMachineWorldNormal;
#ifdef MACHINE_GALVANISED
varying vec3 vMachineObject;
varying vec2 vMachineAxis;
#endif
`;

/**
 * `worldPosition` from three's `<worldpos_vertex>` is NOT usable here: that
 * chunk is guarded by `USE_ENVMAP || DISTANCE || USE_SHADOWMAP ||
 * USE_TRANSMISSION || NUM_SPOT_LIGHT_COORDS > 0`, and on the 'low' tier (no
 * shadow maps) referencing it is a COMPILE ERROR - black machines. Recompute
 * it, including `instanceMatrix`.
 *
 * The world normal likewise cannot be `mat3(modelMatrix) * objectNormal`: that
 * drops `instanceMatrix`, and every part here is non-uniformly instance-scaled,
 * so the up-facing dust mask would point the wrong way. `transformedNormal` has
 * already been through three's per-instance inverse-transpose and the normal
 * matrix, leaving it in VIEW space; multiplying on the right by
 * `mat3(viewMatrix)` is the transpose, which takes it back to world space.
 */
const WEAR_VERTEX_BODY = /* glsl */ `
vec4 machineWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  machineWorld = instanceMatrix * machineWorld;
#endif
vMachineWorldPos = ( modelMatrix * machineWorld ).xyz;
vMachineWorldNormal = normalize( transformedNormal * mat3( viewMatrix ) );
#ifdef MACHINE_GALVANISED
vMachineObject = transformed;
// The bin's axis in world XZ: every galvanised part is instanced centred on it.
vec4 machineAxis = vec4( 0.0, 0.0, 0.0, 1.0 );
#ifdef USE_INSTANCING
  machineAxis = instanceMatrix * machineAxis;
#endif
vMachineAxis = ( modelMatrix * machineAxis ).xz;
#endif
`;

const WEAR_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uMachineGrime;
uniform vec3 uMachineDust;
uniform vec3 uMachineBare;
uniform vec4 uMachineWear;
uniform float uMachineDeck;
varying vec3 vMachineWorldPos;
varying vec3 vMachineWorldNormal;
#ifdef MACHINE_GALVANISED
uniform vec4 uMachineGalv;
uniform vec4 uMachineRings;
uniform float uMachineGalvGround;
uniform vec2 uMachineCorrugation;
uniform vec2 uMachinePatina;
uniform vec4 uMachineFlood;
uniform vec3 uMachineFloodColor;
uniform vec4 uMachineRib;
uniform vec4 uMachineBattery;
uniform vec2 uMachineGroundHorizon;
varying vec3 vMachineObject;
varying vec2 vMachineAxis;
// SILO_FLOOD_PROFILE: irradiance up the wall line facing a flood, h above its head.
float machineFloodFacing( float h ) {
  return ${SILO_FLOOD_PROFILE.peak.toFixed(3)} *
    smoothstep( ${SILO_FLOOD_PROFILE.rise[0].toFixed(3)}, ${SILO_FLOOD_PROFILE.rise[1].toFixed(3)}, h ) *
    ( 1.0 - smoothstep( ${SILO_FLOOD_PROFILE.top[0].toFixed(3)}, ${SILO_FLOOD_PROFILE.top[1].toFixed(3)}, h ) ) *
    ( ${SILO_FLOOD_PROFILE.floor.toFixed(3)} + ${(1 - SILO_FLOOD_PROFILE.floor).toFixed(3)} * exp( - max( h, 0.0 ) / ${SILO_FLOOD_PROFILE.decay.toFixed(3)} ) );
}
// SILO_FLOOD_HEAD_ANGLES: unit XZ directions from a bin's axis to its heads.
const vec2 MACHINE_FLOOD_HEADS[ ${SILO_FLOOD_HEAD_ANGLES.length} ] = vec2[ ${SILO_FLOOD_HEAD_ANGLES.length} ](
  ${SILO_FLOOD_HEAD_ANGLES.map((degrees) => {
    const [x, z] = siloFloodHeadDirection(degrees);
    return `vec2( ${x.toFixed(6)}, ${z.toFixed(6)} )`;
  }).join(',\n  ')}
);
// Candela of the head at heads[ k ] toward a fragment ( toFlood = head - fragment ).
// The facing line receives exactly machineFloodFacing; every other point gets the
// same beam through its own distance and cosine (siloFloodIrradiance mirrors this).
float machineFloodCandela( vec3 toFlood, vec2 head ) {
  float q = max( length( toFlood.xz ), 1e-3 );
  float tanPhi = - toFlood.y / q;
  float s = uMachineFlood.w;
  float aim = max( dot( toFlood.xz, head ) / q, 0.0 );
  return machineFloodFacing( s * tanPhi ) * s * s * pow( 1.0 + tanPhi * tanPhi, 1.5 ) * aim;
}
float machineGalvHash( vec3 p ) {
  p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float machineGalvNoise( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( machineGalvHash( i ), machineGalvHash( i + vec3( 1, 0, 0 ) ), f.x ),
      mix( machineGalvHash( i + vec3( 0, 1, 0 ) ), machineGalvHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( machineGalvHash( i + vec3( 0, 0, 1 ) ), machineGalvHash( i + vec3( 1, 0, 1 ) ), f.x ),
      mix( machineGalvHash( i + vec3( 0, 1, 1 ) ), machineGalvHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
    f.z
  );
}
// One ring's run-off in one column. Live in SILO_STREAK_LIVE_FRACTION of
// columns; each live streak takes its own centre, width, strength and length
// (most short, a few long), broken along its run so it is not a ruled line.
float machineGalvRun( float datum, float ring, float column, float across, float y ) {
  float below = datum - y;
  float seed = machineGalvHash( vec3( column, ring * 7.0, 3.0 ) );
  float shape = machineGalvHash( vec3( column, ring * 7.0, 11.0 ) );
  float streakCentre = 0.25 + 0.5 * shape;
  float streakWidth = 0.08 + 0.22 * fract( shape * 7.3 );
  float profile = 1.0 - smoothstep( 0.0, streakWidth, abs( across - streakCentre ) );
  float lengthSeed = fract( seed * 13.7 );
  float runLength = mix( 0.008, 0.12, lengthSeed * lengthSeed );
  float broken = 0.45 + 0.55 * machineGalvNoise( vec3( column * 3.1, y * 90.0, ring ) );
  float strength = 0.45 + 0.55 * fract( seed * 5.1 );
  return step( ${(1 - SILO_STREAK_LIVE_FRACTION).toFixed(3)}, seed ) * profile * strength * broken *
    smoothstep( 0.0, 0.006, below ) * exp( - max( below, 0.0 ) / runLength );
}
// SILO_STAIN: broad run-off that survives distance, one ring or the eave per call.
float machineGalvStain( float datum, float ring, float column, float across, float y ) {
  float below = datum - y;
  float seed = machineGalvHash( vec3( column, ring * 5.0, 23.0 ) );
  float shape = machineGalvHash( vec3( column, ring * 5.0, 29.0 ) );
  float profile = 1.0 - smoothstep( 0.0, 0.15 + 0.25 * fract( shape * 5.7 ), abs( across - ( 0.3 + 0.4 * shape ) ) );
  float runLength = mix( 0.03, 0.14, fract( seed * 11.3 ) );
  float strength = 0.4 + 0.6 * fract( seed * 3.7 );
  return step( ${(1 - SILO_STAIN.liveFraction).toFixed(3)}, seed ) * profile * strength *
    smoothstep( 0.0, 0.01, below ) * exp( - max( below, 0.0 ) / runLength );
}
#endif
`;

/**
 * Galvanised drum finish (`MACHINE_GALVANISED`, the silo skin only).
 *
 * WHY. A metalness-1 skin has no diffuse term, so the battery's sunlit and
 * shaded faces differed by under 3 sRGB levels (final-med-12: (74,116,126)
 * against (77,119,129)) and the whole drum was a mirror of the cyan sky fill.
 * Weathered galvanising is not one surface: bright zinc spangle (a conductor)
 * among a dull white-grey zinc-carbonate patina (a dielectric), both far below
 * a pixel. The aggregate is what this models - per FRAGMENT it is a coverage
 * fraction, not a half-metal paint, so the hard-binary rule above (which is
 * about coatings) does not apply. Three terms, all analytic:
 *
 *   patina  world-space mottling (2-4 m, stretched down the drum by run-off)
 *           trading metalness for a diffuse grey, which is what gives the
 *           cylinder Lambert form shading under the key light;
 *   spangle the remaining metal at roughness ~0.4 instead of ~0.6;
 *   drips   faint run-off streaks under each stiffener ring and the eave, in
 *           ~0.2 m columns around the drum (an integer count, so the angle
 *           seam is exact), smoothstepped at both ends and faded by the pixel
 *           footprint before the columns can alias.
 *
 * Gated by a define rather than a branch, so every other worn material keeps
 * byte-identical source and its own program.
 */
const GALVANISED_FRAGMENT_BODY = /* glsl */ `
#ifdef MACHINE_GALVANISED
// Corrugated drum (uMachineCorrugation.y = 1, the skin only): the wall normal
// comes from the bin axis, not the lathe's wave (SILO_SHELL_PROFILE), and what
// the maps added on top (the fine corrugation) is kept, faded to its mean as
// its ridges approach a pixel (SILO_CORRUGATION_FADE) so it cannot alias.
float galvRibBand = 0.0;
if ( uMachineCorrugation.y > 0.5 ) {
  vec3 galvRadial = vec3( vMachineWorldPos.x - vMachineAxis.x, 0.0, vMachineWorldPos.z - vMachineAxis.y );
  galvRadial = normalize( ( viewMatrix * vec4( galvRadial, 0.0 ) ).xyz );
  float galvFinePhase = ( vMachineObject.y + 0.5 ) * uMachineCorrugation.x;
  float galvFineFade = 1.0 - smoothstep( ${SILO_CORRUGATION_FADE[0].toFixed(3)}, ${SILO_CORRUGATION_FADE[1].toFixed(3)}, fwidth( galvFinePhase ) );
  vec3 galvCorrugated = normalize( galvRadial + ( normal - nonPerturbedNormal ) * galvFineFade );
  // Wall only: the lathe's end caps sit under the roof and on the skirt.
  normal = mix( normal, galvCorrugated, 1.0 - step( 0.7, abs( vMachineWorldNormal.y ) ) );
  // SILO_RIB_TONE: the lathe wave as a box-filtered tone band, taking over as
  // the fine ribs fade; positive on the up-facing flank (sin of the phase).
  float galvCoarsePhase = ( vMachineObject.y + 0.5 ) * ${SILO_SHELL_PROFILE.ridges.toFixed(1)};
  float galvCoarseW = max( fwidth( galvCoarsePhase ), 1e-4 );
  float galvCoarseKeep = sin( PI * min( galvCoarseW, 1.0 ) ) / ( PI * galvCoarseW ) *
    ( 1.0 - smoothstep( ${SILO_RIB_TONE_FADE[0].toFixed(3)}, ${SILO_RIB_TONE_FADE[1].toFixed(3)}, galvCoarseW ) );
  galvRibBand = sin( 6.28318530718 * galvCoarsePhase ) * galvCoarseKeep * ( 1.0 - galvFineFade ) *
    ( 1.0 - step( 0.7, abs( vMachineWorldNormal.y ) ) );
}
// Patina as weathering runs: long down the drum, narrow around it.
float galvPatinaField =
  machineGalvNoise( vMachineWorldPos * vec3( 0.45, 0.07, 0.45 ) ) * 0.65 +
  machineGalvNoise( vMachineWorldPos * vec3( 1.1, 0.18, 1.1 ) + vec3( 7.1, 3.3, 1.7 ) ) * 0.35;
// A film of near-even coverage (SILO_PATINA_FILM), not metal and matte patches.
float galvPatina = clamp( uMachinePatina.x + uMachinePatina.y * ( galvPatinaField - 0.5 ), 0.0, 1.0 ) * uMachineGalv.x;
float galvColumns = ( atan( vMachineObject.z, vMachineObject.x ) / 6.28318530718 + 0.5 ) * 180.0;
float galvColumn = floor( galvColumns );
float galvAcross = fract( galvColumns );
// Written out, not looped: no dynamic vector indexing for the ANGLE backends.
float galvDrip = max(
  max(
    machineGalvRun( uMachineRings.x, 0.0, galvColumn, galvAcross, vMachineObject.y ),
    machineGalvRun( uMachineRings.y, 1.0, galvColumn, galvAcross, vMachineObject.y )
  ),
  max(
    machineGalvRun( uMachineRings.z, 2.0, galvColumn, galvAcross, vMachineObject.y ),
    machineGalvRun( uMachineRings.w, 3.0, galvColumn, galvAcross, vMachineObject.y )
  )
);
galvDrip *= ( 1.0 - smoothstep( 0.25, 0.6, fwidth( galvColumns ) ) ) * uMachineGalv.w;
float galvStain = 0.0;
if ( uMachineRib.z > 0.0 ) {
  float galvStainColumns = ( atan( vMachineObject.z, vMachineObject.x ) / 6.28318530718 + 0.5 ) * ${SILO_STAIN.columns.toFixed(1)};
  float galvStainColumn = floor( galvStainColumns );
  float galvStainAcross = fract( galvStainColumns );
  galvStain = max(
    max(
      machineGalvStain( uMachineRings.x, 0.0, galvStainColumn, galvStainAcross, vMachineObject.y ),
      machineGalvStain( uMachineRings.y, 1.0, galvStainColumn, galvStainAcross, vMachineObject.y )
    ),
    max(
      machineGalvStain( uMachineRings.z, 2.0, galvStainColumn, galvStainAcross, vMachineObject.y ),
      machineGalvStain( uMachineRings.w, 3.0, galvStainColumn, galvStainAcross, vMachineObject.y )
    )
  ) * ( 1.0 - smoothstep( 0.35, 0.7, fwidth( galvStainColumns ) ) ) * uMachineRib.z;
}
metalnessFactor *= 1.0 - galvPatina;
roughnessFactor = mix( roughnessFactor * uMachineGalv.y, 0.82, galvPatina );
diffuseColor.rgb *= 1.0 - 0.07 * galvPatina - 0.22 * galvDrip - galvStain;
diffuseColor.rgb *= 1.0 + uMachineRib.x * galvRibBand;
roughnessFactor = clamp( roughnessFactor + 0.18 * galvDrip + 0.6 * galvStain - uMachineRib.y * galvRibBand, 0.04, 1.0 );
#endif
`;

/**
 * The sky's aureole, reflected. The environment carries the sun as a 6 degree
 * disc and nothing around it, but the clear sky is several times brighter
 * within a few tens of degrees of the sun, and that brightness is what a
 * weathered metal drum reflects as a soft vertical highlight on its sun side.
 * A broad lobe (cos^6, ~35 degrees) on the reflection vector, scaled by the
 * key light's own colour and the blended F0, so it fades with the sun and
 * carries no highlight on the patina. Unshadowed on purpose: it is sky light.
 */
const GALVANISED_LIGHT_BODY = /* glsl */ `
#if defined( MACHINE_GALVANISED ) && NUM_DIR_LIGHTS > 0
{
  vec3 galvReflect = reflect( - geometryViewDir, normal );
  vec3 galvAureole = vec3( 0.0 );
  // three's own unroll (its pattern needs the index named i), as for its lights.
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
    galvAureole += directionalLights[ i ].color * pow( max( dot( galvReflect, directionalLights[ i ].direction ), 0.0 ), 6.0 );
  }
  #pragma unroll_loop_end
  reflectedLight.indirectSpecular += galvAureole * uMachineGalv.z * material.specularColorBlended;
}
#endif
#ifdef MACHINE_GALVANISED
{
  // The environment's lower band is the grass albedo, but the battery stands
  // on a concrete pad: a drum seen from above mirrored a green-brown blotch
  // onto its lower third. Pull what it reflects BELOW the horizon, and the
  // diffuse bounce on the patina, to their own luminance.
  vec3 galvReflectWorld = inverseTransformDirection( reflect( - geometryViewDir, normal ), viewMatrix );
  float galvGround = smoothstep( uMachineGroundHorizon.x, uMachineGroundHorizon.y, galvReflectWorld.y ) * uMachineGalvGround;
  float galvSpecLuma = dot( reflectedLight.indirectSpecular, vec3( 0.2126, 0.7152, 0.0722 ) );
  reflectedLight.indirectSpecular = mix( reflectedLight.indirectSpecular, vec3( galvSpecLuma ), galvGround );
  float galvDiffLuma = dot( reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
  reflectedLight.indirectDiffuse = mix(
    reflectedLight.indirectDiffuse,
    vec3( galvDiffLuma ),
    ${SILO_GROUND_BOUNCE.toFixed(3)} * uMachineGalvGround
  );
}
// SILO_VALLEY: the face toward a neighbouring bin 1 m away sees its wall, not
// the sky. Occludes the indirect light only, as three's own aoMap does.
if ( uMachineBattery.w > 0.0 && uMachineBattery.z > 0.0 ) {
  vec2 galvOut = vMachineWorldPos.xz - vMachineAxis;
  galvOut /= max( length( galvOut ), 1e-3 );
  float galvPlus = step( vMachineAxis.y + uMachineBattery.z, uMachineBattery.y + 0.5 ) *
    smoothstep( ${SILO_VALLEY.faceCos[0].toFixed(3)}, ${SILO_VALLEY.faceCos[1].toFixed(3)}, galvOut.y );
  float galvMinus = step( uMachineBattery.x - 0.5, vMachineAxis.y - uMachineBattery.z ) *
    smoothstep( ${SILO_VALLEY.faceCos[0].toFixed(3)}, ${SILO_VALLEY.faceCos[1].toFixed(3)}, - galvOut.y );
  float galvValley = 1.0 - uMachineBattery.w * max( galvPlus, galvMinus );
  reflectedLight.indirectDiffuse *= galvValley;
  reflectedLight.indirectSpecular *= galvValley;
}
// The ground floods round this bin (SILO_FLOOD_LIGHT), through the same BRDF
// as the sun: diffuse on the patina, a specular lobe on the spangle, the
// corrugation catching it. Skipped outright while the lamps are off.
// Down-facing faces (the eave overhang) take none (SILO_FLOOD_LEDGE).
float galvFloodLedge = smoothstep( ${SILO_FLOOD_LEDGE[0].toFixed(3)}, ${SILO_FLOOD_LEDGE[1].toFixed(3)}, vMachineWorldNormal.y );
if ( uMachineFlood.x > 0.0 && galvFloodLedge > 0.0 ) {
  IncidentLight galvFlood;
  galvFlood.visible = true;
  for ( int k = 0; k < ${SILO_FLOOD_HEAD_ANGLES.length}; k ++ ) {
    vec2 headDir = MACHINE_FLOOD_HEADS[ k ];
    vec3 head = vec3( vMachineAxis.x + headDir.x * uMachineFlood.y, uMachineFlood.z, vMachineAxis.y + headDir.y * uMachineFlood.y );
    vec3 toFlood = head - vMachineWorldPos;
    float r2 = max( dot( toFlood, toFlood ), 0.25 );
    galvFlood.direction = normalize( ( viewMatrix * vec4( toFlood, 0.0 ) ).xyz );
    // RE_Direct multiplies by n.l; cap the product (SILO_FLOOD_PROFILE.cap).
    float galvFloodNdl = max( dot( geometryNormal, galvFlood.direction ), 1e-4 );
    float galvFloodE = min(
      machineFloodCandela( toFlood, headDir ) * galvFloodNdl / r2,
      ${(SILO_FLOOD_PROFILE.cap * SILO_FLOOD_PROFILE.peak).toFixed(3)}
    );
    galvFlood.color = uMachineFloodColor * ( uMachineFlood.x * galvFloodLedge * galvFloodE / galvFloodNdl );
    RE_Direct( galvFlood, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  }
}
#endif
`;

/**
 * Injected AFTER `<normal_fragment_maps>`, which is the first point in
 * `meshphysical_frag` where `normal` (the view-space shading normal) exists and
 * still early enough that `diffuseColor`, `roughnessFactor` and
 * `metalnessFactor` are all live - they are consumed by
 * `<lights_physical_fragment>` further down.
 *
 * Three masks, all analytic - no extra texture, no extra pass:
 *   grime  dirt splash climbing the bottom `uMachineWear.w` metres ABOVE THE
 *          DECK THE MACHINE STANDS ON. That datum is `uMachineDeck`, not zero:
 *          the mill has two production floors, and the plansifters sit on the
 *          elevated one at y = 9 (MillScene zone 3). Measuring from world zero
 *          put every sifter surface 9 m up, where `smoothstep` saturates and
 *          the whole grime term silently evaluates to nothing.
 *   dust   flour settling on up-facing faces
 *   edge   a fresnel curvature proxy: paint rubbed through to bare metal on
 *          silhouette edges, which is what makes a machine read at distance.
 *          A true curvature mask needs a baked map; this is the cheap stand-in.
 */
const WEAR_FRAGMENT_BODY = /* glsl */ `
float machineGround = 1.0 - smoothstep( 0.0, uMachineWear.w, vMachineWorldPos.y - uMachineDeck );
float machineUp = clamp( vMachineWorldNormal.y, 0.0, 1.0 );
machineUp *= machineUp;
float machineFacing = abs( dot( normalize( vViewPosition ), normal ) );
float machineEdge = pow( 1.0 - machineFacing, 4.0 );
float machineGrimeMask = machineGround * uMachineWear.x;
float machineDustMask = machineUp * uMachineWear.y;
float machineWearMask = machineEdge * uMachineWear.z;
diffuseColor.rgb = mix( diffuseColor.rgb, uMachineGrime, machineGrimeMask );
diffuseColor.rgb = mix( diffuseColor.rgb, uMachineDust, machineDustMask );
diffuseColor.rgb = mix( diffuseColor.rgb, uMachineBare, machineWearMask );
roughnessFactor = mix( roughnessFactor, 0.95, clamp( machineGrimeMask + machineDustMask, 0.0, 1.0 ) );
roughnessFactor = clamp( mix( roughnessFactor, 0.3, machineWearMask ), 0.04, 1.0 );
metalnessFactor = clamp( mix( metalnessFactor, 1.0, machineWearMask * 0.6 ), 0.0, 1.0 );
`;

/** Wet-dirt splash colour at the base of a machine. */
const GRIME_COLOUR = '#6b5f4a';
/** Settled flour / dust on up-facing faces. */
const DUST_COLOUR = '#b8ac93';
/** Bare steel showing through worn paint on edges. */
const BARE_COLOUR = '#9aa0a2';

export interface MachineWearOptions {
  /** 0-1. Strength of the ground-up dirt gradient. */
  readonly grime?: number;
  /** 0-1. Strength of the settled-dust term on up-facing faces. */
  readonly dust?: number;
  /** 0-1. Strength of the fresnel edge-wear term. */
  readonly edge?: number;
  /** Metres. Height the dirt gradient climbs above `deck`. */
  readonly grimeHeight?: number;
  /**
   * World Y of the floor this material's parts stand on. 0 for the slab, 9 for
   * the plansifter deck. Only the three sifter-exclusive materials use 9; every
   * other material is shared across floors, and on those the grime term is a
   * minor contribution to small parts (inlet, service panel, accent strips).
   */
  readonly deck?: number;
  /** The galvanised drum terms (`GALVANISED_FRAGMENT_BODY`); the silo skin only. */
  readonly galvanised?: {
    /** 0-1. Share of the mottled patina that turns dielectric. */
    readonly patina: number;
    /** Multiplier on the ORM roughness for the bare spangle. */
    readonly spangleRoughness: number;
    /** Aureole reflection, as a fraction of the key light's colour. */
    readonly aureole: number;
    /** 0-1. Strength of the run-off streaks under the rings and eave. */
    readonly drips: number;
    /** The corrugated drum only: shade its waves analytically (`GALVANISED_FRAGMENT_BODY`). */
    readonly corrugated?: boolean;
    /** 0-1. Broad run-off that survives distance (`SILO_STAIN`); the drum only. */
    readonly stains?: number;
    /** 0-1. Indirect occlusion on faces toward a neighbouring bin (`SILO_VALLEY`). */
    readonly valley?: number;
  };
}

/** The silo drum's shell instance, in the assembly frame (`CompactMachines`). */
export const SILO_SHELL_SPAN = { centreY: 8.75, height: 12.5 } as const;
/** Stiffener ring centres in the same frame. */
export const SILO_RING_HEIGHTS = [5.25, 9.1, 12.95] as const;
/**
 * Where run-off starts, in the shell's unit space: under each ring band
 * (0.08 x 1.25 = 0.1 m tall in the assembly frame) and at the eave, the
 * shell's top.
 */
export const SILO_DRIP_DATUMS_UNIT: readonly [number, number, number, number] = [
  ...SILO_RING_HEIGHTS.map((y) => (y - 0.05 - SILO_SHELL_SPAN.centreY) / SILO_SHELL_SPAN.height),
  0.5,
] as [number, number, number, number];

/** Elevated plansifter deck, MillScene zone 3. */
export const SIFTER_DECK_Y = 9;

/**
 * Attach the shared grime/dust/edge-wear injection to a machine material.
 *
 * Uniform objects are created once per material and captured by the closure, so
 * they survive every recompile (`onBeforeCompile` runs again on each program
 * build and re-assigns the SAME objects into `shader.uniforms`).
 *
 * The resolved options are mirrored onto `userData.machineWear` because uniform
 * values are otherwise unreachable from a test.
 */
function withWear<T extends THREE.MeshStandardMaterial>(
  material: T,
  options: MachineWearOptions = {}
): T {
  const resolved = {
    grime: options.grime ?? 0.22,
    dust: options.dust ?? 0.12,
    edge: options.edge ?? 0.14,
    grimeHeight: options.grimeHeight ?? 2.2,
    deck: options.deck ?? 0,
  };
  material.userData.machineWear = resolved;
  const uniforms = {
    uMachineGrime: { value: new THREE.Color(GRIME_COLOUR) },
    uMachineDust: { value: new THREE.Color(DUST_COLOUR) },
    uMachineBare: { value: new THREE.Color(BARE_COLOUR) },
    uMachineWear: {
      value: new THREE.Vector4(resolved.grime, resolved.dust, resolved.edge, resolved.grimeHeight),
    },
    uMachineDeck: { value: resolved.deck },
  };
  const galvanised = options.galvanised;
  if (galvanised) {
    // Mirrored on userData so a probe can switch the terms off on one page load.
    const galv = {
      value: new THREE.Vector4(
        galvanised.patina,
        galvanised.spangleRoughness,
        galvanised.aureole,
        galvanised.drips
      ),
    };
    // 1 = the grass outside is neutralised in what the drum reflects (paired control).
    const galvGround = { value: 1 };
    // Film coverage at the field's mean, and its swing (SILO_PATINA_FILM).
    const patina = { value: new THREE.Vector2(SILO_PATINA_FILM.mean, SILO_PATINA_FILM.spread) };
    // Fine ridge count, enabled.
    const corrugation = {
      value: galvanised.corrugated
        ? new THREE.Vector2(SILO_FINE_RIDGES, 1)
        : new THREE.Vector2(0, 0),
    };
    // Rib tone (albedo, roughness; the corrugated drum only), stains, unused.
    const rib = {
      value: new THREE.Vector4(
        galvanised.corrugated ? SILO_RIB_TONE.albedo : 0,
        galvanised.corrugated ? SILO_RIB_TONE.roughness : 0,
        galvanised.stains ?? 0,
        0
      ),
    };
    // First and last bin axis along world Z, spacing, valley occlusion.
    const battery = { value: new THREE.Vector4(...siloBatteryExtent(), galvanised.valley ?? 0) };
    const groundHorizon = { value: new THREE.Vector2(...SILO_GROUND_HORIZON) };
    Object.assign(uniforms, {
      uMachineRib: rib,
      uMachineBattery: battery,
      uMachineGroundHorizon: groundHorizon,
      uMachineGalv: galv,
      uMachineRings: { value: new THREE.Vector4(...SILO_DRIP_DATUMS_UNIT) },
      uMachineGalvGround: galvGround,
      uMachineCorrugation: corrugation,
      uMachinePatina: patina,
      // Shared by every galvanised material: one write lights the whole battery.
      uMachineFlood: SILO_FLOOD_LIGHT,
      uMachineFloodColor: SILO_FLOOD_COLOR,
    });
    material.defines = { ...material.defines, MACHINE_GALVANISED: '' };
    material.userData.machineGalvanised = galv;
    material.userData.machineGalvanisedGround = galvGround;
    material.userData.machineCorrugation = corrugation;
    material.userData.machinePatina = patina;
    material.userData.machineFlood = SILO_FLOOD_LIGHT;
    material.userData.machineRib = rib;
    material.userData.machineBattery = battery;
    material.userData.machineGroundHorizon = groundHorizon;
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WEAR_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WEAR_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WEAR_FRAGMENT_PARS}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n${GALVANISED_FRAGMENT_BODY}\n${WEAR_FRAGMENT_BODY}`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\n${GALVANISED_LIGHT_BODY}`
      );
  };
  material.customProgramCacheKey = () => MACHINE_WEAR_CACHE_KEY;
  return material;
}

// ===========================================================================
// MATERIALS
// ===========================================================================
//
// Brushed ORM has G in 0.35-0.85, mean 0.582. Enamel narrows it to 0.50-0.66
// without painted-on scratches or cavity shadows. Each entry states its FINAL
// roughness after multiplication, before the analytic wear layer.
//
// `metalness` is 0 or 1. Nothing in between.
//
// On brushed surfaces, `aoMap` shares the ORM texture with `roughnessMap` - three reads .r
// for AO and .g for roughness, and `Texture.channel` defaults to 0 so no uv2 is
// needed. The three enamel housings have no baked cavities and leave AO unbound.
// `metalnessMap` is deliberately NOT assigned: `generateMachineORM`
// writes a constant 1 into B, so it would be a no-op on conductors (1 x 1) AND
// on dielectrics (0 x 1) while still costing a texture fetch and a shader
// permutation. Do not "add the missing map".

/**
 * A shared dark instrument display with a process schematic, without invented
 * readings or machine-state colours. The separate beacon owns live status.
 * Working if the bezel surrounds a legible dark screen rather than a cyan tile,
 * including on low where the same emissive map is rendered without bloom.
 */
export function getMachineScreenTexture(): THREE.DataTexture {
  return getTexture('machine-instrument-screen-v1', () => {
    const width = 128;
    const height = 80;
    const data = new Uint8Array(width * height * 4);
    const rect = (u: number, v: number, x: number, y: number, w: number, h: number) =>
      u >= x && u < x + w && v >= y && v < y + h;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const v = y / height;
        let rgb = [9, 20, 28];
        if (rect(u, v, 0.05, 0.77, 0.9, 0.16)) rgb = [23, 48, 58];
        // Header strokes and four linked process blocks remain readable when
        // the HMI occupies only a few dozen pixels. DataTexture row zero is down.
        if (rect(u, v, 0.09, 0.82, 0.23, 0.035)) rgb = [206, 219, 214];
        if (rect(u, v, 0.18, 0.45, 0.63, 0.03)) rgb = [75, 122, 124];
        for (let node = 0; node < 4; node++) {
          const left = 0.1 + node * 0.21;
          if (rect(u, v, left, 0.34, 0.16, 0.25)) rgb = [98, 163, 158];
          if (rect(u, v, left + 0.025, 0.38, 0.11, 0.17)) rgb = [20, 52, 59];
        }
        if (rect(u, v, 0.1, 0.15, 0.35, 0.035)) rgb = [112, 137, 140];
        if (rect(u, v, 0.64, 0.14, 0.2, 0.055)) rgb = [166, 157, 129];
        const offset = (y * width + x) * 4;
        data.set(rgb, offset);
        data[offset + 3] = 255;
      }
    }
    return createColorDataTexture(data, width, height);
  });
}

/**
 * The skin's galvanised terms. Tuned on one page load (silos-tune): patina
 * 0.6 -> 0.8 and aureole 0.07 -> 0.1 took the near drum from 9 to 10.5 sRGB
 * levels sun side to shade side; sparse irregular streaks
 * (SILO_STREAK_LIVE_FRACTION) at 0.8 read as faint run-off.
 */
const SILO_SKIN_GALVANISED = {
  patina: 0.8,
  spangleRoughness: 0.68,
  aureole: 0.1,
  drips: 0.8,
  corrugated: true,
  stains: SILO_STAIN.strength,
  valley: SILO_VALLEY.occlusion,
} as const;

export const MACHINE_MATERIALS = {
  /**
   * Galvanised silo skin. A CONDUCTOR with a dielectric patina: spangle at
   * roughness ~0.4, patina at 0.82 (`GALVANISED_FRAGMENT_BODY`). Neutral
   * silver: the old '#c2c9c7' was blue-green-biased, and as the F0 of a full
   * conductor that bias multiplied straight into the cyan sky it mirrored.
   */
  silo: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-silo-skin',
      color: '#c4c4c3',
      roughnessMap: SILO_SKIN_ORM,
      aoMap: SILO_SKIN_ORM,
      aoMapIntensity: 0.85,
      normalMap: SILO_SKIN_NORMAL,
      // The fine corrugation is now the only shaded corrugation, faded by its own
      // fwidth, so it can carry more relief: 0.7 -> 1.5 on one page load (r4
      // tune t3) read as crisp ridges near and stayed band-free at mid distance.
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughness: 1,
      metalness: 1,
    }),
    {
      grime: 0.3,
      dust: 0.05,
      edge: 0.1,
      grimeHeight: 3.2,
      galvanised: SILO_SKIN_GALVANISED,
    }
  ),

  /**
   * The skirt: the grounded discharge enclosure under the drum, 0-5 m. It was
   * the bare-metal trim, so at noon it read as a flat grey band under a warm
   * patinated drum with a hard step at the seam, and at night it stayed black
   * under its own floods: a full conductor has no diffuse term for them to
   * land on. Same stock, patina and grass-free reflection as the skin (the
   * patina is sampled in world space, so it runs on across the seam); no
   * corrugation and no ring run-off of its own. Splash grime stays low.
   */
  siloSkirt: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-silo-skirt',
      color: '#c4c4c3',
      roughnessMap: SILO_TRIM_ORM,
      aoMap: SILO_TRIM_ORM,
      aoMapIntensity: 0.85,
      normalMap: SILO_TRIM_NORMAL,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1,
      metalness: 1,
    }),
    {
      grime: 0.12,
      dust: 0.05,
      edge: 0.1,
      grimeHeight: 1.2,
      galvanised: { ...SILO_SKIN_GALVANISED, drips: 0, corrugated: false, stains: 0 },
    }
  ),

  /** Galvanised roof and stiffener rings. */
  siloRoof: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-silo-trim',
      color: '#c4c4c3',
      roughnessMap: SILO_TRIM_ORM,
      aoMap: SILO_TRIM_ORM,
      aoMapIntensity: 0.8,
      normalMap: SILO_TRIM_NORMAL,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1,
      metalness: 1,
    }),
    {
      grime: 0.05,
      dust: 0.24,
      edge: 0.16,
      grimeHeight: 2.2,
      // Same neutral silver and grass-free reflection as the skin: the rings
      // mirrored the grass band as teal stripes. Bare metal, no patina or streaks.
      galvanised: { patina: 0, spangleRoughness: 1, aureole: 0.1, drips: 0 },
    }
  ),

  /** Painted structural legs. Final 0.35-0.85. */
  siloLeg: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-silo-leg',
      color: '#48565c',
      roughnessMap: SILO_LEG_ORM,
      aoMap: SILO_LEG_ORM,
      aoMapIntensity: 0.7,
      roughness: 1,
      metalness: 0,
    }),
    { grime: 0.42, dust: 0.08, edge: 0.16, grimeHeight: 1.6 }
  ),

  /**
   * Stored grain. Never metal, never WEAR-shaded - it is a product, not a
   * surface, and a grime gradient climbing a heap of wheat is a mistake.
   *
   * It does take the analytic `vegetation` finish, which is the profile for
   * crop: no grime, no dust, the whole budget in macro tonal drift. 26.6 m over
   * five draws, and a heap of grain that is one flat gold is the one thing in
   * the mill that should obviously not be.
   */
  grain: applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'machine-grain',
      color: '#bf8b36',
      roughness: 0.92,
      metalness: 0,
    }),
    'vegetation'
  ),

  /** Petrol enamel housing. Final roughness 0.33-0.44 retains broad highlights. */
  mill: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-mill-body',
      color: '#356a74',
      roughnessMap: MILL_SKIN_ORM,
      normalMap: MILL_SKIN_NORMAL,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.66,
      metalness: 0,
    }),
    { grime: 0.2, dust: 0.085, edge: 0.07, grimeHeight: 1.5 }
  ),

  /** A narrow brushed-brass trim, distinct from yellow safety paint. */
  millAccent: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-mill-brass-trim',
      color: '#c4b48f',
      roughness: 0.46,
      metalness: 1,
    }),
    { grime: 0, dust: 0.04, edge: 0.02, grimeHeight: 1.2 }
  ),

  /** Painted mill base, hopper and sifter inlet. Final 0.35-0.85. */
  millTrim: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-mill-trim',
      color: '#34474c',
      roughnessMap: MILL_TRIM_ORM,
      aoMap: MILL_TRIM_ORM,
      aoMapIntensity: 0.8,
      normalMap: MILL_TRIM_NORMAL,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1,
      metalness: 0,
    }),
    { grime: 0.34, dust: 0.18, edge: 0.2, grimeHeight: 1.2 }
  ),

  /** Fresh enamel control strip - the one deliberately glossy paint. Final 0.25-0.6. */
  millPanel: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-mill-panel',
      color: '#31605d',
      roughnessMap: MILL_PANEL_ORM,
      aoMap: MILL_PANEL_ORM,
      aoMapIntensity: 0.6,
      roughness: 0.7,
      metalness: 0,
    }),
    { grime: 0.06, dust: 0.08, edge: 0.22, grimeHeight: 1.2 }
  ),

  /** Shadowed recessed inspection panels. Final 0.33-0.81. */
  recess: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-recess',
      color: '#212f33',
      roughnessMap: RECESS_ORM,
      aoMap: RECESS_ORM,
      aoMapIntensity: 0.9,
      normalMap: RECESS_NORMAL,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.95,
      metalness: 0,
    }),
    { grime: 0.14, dust: 0.06, edge: 0.24, grimeHeight: 1.2 }
  ),

  /**
   * Polished chill rolls. CONDUCTOR, and the one surface authored deliberately
   * below the map's authority so it stays glossy: final 0.16-0.38.
   */
  roller: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-chill-roll',
      color: '#d0d7d7',
      roughnessMap: ROLLER_ORM,
      aoMap: ROLLER_ORM,
      aoMapIntensity: 0.5,
      roughness: 0.45,
      metalness: 1,
    }),
    { grime: 0, dust: 0.08, edge: 0.06, grimeHeight: 1 }
  ),

  /** Warm champagne enamel distinguishes the elevated sifting stage. Final 0.40-0.53. */
  sifter: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-sifter-body',
      color: '#bea876',
      roughnessMap: SIFTER_SKIN_ORM,
      normalMap: SIFTER_SKIN_NORMAL,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.8,
      metalness: 0,
    }),
    { grime: 0.18, dust: 0.15, edge: 0.08, grimeHeight: 1.4, deck: SIFTER_DECK_Y }
  ),

  /** Timber-framed sifter trays and lid. Final 0.35-0.85. */
  sifterTray: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-sifter-tray',
      color: '#c3b182',
      roughnessMap: SIFTER_TRAY_ORM,
      aoMap: SIFTER_TRAY_ORM,
      aoMapIntensity: 0.8,
      roughness: 1,
      metalness: 0,
    }),
    { grime: 0.1, dust: 0.36, edge: 0.12, grimeHeight: 1.2, deck: SIFTER_DECK_Y }
  ),

  /** Painted walkway deck. Final 0.35-0.85. */
  platform: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-platform',
      color: '#455258',
      roughnessMap: PLATFORM_ORM,
      aoMap: PLATFORM_ORM,
      aoMapIntensity: 0.85,
      normalMap: PLATFORM_NORMAL,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 1,
      metalness: 0,
    }),
    { grime: 0.4, dust: 0.28, edge: 0.16, grimeHeight: 0.6, deck: SIFTER_DECK_Y }
  ),

  /** Satin-painted packer housing. Final roughness 0.41-0.54. */
  packer: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-packer-body',
      color: '#4e817b',
      roughnessMap: PACKER_SKIN_ORM,
      normalMap: PACKER_SKIN_NORMAL,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.82,
      metalness: 0,
    }),
    { grime: 0.24, dust: 0.22, edge: 0.18, grimeHeight: 1.5 }
  ),

  /** Painted packer base, hopper and fill head. Final 0.35-0.85. */
  packerTrim: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-packer-trim',
      color: '#2c4043',
      roughnessMap: PACKER_TRIM_ORM,
      aoMap: PACKER_TRIM_ORM,
      aoMapIntensity: 0.8,
      normalMap: PACKER_TRIM_NORMAL,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1,
      metalness: 0,
    }),
    { grime: 0.34, dust: 0.18, edge: 0.2, grimeHeight: 1.2 }
  ),

  /**
   * Paper sack. Dielectric, unmapped cloth with a separately fitted raster print.
   *
   * No map, but a `fabric` finish: that profile exists for exactly this, and a
   * human-scale sack retains its restrained weave at the packing camera.
   * The output sack moves on the filling cycle. Rest-space sampling keeps the
   * weave welded to the cloth rather than sliding through a world-space field.
   * Working if bag travel changes the transform, never the cloth's field point.
   */
  bag: applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'machine-bag',
      color: '#ded0aa',
      roughness: 0.92,
      metalness: 0,
    }),
    'fabric',
    { objectSpace: 1 }
  ),

  /** Painted drive motors. Final 0.33-0.81. */
  motor: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-motor',
      color: '#385c68',
      roughnessMap: MOTOR_ORM,
      aoMap: MOTOR_ORM,
      aoMapIntensity: 0.75,
      roughness: 0.95,
      metalness: 0,
    }),
    { grime: 0.12, dust: 0.22, edge: 0.24, grimeHeight: 1.2 }
  ),

  /**
   * Zinc-plated fittings: ladder rails and rungs, vents, guides, fan grilles,
   * suspensions. CONDUCTOR, lifted from #9aa7aa so its F0 (0.39-0.46 linear)
   * sits in a plausible band for weathered galvanising. NO detail maps: every
   * member here is under 0.25 m across, and a tiled grid on a 0.075 m rail is
   * sub-pixel noise that mips to a flat constant.
   *
   * THE "NO MAPS" ARGUMENT IS ABOUT TEXTURES AND DOES NOT REACH THIS ONE.
   * At 195.2 m over 88 instances this is the single largest untreated surface
   * left in the scene - `test-results/pass7/unfinished-models.mjs` measures it,
   * and four work orders read past it because the standing closure ("sub-0.25 m
   * members, a grid on a 0.075 m rail mips to a flat constant") is entirely
   * correct AND entirely about a UV-tiled map. `utils/worldSurface` has no UVs,
   * no texture unit and no tiling: it samples an analytic field in METRES, so a
   * 0.075 m rail and a 120 m batten cut from the same box both get
   * metre-correct detail. That is the same ground on which the module's own
   * header reopened `world-factory-infrastructure` and `authored-village`.
   *
   * `metal`, and the term that pays for it is `edge` rather than `meso`. A thin
   * member is near-grazing over most of its visible area, so the fresnel wear
   * toward bare steel is what gives a ladder rail a silhouette at 20 m; the
   * 0.4 m meso period is longer than any single fitting, which means it varies
   * fitting-to-fitting rather than within one - exactly the read this row
   * needed and could not get from a tiled map.
   */
  hardware: applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'machine-hardware',
      color: '#a8b2b4',
      roughness: 0.55,
      metalness: 1,
    }),
    'metal',
    // The mill deck, not world zero - the same datum every other surface in
    // this module measures from, and the reason `uMachineDeck` exists.
    { datum: 0 }
  ),

  /**
   * HMI screen. Its sparse backlit schematic shares the scene's tone curve.
   * Colour and emissive maps use the same sRGB source. `emissiveIntensity` is
   * raised above 1 only when the composer is mounted; see
   * `setMachineScreenGlow`.
   */
  screen: new THREE.MeshStandardMaterial({
    name: 'machine-screen',
    color: '#ffffff',
    map: getMachineScreenTexture(),
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: getMachineScreenTexture(),
    emissiveIntensity: 1,
    roughness: 0.28,
    metalness: 0,
  }),

  /** Painted hazard plate: hatch cover and the accent strips. Final 0.35-0.85. */
  maintenancePlate: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-hazard-plate',
      color: '#c6a748',
      roughnessMap: PLATE_ORM,
      aoMap: PLATE_ORM,
      aoMapIntensity: 0.7,
      roughness: 1,
      metalness: 0,
    }),
    { grime: 0.2, dust: 0.18, edge: 0.26, grimeHeight: 1.2 }
  ),

  /**
   * Status beacon. Per-instance colour, unlit by design.
   *
   * NOT `vertexColors: true`. This is drawn by the `<instancedMesh>` in
   * `CompactMachines.tsx`, which tints through `setColorAt` - and three defines
   * `USE_INSTANCING_COLOR` from `instanceColor` alone, which is all a per-
   * instance tint needs. `vertexColors` additionally makes the VERTEX shader
   * multiply by a `color` attribute that `BEACON` does not carry; an unbound
   * attribute reads as the WebGL generic default `(0, 0, 0, 1)`, so every
   * beacon rendered black rather than in its status colour. Same defect, and
   * the same fix, as the instanced path in `StaticMeshBatch.tsx`.
   */
  beacon: new THREE.MeshBasicMaterial({ name: 'machine-beacon' }),
} as const;

/**
 * Emissive above 1.0 linear only behaves inside the composer. On the 'low' tier
 * there is no composer, so a high emissive clamps to a flat white blob with no
 * bloom to justify it. Called from the renderer with
 * `isPostProcessingActive(graphics)`.
 */
export function setMachineScreenGlow(composerActive: boolean): void {
  MACHINE_MATERIALS.screen.emissiveIntensity = composerActive ? 1.35 : 1;
}

/** Borrow the approved raster, own only this opaque, ordinary lit ink material.
 * Working if the print follows the bag in one shared instance draw, stays dark
 * at night without a light and never disposes the shared texture on unmount.
 */
export function createPackerPrintMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: 'packer-millos-raster-ink',
    color: '#ffffff',
    map,
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
    polygonOffsetUnits: POLYGON_OFFSET.standard.units,
  });
}

/**
 * Deterministic 0-1 hash of a machine id. Never `Math.random()`: the fleet must
 * look the same on every reload, and a random seed would also make the layout
 * effect non-idempotent across React strict-mode double invocation.
 */
export function machineHash01(id: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Per-instance albedo multiplier for one machine.
 *
 * Writes into `instanceColor`, which three multiplies onto the material colour
 * (`color_vertex.glsl.js` seeds `vColor = vec3(1.0)` under
 * `USE_INSTANCING_COLOR` and multiplies, so `material.vertexColors` must stay
 * FALSE - setting it would make three expect a `color` attribute as well).
 *
 * Values are written in the working (linear) colour space on purpose: they are
 * MULTIPLIERS around 1, not colours, so they must not go through the sRGB
 * transfer function.
 *
 * Amplitude is deliberately small. Beyond about +/-6% lightness the fleet stops
 * reading as one product line and starts reading as a bug.
 */
export function machineInstanceTint(target: THREE.Color, id: string, amount: number): THREE.Color {
  if (amount <= 0) {
    target.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace);
    return target;
  }
  const lightness = 1 + (machineHash01(id, 17) - 0.5) * 0.08 * amount;
  const warm = 1 + (machineHash01(id, 53) - 0.5) * 0.03 * amount;
  const cool = 1 + (machineHash01(id, 91) - 0.5) * 0.03 * amount;
  target.setRGB(lightness * warm, lightness, lightness * cool, THREE.LinearSRGBColorSpace);
  return target;
}
