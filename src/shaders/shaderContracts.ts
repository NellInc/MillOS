export type GraphicsTier = 'low' | 'medium' | 'high' | 'ultra';
export type ShaderTimeSource = 'simulation' | 'render-visual-only' | 'none';

export interface ActiveShaderContract {
  readonly id: string;
  readonly owner: string;
  /**
   * Repo-relative paths of every file that DEFINES this family, i.e. that
   * assigns `onBeforeCompile` or `customProgramCacheKey`, or that owns the
   * ShaderChunk override / ShaderMaterial source the family is made of.
   *
   * `scripts/validate-shaders.mjs` requires that every shader definition site
   * under `src/` appears in exactly this union or in
   * `UNCONTRACTED_SHADER_SITES`. Without it the registry only ever proved
   * registered -> source, so a brand new family could be added and the
   * validator would still report a clean run.
   */
  readonly sources: readonly string[];
  readonly coordinateSpaces: readonly string[];
  readonly colorSpace: string;
  readonly toneMapping: 'three-chunk' | 'material-pipeline' | 'disabled-emissive';
  readonly fog: 'three-chunk' | 'material-pipeline' | 'none';
  readonly transparency: 'opaque' | 'alpha' | 'additive';
  readonly depthBehavior: string;
  readonly qualityVariants: readonly GraphicsTier[];
  readonly uniformOwner: string;
  readonly timeSource: ShaderTimeSource;
  readonly cacheKey: string;
  readonly disposalOwner: string;
  readonly fallbackMaterial: string;
  /**
   * Anything true of this family that none of the fields above can hold - most
   * usefully, a second family COMPOSED onto the same material, which splits the
   * compiled cache key away from the `cacheKey` literal a reader would grep for.
   */
  readonly notes?: string;
}

/**
 * Contracts for custom shaders reachable from the current product.
 *
 * The low and medium shaders are first-scene critical. Detailed families are
 * loaded only with their high or ultra cells. A cache key of
 * `three-source-default` means Three.js derives a stable key from immutable
 * shader source and material parameters. A cache key containing `{}` is
 * parameterised per variant; the braces mark it as a pattern rather than a
 * literal to grep for.
 */
