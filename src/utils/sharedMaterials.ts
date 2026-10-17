/**
 * Shared Materials Module
 *
 * Centralized material definitions to reduce GPU memory usage and GC pressure.
 * Materials are created once and reused across all components.
 *
 * IMPORTANT: These materials should NOT be disposed - they are module-level singletons.
 */
import * as THREE from 'three';
import { generateBrushedMetal, generateMachineORM } from '../textures/brushedMetal';
import {
  generateMachinePanelNormal,
  generatePanelNormal,
  generateProceduralNormal,
} from '../textures/normalGenerator';
import { generateRustPattern } from '../textures/rust';
import { generateSafetyStripe } from '../textures/safetyStripe';
import { generateBrick, generateBrickNormal } from '../textures/brick';
import { generateBark, generateBarkNormal, generateBarkRoughness } from '../textures/bark';
import {
  generateCobblestone,
  generateCobblestoneNormal,
  generateCobblestoneRoughness,
} from '../textures/cobblestone';
import { generateMud, generateMudRoughness } from '../textures/mud';
import {
  generateClayTiles,
  generateClayTilesNormal,
  generateSlate,
  generateSlateNormal,
  generateThatch,
  generateThatchNormal,
} from '../textures/roofTiles';
import { generateStucco, generateStuccoNormal, generateStuccoRoughness } from '../textures/stucco';

// Generate procedural textures for metal materials (cached on first call)
//
// RETAINED FOR COMPATIBILITY ONLY - do not bind either of these to a material
// in this file. Both are exported through `PROCEDURAL_TEXTURES` and are still
// bound at 29 (`brushedMetal`) and 19 (`panelNormal`) call sites outside this
// module, so the exported objects must keep their identity; but both are the
// wrong map for the slot they were historically used in:
//
//   `brushedMetalTexture` packs R = roughness, G = metalness, B = AO. three
//   samples `roughnessMap.g`, so as a roughnessMap it multiplied roughness by
//   the METALNESS channel - a near-flat 0.90-1.00 - and threw the actual
//   brushed variation away. As a normalMap it decodes to a near-constant tilt
//   of about (-0.37, +0.90). Use `metalOrmTexture` / `machinePanelNormalTexture`.
//
//   `panelNormalTexture` is `generatePanelNormal(256, 8, 0.02)`, whose bevel is
//   0.02 x (1/8) = 0.0025 UV = 0.64 px at 256. That is below one texel, so the
//   mip chain erases it and the map is inert. See the doc comment on
//   `generateMachinePanelNormal`, which specifies its bevel in PIXELS for
//   exactly this reason.
const brushedMetalTexture = generateBrushedMetal(256, 0.4, 'horizontal');
const panelNormalTexture = generatePanelNormal(256, 8, 0.02);

/**
 * Shared metal ORM map in glTF channel order: R = AO, G = roughness,
 * B = metalness. Bound to `roughnessMap` AND `aoMap` on every metal material
 * below (three reads `.g` and `.r` respectively, and `Texture.channel`
 * defaults to 0, so no uv2 is required - the same wiring `machineSurfaces.ts`
 * uses). `metalnessMap` is deliberately never assigned: B is a constant 1, so
 * it would be a no-op on conductors (1 x 1) and on dielectrics (0 x 1) while
 * still costing a fetch and a shader permutation.
 *
 * The key `(512, 'horizontal', 128)` is the same one `machineSurfaces.ts`
 * (HOUSING_ORM) and `OptimizedFactoryInfrastructure.tsx` (DECK_ORM) already
 * generate, so `getTexture` hands back the cached source and this module adds
 * no generation cost.
 *
 * Cloned rather than bound directly so a future `configureTexture()` call in
 * this file cannot re-tile the factory shell (that is precisely what the
 * `bands every detail map off a clone` invariant in `machineSurfaces.test.ts`
 * guards). Sampler state is left untouched - `repeat` is NOT part of three's
 * texture cache key but wrap/filter/anisotropy are, so an identical-parameter
 * clone of the same `Source` reuses the existing WebGLTexture and adds ZERO
 * GPU memory. Do not raise `anisotropy` here without accepting a second upload.
 *
 * `repeat` stays at (1, 1). Per-surface texel density is a call-site decision
 * (see the TEXEL DENSITY BANDS block in `machineSurfaces.ts`); a shared library
 * consumed by everything from a 12 m silo to a 0.1 m bracket cannot pick one
 * number that is right for both, and (1, 1) is the only value that changes
 * nothing except the fact that roughness now actually varies.
 */
