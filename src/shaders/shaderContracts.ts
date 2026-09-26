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
    cacheKey: 'millos-optimized-sky-v8',
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
    ],
    colorSpace: 'linear uniforms to Three.js output color space',
    toneMapping: 'three-chunk',
    // Per-ring aerial extinction separates the remote optical horizon from
    // two world-anchored foothill ranges. The latter fade before the far plane.
    fog: 'none',
    transparency: 'alpha',
    depthBehavior:
      'FrontSide, depth test ON; remote ring writes depth, fixed foothills alpha-fade with depth write OFF',
    qualityVariants: ['low', 'medium'],
    uniformOwner: 'OptimizedSkySystem memoized per-ring materials',
    timeSource: 'simulation',
    cacheKey: 'millos-ridge-aerial-geology-v6',
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
    cacheKey: 'millos-procedural-moon-v1',
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
    sources: ['src/components/FactoryExterior.tsx'],
    coordinateSpaces: ['object UV', 'world position', 'analytic ripple normal', 'view direction'],
    colorSpace: 'linear uniforms through explicit tonemapping and colorspace chunks',
    // The fragment shader ends with `#include <tonemapping_fragment>`,
    // `#include <colorspace_fragment>` and `#include <fog_fragment>` by hand,
    // so the >1.0 specular glitter rolls off on the `low` path where no
    // composer is mounted to catch it, and scene fog lands after the colorspace
    // chunk as it does in three's own materials.
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'opaque',
    depthBehavior:
      'transparent false, depthWrite true, DoubleSide so a first-person eye below the canyon surface still sees water',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'AnimatedWater memoized material, registered in the module `waterMaterials` set',
    timeSource: 'simulation',
    cacheKey: 'millos-unified-water-v9',
    disposalOwner: 'AnimatedWater cleanup effect disposes and deregisters',
    fallbackMaterial: 'flat calibrated deep-water colour',
  },
  {
    id: 'terrain-splat-and-displacement',
    owner: 'TerrainMaterial',
    sources: ['src/components/terrain/TerrainMaterial.tsx'],
    coordinateSpaces: ['object position', 'world position', 'splat UV'],
    colorSpace: 'MeshStandardMaterial pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'standard depth with named decal bias',
    qualityVariants: ['high', 'ultra'],
    uniformOwner: 'TerrainMaterial stable uniform refs',
    timeSource: 'none',
    cacheKey: 'terrain_v10_{disp|nodisp}',
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
    cacheKey: 'villageCobble_feather_v3',
    disposalOwner: 'application material library lifetime',
    fallbackMaterial: 'tinted cobble MeshStandardMaterial',
  },
  {
    // Registered in the DEFECT 2 sweep, specified by the infrastructure author.
    id: 'factory-slab-detail',
    owner: 'OptimizedFactoryInfrastructure',
    sources: ['src/components/infrastructure/OptimizedFactoryInfrastructure.tsx'],
    coordinateSpaces: ['slab UV', 'view-space normal from a constant world tangent frame'],
    colorSpace: 'sRGB detail sampler decoded by the GPU, ratio blend in linear',
    toneMapping: 'three-chunk',
    fog: 'three-chunk',
    transparency: 'opaque',
    depthBehavior: 'opaque slab, depth test and write on',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner: 'module-level FLOOR_DETAIL_UNIFORMS',
    timeSource: 'none',
    cacheKey: 'millos-floor-detail-v2',
    disposalOwner: 'module lifetime',
    fallbackMaterial: 'macro map only',
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
      'per-material closure captured by applyMachineWear, mirrored on userData.machineWear',
    timeSource: 'none',
    cacheKey: 'machineWear_v2',
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
    sources: ['src/utils/worldSurface.ts'],
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
      'opaque authored surfaces and static-batch outputs; transparent and sub-unit-opacity materials are declined by resolveSurfaceProfile',
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
    coordinateSpaces: ['object-rest position, measured cabin porthole bays'],
    colorSpace: 'linear albedo and emissive radiance in the standard material pipeline',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherited opaque generated mesh, depth test and write enabled',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'cloned material; live { value } night uniform owned by the component, so a day/night flip writes one float and rebuilds nothing',
    timeSource: 'simulation',
    cacheKey: 'millos-generated-boat-portholes-v1',
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
    cacheKey: 'millos-generated-lamp-lens-v1',
    disposalOwner: 'GeneratedLampModel effect cleanup disposes its cloned materials',
    fallbackMaterial: 'the generated lamp material before the lens injection',
  },
  {
    id: 'generated-office-windows',
    owner: 'models/GeneratedOfficeModel',
    sources: ['src/components/models/GeneratedOfficeModel.tsx'],
    coordinateSpaces: ['object-rest facade position and decoded blue glazing albedo'],
    colorSpace: 'linear glass albedo and warm emissive radiance',
    toneMapping: 'material-pipeline',
    fog: 'material-pipeline',
    transparency: 'opaque',
    depthBehavior: 'inherited opaque generated mesh, depth test and write enabled',
    qualityVariants: ['low', 'medium', 'high', 'ultra'],
    uniformOwner:
      'cloned material; live { value } night uniform owned by the component, so a day/night flip writes one float and rebuilds nothing',
    timeSource: 'simulation',
    cacheKey: 'millos-generated-office-window-v2',
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
    cacheKey: 'millos-machine-steam-v1',
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
