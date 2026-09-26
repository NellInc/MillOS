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
export const MACHINE_WEAR_CACHE_KEY = 'machineWear_v2';

const WEAR_VERTEX_PARS = /* glsl */ `
varying vec3 vMachineWorldPos;
varying vec3 vMachineWorldNormal;
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
`;

const WEAR_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uMachineGrime;
uniform vec3 uMachineDust;
uniform vec3 uMachineBare;
uniform vec4 uMachineWear;
uniform float uMachineDeck;
varying vec3 vMachineWorldPos;
varying vec3 vMachineWorldNormal;
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
}

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

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WEAR_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WEAR_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WEAR_FRAGMENT_PARS}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n${WEAR_FRAGMENT_BODY}`
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

export const MACHINE_MATERIALS = {
  /** Galvanised silo skin. CONDUCTOR. Zinc spangle at roughness 0.56-0.66. */
  silo: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-silo-skin',
      color: '#c2c9c7',
      roughnessMap: SILO_SKIN_ORM,
      aoMap: SILO_SKIN_ORM,
      aoMapIntensity: 0.85,
      normalMap: SILO_SKIN_NORMAL,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1,
      metalness: 1,
    }),
    { grime: 0.3, dust: 0.05, edge: 0.1, grimeHeight: 3.2 }
  ),

  /** Galvanised roof, grounded discharge enclosure and stiffener rings. */
  siloRoof: withWear(
    new THREE.MeshStandardMaterial({
      name: 'machine-silo-trim',
      color: '#c2c9c7',
      roughnessMap: SILO_TRIM_ORM,
      aoMap: SILO_TRIM_ORM,
      aoMapIntensity: 0.8,
      normalMap: SILO_TRIM_NORMAL,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1,
      metalness: 1,
    }),
    { grime: 0.05, dust: 0.24, edge: 0.16, grimeHeight: 2.2 }
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
   * Paper sack. Dielectric, no maps - it is 1.25 x 1.45 m of woven paper.
   *
   * No map, but a `fabric` finish: that profile exists for exactly this, and a
   * 1.25 m sack is comfortably above the aliasing floor at the packing camera.
   * WORLD space rather than the profile's authored object space, because these
   * sacks do not move and the point is that a stack of them stops reading as
   * one sack drawn six times.
   */
  bag: applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'machine-bag',
      color: '#ded0aa',
      roughness: 0.92,
      metalness: 0,
    }),
    'fabric',
    { objectSpace: 0 }
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