const metalOrmTexture = generateMachineORM(512, 'horizontal', 128).clone();
metalOrmTexture.needsUpdate = true;

/**
 * Mean of the ORM green channel - `final roughness = base * this`. Every
 * `roughness` in this file that sits next to a `roughnessMap` is authored
 * against this number. It must track `MACHINE_ORM_MEAN_ROUGHNESS` in
 * `machineSurfaces.ts`, which measures the same generator; the test asserts it.
 */
export const ORM_MEAN_ROUGHNESS = 0.582;

/** AO is indirect-light only, so this does nothing on the `low` tier. */
const ORM_AO_INTENSITY = 0.7;

/**
 * Real sheet-metal panel relief, bevel specified in pixels so it survives the
 * mip chain. Key `(512, 4, 7)` is shared with `machineSurfaces.ts` and
 * `OptimizedFactoryInfrastructure.tsx`, so it is a free cache hit.
 */
const machinePanelNormalTexture = generateMachinePanelNormal(512, 4, 7).clone();
machinePanelNormalTexture.needsUpdate = true;

/**
 * Intended scale for `machinePanelNormalTexture`. The generator documents
 * 0.6-0.9; anything near the old 0.1 leaves a correct map as inert as the
 * broken one it replaces.
 */
const PANEL_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);
const rustTexture = generateRustPattern(256, 0.3, 'down');
const safetyStripeTexture = generateSafetyStripe(256, 32, {
  primary: '#fbbf24',
  secondary: '#1f2937',
});
const brickColorTexture = generateBrick(512, {
  baseColor: '#8b4513',
  brickWidth: 32,
  brickHeight: 16,
});
const brickNormalTexture = generateBrickNormal(512, 32, 16, 2);
const barkOakTexture = generateBark(256, 'oak');
const barkBirchTexture = generateBark(256, 'birch');
const barkOakRoughnessTexture = generateBarkRoughness(256, 'oak');
const barkNormalTexture = generateBarkNormal(256);
// One64-cell laid family, registered across the existing512/512/256px maps.
const cobblestoneColorTexture = generateCobblestone(512, { stoneSize: 8 });
const cobblestoneNormalTexture = generateCobblestoneNormal(512, 8);
const cobblestoneRoughnessTexture = generateCobblestoneRoughness(256, 4);

// Enable wrapping for cobblestone textures (repeat set per-geometry for consistent world-scale)
cobblestoneColorTexture.wrapS = cobblestoneColorTexture.wrapT = THREE.RepeatWrapping;
cobblestoneNormalTexture.wrapS = cobblestoneNormalTexture.wrapT = THREE.RepeatWrapping;
const mudColorTexture = generateMud(512, { wetness: 0.5 });
const mudRoughnessTexture = generateMudRoughness(512, 0.5);

// Village roof textures - using larger tiles for visible detail
const clayTilesColorTexture = generateClayTiles(512, { tileWidth: 40, tileHeight: 56 });
const clayTilesNormalTexture = generateClayTilesNormal(512, 40, 56);
const slateColorTexture = generateSlate(512, { tileWidth: 44, tileHeight: 32 });
const slateNormalTexture = generateSlateNormal(512, 44, 32);
const thatchSurfaceOptions = { bundleWidth: 40, density: 0.8 };
const thatchColorTexture = generateThatch(512, thatchSurfaceOptions);
const thatchNormalTexture = generateThatchNormal(512, thatchSurfaceOptions);

// Village wall textures - neutral gray for proper tinting
const stuccoColorTexture = generateStucco(512, { weathering: 0.12, contrast: 0.1 });
const stuccoNormalTexture = generateStuccoNormal(512, 0.35);
const stuccoRoughnessTexture = generateStuccoRoughness(512, 0.75);