export const ACTIVE_SHADER_CONTRACTS: readonly ActiveShaderContract[] = [
  {
    id: 'windmill-inspection-task-light',
    owner: 'models/WindmillInterior',
    sources: ['src/components/models/WindmillInterior.tsx'],
    coordinateSpaces: [
      'fixed source in world metres, transformed by the current renderer viewMatrix',
      'perturbed per-fragment view normal including the actual gear rotation',
      'object-rest metres for the composed surface treatment',
    ],
    colorSpace: 'linear incident PBR radiance, display-hex source colour decoded by Three',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'unchanged opaque depth test/write; no displacement or new shadow map',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'one world source, colour, dimmer strength and held gain per mounted interior',
    timeSource: 'none',
    cacheKey: 'windmill_task_lamp_v1_{world-surface-key}',
    disposalOwner: 'WindmillInterior disposes its owned materials and geometries on unmount',
    fallbackMaterial:
      'the same standard material with task strength zero and normal world lighting',
    notes:
      'Unshadowed source is limited to six owned materials, not a scene Light. Shared lens is never disposed. Zero-global-direct-light variants initialise multiscattering before RE_Direct. Existing surface injection is composed rather than replaced.',
  },
  {
    id: 'civic-lamp-baked-visibility',
    owner: 'CivicSquareLighting',
    sources: ['src/shaders/civicLampShadows.ts'],
    coordinateSpaces: [
      'draw-camera view to world',
      'unperturbed receiver tangent plane',
      'fixed source radial depth cube-face texel centres',
    ],
    colorSpace: 'RG16 linear depth, unchanged linear punctual incident radiance',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'attenuates matching local lights only; no additional runtime shadow pass',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'shared immutable baked atlas and source manifest, runtime isolation strength',
    timeSource: 'none',
    cacheKey: 'millos-civic-lamp-visibility-v5',
    disposalOwner: 'shared TextureLoader cache and host material owner',
    fallbackMaterial: 'unmodified host for Basic/non-PBR surfaces',
    notes:
      'Rigid static occluders only. Five reprojected nearest-texel rays use receiver-plane depths with retained fragment bias; grazing/out-of-range planes retain centre-depth comparison. Smooth normals approximate the tangent plane. Windy alpha crowns and inhabitants receive lamp light but do not cast moving lamp shadows. Existing celestial map remains the dynamic shadow source.',
  },
  {
    id: 'exact-zero-punctual-light-culling',
    owner: 'shaders/punctualLightCulling',
    sources: ['src/shaders/punctualLightCulling.ts'],
    coordinateSpaces: ['view-space light direction and distance'],
    colorSpace: 'unchanged linear incident radiance',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'no depth changes; retains host material state including transparent hosts',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'WebGL zero-initialized diagnostic reference bool; no production writer',
    timeSource: 'none',
    cacheKey: 'three-source-default',
    disposalOwner: 'process lifetime, installed before compilation in App.tsx',
    fallbackMaterial: 'stock equations for every non-Standard/Physical material',
    notes:
      'Skips only exact-zero point/spot BRDF contributions. Compact ascending Standard/Physical loops for unshadowed/unmapped punctual lights; other materials and shadow/map branches retain stock unrolling. No light removal, intensity threshold, material hook, extra draw or camera-dependent variant.',
  },
  {
    id: 'generated-geometry-normal-layer',
    owner: 'GeneratedGeometrySurface.createGeneratedSurfaceMaterial',
    sources: ['src/components/models/GeneratedGeometrySurface.tsx'],
    coordinateSpaces: [
      'authored UV0 with its texture transform',
      'atlas UV1',
      'view-space tangent frame',
    ],
    colorSpace: 'linear normal vectors; host material owns albedo and output conversion',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherits the original opaque MeshStandardMaterial depth test and write',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'isolated material clone; authored normal sampler, transform and scale remain shared with the host',
    timeSource: 'none',
    cacheKey: '{hostKey}_millos-tripo-authored-normal-v1',
    disposalOwner: 'GeneratedGeometrySurface and LoadedSurfaceMesh cleanup effects',
    fallbackMaterial: 'original authored geometry and MeshStandardMaterial',
    notes:
      'Runs the host injection first, including machine wear or world-surface treatment. Appends the authored UV0 normal after the atlas normal chunk. Without an authored normal map, the clone retains the host key and standard atlas normal path.',
  },
  {
    id: 'optimized-analytic-sky',
    owner: 'OptimizedSkySystem',
    sources: ['src/components/environment/OptimizedSkySystem.tsx'],
    coordinateSpaces: ['local sky direction', 'camera-centred world transform'],
    colorSpace: 'linear uniforms to Three.js output color space',
    // Tone mapped from v5. The composer mounts from `medium` upward and applies
    // the curve to the composite, where `toneMapped` is inert, so only `low`
    // was leaving the sky off a curve every fogged surface it meets is on.
    toneMapping: 'three-chunk',
    fog: 'none',
    transparency: 'opaque',
    depthBehavior: 'BackSide, depth test and write disabled, sky render order',
    qualityVariants: ['low', 'medium'],
    uniformOwner: 'OptimizedSkySystem memoized material',
    timeSource: 'simulation',
    cacheKey: 'millos-optimized-sky-v14',
    disposalOwner: 'React scene lifetime',
    fallbackMaterial: 'scene background and fog color',
  },
  {
    id: 'ridge-aerial-perspective',
    owner: 'OptimizedSkySystem',
    sources: ['src/components/environment/OptimizedSkySystem.tsx'],
    coordinateSpaces: [
      'world normal',
      'object-rest geology',
      'vertex albedo',
      'normalised ridge height',
      'metre-space woodland crowns with fragment-footprint filtering',
      'object-rest alpine gullies and slope-aware snow accumulation',
    ],
    colorSpace: 'linear uniforms to Three.js output color space',
    toneMapping: 'three-chunk',
    // Per-ring aerial extinction separates the remote optical horizon from
    // two world-anchored foothill ranges. Their colour fades before the far plane.
    fog: 'none',
    transparency: 'opaque',
    depthBehavior: 'FrontSide, depth test ON and depth write ON for all solid terrain rings',
    qualityVariants: ['low', 'medium'],
    uniformOwner: 'OptimizedSkySystem memoized per-ring materials',
    timeSource: 'simulation',
    cacheKey: 'millos-ridge-aerial-geology-v28',
    disposalOwner: 'OptimizedSkySystem cleanup effect',
    fallbackMaterial: 'flat vertex-coloured basic ridge',
  },
  {
    // Registered in the DEFECT 2 sweep. The moon shares a file with the two sky
    // contracts above but is a separate program with its own cache key, its own
    // uniform and its own depth state, so folding it into either would have
    // described neither accurately.
    id: 'procedural-moon',
    owner: 'OptimizedSkySystem moon disc',
    sources: ['src/components/environment/OptimizedSkySystem.tsx'],
    coordinateSpaces: ['object UV over the moon quad'],
    colorSpace: 'linear lunar albedo through Three.js output',
    // `toneMapped: false`. The disc is camera-locked past every fog model and
    // is authored at display brightness rather than as a scene radiance, so the
    // curve would only crush the maria contrast that makes it read as a moon.
    toneMapping: 'disabled-emissive',
    fog: 'none',
    transparency: 'alpha',
    depthBehavior: 'depthTest true, depthWrite false, sun/moon render order behind mountains',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'module-level moonMaterial, single `opacity` uniform driven by the day cycle',
    timeSource: 'simulation',
    cacheKey: 'millos-procedural-moon-v2',
    disposalOwner: 'module lifetime',
    fallbackMaterial: 'opacity 0, the disc simply does not draw',
  },
  {
    id: 'atmospheric-fog-chunk',
    owner: 'shaders/atmosphericFog',
    sources: ['src/shaders/atmosphericFog.ts'],
    coordinateSpaces: ['view-space depth', 'reconstructed world height'],
    colorSpace: 'renderer fog color uniform',
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'opaque',
    depthBehavior:
      'no depth state; a global ShaderChunk override installed in App.tsx module scope',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'THREE.FogExp2 on the scene, driven by OptimizedSkySystem',
    timeSource: 'none',
    cacheKey: 'three-source-default',
    disposalOwner: 'process lifetime',
    fallbackMaterial: 'stock three fog chunks',
  },
  {
    id: 'display-toe-tone-mapping-chunk',
    owner: 'shaders/displayToeToneMapping',
    sources: [
      'src/shaders/displayToeToneMapping.ts',
      'src/components/environment/DisplayToneMapping.ts',
    ],
    coordinateSpaces: ['scene-referred linear colour after exposure'],
    colorSpace: 'linear in, linear out (before the sRGB output transfer)',
    toneMapping: 'three-chunk',
    fog: 'none',
    transparency: 'opaque',
    depthBehavior:
      'no depth state; a global ShaderChunk override installed in App.tsx module scope',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'none on low (strength 1); DISPLAY_TOE_STRENGTH on the composer, written by PostProcessing',
    timeSource: 'none',
    cacheKey: 'three-source-default',
    disposalOwner: 'process lifetime',
    fallbackMaterial: 'stock three NeutralToneMapping',
  },
  {
    id: 'water-family',
    owner: 'OptimizedExterior.WaterNetwork',
    sources: ['src/components/exterior/OptimizedExterior.tsx'],
    coordinateSpaces: ['object UV', 'world position', 'world normal', 'view direction'],
    colorSpace: 'linear uniforms to Three.js output color space',
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'alpha',
    depthBehavior: 'depthTest true, depthWrite false, named water render order',
    qualityVariants: ['low', 'medium'],
    uniformOwner: 'WaterNetwork memoized preset materials',
    timeSource: 'simulation',
    cacheKey: 'millos-water-family-v3',
    disposalOwner: 'WaterNetwork cleanup effect',
    fallbackMaterial: 'opaque calibrated water body color',
  },
  {
    // Registered in the DEFECT 2 sweep. This is a SECOND live water family,
    // distinct from `water-family` above: `FactoryExterior` is lazily mounted by
    // MillScene alongside `OptimizedExterior`, so both programs can be resident
    // in the same frame. See the note in UNCONTRACTED_SHADER_SITES about which
    // camera this lands under.
    id: 'authored-exterior-water',
    owner: 'FactoryExterior.AnimatedWater',
    sources: ['src/components/FactoryExterior.tsx', 'src/utils/waterOptics.ts'],
    coordinateSpaces: ['object UV', 'world position', 'analytic ripple normal', 'view direction'],
    colorSpace: 'linear uniforms through explicit tonemapping and colorspace chunks',
    // The fragment shader ends with `#include <tonemapping_fragment>`,
    // `#include <colorspace_fragment>` and `#include <fog_fragment>` by hand,
    // so the >1.0 specular glitter rolls off on the `low` path where no
    // composer is mounted to catch it, and scene fog lands after the colorspace
    // chunk as it does in three's own materials.
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'alpha',
    depthBehavior:
      'opaque on Low/unbacked water, single-pass DoubleSide transparent/depthWrite false on actual river bed/apron/film',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'UnifiedWaterSurfaceMaterial owns bed/film optics; WaterAnimationManager owns shared admitted phase; High/Ultra junction service owns cached incident reflection',
    timeSource: 'simulation',
    cacheKey: 'millos-unified-water-v31',
    disposalOwner: 'AnimatedWater cleanup effect disposes and deregisters',
    fallbackMaterial: 'flat calibrated deep-water colour',
  },
  {
    id: 'terrain-splat-and-displacement',
    owner: 'TerrainMaterial',
    sources: [
      'src/components/terrain/TerrainMaterial.tsx',
      'src/utils/concreteSlab.ts',
      'src/utils/surfaceGrit.ts',
    ],
    coordinateSpaces: ['object position', 'world position', 'splat UV'],
    colorSpace: 'MeshStandardMaterial pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'standard depth with named decal bias',
    qualityVariants: ['high', 'ultra'],
    uniformOwner: 'TerrainMaterial stable uniform refs',
    timeSource: 'none',
    cacheKey: 'terrain_v14_{disp|nodisp}',
    disposalOwner: 'TerrainMaterial cleanup effect',
    fallbackMaterial: 'calibrated grass MeshStandardMaterial',
  },
  {
    id: 'village-edge-feather',
    owner: 'VillageArea',
    sources: ['src/components/VillageArea.tsx'],
    coordinateSpaces: ['world position', 'object UV'],
    colorSpace: 'MeshStandardMaterial pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'alpha',
    depthBehavior: 'named moderate depth bias at a physical cobble datum',
    qualityVariants: ['high', 'ultra'],
    uniformOwner: 'module-level immutable material',
    timeSource: 'none',
    cacheKey: 'villageCobble_feather_v4',
    disposalOwner: 'application material library lifetime',
    fallbackMaterial: 'tinted cobble MeshStandardMaterial',
  },
  {
    // Registered in the DEFECT 2 sweep, specified by the infrastructure author.
    id: 'factory-slab-detail',
    owner: 'OptimizedFactoryInfrastructure',
    sources: [
      'src/components/infrastructure/OptimizedFactoryInfrastructure.tsx',
      'src/utils/surfaceGrit.ts',
    ],
    coordinateSpaces: [
      'slab UV',
      'slab metres (UV x tile repeat x joint pitch) for the grit',
      'view-space normal from a constant world tangent frame',
    ],
    colorSpace: 'sRGB detail sampler decoded by the GPU, ratio blend in linear',
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'opaque',
    depthBehavior: 'opaque slab, depth test and write on',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'module-level FLOOR_DETAIL_UNIFORMS',
    timeSource: 'none',
    cacheKey: 'millos-floor-detail-v3',
    disposalOwner: 'module lifetime',
    fallbackMaterial: 'macro map only',
  },
  {
    id: 'factory-glazing-fresnel',
    owner: 'OptimizedFactoryInfrastructure',
    sources: ['src/components/infrastructure/OptimizedFactoryInfrastructure.tsx'],
    coordinateSpaces: [
      'view-space geometry normal and view direction',
      'world-space face normal and fragment position (which side of the hall the eye is on)',
      'instance translation and object-space unit box (per-light seed, tilt and bow)',
    ],
    colorSpace: 'linear PMREM radiance composited before tone mapping',
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'alpha',
    depthBehavior: 'transparent panes, depth test on, depth write off',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'module-level GLAZING_FRESNEL_STRENGTH, GLAZING_V3 and GLAZING_V4, mirrored on userData.glazingFresnel, userData.glazingV3 and userData.glazingV4',
    timeSource: 'none',
    cacheKey: 'millos-glazing-fresnel-v4',
    disposalOwner: 'module lifetime',
    fallbackMaterial: 'the flat film at the authored opacity (strength 0)',
  },
  {
    // Registered in the DEFECT 2 sweep. One injection, many cache keys: every
    // caller passes its own CONSTANT literal so each species compiles once, and
    // the shadow variant is a separate MeshDepthMaterial with a `_depth` suffix
    // so the shadow sways in lockstep with the leaves.
    id: 'foliage-wind-sway',
    owner: 'scenery/WindDriver applyWindShader',
    sources: [
      'src/components/scenery/WindDriver.tsx',
      'src/components/scenery/InstancedFoliage.tsx',
      'src/components/FarmArea.tsx',
    ],
    coordinateSpaces: [
      'object-space vertex height',
      'world XZ wind direction',
      'instance matrix basis, inverted as transpose(M3)/scale^2',
      'model matrix basis, reversed the same way as the instance matrix',
    ],
    colorSpace:
      'MeshStandardMaterial pipeline, vertex displacement only; the lit foliage and crop materials additionally carry the world-surface-treatment family composed on top through composeWorldSurface, which runs this injection first and appends its own cache key',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior:
      'opaque alphaTest foliage; the matching MeshDepthMaterial carries the same sway so shadows track the geometry',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'module-level WIND_UNIFORMS shared by reference; advanced once per frame, idempotent per elapsedTime',
    timeSource: 'render-visual-only',
    cacheKey: 'millos_foliage_{kind}_v1',
    disposalOwner: 'module lifetime for the shared materials, WindDriver mounts no resources',
    notes:
      'the lit materials compile as millos_foliage_{kind}_v1_millos_world_surface_{version}; the MeshDepthMaterial shadow variants keep the bare key, since a depth pass has no albedo or roughness for the surface terms to modulate',
    fallbackMaterial: 'the same materials, static (uWindStrength 0)',
  },
  {
    // Registered in the DEFECT 2 sweep.
    id: 'machine-wear-surface',
    owner: 'machines/machineSurfaces',
    sources: ['src/components/machines/machineSurfaces.ts'],
    coordinateSpaces: [
      'world Y above the machine base',
      'object-space normal',
      'view-space normal',
    ],
    colorSpace: 'linear grime/dust/bare tints mixed into diffuseColor inside MeshStandardMaterial',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'opaque machine bodies, depth test and write on',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'per-material closure captured by applyMachineWear, mirrored on userData.machineWear; the galvanised silo materials also share the module-level SILO_FLOOD_LIGHT / SILO_FLOOD_COLOR, written each frame by SiloFloodlights',
    timeSource: 'none',
    cacheKey: 'machineWear_v7',
    disposalOwner: 'module lifetime (MACHINE_MATERIALS library)',
    fallbackMaterial: 'the same MeshStandardMaterial with no wear injection',
  },
  {
    // Registered in the DEFECT 2 sweep. Replaces the removed
    // `machine-status-ring` contract as the live machine-surface family.
    id: 'machine-face-decals',
    owner: 'machines/machineDecals',
    sources: ['src/components/machines/machineDecals.ts'],
    coordinateSpaces: [
      'quad UV remapped through a per-instance aDecalUvRect atlas rect',
      'local padded dial UV with per-instance current motor-load fraction',
    ],
    colorSpace: 'sRGB placard atlas via createColorDataTexture, lit by the standard pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    // `alphaTest` WITHOUT `transparent`: the placards stay in the opaque pass,
    // so there is no sort order to get wrong and they still write depth.
    transparency: 'opaque',
    depthBehavior:
      'opaque via alphaTest, depth write on, POLYGON_OFFSET.moderate plus the named SURFACE_LAYERS machine standoffs',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'module-level MACHINE_DECAL_MATERIAL, atlas built once and cached',
    timeSource: 'none',
    cacheKey: 'machineDecal_v2',
    disposalOwner: 'module lifetime',
    fallbackMaterial: 'undecorated machine bodies',
  },
  {
    // Registered in the DEFECT 2 sweep.
    id: 'vehicle-surface-grime',
    owner: 'utils/vehicleSurface',
    sources: ['src/utils/vehicleSurface.ts'],
    coordinateSpaces: [
      'world Y for the road-film gradient',
      'object-space metres recovered from the object matrix basis lengths for the panel ribs',
    ],
    colorSpace: 'linear grime tint mixed into diffuseColor inside the physical pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'opaque vehicle bodywork, depth test and write on',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'per-material closure, mirrored on userData.millosVehicleSurface',
    timeSource: 'none',
    cacheKey: 'millos_vehicle_surface_{version}',
    disposalOwner:
      'the calling component that owns the material (OptimizedTruckBay, ForkliftModel)',
    fallbackMaterial: 'clean painted MeshPhysicalMaterial',
  },
  {
    id: 'world-surface-treatment',
    owner: 'utils/worldSurface',
    sources: ['src/utils/worldSurface.ts', 'src/utils/concreteSlab.ts'],
    coordinateSpaces: [
      'world position recomputed through modelMatrix and instanceMatrix, never <worldpos_vertex> (guarded, and a compile error on low)',
      'object rest-space metres from the `position` attribute scaled by the object matrix basis lengths, for anything that moves or deforms',
      'the WORLD field is recomputed from `position` rather than `transformed` on composed variants (composeWorldSurface worldRest), because this anchor runs after <begin_vertex> and a swaying host has already displaced `transformed`',
      'world normal recovered as transformedNormal * mat3(viewMatrix), so per-instance scale reaches the up-facing dust mask',
      'view-space normal and vViewPosition for the fresnel edge-wear term and the derivative relief',
    ],
    colorSpace:
      'analytic masks modulating linear diffuseColor, roughnessFactor and metalnessFactor inside the physical pipeline; no texture is sampled, so no transfer function applies',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior:
      'opaque primitive surfaces and static-batch outputs; automatic resolvers preserve existing PBR maps and decline transparent/sub-unit-opacity materials; explicit textured opt-ins remain authoritative',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'per-material closure mirrored on userData.millosWorldSurface, except uSurfStrength which is the module-level WORLD_SURFACE_STRENGTH object shared by every treated material and written only by SurfaceTreatmentIsolation',
    timeSource: 'none',
    cacheKey: 'millos_world_surface_{version}',
    disposalOwner:
      'whoever owns the material - StaticMeshBatch.restoreBatches for batch outputs it cloned, the declaring module for named materials',
    notes:
      'composeWorldSurface stacks this family on top of a host injection under the key {host}_millos_world_surface_{version} and marks the material composed, which keeps it out of StaticMeshBatch: the batcher merges into a clone and Material.copy() would drop the host shader',
    fallbackMaterial: 'the same material with uSurfStrength at 0, which is the A/B control arm',
  },
  {
    id: 'generated-boat-portholes',
    owner: 'models/GeneratedBoatModel',
    sources: ['src/components/models/GeneratedBoatModel.tsx'],
    coordinateSpaces: [
      'object-rest metres and porthole/door glass plus painted-surface atlas identity',
      'view-space side and end cabin parallax',
    ],
    colorSpace: 'linear albedo and emissive radiance in the standard material pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherited opaque generated mesh, depth test and write enabled',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'ExteriorLampDriver dimmer, shared interior, glazing, reveal and paint isolation strengths and private linear cabin colours',
    timeSource: 'simulation',
    cacheKey: 'millos-authored-boat-portholes-v7',
    disposalOwner: 'GeneratedBoatModel effect cleanup disposes its cloned materials',
    fallbackMaterial: 'the generated boat material before the porthole injection',
  },
  {
    id: 'generated-lamp-lenses',
    owner: 'models/GeneratedLampModel',
    sources: ['src/components/models/GeneratedLampModel.tsx'],
    coordinateSpaces: ['object-rest height and decoded atlas albedo'],
    colorSpace: 'linear exterior lamp emissive color and intensity',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherited opaque generated mesh, depth test and write enabled',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'cloned material, intensity getter reads EXTERIOR_LAMP_LENS_MATERIAL',
    timeSource: 'simulation',
    cacheKey: 'millos-generated-lamp-lens-v2',
    disposalOwner: 'GeneratedLampModel effect cleanup disposes its cloned materials',
    fallbackMaterial: 'the generated lamp material before the lens injection',
  },
  {
    id: 'lit-inland-water-ripples',
    owner: 'VillageArea retained fountain and fallback pond/well',
    sources: ['src/utils/waterAppearance.ts'],
    coordinateSpaces: ['world metres', 'view-space micro-normal'],
    colorSpace: 'MeshStandardMaterial linear-light pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'alpha',
    depthBehavior: 'retains the host material depth state; normal-only finish with no new surface',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'WaterAnimationManager shared weather and clock, or guarded fountain clock',
    timeSource: 'render-visual-only',
    cacheKey: 'millos-lit-water-ripples-v2',
    disposalOwner: 'host material owner; no new textures, geometries or render targets',
    fallbackMaterial: 'original lit water material',
    notes:
      'Host variants: transparent retained fountain overlays use guarded render time, while opaque fallback pond/well surfaces use WaterAnimationManager simulation time. The helper preserves every host transparency/depth flag.',
  },
  {
    id: 'fountain-impact-froth',
    owner: 'VillageArea four scupper landings and primitive fallback',
    sources: ['src/utils/waterAppearance.ts'],
    coordinateSpaces: ['per-impact UV', 'view-space scene lighting'],
    colorSpace: 'MeshStandardMaterial linear-light pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'alpha',
    depthBehavior: 'depthWrite false; measured splash footprints above the basin water',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'guarded fountain animation clock',
    timeSource: 'render-visual-only',
    cacheKey: 'millos-fountain-impact-foam-v1',
    disposalOwner: 'VillageArea module-lifetime shared landing material and geometry',
    fallbackMaterial: 'lit pale splash patches',
  },
  {
    id: 'retained-pond-water',
    owner: 'scenery/NaturalDuckPond',
    sources: ['src/components/scenery/NaturalDuckPond.tsx'],
    coordinateSpaces: [
      'authored atlas UV',
      'object-rest pond position',
      'view-space reflection normal',
    ],
    colorSpace: 'linear chroma mask and colour uniforms in the standard material pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'authored opaque mesh, depth test/write retained; no duplicate water plane',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'NaturalDuckPond bounded memoized time, frozen by reduced motion, and shared crossing-wave strength',
    timeSource: 'render-visual-only',
    cacheKey: 'millos-retained-pond-water-v3',
    disposalOwner:
      'NaturalDuckPond effect disposes cloned materials; loader owns shared geometry/maps',
    fallbackMaterial: 'procedural DuckPondBasin through the existing GeneratedBoundary',
  },
  {
    id: 'generated-castle-paving',
    owner: 'GeneratedModel castle-only private material, composed after the existing room shader',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: [
      'authored castle atlas slot 6 and up-facing slab',
      'object-rest flagstones',
      'view-metre shallow normal relief',
    ],
    colorSpace: 'retained linear atlas albedo with bounded stone/joint modulation; no emission',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'original opaque depth test/write; geometry and walking datum unchanged',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'shared CASTLE_PAVING_STRENGTH exact same-page isolation control',
    timeSource: 'none',
    cacheKey: 'millos-castle-paving-v1',
    disposalOwner:
      'GeneratedModel effect disposes the private material; loader retains shared geometry/maps',
    fallbackMaterial: 'existing primitive PalaceFallback without the atlas-specific finish',
  },
  {
    id: 'generated-farm-interiors',
    owner: 'models/GeneratedModel farmhouse and recessed barn loft',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: [
      'measured farmhouse object-rest apertures',
      'measured barn loft object-rest backing',
      'view-space shallow room',
      'static world pane centre',
    ],
    colorSpace: 'linear host albedo, linen and bounded warm room emission',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'original opaque farmhouse depth; original barn backing and braces retain depth',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'shared exterior dimmer, village room/fabric controls and FARM_INTERIOR_STRENGTH isolation',
    timeSource: 'simulation',
    cacheKey: 'millos-farm-window-{kind}-v1',
    disposalOwner:
      'GeneratedModel owns private materials; all cached farm geometry/maps stay shared',
    fallbackMaterial: 'unchanged existing primitive farm buildings',
    notes:
      'Composes the existing village virtual room. Three measured house apertures retain green joinery through bounded linear albedo selection. Barn vents, walls, X braces and doors remain untouched. No extra draw, light or shadow map.',
  },
  {
    id: 'generated-village-windows',
    owner: 'models/GeneratedModel village and castle architecture and scenery/VillageGardens homes',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: [
      'authored village atlas UV glass tile',
      'standalone home pane UVs',
      'authored castle atlas UV glass tile',
      'view-space shallow room',
      'static world pane centre',
      'object-rest shop display variety',
    ],
    colorSpace:
      'linear linen albedo, bounded warm rooms, linear trade-specific pigments and diffuse room irradiance on shop display goods and atlas-coloured stained-glass emission',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'original opaque depth test and write',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'ExteriorLampDriver shared EXTERIOR_LAMP_LEVEL dimmer; shared VILLAGE_INTERIOR_STRENGTH and fabric-only VILLAGE_FABRIC_STRENGTH controls; GeneratedModel private per-trade pigments',
    timeSource: 'simulation',
    cacheKey: 'millos-authored-village-windows-v8',
    disposalOwner:
      'GeneratedModel effect cleanup disposes private materials and shop display geometries; VillageHome disposes private materials',
    fallbackMaterial: 'existing primitive village building through GeneratedBoundary',
  },
  {
    id: 'generated-church-stained-glass',
    owner: 'GeneratedModel church, composed onto village glazing',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: [
      'authored glass atlas masks',
      'static world metres',
      'fragment pixel footprint',
    ],
    colorSpace: 'linear retained atlas pigment and oxidised lead, bounded coloured glass emission',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'unchanged opaque depth test and write',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'shared EXTERIOR_LAMP_LEVEL and existing VILLAGE_INTERIOR_STRENGTH controls',
    timeSource: 'simulation',
    cacheKey: 'millos-authored-village-windows-v10-stained',
    disposalOwner:
      'GeneratedModel disposes its private material; geometry and atlas remain borrowed',
    fallbackMaterial: 'existing primitive church through GeneratedBoundary',
    notes:
      'Only stained mode adds derivative-filtered quarry leads, glass variation and roughness. Strength zero restores the former flat glazing; other village programs retain v8. No geometry, texture, light or frame owner added.',
  },
  {
    id: 'generated-forge-hearth',
    owner: 'models/GeneratedModel forge, layered over existing village glazing',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: ['object-rest firebox metres', 'ink atlas UV tile'],
    colorSpace: 'bounded linear coal emission through the standard material pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'original opaque depth test and write',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'ChimneySmoke existing throttled forge schedule; shared FORGE_HEAT_STRENGTH control',
    timeSource: 'simulation',
    cacheKey: 'millos-forge-hearth-v3',
    disposalOwner: 'GeneratedModel effect disposes cloned materials, retaining shared loader maps',
    fallbackMaterial: 'existing unheated primitive ForgePrimitiveBody',
  },
  {
    id: 'generated-apartment-windows',
    owner: 'models/GeneratedOfficeModel apartments',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: ['object-rest building height', 'authored atlas linear chroma'],
    colorSpace: 'linear emission masked to cyan glazing in the standard material pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'original opaque mesh, depth test and write unchanged',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'ExteriorLampDriver shared EXTERIOR_LAMP_LEVEL dimmer; inherited VILLAGE_INTERIOR_STRENGTH and fabric-only VILLAGE_FABRIC_STRENGTH',
    timeSource: 'simulation',
    cacheKey: 'millos-generated-apartment-window-v5',
    disposalOwner: 'GeneratedOfficeModel effect cleanup disposes cloned materials',
    fallbackMaterial: 'the existing procedural apartment through GeneratedBoundary',
  },
  {
    id: 'generated-office-windows',
    owner: 'models/GeneratedOfficeModel',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: [
      'object-rest facade position and decoded blue glazing albedo',
      'derivative view basis and shallow pane-local rooms',
    ],
    colorSpace: 'linear glass albedo and warm emissive radiance',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherited opaque generated mesh, depth test and write enabled',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'ExteriorLampDriver shared dimmer and default-one OFFICE_INTERIOR_STRENGTH control',
    timeSource: 'simulation',
    cacheKey: 'millos-generated-office-window-v3',
    disposalOwner: 'GeneratedOfficeModel effect cleanup disposes its cloned materials',
    fallbackMaterial: 'the generated office material before the window injection',
  },
  {
    id: 'generated-vehicle-paint',
    owner: 'models/GeneratedPaintedModel',
    sources: ['src/components/models/GeneratedPaintedModel.tsx'],
    coordinateSpaces: ['decoded atlas albedo, color-selective paint mask'],
    colorSpace: 'sRGB authored tint decoded to linear albedo before scene lighting',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherited opaque generated mesh, depth test and write enabled',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'one tint uniform per cloned source material',
    timeSource: 'none',
    cacheKey: 'millos-generated-paint-{profile}-v1',
    disposalOwner: 'GeneratedPaintedModel effect cleanup disposes its deduplicated materials',
    fallbackMaterial: 'the original generated vehicle atlas material',
  },
  {
    id: 'generated-windmill-sails',
    owner: 'models/GeneratedWindmill',
    sources: ['src/components/models/GeneratedWindmill.tsx'],
    coordinateSpaces: [
      'object space, rotating transformed.yz about a measured hub in the YZ plane against a baked per-vertex aSailWeight',
    ],
    colorSpace: 'geometry only - the injection writes no colour',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior:
      'opaque; the matching MeshDepthMaterial carries the same position injection so the shadow turns with the sails',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'a single uSailAngle IUniform held in a ref and shared with the depth material',
    timeSource: 'simulation',
    cacheKey: 'windmill_sails_v1{_depth}',
    disposalOwner: 'GeneratedWindmillModel, on the cloned scene it owns',
    fallbackMaterial: 'the unrotated generated windmill materials',
  },
  {
    id: 'data-flow-line',
    owner: 'DataFlowLine',
    sources: ['src/components/DataFlowLine.tsx'],
    // v4: tube UV progress is scaled by physical route length for short,
    // consistent dashes. Inactive links keep a stationary, dimmed phase.
    coordinateSpaces: ['tube UV', 'view-space normal and view direction'],
    colorSpace: 'linear accent to Three.js output color space',
    toneMapping: 'disabled-emissive',
    fog: 'none',
    transparency: 'additive',
    depthBehavior: 'depthTest true, depthWrite false',
    qualityVariants: ['medium', 'high', 'ultra'],
    uniformOwner: 'DataFlowLine memoized material',
    timeSource: 'simulation',
    cacheKey: 'millos-data-flow-line-v4',
    disposalOwner: 'DataFlowLine cleanup effects',
    fallbackMaterial: 'static LineBasicMaterial',
  },
  {
    id: 'machine-heat-shimmer',
    owner: 'VisualEffects.HeatShimmer',
    sources: ['src/components/machines/VisualEffects.tsx'],
    coordinateSpaces: ['object UV'],
    colorSpace: 'linear effect color to Three.js output color space',
    toneMapping: 'disabled-emissive',
    fog: 'none',
    transparency: 'alpha',
    depthBehavior: 'depthTest true, depthWrite false',
    qualityVariants: ['medium', 'high', 'ultra'],
    uniformOwner: 'HeatShimmer mounted material and shader registry',
    timeSource: 'render-visual-only',
    cacheKey: 'millos-heat-shimmer-v2',
    disposalOwner: 'HeatShimmer cleanup effect',
    fallbackMaterial: 'feature hidden',
  },
  {
    id: 'detailed-atmosphere-family',
    owner: 'SkySystem',
    sources: ['src/components/SkySystem.tsx'],
    coordinateSpaces: ['sky direction', 'world position', 'object UV'],
    colorSpace: 'shader-specific linear values through audited Three.js output',
    toneMapping: 'three-chunk',
    fog: 'material-pipeline',
    transparency: 'alpha',
    depthBehavior: 'camera-centred sky with explicit depth writes and named transparent layers',
    qualityVariants: ['high', 'ultra'],
    uniformOwner: 'SkySystem memoized materials',
    timeSource: 'simulation',
    cacheKey: 'three-source-default',
    disposalOwner: 'SkySystem component lifetime',
    fallbackMaterial: 'OptimizedSkySystem',
  },
  {
    id: 'blueprint-wireframe',
    owner: 'blueprint.WireframeOverlay',
    sources: ['src/components/blueprint/WireframeOverlay.tsx'],
    coordinateSpaces: ['object position', 'object UV'],
    colorSpace: 'linear accent through Three.js output',
    toneMapping: 'disabled-emissive',
    fog: 'none',
    transparency: 'alpha',
    depthBehavior: 'overlay depth test with no depth write',
    qualityVariants: ['medium', 'high', 'ultra'],
    uniformOwner: 'WireframeOverlay material ref',
    timeSource: 'render-visual-only',
    cacheKey: 'three-source-default',
    disposalOwner: 'WireframeOverlay cleanup',
    fallbackMaterial: 'static wireframe material',
  },
  {
    id: 'dust-mote-billboard',
    owner: 'DustParticles.DustParticles',
    sources: ['src/components/DustParticles.tsx'],
    // An `onBeforeCompile` injection on MeshBasicMaterial, not a ShaderMaterial:
    // three's lighting/fog/colour-space chunks are kept, only <project_vertex>
    // is replaced with a camera-facing billboard that preserves instance scale.
    coordinateSpaces: ['instance matrix translation and scale', 'view space', 'quad UV'],
    colorSpace: 'linear instance vertex colours through Three.js output',
    toneMapping: 'disabled-emissive',
    fog: 'three-chunk',
    transparency: 'additive',
    depthBehavior: 'depthTest true, depthWrite false',
    // Never mounted on `low` (MillScene gates the whole DustAnimationManager),
    // so the >1.0 additive gain always renders inside the composer.
    qualityVariants: ['medium', 'high', 'ultra'],
    uniformOwner: 'DustParticles memoized material',
    timeSource: 'none',
    cacheKey: 'millos-dust-mote-v1',
    disposalOwner: 'DustParticles cleanup effect',
    fallbackMaterial: 'feature hidden',
  },
  {
    id: 'machine-steam-puff',
    owner: 'DustParticles.MachineSteamParticle',
    sources: ['src/components/DustParticles.tsx'],
    coordinateSpaces: ['gl_PointCoord', 'per-point aLife attribute'],
    colorSpace: 'linear point colour through Three.js output',
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'alpha',
    depthBehavior: 'depthTest true, depthWrite false',
    qualityVariants: ['medium', 'high', 'ultra'],
    uniformOwner: 'MachineSteamParticle memoized material',
    timeSource: 'none',
    // Suffixed with the point-size cap in source (steam 128, dust/exhaust 64).
    cacheKey: 'millos-machine-steam-v2',
    disposalOwner: 'MachineSteamParticle cleanup effect',
    fallbackMaterial: 'plain PointsMaterial with constant opacity',
  },
  {
    id: 'firefly-billboard',
    owner: 'effects.Fireflies',
    sources: ['src/components/effects/Fireflies.tsx'],
    coordinateSpaces: ['instance matrix translation and scale', 'view space', 'quad UV'],
    colorSpace: 'linear accent through Three.js output',
    toneMapping: 'disabled-emissive',
    fog: 'three-chunk',
    transparency: 'additive',
    depthBehavior: 'depthTest true, depthWrite false',
    // Night-only, and the component returns null on `low`.
    qualityVariants: ['medium', 'high', 'ultra'],
    uniformOwner: 'Fireflies memoized material',
    timeSource: 'none',
    cacheKey: 'millos-firefly-v1',
    disposalOwner: 'Fireflies cleanup effect',
    fallbackMaterial: 'feature hidden',
  },
] as const;

