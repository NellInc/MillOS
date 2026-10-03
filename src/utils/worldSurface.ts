/**
 * World surface treatment: the analytic finish for authored primitive surfaces.
 *
 * ===========================================================================
 * WHY THIS EXISTS, AND WHY IT IS NOT A TEXTURE
 * ===========================================================================
 *
 * The measured work list this repo steers by (`audit-scene-models.mjs`, FLAT
 * MATERIALS BY WORLD SIZE) has had the same three rows at the top for three
 * passes:
 *
 *     MeshStandardMaterial #ffffff   3953 m   217 meshes   499 inst
 *     factory-trim                   3488 m     2 meshes    87 inst
 *     factory-accent                  762 m     1 mesh       8 inst
 *
 * Every previous pass reached for a texture and stopped, for three reasons that
 * are all correct and all recorded in the source:
 *
 * 1. NO SINGLE TILING CAN BE CORRECT. `InstancedBoxes` draws every instance
 *    from one shared `UNIT_BOX`, so a UV repeat stretches with each instance's
 *    scale. `factory-trim` alone spans 118 x 0.3 x 0.3 trusses, 120 x 0.18 x
 *    0.22 eave trim and 5 x 1 x 3 roof units - over 300:1 of aspect variation
 *    against one UV layout. `vehicleSurface.ts` documents the same constraint
 *    for the trucks, and `ChamferStrip` for geometry.
 *
 * 2. THE BIG ROW IS NOT A MATERIAL. `MeshStandardMaterial #ffffff` is the
 *    output of `StaticMeshBatch.createMergedGeometry`; the real colours ride a
 *    `color` attribute. There is no source material to texture - there are 579
 *    material elements in `FactoryExterior.tsx` and 492 in `TruckBay.tsx` that
 *    feed it.
 *
 * 3. A SHADER ON A SOURCE MATERIAL DESTROYS BATCHING.
 *    `StaticMeshBatch.isSupportedMaterial` rejects any material carrying an own
 *    `onBeforeCompile` or `customProgramCacheKey`. `FactoryExterior.tsx` says
 *    so at its GRAVITY WEATHERING block and chose decal quads instead; so does
 *    `FarmArea.tsx` ("Do NOT do this to a building material"). Both are right.
 *
 * This module is the move all three of those constraints point at and none of
 * them took: attach the finish to the material the BATCHER PRODUCES, in world
 * and object space rather than UV space, with no texture taps at all.
 *
 *   - Zero draw-call cost. The injection lands after the merge, so nothing is
 *     evicted from a batch. The bounded worst case the predecessor measured for
 *     the texture route - +139 calls out of 1,227, 11% - is not spent.
 *   - Zero VRAM. Analytic noise, no texture unit, no upload, no mip chain.
 *   - Scale invariant. A 120 m batten and a 0.3 m bolt cut from the same unit
 *     box both get metre-correct detail, because the field is sampled in metres
 *     and not in UV.
 *
 * WHAT THIS OVERTURNS, DELIBERATELY. Pass 3 closed `world-factory-infrastructure`
 * and `authored-village` as JUDGED rather than as work lists, and the judgement
 * was sound on the evidence available: no UV tiling can serve that instanced
 * set, so "add the missing map" was the wrong instruction. A world-space field
 * is precisely the thing that defeats that objection, so those closures are
 * reopened here on new grounds rather than re-litigated on the old ones. The
 * reasons those materials have no `map:` still stand and no `map:` is added.
 *
 * ===========================================================================
 * COORDINATE SPACES, AND WHY EACH TERM USES THE ONE IT DOES
 * ===========================================================================
 *
 * | term  | space                  | why                                      |
 * |-------|------------------------|------------------------------------------|
 * | macro | field (world or object)| metre-scale tonal drift                   |
 * | meso  | field (world or object)| material-scale break-up and relief        |
 * | grime | WORLD Y minus a datum  | height above the floor it stands on       |
 * | dust  | WORLD normal Y         | which way is up, at any height            |
 * | edge  | VIEW normal + position | silhouette curvature proxy                |
 *
 * The FIELD space is selected per profile, and this is the part that is easy to
 * get wrong. A world-space field on a static building is what makes two copies
 * of the same prefab stop reading as two copies. The same field on a WALKING
 * WORKER makes the detail swim: the field is nailed to the world and the body
 * moves through it. Anything that translates, rotates or deforms therefore
 * samples in OBJECT space, which is welded to the body - the same choice
 * `vehicleSurface.ts` made for the trailers' ribs, for the same reason.
 *
 * Object space is taken from `position`, not from `transformed`. For a
 * `SkinnedMesh` `transformed` is the DEFORMED position, so a field sampled
 * there would slide over the mesh as the clip plays; `position` is the rest
 * pose and stays put. That also sidesteps the reason `world-personnel` has had
 * no albedo for four passes - `SharedWorkerMaterials` records that the GLB
 * unwrap spans roughly U/V [-1.0, 1.5] with no atlas intent, so no map can be
 * bound to it. A rest-space field needs no unwrap at all.
 *
 * INSTANCING. `transformed` does NOT carry `instanceMatrix` - three applies it
 * inside `<project_vertex>`, at the point this injects - so the object matrix is
 * composed explicitly and the same material gives the same answer on a `Mesh`
 * and on an `InstancedMesh`.
 *
 * WORLD NORMAL. `mat3( modelMatrix ) * objectNormal` is wrong here because it
 * drops `instanceMatrix`, and these instanced sets are non-uniformly scaled per
 * instance, which would point the up-facing dust mask sideways.
 * `transformedNormal` has already been through three's per-instance
 * inverse-transpose and the normal matrix, leaving it in VIEW space; multiplying
 * on the right by `mat3( viewMatrix )` is the transpose, which returns it to
 * world space. `machineSurfaces.ts` documents the same manoeuvre.
 *
 * WORLD POSITION IS RECOMPUTED, never taken from `<worldpos_vertex>`: that chunk
 * is guarded by `USE_ENVMAP || DISTANCE || USE_SHADOWMAP || USE_TRANSMISSION ||
 * NUM_SPOT_LIGHT_COORDS > 0`, so on the `low` tier - no shadow maps - reading
 * `worldPosition` is a COMPILE ERROR and the surfaces go black. That failure is
 * already written up in `machineSurfaces.ts`; it is repeated here because this
 * module reaches far more materials than that one does.
 *
 * ===========================================================================
 * THE GROUND DATUM IS A PARAMETER, BECAUSE A SATURATED SMOOTHSTEP IS INERT
 * ===========================================================================
 *
 * `machineSurfaces` measures grime from `uMachineDeck` rather than zero because
 * the plansifters stand on the elevated floor at y = 9, where a zero-datum
 * `smoothstep` saturates and the whole grime term silently evaluates to
 * nothing. The surfaces this module reaches span the yard at y = 0, walkway
 * decks, the factory roof around y = 15 and the village. Every profile
 * therefore carries its own datum, and the two terms that must still work at
 * height - dust and edge wear - are deliberately datum-free.
 *
 * ===========================================================================
 * HOW A CHANGE HERE IS VERIFIED
 * ===========================================================================
 *
 * `audit-scene-models.mjs` CANNOT verify this module. It classifies a mesh as
 * finished when `material.shaderInjected` is true, so attaching any injection
 * removes these rows from the work list whether or not a pixel changed. An
 * inert treatment and a working one score identically there.
 *
 * `scripts/measure-surface-contrast.mjs` is the paired control. Every material
 * here shares ONE `uSurfStrength` uniform object, so the treatment switches off
 * between two frames of the same render - one page load, one variable - and the
 * script reports the changed-pixel fraction and the local-contrast ratio inside
 * the changed region. An exactly-zero changed fraction means the term is not
 * there. Read a green audit as evidence of nothing.
 *
 * CACHE KEY. One fixed literal for every profile, versioned by hand. The
 * profiles differ only in UNIFORM VALUES, so they must share one program: three
 * folds the parameter defines into the key alongside this string, so
 * USE_INSTANCING / USE_COLOR / shadow permutations still split properly.
 * NEVER put `Date.now()` or `Math.random()` in it - that recompiles the program
 * every frame, which is a documented 60-recompiles-per-second bug in this repo.
 */