// === METAL MATERIALS ===
//
// `metalness` is 0 or 1 across this whole file. Nothing in between: the 0.4-0.9
// band these were authored in is physically empty, and it only started to show
// once `scene.environment` gave metalness something to reflect.
//
// The split is decided by the albedo, not by the name. A conductor's albedo IS
// its specular reflectance, so anything below ~0.3 mean LINEAR renders as a dim
// mirror rather than as metal. Every hex here was measured; the ones that came
// out under 0.3 are painted steel, which is a DIELECTRIC - the colour stays and
// `roughness` carries the whole look.
//
// `roughness` is authored as a BASE that the ORM green channel multiplies
// (mean 0.582, range 0.35-0.85). Each entry states the resulting final band, so
// the intent is legible without redoing the multiplication.
export const METAL_MATERIALS = {
  /** Primed/painted industrial steel. F0 0.19 - DIELECTRIC. Final 0.30-0.73. */
  steel: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
    envMapIntensity: 1.0,
  }),
  /** Painted dark steel. F0 0.10 - DIELECTRIC. Final 0.32-0.77. */
  steelDark: new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0,
    roughness: 0.9,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** Galvanised sheet. F0 0.38 - CONDUCTOR. Final 0.25-0.60. */
  steelLight: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 1,
    roughness: 0.7,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** Polished chrome. F0 0.53 - CONDUCTOR. Deliberately unmapped and smooth. */
  chrome: new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    metalness: 1,
    roughness: 0.05,
    envMapIntensity: 1.2,
  }),
  // Painted metals - dielectrics. The colour is paint, not a reflectance.
  /** F0 0.03. Final 0.30-0.73. */
  paintedDarkGray: new THREE.MeshStandardMaterial({
    color: '#1f2937',
    metalness: 0,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** F0 0.06. Final 0.30-0.73. */
  paintedSlate: new THREE.MeshStandardMaterial({
    color: '#334155',
    metalness: 0,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** F0 0.06. Final 0.30-0.73. */
  paintedMediumGray: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** Matte black paint. F0 0.01. Final 0.33-0.81. */
  paintedBlack: new THREE.MeshStandardMaterial({
    color: '#0f172a',
    metalness: 0,
    roughness: 0.95,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  // Accent metals.
  /** Brass. F0 0.50 - CONDUCTOR. Final 0.15-0.37. */
  brass: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 1,
    roughness: 0.43,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /**
   * F0 0.29 - just under the conductor floor, so this is authored as a
   * copper-coloured painted/lacquered surface, NOT as bare copper. Real copper
   * F0 is ~(0.95, 0.64, 0.54); promoting this would mean re-authoring the
   * albedo to roughly '#c87533' or lighter, which is a colour change nobody
   * asked for. Final 0.18-0.44.
   */
  copper: new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0,
    roughness: 0.52,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /** Painted motor housing. F0 0.06 - DIELECTRIC. Final 0.29-0.70. */
  industrialBlue: new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    metalness: 0,
    roughness: 0.82,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
} as const;

// Rubber/belt grain. The `RUBBER_MATERIALS` group this was written for had zero
// consumers repo-wide (`conveyorBelt` actively misled anyone looking for belt
// shading - the real belts are shaded in `ConveyorSystem.tsx`), so the group is
// gone. The texture itself stays: three files bind it through
// `PROCEDURAL_TEXTURES.rubberNormal`.
const rubberNormalTexture = generateProceduralNormal(256, 0.3, 25);

// Generate painted metal texture for safety equipment
const paintedMetalNormal = generateProceduralNormal(256, 0.4, 12);

// === SAFETY/ACCENT MATERIALS ===
// Powder-coated safety equipment: DIELECTRIC. These were at metalness 0.5, dead
// centre of the physically empty band, which is what made the hazard colours
// read chalky once there was an environment to reflect.
export const SAFETY_MATERIALS = {
  warningRed: new THREE.MeshStandardMaterial({
    color: '#ef4444',
    metalness: 0,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  warningYellow: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  safetyGreen: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    metalness: 0,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  safetyOrange: new THREE.MeshStandardMaterial({
    color: '#f97316',
    metalness: 0,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
} as const;

// === PIPE MATERIALS ===
// Spouting and its supports. Every one of these sat at metalness 0.42-0.50 -
// the exact middle of the invalid band.
//
// WARNING TO CLONERS: `roughness` here is a BASE that the ORM green channel
// multiplies by ~0.582. If you `clone()` one of these and then overwrite
// `roughness` with a number you picked by eye, you are setting the base, not
// the final value, and you will land ~1.7x glossier than you meant. Divide the
// look you want by ORM_MEAN_ROUGHNESS, or drop the `roughnessMap` on the clone.
// `SpoutingSystem.tsx` `derive()` is the live example.
export const PIPE_MATERIALS = {
  /** Painted spouting. F0 0.22 - DIELECTRIC. Final 0.28-0.68. */
  darkPipe: new THREE.MeshStandardMaterial({
    color: '#73858b',
    metalness: 0,
    roughness: 0.8,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /** Galvanised spouting. F0 0.60 - CONDUCTOR. Final 0.25-0.61. */
  lightPipe: new THREE.MeshStandardMaterial({
    color: '#c5d0cf',
    metalness: 1,
    roughness: 0.72,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /**
   * Food-grade white paint. F0 0.73 is bright enough for a conductor
   * numerically, but no metal has a neutral 0.73 reflectance except polished
   * aluminium/silver - a near-white "metal" pipe renders as a mirror. This is
   * paint. DIELECTRIC. Final 0.29-0.70.
   */
  whitePipe: new THREE.MeshStandardMaterial({
    color: '#dde2dc',
    metalness: 0,
    roughness: 0.82,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /** Painted support steel. F0 0.12 - DIELECTRIC. Final 0.33-0.81. */
  supportGray: new THREE.MeshStandardMaterial({
    color: '#53646a',
    metalness: 0,
    roughness: 0.95,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** Painted support steel. F0 0.18 - DIELECTRIC. Final 0.32-0.78. */
  supportSlate: new THREE.MeshStandardMaterial({
    color: '#66787d',
    metalness: 0,
    roughness: 0.92,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
} as const;

// === MACHINE-SPECIFIC MATERIALS ===
// Note: `machineSurfaces.ts` owns the shading of the four real machine types.
// This group is the older shared set still used by `Machines.tsx`,
// `ConveyorSystem.tsx` and `SpoutingSystem.tsx`, and it follows the same rules.
export const MACHINE_MATERIALS = {
  /** Galvanised silo skin. F0 0.67 - CONDUCTOR. Final 0.30-0.73. */
  siloBody: new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 1,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
    envMapIntensity: 1.0,
  }),
  /** Galvanised stiffener ring. F0 0.38 - CONDUCTOR. Final 0.29-0.70. */
  siloRing: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 1,
    roughness: 0.82,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /** Painted mill housing. F0 0.06 - DIELECTRIC. Final 0.32-0.77. */
  millBody: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0,
    roughness: 0.9,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
    envMapIntensity: 0.8,
  }),
  /** Painted drum shell. F0 0.19 - DIELECTRIC. Final 0.28-0.68. */
  millDrum: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0,
    roughness: 0.8,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /** Painted enclosure. F0 0.03 - DIELECTRIC. Final 0.28-0.68. */
  panelBody: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0,
    roughness: 0.8,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** Screen glass. DIELECTRIC; unmapped, so `roughness` is the final value. */
  panelScreen: new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    metalness: 0,
    roughness: 0.3,
  }),
  /** Painted motor housing. F0 0.06 - DIELECTRIC. Final 0.28-0.68. */
  motorBody: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0,
    roughness: 0.8,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /**
   * Machined shaft. F0 0.18 - too dark to be a conductor, so it is authored as
   * an oiled/blued shaft rather than bare bright steel. Final 0.18-0.44.
   */
  shaft: new THREE.MeshStandardMaterial({
    color: '#6b7280',
    metalness: 0,
    roughness: 0.52,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
  /** Bare roller. F0 0.38 - CONDUCTOR. Final 0.21-0.51. */
  rollerMetal: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 1,
    roughness: 0.6,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
  }),
} as const;

// === LOW QUALITY (MeshBasicMaterial) VERSIONS ===
export const BASIC_MATERIALS = {
  steel: new THREE.MeshBasicMaterial({ color: '#64748b' }),
  gray: new THREE.MeshBasicMaterial({ color: '#475569' }),
  darkGray: new THREE.MeshBasicMaterial({ color: '#1f2937' }),
  white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  black: new THREE.MeshBasicMaterial({ color: '#0f172a' }),
} as const;

// Generate concrete/wall textures
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
const concreteColorTexture = generateConcrete(512, 64, true);
const concreteRoughnessTexture = generateConcreteRoughness(512);

// === WALL/SURFACE MATERIALS ===
export const WALL_MATERIALS = {
  // Concrete walls with panel texture
  // Hue-preserving cool cast, not a reset to white: this is a deliberate
  // tinted variant of the one concrete map, so only the compensating darkness
  // is removed now that albedo decodes as sRGB.
  concreteWall: new THREE.MeshStandardMaterial({
    color: '#e2e6ea',
    roughness: 0.85,
    metalness: 0,
    map: concreteColorTexture,
    roughnessMap: concreteRoughnessTexture,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  // Painted wall surfaces
  paintedWall: new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.75,
    metalness: 0,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.08, 0.08),
  }),
  // Dark industrial wall
  industrialWall: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.8,
    metalness: 0,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  /** Painted door/window frame. F0 0.06 - DIELECTRIC. Final 0.30-0.73. */
  metalFrame: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  // Glass material - a dielectric; metalness 0.1 was tinting it grey.
  glass: new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.4,
  }),
  // Dock/concrete floor
  // Hue-preserving cool cast (see concreteWall).
  dockConcrete: new THREE.MeshStandardMaterial({
    color: '#cfd6dd',
    roughness: 0.9,
    metalness: 0,
    map: concreteColorTexture,
    roughnessMap: concreteRoughnessTexture,
  }),
} as const;

// Generate outdoor textures (grass and tarmac)
import { generateGrass, generateGrassRoughness } from '../textures/grass';
import { generateTarmac, generateTarmacRoughness } from '../textures/tarmac';

// Configure texture for optimal quality with anisotropic filtering
const configureTexture = (texture: THREE.DataTexture, anisotropy: number = 16): void => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
};

// Generate grass textures with proper filtering
// Using 1024 for better mipmap chain at grazing angles (reduces shimmering from high up)
const grassColorTexture = generateGrass(1024);
const grassRoughnessTexture = generateGrassRoughness(1024);

// Apply anisotropic filtering and mipmapping to grass textures
configureTexture(grassColorTexture, 16);
configureTexture(grassRoughnessTexture, 16);

// Generate tarmac textures with proper filtering
const tarmacColorTexture = generateTarmac(512);
const tarmacRoughnessTexture = generateTarmacRoughness(512);
configureTexture(tarmacColorTexture, 16);
configureTexture(tarmacRoughnessTexture, 16);

// Also configure procedural metal textures with filtering
configureTexture(brushedMetalTexture, 8);
configureTexture(panelNormalTexture, 8);

// Export texture configuration utility for use across components
export const applyAnisotropicFiltering = (
  texture: THREE.Texture | null,
  anisotropy: number = 16
): void => {
  if (texture && 'anisotropy' in texture) {
    texture.anisotropy = anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
};

// Set a universal repeat value for grass (covers large surfaces like 600x600)
// Value of 1 means the texture covers the full extent - scaling happens in the UV
// Grass will tile naturally based on geometry UV
const GRASS_REPEAT = 20; // 20 tiles over a 600 unit surface = 30 units per tile (less repeat = less shimmering at distance)
grassColorTexture.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
grassRoughnessTexture.repeat.set(GRASS_REPEAT, GRASS_REPEAT);

// Tarmac repeat
const TARMAC_REPEAT = 25;
tarmacColorTexture.repeat.set(TARMAC_REPEAT, TARMAC_REPEAT);
tarmacRoughnessTexture.repeat.set(TARMAC_REPEAT, TARMAC_REPEAT);

// === OUTDOOR MATERIALS ===
export const OUTDOOR_MATERIALS = {
  // Grass - for lawns, parks, fields.
  // The tint must stay white: grassColorTexture already carries the green, and
  // since procedural albedo is now decoded as sRGB, a green tint on top of a
  // green map multiplies the same hue twice and lands ~14x too dark over the
  // 1.44M square units of ground this material covers.
  grass: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0.0,
    map: grassColorTexture,
    roughnessMap: grassRoughnessTexture,
  }),
  // Grass without texture (for tinting with different colors).
  // This one keeps its green: with no map, the colour IS the albedo.
  // The old `panelNormalTexture` binding is dropped rather than replaced: it
  // was a sub-texel no-op at normalScale 0.05, and the correct replacement is a
  // sheet-metal panel bevel, which has no business on grass.
  grassBase: new THREE.MeshStandardMaterial({
    color: '#4a7c59',
    roughness: 0.95,
    metalness: 0.0,
  }),
  // Tarmac/Asphalt - for roads, parking lots (matte, not wet)
  tarmac: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.0,
    map: tarmacColorTexture,
    roughnessMap: tarmacRoughnessTexture,
  }),
  // Worn tarmac (lighter, more weathered). Hue-preserving lift rather than a
  // reset to white: plain #ffffff would make this byte-identical to `tarmac`
  // above (same map, same white tint) and silently delete a distinct surface.
  tarmacWorn: new THREE.MeshStandardMaterial({
    color: '#c8c8c4',
    roughness: 0.85,
    metalness: 0.0,
    map: tarmacColorTexture,
    roughnessMap: tarmacRoughnessTexture,
  }),
  // Dirt/gravel path. Inert panel normal dropped for the same reason as
  // `grassBase` above.
  dirt: new THREE.MeshStandardMaterial({
    color: '#5c4d3d',
    roughness: 0.9,
    metalness: 0.0,
  }),
} as const;

// === EXPORTED PROCEDURAL TEXTURES ===
// For inline use in components that can't use shared materials
export const PROCEDURAL_TEXTURES = {
  /**
   * DEPRECATED CHANNEL ORDER - R = roughness, G = metalness, B = AO.
   * three reads `roughnessMap.g` and `metalnessMap.b`, so this is wrong in both
   * of those slots, and as a `normalMap` it decodes to a near-constant tilt of
   * about (-0.37, +0.90). Retained only because ~30 call sites outside this
   * module still bind it. New code wants `machineORM` / `machinePanelNormal`.
   */
  brushedMetal: brushedMetalTexture,
  /**
   * DEPRECATED - `generatePanelNormal(256, 8, 0.02)` has a 0.64 px bevel, which
   * is below one texel, so the mip chain erases it and the map does nothing.
   * Retained for the same compatibility reason. Use `machinePanelNormal`.
   */
  panelNormal: panelNormalTexture,
  /** glTF-order metal ORM: R = AO, G = roughness, B = metalness (constant 1). */
  machineORM: metalOrmTexture,
  /** Real sheet-metal panel relief. Intended normalScale 0.6-0.9. */
  machinePanelNormal: machinePanelNormalTexture,
  rubberNormal: rubberNormalTexture,
  paintedMetalNormal: paintedMetalNormal,
  concreteColor: concreteColorTexture,
  concreteRoughness: concreteRoughnessTexture,
  grassColor: grassColorTexture,
  grassRoughness: grassRoughnessTexture,
  tarmacColor: tarmacColorTexture,
  tarmacRoughness: tarmacRoughnessTexture,
  rust: rustTexture,
  safetyStripe: safetyStripeTexture,
  brickColor: brickColorTexture,
  brickNormal: brickNormalTexture,
  barkOak: barkOakTexture,
  barkNormal: barkNormalTexture,
  cobblestoneColor: cobblestoneColorTexture,
  cobblestoneNormal: cobblestoneNormalTexture,
  cobblestoneRoughness: cobblestoneRoughnessTexture,
  mudColor: mudColorTexture,
  mudRoughness: mudRoughnessTexture,
  // Village roof textures
  clayTilesColor: clayTilesColorTexture,
  clayTilesNormal: clayTilesNormalTexture,
  slateColor: slateColorTexture,
  slateNormal: slateNormalTexture,
  thatchColor: thatchColorTexture,
  thatchNormal: thatchNormalTexture,
  // Village wall textures
  stuccoColor: stuccoColorTexture,
  stuccoNormal: stuccoNormalTexture,
  stuccoRoughness: stuccoRoughnessTexture,
} as const;

// === PLANT MATERIALS ===
// Materials for factory plants, trees, and vegetation
export const PLANT_MATERIALS = {
  pot: new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.9, metalness: 0.0 }),
  soil: new THREE.MeshStandardMaterial({ color: '#3d2817', roughness: 1.0, metalness: 0.0 }),
  barkDark: new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.9, metalness: 0.0 }),
  woodPale: new THREE.MeshStandardMaterial({ color: '#8b7355', roughness: 0.95, metalness: 0.0 }),
  hay: new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.8, metalness: 0.0 }),
} as const;