export interface UncontractedShaderSite {
  /** Repo-relative path of a file that defines a shader but has no contract. */
  readonly path: string;
  /** Why it is exempt. An allow-list without reasons is just a mute button. */
  readonly reason: string;
}

/**
 * Shader definition sites that deliberately have no contract.
 *
 * `scripts/validate-shaders.mjs` requires each of these paths to still contain
 * a shader definition site, so an entry cannot rot into a permanent mute after
 * the code it excused has been deleted. Removing the file is always preferred
 * over adding an entry here; these three are recorded rather than deleted
 * because deleting them belongs to the agents who own those trees.
 */
export const UNCONTRACTED_SHADER_SITES: readonly UncontractedShaderSite[] = [
  {
    path: 'src/components/machines/StatusRing.tsx',
    reason:
      'Unreachable. Imported only by Instanced{Silos,RollerMills,Plansifters,Packers}.tsx, which are imported only by src/components/Machines.tsx, which nothing imports - statically or via the lazy import() chain in MillScene.tsx. MillScene renders machines through CompactMachines instead, whose only ring is an opaque structural stiffener band. The former `machine-status-ring` contract described this file and was removed. Delete the tree to clear this entry.',
  },
  {
    path: 'src/components/conveyors/CompactConveyorSystem.tsx',
    reason:
      'Unreachable. No file in src/ references it, statically or dynamically; MillScene lazily imports src/components/ConveyorSystem.tsx, which has no custom shader at all. The former `compact-conveyor-belt` contract named this file and was removed - it could not be repointed because the live conveyor has no shader family to point at.',
  },
  {
    path: 'src/materials/generativeMaterials.ts',
    reason:
      'Unreachable. Re-exported by src/materials/index.ts, which nothing imports, and createPaintedMetalMaterial / createRustyMetalMaterial have no call sites outside that barrel. Both cache keys (paintedMetal_wear_v1, rustyMetal_v1) are stable, so this is dead weight rather than a hazard.',
  },
];