import * as THREE from 'three';

/** Bump BY HAND whenever the injected GLSL below changes. Never derive this. */
const WORLD_SURFACE_PROGRAM_VERSION = 'v5';

/** The program cache key every profile shares. Exported for the invariant test. */
export const WORLD_SURFACE_CACHE_KEY = `millos_world_surface_${WORLD_SURFACE_PROGRAM_VERSION}`;

/**
 * The A/B kill switch, shared BY REFERENCE with every material this module
 * touches.
 *
 * three re-uploads a material's whole uniform list whenever a different
 * material was bound last (`WebGLRenderer.js`: `refreshMaterial = true` on
 * `material.id !== _currentMaterialId`), and resets `_currentMaterialId` to -1
 * at the end of every `render()`. So writing `.value` here reaches every
 * treated surface on the next frame with no recompile and no per-material
 * bookkeeping. Verified against the installed three source, not assumed.
 *
 * `SurfaceTreatmentIsolation` owns the writes; nothing else should.
 */
export const WORLD_SURFACE_STRENGTH: { value: number } = { value: 1 };

/**
 * Surface families. A profile is a bundle of uniform VALUES, not a program.
 *
 * Frequencies are authored as a PERIOD IN METRES and inverted at construction,
 * because the number that matters when reading this table is "how big is one
 * feature", and CLAUDE.md's procedural-texture rule 5 is about exactly that:
 * a feature period that lands under ~4-6 px at the viewing distance aliases and
 * then averages to a flat constant one mip level down - a mathematical no-op
 * dressed as detail. The meso term is additionally faded out past
 * `mesoFadeMetres` so it cannot shimmer at the site-scale cameras.
 */
export interface WorldSurfaceProfile {
  /** Metres. Period of the tonal drift that breaks up large flat areas. */
  readonly macroPeriod: number;
  /** 0-1. Amplitude of that drift as a fraction of albedo. */
  readonly macro: number;
  /** Metres. Period of the material-scale break-up. */
  readonly mesoPeriod: number;
  /** 0-1. Amplitude of the break-up in albedo and roughness. */
  readonly meso: number;
  /**
   * METRES of bump amplitude derived from the meso height field. 0 disables it.
   *
   * THE UNIT IS THE WHOLE POINT, and getting it wrong is what the first capture
   * of this treatment shipped. `surfPerturbNormal` is three's `perturbNormalArb`,
   * which takes `dHdxy` in the SAME LENGTH UNITS as its `surf_pos` argument -
   * and `surf_pos` here is `-vViewPosition`, i.e. view-space METRES. So the
   * shader consumes this number as a height in metres, while it was authored as
   * a 0-1 "strength": `painted` asked for 0.35 m of relief over a 0.55 m period,
   * which is a slope of 1.27, a 52 degree surface tilt. On the frame that showed
   * up as a lamp post rendered in hard light and dark blocks - one per noise
   * cell up its length - because each cell was lighting as a differently angled
   * facet.
   *
   * Author it against the period: real micro-relief on paint, render and
   * asphalt is a few per cent of its feature spacing. `worldSurface.test.ts`
   * pins every profile below a 0.12 slope so this cannot drift back.
   */
  readonly reliefMetres: number;
  /** Metres. View distance at which the meso term has faded out completely. */
  readonly mesoFadeMetres: number;
  /** 0-1. Strength of the dirt gradient climbing from `datum`. */
  readonly grime: number;
  /** Metres. Height above `datum` the dirt gradient climbs. */
  readonly grimeHeight: number;
  /** World Y of the floor these surfaces stand on. */
  readonly datum: number;
  /** 0-1. Settled dust on up-facing faces. Datum-free, so it works at height. */
  readonly dust: number;
  /** 0-1. Fresnel curvature proxy: paint worn through on silhouette edges. */
  readonly edge: number;
  /** 0 samples the detail field in world space, 1 in object rest space. */
  readonly objectSpace: 0 | 1;
  /** Wet-dirt colour at the base of the surface. */
  readonly grimeColor: string;
  /** Settled dust / flour colour on up-facing faces. */
  readonly dustColor: string;
  /** Substrate showing through on worn edges. */
  readonly bareColor: string;
}

const GRIME_BROWN = '#5d5342';
const DUST_PALE = '#b3aa96';
const BARE_STEEL = '#9aa0a2';
const BARE_CONCRETE = '#a49d92';

/**
 * The named families, and the one-line reason each differs from `painted`.
 *
 * These are art direction, so they are tuned by eye against captured frames and
 * not derived. The numbers that are NOT free choices are called out.
 */