// === HEALTH STATUS MATERIALS ===
export const HEALTH_MATERIALS = {
  healthy: new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.7, metalness: 0.0 }),
  moderate: new THREE.MeshStandardMaterial({ color: '#84cc16', roughness: 0.7, metalness: 0.0 }),
  poor: new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.7, metalness: 0.0 }),
  healthyEmissive: new THREE.MeshBasicMaterial({ color: '#22c55e' }),
  criticalEmissive: new THREE.MeshBasicMaterial({ color: '#ef4444' }),
  activeEmissive: new THREE.MeshBasicMaterial({ color: '#1e40af' }),
} as const;

export const getHealthMaterial = (health: number): THREE.MeshStandardMaterial => {
  if (health > 60) return HEALTH_MATERIALS.healthy;
  if (health > 30) return HEALTH_MATERIALS.moderate;
  return HEALTH_MATERIALS.poor;
};

// === CACHED VECTOR2 CONSTANTS ===
export const NORMAL_SCALES = {
  low: new THREE.Vector2(0.15, 0.15),
  medium: new THREE.Vector2(0.2, 0.2),
  standard: new THREE.Vector2(0.3, 0.3),
  high: new THREE.Vector2(0.4, 0.4),
} as const;

// === INSTANCED MACHINE MATERIALS ===
export const INSTANCED_MACHINE_MATERIALS = {
  siloBody: new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.5, roughness: 0.2 }),
  siloDarkMetal: new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.6,
    roughness: 0.4,
  }),
  siloFill: new THREE.MeshStandardMaterial({
    color: '#f5d78e',
    transparent: true,
    opacity: 0.7,
    roughness: 0.9,
  }),
  siloFillLow: new THREE.MeshBasicMaterial({ color: '#f5d78e', transparent: true, opacity: 0.7 }),
  millHousingLower: new THREE.MeshStandardMaterial({
    color: '#2563eb',
    metalness: 0.6,
    roughness: 0.2,
  }),
  millHousingUpper: new THREE.MeshStandardMaterial({
    color: '#60a5fa',
    metalness: 0.5,
    roughness: 0.3,
  }),
  millFrame: new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.8, roughness: 0.15 }),
  millMotor: new THREE.MeshStandardMaterial({ color: '#374151', metalness: 0.7, roughness: 0.25 }),
  millWindow: new THREE.MeshPhysicalMaterial({
    color: '#e0f2fe',
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.8,
    thickness: 0.1,
  }),
  millRoller: new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.9, roughness: 0.1 }),
  sifterFrame: new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.8, roughness: 0.2 }),
  sifterBody: new THREE.MeshPhysicalMaterial({
    color: '#f5f0e6',
    metalness: 0.1,
    roughness: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  }),
  sifterDarkMetal: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.6,
    roughness: 0.3,
  }),
  sifterFlywheel: new THREE.MeshStandardMaterial({
    color: '#1f2937',
    metalness: 0.85,
    roughness: 0.15,
  }),
  sifterCable: new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.3, roughness: 0.6 }),
  packerFrame: new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.4, roughness: 0.4 }),
  packerHopper: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.7,
    roughness: 0.2,
  }),
  packerSpout: new THREE.MeshStandardMaterial({
    color: '#6b7280',
    metalness: 0.75,
    roughness: 0.2,
  }),
  packerConveyor: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.6,
    roughness: 0.35,
  }),
  packerPanel: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.5,
    roughness: 0.35,
  }),
  packerSafety: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.3,
    roughness: 0.5,
    transparent: true,
    opacity: 0.4,
  }),
} as const;