export const WORLD_SURFACE_PROFILES = {
  /**
   * Painted and powder-coated steel: cladding, trim, sills, rails, plant.
   * The default for anything the batcher hands over that is not obviously
   * something else.
   */
  painted: {
    macroPeriod: 11,
    macro: 0.14,
    mesoPeriod: 0.55,
    meso: 0.13,
    reliefMetres: 0.018,
    mesoFadeMetres: 55,
    grime: 0.3,
    grimeHeight: 2.2,
    datum: 0,
    dust: 0.15,
    edge: 0.2,
    objectSpace: 0,
    grimeColor: GRIME_BROWN,
    dustColor: DUST_PALE,
    bareColor: BARE_STEEL,
  },
  /**
   * Concrete, brick, stone, render, tarmac. Rougher meso, shorter period,
   * stronger relief, and almost no edge wear - masonry does not rub through to
   * a brighter substrate the way paint does.
   */
  masonry: {
    macroPeriod: 8,
    // Raised from 0.14/0.13 after the relief units were corrected. The first
    // build's apron read as aggregate only because `reliefMetres` was 30x too
    // large and the normal perturbation was doing the work; with relief made
    // physical, receiving's contrast ratio fell to 1.00 - the term was still
    // there and no longer visible.
    //
    // The lever had to change with it. Real asphalt aggregate is 5-15 mm chips
    // at 10-25 mm spacing, which at these cameras' 10-40 m is one to three
    // pixels: it cannot be rendered as relief at all, only aliased. What a yard
    // this size actually shows at this distance is TONAL - patch repairs, oil,
    // wear lanes, damp - so the budget moves into albedo and roughness, where
    // it is resolvable, and the relief stays at a plausible 6 degrees of
    // undulation rather than an implausible 57.
    macro: 0.17,
    mesoPeriod: 0.35,
    meso: 0.2,
    reliefMetres: 0.02,
    mesoFadeMetres: 45,
    grime: 0.34,
    grimeHeight: 1.6,
    datum: 0,
    // 0.24 first time out. On the yard utility shed - a flat roof 3 m up, which
    // is `surfUp` 1 and `surfLedge` 1, i.e. the dust term at its maximum - that
    // replaced enough of the albedo to take the roof from teal to olive. It
    // should read as dusty, not as a different material.
    //
    // STILL THE SITE TO WATCH, AND THERE IS NO PER-ROOF LEVER. A blind A/B
    // judge, told nothing about what it was looking at, independently named the
    // same surface a pass later and in the same direction: the roof "goes from a
    // smooth teal slab to a khaki-olive dust cake whose hue and value land close
    // to the surrounding yard dirt", weakening roof-to-ground separation. Two
    // passes, two methods, one surface - a replication, not an opinion. It
    // stopped short of calling it a defect, so 0.18 stands.
    //
    // What the arithmetic says at 0.18: on a flat roof `surfUp` and `surfLedge`
    // are both 1 above y = 1, so `surfDust` = 0.18 * (0.5 + surfMesoRaw) over
    // surfMesoRaw's [0,1], i.e. 0.09 to 0.27 - up to 27% of the roof's albedo
    // replaced by DUST_PALE. On a dark blue-grey that is a hue change, not a
    // soiling.
    //
    // The reason this is a PROFILE-level number rather than a per-site override:
    // all four outbuilding roofs are inline JSX in `FactoryExterior.tsx` at
    // roughness 0.85 (the shared `OUTBUILDING_SURFACE`), so they reach the frame
    // through `StaticMeshBatch` and take their profile from
    // `resolveBatchSurfaceProfile`, which is colour-blind by construction and
    // has no override channel. Cutting for that roof therefore cuts every ledge,
    // sill, walkway deck and factory roof on the site. Anyone who wants the roof
    // alone has to give the batcher a per-mesh profile channel first; anyone who
    // wants it cut site-wide should validate the cut with its own blind A/B and
    // not by eye.
    dust: 0.18,
    edge: 0.08,
    objectSpace: 0,
    grimeColor: GRIME_BROWN,
    dustColor: DUST_PALE,
    bareColor: BARE_CONCRETE,
  },
  /**
   * Bare, galvanised and plated metal. Metalness 1 means diffuse is ZERO, so a
   * diffuse-side grime tint barely reads and the work has to be done by
   * roughness and by the edge term - which is also what makes a metal silhouette
   * read at distance. Low grime is not timidity, it is where the signal is.
   */
  metal: {
    macroPeriod: 13,
    macro: 0.1,
    mesoPeriod: 0.4,
    meso: 0.08,
    reliefMetres: 0.012,
    mesoFadeMetres: 50,
    grime: 0.16,
    grimeHeight: 1.4,
    datum: 0,
    dust: 0.12,
    // 0.34 first time out. A thin metal member is near-grazing over most of its
    // visible area, so a strong rim toward pale steel covered a whole lamp post
    // rather than picking out its edge.
    edge: 0.24,
    objectSpace: 0,
    grimeColor: GRIME_BROWN,
    dustColor: DUST_PALE,
    bareColor: BARE_STEEL,
  },
  /**
   * Foliage, hedging, thatch, crop. No grime and no dust: a leaf is not a
   * horizontal ledge, and a dirt gradient up a hedge reads as a mistake. The
   * whole budget goes into macro variation, which is what stops a hundred
   * instances of one bush reading as a hundred instances of one bush.
   *
   * WHO WEARS THIS, AND WHO DELIBERATELY DOES NOT.
   *
   * Every green surface in this repo already owned a shader before this profile
   * existed, which is why it was authored, unit-tested and applied to NOTHING
   * for two passes - a blind A/B judge measured exactly 0.000 change on the
   * grass in `overview` and `yard` and flagged the surface as outside the
   * treated set without being told what it was looking at.
   *
   * Worn, through `composeWorldSurface` (the wind injection runs first, the
   * surface terms after it, under a new cache key), all at `worldRest`:
   *
   *   `scenery/InstancedFoliage`  BROADLEAF_MATERIAL, NEEDLE_MATERIAL, CLUTTER
   *   `FarmArea`                  SM.cornGreen, the grain field
   *
   * NOT worn, on grounds that are about the surface and not about reach:
   *
   *   `terrain/TerrainMaterial` - the site's grass is not flat and has not been
   *     for some time. It carries a 175-unit macro control map (dry / soiling /
   *     hue) plus a dedicated grass tile-break in that map's alpha, on every
   *     tier, with a second 38-unit rotated tap on high and ultra; the splat
   *     shader also binds a packed grass surface map for normal, roughness and
   *     cavity AO from medium up. A second macro field on top would double-dip
   *     the term this profile exists to supply, and the injection would be
   *     declined anyway. This closes the "grass is one flat colour plus a tiled
   *     texture" reading on new grounds rather than re-litigating it.
   *
   *   the batched greens - the embankment meadow top in `FactoryExterior`,
   *     `VillageArea`'s thatch - reach the frame through
   *     `StaticMeshBatch`, whose `resolveBatchSurfaceProfile` is deliberately
   *     BLIND TO COLOUR (see that function: one merge group legitimately holds
   *     a green hedge and a red postbox), so they take `masonry` and are
   *     treated rather than untreated. Applying `vegetation` at the source
   *     material would change nothing, because the batcher re-treats the clone
   *     it merges into.
   */
  vegetation: {
    macroPeriod: 6,
    macro: 0.18,
    mesoPeriod: 0.3,
    meso: 0.12,
    reliefMetres: 0.014,
    mesoFadeMetres: 40,
    grime: 0,
    grimeHeight: 1,
    datum: 0,
    dust: 0,
    edge: 0.05,
    objectSpace: 0,
    grimeColor: GRIME_BROWN,
    dustColor: DUST_PALE,
    bareColor: BARE_CONCRETE,
  },
  /**
   * Anything that drives or is carried: forklift bodies, cargo, trailers not
   * already covered by `vehicleSurface`. OBJECT space, or the detail swims.
   * Short macro period because the subject is metres, not tens of metres.
   */
  vehicle: {
    macroPeriod: 3,
    macro: 0.1,
    mesoPeriod: 0.25,
    meso: 0.13,
    reliefMetres: 0.008,
    mesoFadeMetres: 30,
    grime: 0.24,
    grimeHeight: 1.3,
    datum: 0,
    dust: 0.14,
    edge: 0.26,
    objectSpace: 1,
    grimeColor: '#463c2e',
    dustColor: DUST_PALE,
    bareColor: BARE_STEEL,
  },
  /**
   * Worker clothing and hi-viz. Object REST space, so the weave stays welded to
   * the garment through the walk cycle.
   *
   * `mesoPeriod` 0.055 m is the one number here with a hard floor under it: at
   * the `personnel-close` camera a 1.75 m worker covers roughly 500 px, so one
   * period lands at ~16 px - comfortably above CLAUDE.md's 4-6 px aliasing
   * floor. Do not shorten it without redoing that arithmetic, and note the
   * meso fade at 14 m is what protects the wide cameras from it.
   */
  fabric: {
    macroPeriod: 1.2,
    macro: 0.09,
    // Cloth is the one surface here where the WEAVE is the point, so it gets the
    // largest meso amplitude and the relief to go with it - a garment reads as
    // cloth through its micro-shadowing, not through a tint. Slope 0.09 against
    // the 0.055 m period, still inside the units invariant.
    mesoPeriod: 0.055,
    meso: 0.22,
    reliefMetres: 0.005,
    mesoFadeMetres: 14,
    grime: 0.15,
    grimeHeight: 0.85,
    datum: 0,
    dust: 0.1,
    edge: 0.16,
    objectSpace: 1,
    grimeColor: '#4e4536',
    dustColor: '#c4bda8',
    bareColor: '#cfc9bb',
  },
  /**
   * Skin: hands, forearms, faces. Almost nothing - a fine pore-scale break-up
   * and a weak rim. No grime and no dust at all; the failure mode here is a
   * worker who looks diseased, and it is far worse than a worker who looks
   * clean.
   */
  skin: {
    macroPeriod: 0.6,
    macro: 0.03,
    mesoPeriod: 0.028,
    meso: 0.05,
    reliefMetres: 0.0008,
    // 10 m first time out, which `worldSurface.test.ts` rejected: a 0.028 m pore
    // period at 10 m is 3.84 screen pixels on the capture viewport, under
    // CLAUDE.md's 4-6 px floor, so the last two metres of that fade were drawing
    // detail that averages to a flat constant. The personnel cameras sit within
    // a few metres of their subject, so nothing is lost.
    mesoFadeMetres: 8,
    grime: 0,
    grimeHeight: 0.5,
    datum: 0,
    dust: 0,
    edge: 0.09,
    objectSpace: 1,
    grimeColor: GRIME_BROWN,
    dustColor: DUST_PALE,
    bareColor: '#e8c9ae',
  },
  /**
   * Signage, safety markings, moulded plastic, lamp housings. Deliberately the
   * lightest profile: these surfaces are meant to read as clean, recently
   * painted and legible, and a hi-viz chevron that has been weathered into the
   * background has been broken rather than finished.
   */
  signage: {
    macroPeriod: 4,
    macro: 0.05,
    mesoPeriod: 0.3,
    meso: 0.06,
    reliefMetres: 0.006,
    mesoFadeMetres: 30,
    grime: 0.16,
    grimeHeight: 1,
    datum: 0,
    dust: 0.12,
    edge: 0.1,
    objectSpace: 0,
    grimeColor: GRIME_BROWN,
    dustColor: DUST_PALE,
    bareColor: BARE_CONCRETE,
  },
} as const satisfies Record<string, WorldSurfaceProfile>;