// === SHARED GEOMETRIES ===
// Common geometries that can be reused with different materials
export const SHARED_GEOMETRIES = {
  // Roller geometries
  rollerMain: new THREE.CylinderGeometry(0.15, 0.15, 2, 16),
  rollerAxle: new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8),
  rollerEndCap: new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12),

  // Bracket geometries
  bracketSmall: new THREE.BoxGeometry(0.08, 0.25, 0.08),
  bracketLarge: new THREE.BoxGeometry(0.15, 0.15, 0.08),

  // Support leg geometries
  legVertical: new THREE.BoxGeometry(0.2, 0.6, 0.2),
  legFoot: new THREE.BoxGeometry(0.4, 0.04, 0.25),

  // Pipe support geometries
  pipeVerticalSupport: (height: number) => new THREE.CylinderGeometry(0.1, 0.1, height * 2),
  pipeCrossBeam: new THREE.CylinderGeometry(0.08, 0.08, 3),
} as const;

// Helper function to get material for quality level
export const getMaterialForQuality = (
  standardMaterial: THREE.MeshStandardMaterial,
  basicMaterial: THREE.MeshBasicMaterial,
  quality: 'low' | 'medium' | 'high' | 'ultra'
): THREE.Material => {
  return quality === 'low' ? basicMaterial : standardMaterial;
};

// === TUNNEL MATERIALS ===
// Materials for tunnel/culvert structures (drainage passages and scenic tunnels)
export const TUNNEL_MATERIALS = {
  concrete: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    map: concreteColorTexture,
    roughnessMap: concreteRoughnessTexture,
  }),
  brick: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.85,
    map: brickColorTexture,
    normalMap: brickNormalTexture,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  /**
   * Corrugated culvert lining. The old `normalMap: brushedMetalTexture`
   * decoded a roughness/metalness/AO pack as a tangent-space normal, which is a
   * near-constant tilt of about (-0.37, +0.90) over the entire surface - a
   * uniform lighting bias, not relief. F0 0.19 - DIELECTRIC. Final 0.30-0.73.
   */
  metal: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0,
    roughness: 0.86,
    roughnessMap: metalOrmTexture,
    aoMap: metalOrmTexture,
    aoMapIntensity: ORM_AO_INTENSITY,
    normalMap: machinePanelNormalTexture,
    normalScale: PANEL_NORMAL_SCALE,
  }),
  water: new THREE.MeshStandardMaterial({
    color: '#5c8a6a',
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
  }),
} as const;

// === TREE MATERIALS (Textured) ===
// Tree materials with procedural textures for detailed scenery trees.
// `leaves` and `pineNeedles` were removed: canopies are instanced cut-out cards
// now (`InstancedFoliage.tsx`), which shade themselves, and both materials had
// zero consumers left.
export const TREE_MATERIALS = {
  trunk: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    map: barkOakTexture,
    normalMap: barkNormalTexture,
    // Raised now that the bark normal is signed: the previous generator biased
    // every texel the same direction, so extra scale only deepened a flat tilt.
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: barkOakRoughnessTexture,
  }),
  birchTrunk: new THREE.MeshStandardMaterial({
    // Real birch bark instead of oak faked with a near-white tint.
    color: '#ffffff',
    roughness: 0.7,
    map: barkBirchTexture,
    normalMap: barkNormalTexture,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
} as const;

// === BENCH MATERIALS ===
// Materials for park benches and outdoor furniture
export const BENCH_MATERIALS = {
  wood: new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.7 }),
  // Painted ironwork. F0 0.05 - DIELECTRIC; metalness 0.3 was in the dead band.
  metal: new THREE.MeshStandardMaterial({ color: '#424242', roughness: 0.6, metalness: 0 }),
} as const;