export type WorldSurfaceProfileName = keyof typeof WORLD_SURFACE_PROFILES;

/** Per-profile overrides, for the sites whose floor is not world zero. */
export type WorldSurfaceOverrides = Partial<WorldSurfaceProfile>;

interface WorldSurfaceUniforms {
  readonly uSurfStrength: { value: number };
  /** x grime, y dust, z edge, w macro amplitude. */
  readonly uSurfMask: { value: THREE.Vector4 };
  /** x meso amplitude, y meso frequency (1/m), z relief, w meso fade metres. */
  readonly uSurfDetail: { value: THREE.Vector4 };
  /** x datum Y, y grime height, z macro frequency (1/m), w object-space select. */
  readonly uSurfSpan: { value: THREE.Vector4 };
  readonly uSurfGrime: { value: THREE.Color };
  readonly uSurfDust: { value: THREE.Color };
  readonly uSurfBare: { value: THREE.Color };
}

/** Materials publish their live uniforms so a caller can retune at runtime. */
export interface WorldSurfaceMaterial extends THREE.Material {
  userData: {
    millosWorldSurface?: WorldSurfaceUniforms;
    millosWorldSurfaceProfile?: string;
    /** Set when the treatment declined a material that already owns a shader. */
    millosWorldSurfaceSkipped?: string;
    /** Set by `composeWorldSurface`: this material carries a HOST injection too. */
    millosWorldSurfaceComposed?: boolean;
  };
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vSurfWorld;
varying vec3 vSurfObject;
varying vec3 vSurfNormalW;
`;

const VERTEX_ANCHOR = '#include <project_vertex>';

/**
 * `transformed` for anything that does not deform in the vertex shader, and
 * `position` for anything that does.
 *
 * This anchor sits AFTER `<begin_vertex>`, so by the time it runs a vertex
 * shader that sways, skins or displaces has already moved `transformed`.
 * Sampling the world field there nails the field to the world and lets the
 * geometry travel through it - the detail crawls over the surface instead of
 * being welded to it. That is the same failure `vSurfObject` avoids for skinned
 * meshes below, arriving through the world half instead of the object half.
 *
 * It is only worth paying for where a deformation exists: `worldRest` costs a
 * program variant, and for a rigid mesh `position` and `transformed` are the
 * same vector at this point.
 */
const vertexBody = (worldSource: 'transformed' | 'position'): string => /* glsl */ `
  mat4 surfObjectMatrix = modelMatrix;
  #ifdef USE_INSTANCING
    surfObjectMatrix = surfObjectMatrix * instanceMatrix;
  #endif
  vSurfWorld = ( surfObjectMatrix * vec4( ${worldSource}, 1.0 ) ).xyz;
  // position, not transformed: for a SkinnedMesh transformed is the deformed
  // vertex and a field sampled there slides over the body as the clip plays.
  // position is the rest pose.
  vSurfObject = position * vec3(
    length( surfObjectMatrix[ 0 ].xyz ),
    length( surfObjectMatrix[ 1 ].xyz ),
    length( surfObjectMatrix[ 2 ].xyz )
  );
  vSurfNormalW = normalize( transformedNormal * mat3( viewMatrix ) );
`;

const VERTEX_BODY = vertexBody('transformed');
const VERTEX_BODY_REST = vertexBody('position');

/**
 * The hash is deliberately transcendental-free. A `sin()`-based hash costs a
 * transcendental per corner - eight per noise sample, three samples per
 * fragment - on surfaces that cover most of the frame.
 */
const FRAGMENT_PARS = /* glsl */ `
uniform float uSurfStrength;
uniform vec4 uSurfMask;
uniform vec4 uSurfDetail;
uniform vec4 uSurfSpan;
uniform vec3 uSurfGrime;
uniform vec3 uSurfDust;
uniform vec3 uSurfBare;
varying vec3 vSurfWorld;
varying vec3 vSurfObject;
varying vec3 vSurfNormalW;

float surfHash( vec3 p ) {
  p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

// A fixed orthonormal rotation applied to every sample position.
//
// THIS IS A FIX, NOT A FLOURISH. Value-noise cell boundaries are axis-aligned
// planes, and a SLENDER member samples a one-dimensional slice through them: a
// 0.15 m lamp post crossing a 0.55 m field picks up one near-constant value per
// cell along its length, so the post renders as a stack of hard light and dark
// blocks perpendicular to its axis - measured, in receiving-on.png, on the first
// capture of this treatment. Rotating the sample basis makes those boundaries
// oblique to the world axes and to the post, which is far less legible; the
// second octave below does the rest. The matrix is orthonormal (det 1) so it
// rotates the field without rescaling its frequency.
const mat3 surfBasis = mat3(
  0.879776, -0.075342, 0.469380,
  0.349864, 0.771090, -0.531992,
  -0.321854, 0.632253, 0.704746
);

// Value noise with a smoothstep fade, which is C1 continuous across cell
// boundaries. That matters here beyond looks: the relief term differentiates
// this function, and a C0 field would put a visible crease on every cell edge.
float surfNoise( vec3 p ) {
  vec3 cell = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = surfHash( cell );
  float n100 = surfHash( cell + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = surfHash( cell + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = surfHash( cell + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = surfHash( cell + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = surfHash( cell + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = surfHash( cell + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = surfHash( cell + vec3( 1.0, 1.0, 1.0 ) );
  return mix(
    mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
    mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ),
    f.z
  );
}

// Two octaves at a NON-INTEGER ratio, so no two cell lattices ever line up and
// the field has no single dominant feature size to read as a pattern. One octave
// on its own is what produced the blocked lamp post; 2.17 rather than 2.0 keeps
// the second lattice from landing on the first every other cell.
float surfFbm( vec3 p ) {
  return surfNoise( p ) * 0.65 + surfNoise( p * 2.17 + vec3( 11.3, 5.7, 17.1 ) ) * 0.35;
}

// three's own perturbNormalArb, inlined: bumpmap_pars_fragment only reaches the
// shader when USE_BUMPMAP is defined, and defining that would require a bump
// texture and its UVs - which is the whole thing this module exists to avoid.
// Screen-space derivatives of an analytic height need neither.
vec3 surfPerturbNormal( vec3 surfPos, vec3 surfNorm, vec2 dHdxy ) {
  vec3 sigmaX = dFdx( surfPos );
  vec3 sigmaY = dFdy( surfPos );
  vec3 R1 = cross( sigmaY, surfNorm );
  vec3 R2 = cross( surfNorm, sigmaX );
  float det = dot( sigmaX, R1 ) * ( gl_FrontFacing ? 1.0 : -1.0 );
  vec3 grad = sign( det ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( det ) * surfNorm - grad );
}
`;

/**
 * Injected AFTER `<normal_fragment_maps>`, which is the first point in
 * `meshphysical_frag` where the shading `normal` exists and still early enough
 * that `diffuseColor`, `roughnessFactor` and `metalnessFactor` are all live -
 * `<lights_physical_fragment>` consumes them further down. `<color_fragment>`
 * has already applied the merged batch's per-vertex tint, so `diffuseColor` at
 * this point is the real albedo of the surface and the treatment modulates it
 * rather than replacing it.
 *
 * BRANCHLESS on `uSurfStrength`, on purpose. A `if ( uSurfStrength > 0.0 )`
 * wrapper would make the A/B arms differ in shader cost as well as in pixels,
 * and the whole value of the toggle is that it changes exactly one thing.
 */
const FRAGMENT_BODY = /* glsl */ `
  float surfKill = clamp( uSurfStrength, 0.0, 1.0 );
  vec3 surfField = surfBasis * mix( vSurfWorld, vSurfObject, uSurfSpan.w );
  float surfViewDist = length( vViewPosition );

  float surfMacro = surfNoise( surfField * uSurfSpan.z ) - 0.5;
  float surfNear = 1.0 - smoothstep( uSurfDetail.w * 0.45, uSurfDetail.w, surfViewDist );
  float surfMesoRaw = surfFbm( surfField * uSurfDetail.y );
  float surfMeso = ( surfMesoRaw - 0.5 ) * surfNear;

  // How much this fragment faces the sky, and how much it faces sideways. The
  // two soiling terms are geometric OPPOSITES and were originally allowed to
  // stack, which is what turned the 60 m truck apron into a sand beach on the
  // first capture: a ground-level horizontal surface saturated BOTH the
  // splash-from-the-floor gradient and the settled-dust mask at once, replacing
  // about half its albedo with dirt colours and flattening its local contrast
  // (measured: receiving lost 8% of its contrast while 44% of the frame moved).
  float surfUp = clamp( vSurfNormalW.y, 0.0, 1.0 );
  surfUp *= surfUp;
  float surfSide = 1.0 - surfUp;

  // GRIME is splash thrown UP A WALL, so it belongs on the vertical component.
  // A floor does not collect a gradient of its own dirt; it is the source of it.
  float surfHeight = vSurfWorld.y - uSurfSpan.x;
  float surfGround = 1.0 - smoothstep( 0.0, uSurfSpan.y, surfHeight );
  surfGround *= surfGround * surfSide;
  float surfGrime = clamp( surfGround * uSurfMask.x * ( 0.55 + 0.9 * surfMesoRaw ), 0.0, 1.0 ) * surfKill;

  // DUST settles on LEDGES, so it is gated off the ground plane itself and
  // rises to full over the first metre. That keeps it working at any height -
  // sills, crate lids, walkway decks, the factory roof - which is the whole
  // reason it is the datum-free term, while leaving the yard surface to be
  // varied by the macro and meso fields rather than repainted by dirt.
  float surfLedge = smoothstep( 0.12, 1.0, surfHeight );
  float surfDust = clamp( surfUp * surfLedge * uSurfMask.y * ( 0.5 + surfMesoRaw ), 0.0, 1.0 ) * surfKill;

  float surfFacing = abs( dot( normalize( vViewPosition ), normal ) );
  float surfEdge = pow( 1.0 - surfFacing, 4.0 ) * uSurfMask.z * surfKill;

  float surfTone = ( surfMacro * uSurfMask.w + surfMeso * uSurfDetail.x ) * 2.0 * surfKill;
  diffuseColor.rgb *= clamp( 1.0 + surfTone, 0.3, 1.7 );
  diffuseColor.rgb = mix( diffuseColor.rgb, uSurfGrime, surfGrime );
  diffuseColor.rgb = mix( diffuseColor.rgb, uSurfDust, surfDust );
  diffuseColor.rgb = mix( diffuseColor.rgb, uSurfBare, surfEdge );

  // Capped below 1. Whatever the profile asks for, a surface never loses ALL of
  // its authored albedo and roughness to dirt: at 1.0 the material stops being
  // the material and the tonal design of the scene goes with it.
  float surfSoiled = min( surfGrime + surfDust, 0.55 );
  roughnessFactor = clamp(
    roughnessFactor + surfMeso * uSurfDetail.x * 1.4 * surfKill,
    0.04,
    1.0
  );
  roughnessFactor = mix( roughnessFactor, 0.95, surfSoiled );
  roughnessFactor = clamp( mix( roughnessFactor, 0.32, surfEdge ), 0.04, 1.0 );
  metalnessFactor = clamp( mix( metalnessFactor, 1.0, surfEdge * 0.5 ), 0.0, 1.0 );

  // uSurfDetail.z is METRES of bump amplitude, not a 0-1 strength: dHdxy has to
  // arrive in the same length units as surfPerturbNormal's surf_pos, which is
  // view-space metres. See WorldSurfaceProfile.reliefMetres for the frame that
  // proved it.
  vec2 surfDh = vec2( dFdx( surfMesoRaw ), dFdy( surfMesoRaw ) )
    * ( uSurfDetail.z * surfNear * surfKill );
  normal = surfPerturbNormal( -vViewPosition, normal, surfDh );
`;

const FRAGMENT_ANCHOR = '#include <normal_fragment_maps>';

/**
 * Dirt has to kill the coat, or it is invisible.
 *
 * A grime tint mixed into `diffuseColor` sits UNDER a clearcoat's specular, so
 * on a coated surface - forklift paint, a moulded hard hat - the surface still
 * reads as showroom-fresh however much dirt is in its albedo.
 * `vehicleSurface.ts` found this on the trucks and reaches into
 * `material.clearcoat` for the same reason; this is that fix, generalised.
 *
 * Injected after `<lights_physical_fragment>`, which is where `material` exists
 * as a `PhysicalMaterial` struct with its clearcoat fields populated. Guarded by
 * USE_CLEARCOAT so the same source compiles on a plain standard material.
 */
const CLEARCOAT_ANCHOR = '#include <lights_physical_fragment>';
const CLEARCOAT_BODY = /* glsl */ `
  #ifdef USE_CLEARCOAT
    material.clearcoat = mix( material.clearcoat, 0.08, surfSoiled );
    material.clearcoatRoughness = clamp(
      mix( material.clearcoatRoughness, 0.6, surfSoiled ),
      0.0525,
      1.0
    );
  #endif
`;

/**
 * Materials this module can be attached to.
 *
 * `roughnessFactor` and `metalnessFactor` do not exist in `meshbasic_frag` or
 * `meshlambert_frag`, and `<normal_fragment_maps>` is not in the basic shader at
 * all - so on an unlit material the fragment anchor would silently match
 * nothing while the vertex half compiled, giving exactly the inert-with-a-
 * confident-comment outcome this repo keeps paying for. Guarded here instead.
 */
export function canApplyWorldSurface(material: THREE.Material | null | undefined): boolean {
  return Boolean(
    material &&
    (material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial)
  );
}

/** The uniform block a profile expands into. Shared by both attachment paths. */
function buildWorldSurfaceUniforms(
  profile: WorldSurfaceProfileName,
  overrides: WorldSurfaceOverrides
): WorldSurfaceUniforms {
  const settings: WorldSurfaceProfile = { ...WORLD_SURFACE_PROFILES[profile], ...overrides };
  return {
    uSurfStrength: WORLD_SURFACE_STRENGTH,
    uSurfMask: {
      value: new THREE.Vector4(settings.grime, settings.dust, settings.edge, settings.macro),
    },
    uSurfDetail: {
      value: new THREE.Vector4(
        settings.meso,
        1 / Math.max(1e-4, settings.mesoPeriod),
        settings.reliefMetres,
        Math.max(1, settings.mesoFadeMetres)
      ),
    },
    uSurfSpan: {
      value: new THREE.Vector4(
        settings.datum,
        Math.max(1e-3, settings.grimeHeight),
        1 / Math.max(1e-4, settings.macroPeriod),
        settings.objectSpace
      ),
    },
    uSurfGrime: { value: new THREE.Color(settings.grimeColor) },
    uSurfDust: { value: new THREE.Color(settings.dustColor) },
    uSurfBare: { value: new THREE.Color(settings.bareColor) },
  };
}

/** The GLSL edit, applied to a shader three is about to compile. */
function injectWorldSurface(
  shader: THREE.WebGLProgramParametersWithUniforms,
  uniforms: WorldSurfaceUniforms,
  worldRest: boolean
): void {
  Object.assign(shader.uniforms, uniforms);
  const body = worldRest ? VERTEX_BODY_REST : VERTEX_BODY;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace(VERTEX_ANCHOR, `${VERTEX_ANCHOR}\n${body}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace(FRAGMENT_ANCHOR, `${FRAGMENT_ANCHOR}\n${FRAGMENT_BODY}`)
    .replace(CLEARCOAT_ANCHOR, `${CLEARCOAT_ANCHOR}\n${CLEARCOAT_BODY}`);
}

/**
 * Attach the treatment. Returns the same material so it can be used inline.
 *
 * Idempotent: a material that already carries the injection is returned
 * untouched rather than double-wrapped, because the batcher can be asked to
 * re-run over a tree whose materials it already treated.
 */
export function applyWorldSurface<T extends THREE.Material>(
  material: T,
  profile: WorldSurfaceProfileName,
  overrides: WorldSurfaceOverrides = {}
): T {
  if (!canApplyWorldSurface(material)) return material;
  const surfaceMaterial = material as unknown as WorldSurfaceMaterial;
  // Identity, not mere presence. `THREE.Material.copy()` deep-copies userData
  // through `JSON.parse( JSON.stringify( source.userData ) )` while NOT copying
  // `onBeforeCompile` or `customProgramCacheKey`, so a clone of a treated
  // material arrives carrying a JSON GHOST of these uniforms - Colors flattened
  // to `{r,g,b}`, Vector4s to `{x,y,z,w}`, and a detached `{value:1}` where the
  // shared strength object was - and no shader at all. A presence check would
  // read that ghost as "already treated" and leave the clone unfinished and
  // permanently deaf to the A/B toggle. Checking that the recorded strength IS
  // the shared object is the one test a JSON round-trip cannot pass.
  if (surfaceMaterial.userData.millosWorldSurface?.uSurfStrength === WORLD_SURFACE_STRENGTH) {
    return material;
  }
  // NEVER overwrite someone else's injection. `onBeforeCompile` is a single
  // slot: assigning here would silently delete the floor's expansion-joint
  // relief, the terrain's splat blend, the trailers' ribs or the machines' wear,
  // and every one of those would still report `shaderInjected: true` to the
  // audit afterwards - a swap that no gate in this repo can see. Recorded on
  // userData rather than dropped quietly, so a skip is findable.
  if (
    Object.hasOwn(material, 'onBeforeCompile') ||
    Object.hasOwn(material, 'customProgramCacheKey')
  ) {
    surfaceMaterial.userData.millosWorldSurfaceSkipped = 'already-injected';
    return material;
  }

  const uniforms = buildWorldSurfaceUniforms(profile, overrides);
  material.onBeforeCompile = (shader) => injectWorldSurface(shader, uniforms, false);
  material.customProgramCacheKey = () => WORLD_SURFACE_CACHE_KEY;
  material.needsUpdate = true;
  surfaceMaterial.userData.millosWorldSurface = uniforms;
  surfaceMaterial.userData.millosWorldSurfaceProfile = profile;
  return material;
}

/** Options for {@link composeWorldSurface}. */
export interface WorldSurfaceCompositionOptions {
  /**
   * CONSTANT literal, unique to this composed variant. REQUIRED, and it must
   * not be the host injection's own key.
   *
   * three keys its program cache on `customProgramCacheKey` plus the parameter
   * defines. Leaving the host's key in place after adding GLSL to the same
   * shader hands back the program that was compiled WITHOUT these terms - a
   * treatment that is inert with every gate green, which is the failure this
   * repo keeps paying for. Never derive it from `Date.now()` or `Math.random()`.
   */
  readonly cacheKey: string;
  /** Per-site profile overrides, as for `applyWorldSurface`. */
  readonly overrides?: WorldSurfaceOverrides;
  /**
   * Sample the WORLD field at the rest vertex. Set this whenever the host
   * injection moves `transformed` - wind sway, vertex displacement - or the
   * field is nailed to the world while the geometry swings through it and the
   * detail crawls. See `vertexBody`.
   */
  readonly worldRest?: boolean;
}

/**
 * Attach the treatment ON TOP OF an injection the material already owns.
 *
 * `applyWorldSurface` refuses this case on purpose: `onBeforeCompile` is a
 * single slot, so assigning over a host injection silently deletes it while
 * still reporting `shaderInjected: true` to every gate. This is the deliberate
 * version of the same operation - the host's callback is CALLED FIRST and its
 * edits are preserved, and the caller has to name a new cache key to prove they
 * know a new program is being compiled.
 *
 * It exists because the whole vegetation branch is out of reach without it.
 * Every leaf, tuft and stalk material in this repo carries `applyWindShader`,
 * so `applyWorldSurface` declined all of them and `WORLD_SURFACE_PROFILES.
 * vegetation` was authored, tested and applied to nothing - measured by a blind
 * A/B judge as exactly 0.000 change on the grass in `overview` and `yard`.
 *
 * The composed material still shares `WORLD_SURFACE_STRENGTH` by reference, so
 * `SurfaceTreatmentIsolation` and `measure:surfaces` see it like any other
 * treated surface. It is marked composed so `StaticMeshBatch` can keep refusing
 * to merge it: the batcher merges into a CLONE, and `Material.copy()` does not
 * copy `onBeforeCompile`, so merging a composed material would silently drop
 * the host injection - the wind - from whatever it swallowed.
 */
export function composeWorldSurface<T extends THREE.Material>(
  material: T,
  profile: WorldSurfaceProfileName,
  options: WorldSurfaceCompositionOptions
): T {
  if (!canApplyWorldSurface(material)) return material;
  const surfaceMaterial = material as unknown as WorldSurfaceMaterial;
  // Same identity check as `applyWorldSurface`, and for the same reason: a
  // JSON ghost of these uniforms survives `Material.copy()` while the shader
  // does not, and only the shared-object comparison can tell the two apart.
  if (surfaceMaterial.userData.millosWorldSurface?.uSurfStrength === WORLD_SURFACE_STRENGTH) {
    return material;
  }

  const host = Object.hasOwn(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const uniforms = buildWorldSurfaceUniforms(profile, options.overrides ?? {});
  material.onBeforeCompile = (shader, renderer) => {
    host?.call(material, shader, renderer);
    injectWorldSurface(shader, uniforms, options.worldRest ?? false);
  };
  material.customProgramCacheKey = () => `${options.cacheKey}_${WORLD_SURFACE_CACHE_KEY}`;
  material.needsUpdate = true;
  surfaceMaterial.userData.millosWorldSurface = uniforms;
  surfaceMaterial.userData.millosWorldSurfaceProfile = profile;
  surfaceMaterial.userData.millosWorldSurfaceComposed = true;
  return material;
}

/**
 * True when this material's shader injection is THIS module's.
 *
 * `StaticMeshBatch.isSupportedMaterial` rejects every material carrying an own
 * `onBeforeCompile`, because it cannot merge two different injected programs and
 * has no way to tell them apart. It can tell THIS one apart: every profile
 * shares one program cache key and differs only in uniform values, and the
 * uniforms are recoverable from `userData`. Without this, finishing a mesh the
 * batcher declined to batch would permanently evict it from ever being batched
 * again - the exact trap `FactoryExterior.tsx` and `FarmArea.tsx` both warn
 * about.
 */
export function hasWorldSurface(material: THREE.Material | null | undefined): boolean {
  const surfaceMaterial = material as WorldSurfaceMaterial | null | undefined;
  return surfaceMaterial?.userData?.millosWorldSurface?.uSurfStrength === WORLD_SURFACE_STRENGTH;
}

/**
 * True when this material's ONLY shader injection is this module's.
 *
 * This, not `hasWorldSurface`, is what the batcher's exemption may safely test.
 * The exemption is sound because a merged batch re-applies the treatment to the
 * clone it produces, so nothing is lost by merging - which stops being true the
 * moment a HOST injection is riding along underneath, because
 * `Material.copy()` does not carry `onBeforeCompile` and the batcher has no way
 * to re-apply someone else's shader.
 */
export function ownsOnlyWorldSurface(material: THREE.Material | null | undefined): boolean {
  const surfaceMaterial = material as WorldSurfaceMaterial | null | undefined;
  return hasWorldSurface(material) && !surfaceMaterial?.userData?.millosWorldSurfaceComposed;
}

/** Linear luminance of a colour, for the substrate heuristics below. */
const luminanceOf = (color: THREE.Color): number =>
  0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

/**
 * Reasons a material gets no treatment at all. Shared by both resolvers so the
 * two can never disagree about what is out of scope.
 *
 *   - UNLIT and UNSHADED materials. Basic and Lambert have no roughness or
 *     metalness to modulate; see `canApplyWorldSurface`.
 *   - EMISSIVE surfaces. A lamp lens, a screen or a lit sign is emitting, not
 *     reflecting, and weathering its diffuse does nothing visible while
 *     weathering its roughness is meaningless.
 *   - TEXTURED substrates already carry authored albedo/relief/PBR response.
 *     Automatic finishing preserves those maps; explicit applyWorldSurface or
 *     composeWorldSurface opt-ins remain authoritative.
 *   - TRANSPARENT surfaces. Glass and painted floor markings are flat BY
 *     CONSTRUCTION - `world-factory-infrastructure` records this for
 *     `factory-glazing` and `factory-walkway-paint` and it is still right.
 *     They also never reach the merge path at all: `getInstanceColor` returns
 *     null for anything with `transparent` or `opacity < 1`.
 */
function isOutOfSurfaceScope(
  material: THREE.Material | null | undefined,
  allowMapped = false
): boolean {
  if (!canApplyWorldSurface(material)) return true;
  const standard = material as THREE.MeshStandardMaterial;
  if (standard.transparent || standard.opacity < 1) return true;
  // Atlas/PBR maps already describe the substrate. Automatic masonry relief
  // over the farmhouse atlas produced metre-wide plaster blobs, even with its
  // normal map disabled. Working if fresh mapped bodies retain their atlas
  // without this injection, while explicit opt-ins and plain primitives keep it.
  const hasSubstrateMaps =
    standard.map ||
    standard.normalMap ||
    standard.bumpMap ||
    standard.roughnessMap ||
    standard.metalnessMap ||
    standard.aoMap ||
    standard.displacementMap;
  if (hasSubstrateMaps && !allowMapped && !hasWorldSurface(material)) return true;
  return luminanceOf(standard.emissive) * standard.emissiveIntensity > 0.02;
}

/**
 * Choose a profile from a material's own description, colour included.
 *
 * For SINGLE-MATERIAL application sites, where the colour on the material is
 * the colour of the surface: `factory-trim`, the worker fabrics, a named
 * building material. Do NOT use it on a batch output - see
 * `resolveBatchSurfaceProfile` for why the colour is not usable there.
 * `allowMapped` is an explicit substrate-owner opt-in, never an automatic sweep.
 */
export function resolveSurfaceProfile(
  material: THREE.Material | null | undefined,
  allowMapped = false
): WorldSurfaceProfileName | null {
  if (isOutOfSurfaceScope(material, allowMapped)) return null;
  const standard = material as THREE.MeshStandardMaterial;
  if ((standard.metalness ?? 0) >= 0.55) return 'metal';

  const color = standard.color ?? new THREE.Color(0xffffff);
  // Hue-and-saturation classification on the LINEAR values three actually
  // shades with. A green that is genuinely foliage is both saturated and
  // green-dominant; the mill's painted greens are neither.
  const maxChannel = Math.max(color.r, color.g, color.b);
  const minChannel = Math.min(color.r, color.g, color.b);
  const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
  if (saturation > 0.45 && color.g === maxChannel && color.g > color.r * 1.25) {
    return 'vegetation';
  }
  // Saturated, bright and not green: hi-viz, chevrons, painted signage. These
  // are meant to stay legible.
  if (saturation > 0.5 && luminanceOf(color) > 0.15) return 'signage';
  // A rough, unsaturated surface is the mill's concrete, render and tarmac.
  if ((standard.roughness ?? 1) >= 0.8 && saturation < 0.2) return 'masonry';
  return 'painted';
}

/**
 * Choose a profile for a STATIC BATCH OUTPUT, deliberately blind to colour.
 *
 * This is what makes a blanket treatment at the batcher defensible rather than
 * indiscriminate - and the blindness is the load-bearing part.
 * `StaticMeshBatch` groups by `mergeMaterialSignature`, which is built with
 * `includeColor: false` precisely BECAUSE the members' colours differ and ride a
 * per-vertex `color` attribute instead. One merge group can legitimately hold a
 * green hedge and a red postbox. So the representative's `color` describes one
 * arbitrary member, and classifying the group by it would give a whole batch the
 * profile of whichever mesh the traversal happened to reach first.
 *
 * Every property read here is one the merge key already pinned: type, opacity,
 * emissive, and roughness/metalness rounded to the nearest quarter. That is the
 * exact set on which the representative genuinely does speak for the group.
 *
 * The cost of the blindness is that `vegetation` and `signage` can never be
 * chosen here. Both are almost entirely out of the batcher's reach anyway -
 * foliage is `InstancedMesh` or transparent, and the mill's signage is unlit
 * `MeshBasicMaterial` - and all three are excluded from batching by
 * construction. Where a batched surface genuinely wants one of those profiles,
 * the owning branch should apply it at the material instead of hoping the
 * batcher guesses.
 */
export function resolveBatchSurfaceProfile(
  material: THREE.Material | null | undefined
): WorldSurfaceProfileName | null {
  if (isOutOfSurfaceScope(material)) return null;
  const standard = material as THREE.MeshStandardMaterial;
  if ((standard.metalness ?? 0) >= 0.55) return 'metal';
  if ((standard.roughness ?? 1) >= 0.8) return 'masonry';
  return 'painted';
}

/**
 * Finish a mesh the batcher DECLINED, in place.
 *
 * `applyBatchWorldSurface` reaches only the materials `StaticMeshBatch`
 * PRODUCES. Everything it excluded - `InstancedMesh`, and anything under a
 * dynamic or interactive ancestor - keeps its own material and, until this
 * existed, kept no finish either. `test-results/pass7/unfinished-models.mjs`
 * measures that gap at roughly 200 m spread across `authored-factory-exterior`,
 * `authored-truck-yard`, `authored-village-site` and `authored-farm-site`, in
 * hundreds of inline JSX `meshStandardMaterial` elements that no per-site edit
 * could reach at a sensible cost.
 *
 * THE COLOUR-AWARE RESOLVER IS THE RIGHT ONE HERE, and that is the whole
 * difference from the batch path. `resolveBatchSurfaceProfile` is deliberately
 * blind to colour because a merge group's representative speaks for a group
 * whose members' colours differ and ride a vertex attribute. A declined mesh is
 * a SINGLE-MATERIAL SITE: its `color` is the colour of its surface, which is
 * exactly the case `resolveSurfaceProfile` documents itself for. So a hedge
 * gets `vegetation` and a chevron gets `signage` here, neither of which the
 * batcher can ever choose.
 *
 * Every existing guard still applies and none is duplicated: transparent,
 * sub-unit-opacity, emissive and unlit materials are declined by
 * `isOutOfSurfaceScope`, and anything already carrying an injection - its own
 * or this module's - is declined by `applyWorldSurface`. Returns the profile it
 * applied, or null, so the caller can tally what it actually reached.
 */
export function applyDeclinedWorldSurface(material: THREE.Material): string | null {
  const profile = resolveSurfaceProfile(material);
  if (!profile) return null;
  if (hasWorldSurface(material)) return null;
  applyWorldSurface(material, profile);
  // `applyWorldSurface` silently declines a material that already owns someone
  // else's injection, so confirm rather than assume - a tally that counts
  // declines as successes is the shape of bug this repo keeps paying for.
  return hasWorldSurface(material) ? profile : null;
}

/**
 * The `surface` callback `StaticMeshBatch` calls on every material it produces.
 *
 * Lives here rather than in `StaticMeshBatch` so that the batcher stays a
 * draw-call utility with no opinion about how a surface should look, and so the
 * decision - which profile, and why - is readable next to the profiles
 * themselves. `target` is the batcher's clone (its `color` has been forced to
 * white and its tint moved to a vertex attribute); `source` is the group's
 * representative, which still carries the roughness and metalness the merge key
 * agreed on.
 *
 * Returns the profile name it applied, or null, so the batcher can tally what it
 * actually did into `userData.staticBatchStats` - a treatment that silently
 * reached nothing is the failure mode worth being able to see.
 */
export function applyBatchWorldSurface(
  target: THREE.Material,
  source: THREE.Material
): string | null {
  const profile = resolveBatchSurfaceProfile(source);
  if (!profile) return null;
  applyWorldSurface(target, profile);
  return profile;
}