// === WOOD MATERIALS ===
// Wood materials for pallets, crates, wooden objects
export const WOOD_MATERIALS = {
  pallet: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 }),
  palletDark: new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.9 }),
  palletMedium: new THREE.MeshStandardMaterial({ color: '#7a4c2a', roughness: 0.9 }),
  crateLight: new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.8 }),
} as const;

// === FABRIC MATERIALS ===
// Fabric materials for sacks, burlap, grain bags
export const FABRIC_MATERIALS = {
  burlap: new THREE.MeshStandardMaterial({ color: '#e8dcc8', roughness: 0.95 }),
  sackGrain: new THREE.MeshStandardMaterial({ color: '#d4c4a8', roughness: 1 }),
  sackLight: new THREE.MeshStandardMaterial({ color: '#f5f0e6', roughness: 0.95 }),
} as const;

// === CERAMIC MATERIALS ===
// Ceramic materials for pots, fixtures
export const CERAMIC_MATERIALS = {
  white: new THREE.MeshStandardMaterial({ color: '#e5e5e5', roughness: 0.5 }),
  terracotta: new THREE.MeshStandardMaterial({ color: '#c45a3b', roughness: 0.7 }),
} as const;

// === SIGNAGE MATERIALS ===
// Signage materials for signs and warnings
export const SIGNAGE_MATERIALS = {
  warningYellow: new THREE.MeshStandardMaterial({ color: '#ffc107', roughness: 0.3 }),
  warningRed: new THREE.MeshStandardMaterial({ color: '#dc3545', roughness: 0.3 }),
  infoBlue: new THREE.MeshStandardMaterial({ color: '#0d6efd', roughness: 0.3 }),
  white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  black: new THREE.MeshBasicMaterial({ color: '#000000' }),
} as const;
