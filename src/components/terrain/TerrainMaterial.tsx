/**
 * TerrainMaterial - Custom material with splat map-based blending
 *
 * Extends MeshStandardMaterial to blend 4 terrain types based on a
 * splat map texture. Each RGBA channel controls blend weight for:
 * - R: Grass
 * - G: Asphalt
 * - B: Road
 * - A: Dirt / gravel verge
 *
 * This eliminates z-fighting because there's only ONE surface.
 *
 * COLOUR SPACE CONTRACT (read before touching the albedo path)
 * -----------------------------------------------------------
 * Every albedo texture handed to this material is tagged SRGBColorSpace by
 * `createColorDataTexture`, so the GPU decodes it on sample and `uXColor` is
 * already in linear working space. There is deliberately NO sRGB decode in
 * this shader: adding one would double-correct and the ground would go black.
 * The per-channel colour uniform is a TINT that multiplies the albedo tap, so
 * feeding it the same hue the texture already carries applies that hue twice -
 * which is exactly the bug that made the grass a dark, oversaturated green.
 * See TERRAIN_TINTS in terrainTypes.ts.
 *
 * SURFACE DATA
 * The `*Surface` textures pack tangent-normal XY, roughness and height into
 * one RGBA tap each (see terrainTextures.ts). AO is derived from height in
 * the shader. Everything is gated on `uHasSurfaceMaps`, a uniform float, so
 * the `low` tier pays exactly what it paid before and no new #define - and so
 * no new program variant - is introduced.
 *
 * FRAGMENT TAP BUDGET (per fragment, pure grass - most of any exterior frame)
 *   low     2  splat + grass albedo
 *   medium  4  splat + grass albedo + grass surface + macro (far only)
 *   high    5  ... + macro (near)
 *   ultra   5
 * Worst case, a fragment sitting on a four-way region transition, is 11 on
 * high/ultra and 10 on medium.
 *
 * Every gate in this shader is a REAL branch, not a multiply by zero: a
 * multiply still issues the sample and pays for it in full. `uHasSurfaceMaps`,
 * `uMacroAmount`, `uMacroNearAmount` and the `uHasXTexture` flags are uniforms,
 * so those branches are coherent across the whole draw and the sample is
 * genuinely never issued. The per-channel `weights.X > EPS` gates are
 * data-dependent but screen-space coherent, because splat regions are painted
 * at full intensity with edges only a few units wide. Do not "simplify" any of
 * these into arithmetic.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  TerrainChannel,
  DEFAULT_TERRAIN_MATERIALS,
  TERRAIN_BOUNDS,
  type TerrainBounds,
} from './terrainTypes';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

interface TerrainMaterialProps {
  /** The splat map texture (RGBA = grass/asphalt/road/dirt weights) */
  splatMap: THREE.Texture;
  /** Optional: Heightmap texture for vertex displacement (R channel = height) */
  heightmap?: THREE.Texture;
  /** Maximum displacement depth (world units, positive = downward) */
  displacementDepth?: number;
  /**
   * Per-channel colour. Multiplies the albedo tap when a texture is bound
   * (i.e. acts as a tint) and is the flat albedo when one is not.
   */
  grassColor?: THREE.ColorRepresentation;
  asphaltColor?: THREE.ColorRepresentation;
  roadColor?: THREE.ColorRepresentation;
  dirtColor?: THREE.ColorRepresentation;
  /**
   * Albedo textures. The road channel deliberately has none: it samples the
   * asphalt albedo at its own tiling scale, which saves a fragment sampler and
   * is physically right - a road IS asphalt, just a different age and finish.
   */
  grassTexture?: THREE.Texture;
  asphaltTexture?: THREE.Texture;
  dirtTexture?: THREE.Texture;
  /**
   * Packed surface data (R,G = tangent normal XY, B = roughness, A = height).
   * Omit all three to disable normal mapping, per-channel roughness, cavity AO
   * and height blending in one step.
   */
  grassSurface?: THREE.Texture;
  tarmacSurface?: THREE.Texture;
  dirtSurface?: THREE.Texture;
  /**
   * Macro variation control map: R dry, G soiling, B hue, A grass tile-break.
   * The alpha channel replaced a second tap of the grass surface texture, so it
   * must carry that channel's spread - see MACRO_BREAK_STDDEV.
   */
  macroNoise?: THREE.Texture;
  /** Texture tiling scales (world units per repeat) */
  grassScale?: number;
  asphaltScale?: number;
  roadScale?: number;
  dirtScale?: number;
  /** Per-channel tangent-normal XY gain, in TerrainChannel order. */
  normalStrength?: [number, number, number, number];
  /** Per-channel roughness multiplier, in TerrainChannel order. */
  roughnessRemap?: [number, number, number, number];
  /** How strongly cavity AO attenuates indirect light (0-1). */
  aoIntensity?: number;
  /** Height-blend hardness. Smaller interlocks harder; below ~0.12 it jags. */
  blendSharpness?: number;
  /** Macro variation amount (0 disables the macro taps entirely). */
  macroAmount?: number;
  /**
   * Weight of the SECOND (38-unit, rotated) macro tap, 0..1. At 0 the shader
   * takes a real branch around that tap and re-gains the 175-unit tap so the
   * variation keeps the same RMS strength and loses only the 38-unit frequency
   * band. This is the per-fragment cost knob for tiers below `high`.
   */
  macroNearAmount?: number;
  /** World bounds the splat map is painted over (SPLAT_BOUNDS, not the mesh). */
  bounds?: TerrainBounds;
}

/** Neutral tint used when a channel has a texture but no explicit colour. */
const NEUTRAL_TINT = 0xffffff;

/**
 * Resolve a channel's colour uniform.
 *
 * With a texture bound the uniform is a tint and must default to white -
 * defaulting it to the channel's base colour is what produced the
 * multiplied-by-itself albedo. With no texture it IS the albedo and keeps the
 * calibrated base colour.
 */
function resolveChannelColor(
  texture: THREE.Texture | undefined,
  override: THREE.ColorRepresentation | undefined,
  channel: TerrainChannel
): THREE.Color {
  if (override !== undefined) return new THREE.Color(override);
  return new THREE.Color(texture ? NEUTRAL_TINT : DEFAULT_TERRAIN_MATERIALS[channel].color);
}

/**
 * Creates the custom shader uniforms for terrain blending
 */
function createTerrainUniforms(props: TerrainMaterialProps) {
  const normalStrength = props.normalStrength ?? [1.0, 0.85, 0.7, 0.95];
  const roughnessRemap = props.roughnessRemap ?? [1.0, 1.0, 0.94, 1.0];
  const hasSurfaceMaps = props.grassSurface || props.tarmacSurface || props.dirtSurface ? 1.0 : 0.0;

  return {
    uSplatMap: { value: props.splatMap },
    uHeightmap: { value: props.heightmap ?? null },
    uHasHeightmap: { value: props.heightmap ? 1.0 : 0.0 },
    uDisplacementDepth: { value: props.displacementDepth ?? 2.5 },
    uGrassColor: {
      value: resolveChannelColor(props.grassTexture, props.grassColor, TerrainChannel.GRASS),
    },
    uAsphaltColor: {
      value: resolveChannelColor(props.asphaltTexture, props.asphaltColor, TerrainChannel.ASPHALT),
    },
    uRoadColor: {
      value: resolveChannelColor(props.asphaltTexture, props.roadColor, TerrainChannel.ROAD),
    },
    uDirtColor: {
      value: resolveChannelColor(props.dirtTexture, props.dirtColor, TerrainChannel.DIRT),
    },
    uGrassTexture: { value: props.grassTexture ?? null },
    uAsphaltTexture: { value: props.asphaltTexture ?? null },
    uDirtTexture: { value: props.dirtTexture ?? null },
    uHasGrassTexture: { value: props.grassTexture ? 1.0 : 0.0 },
    uHasAsphaltTexture: { value: props.asphaltTexture ? 1.0 : 0.0 },
    uHasDirtTexture: { value: props.dirtTexture ? 1.0 : 0.0 },
    uGrassSurface: { value: props.grassSurface ?? null },
    uTarmacSurface: { value: props.tarmacSurface ?? null },
    uDirtSurface: { value: props.dirtSurface ?? null },
    uHasSurfaceMaps: { value: hasSurfaceMaps },
    uMacroNoise: { value: props.macroNoise ?? null },
    uMacroAmount: { value: props.macroNoise ? (props.macroAmount ?? 1.0) : 0.0 },
    uMacroNearAmount: { value: props.macroNoise ? (props.macroNearAmount ?? 1.0) : 0.0 },
    uGrassScale: { value: props.grassScale ?? 10.0 },
    uAsphaltScale: { value: props.asphaltScale ?? 5.0 },
    uRoadScale: { value: props.roadScale ?? 8.0 },
    uDirtScale: { value: props.dirtScale ?? 4.5 },
    uNormalStrength: { value: new THREE.Vector4(...normalStrength) },
    uRoughnessRemap: { value: new THREE.Vector4(...roughnessRemap) },
    uAOIntensity: { value: props.aoIntensity ?? 0.8 },
    uBlendSharpness: { value: props.blendSharpness ?? 0.18 },
    uTerrainBoundsMin: {
      value: new THREE.Vector2(
        props.bounds?.minX ?? TERRAIN_BOUNDS.minX,
        props.bounds?.minZ ?? TERRAIN_BOUNDS.minZ
      ),
    },
    uTerrainBoundsMax: {
      value: new THREE.Vector2(
        props.bounds?.maxX ?? TERRAIN_BOUNDS.maxX,
        props.bounds?.maxZ ?? TERRAIN_BOUNDS.maxZ
      ),
    },
  };
}

/**
 * Vertex shader additions - heightmap displacement and world position
 */
const vertexShaderPreamble = `
  uniform sampler2D uHeightmap;
  uniform float uHasHeightmap;
  uniform float uDisplacementDepth;
  uniform vec2 uTerrainBoundsMin;
  uniform vec2 uTerrainBoundsMax;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
`;

// Custom vertex displacement - placeholder for future heightmap-based displacement
// CPU-side displacement is now handled in TerrainGround.tsx via createDisplacedGeometry
const vertexShaderDisplacement = `
  // No additional shader displacement - CPU geometry handles terrain carving
`;

// World-space normal for the fragment-side tangent frame.
// MUST be injected after <beginnormal_vertex>, which is where objectNormal is
// defined; before it the symbol does not exist, and after
// <defaultnormal_vertex> only the view-space transformedNormal remains.
const vertexShaderWorldNormal = `
  vWorldNormal = mat3(modelMatrix) * objectNormal;
`;

// World position calculation for fragment shader
const vertexShaderWorldPos = `
  vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/**
 * Fragment shader additions - sample splat map and blend terrain surfaces.
 *
 * Results land in globals because the consumers sit at four different chunk
 * boundaries: albedo at <color_fragment>, roughness at <roughnessmap_fragment>,
 * normal at <normal_fragment_maps> and AO at <aomap_fragment> (the only point
 * where reflectedLight is in scope).
 */
const fragmentShaderPreamble = `
  uniform sampler2D uSplatMap;
  uniform vec3 uGrassColor;
  uniform vec3 uAsphaltColor;
  uniform vec3 uRoadColor;
  uniform vec3 uDirtColor;
  uniform sampler2D uGrassTexture;
  uniform sampler2D uAsphaltTexture;
  uniform sampler2D uDirtTexture;
  uniform float uHasGrassTexture;
  uniform float uHasAsphaltTexture;
  uniform float uHasDirtTexture;
  uniform sampler2D uGrassSurface;
  uniform sampler2D uTarmacSurface;
  uniform sampler2D uDirtSurface;
  uniform float uHasSurfaceMaps;
  uniform sampler2D uMacroNoise;
  uniform float uMacroAmount;
  uniform float uMacroNearAmount;
  uniform float uGrassScale;
  uniform float uAsphaltScale;
  uniform float uRoadScale;
  uniform float uDirtScale;
  uniform vec4 uNormalStrength;
  uniform vec4 uRoughnessRemap;
  uniform float uAOIntensity;
  uniform float uBlendSharpness;
  uniform vec2 uTerrainBoundsMin;
  uniform vec2 uTerrainBoundsMax;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  vec3 gTerrainAlbedo;
  float gTerrainRoughness;
  float gTerrainAO;
  vec3 gTerrainNormalWorld;

  // Flat surface: normal straight up in tangent space, mid roughness, mid
  // height. Used for channels whose weight is too small to be worth a tap.
  const vec4 TERRAIN_FLAT_SURFACE = vec4(0.5, 0.5, 0.85, 0.5);
  const float TERRAIN_WEIGHT_EPS = 0.002;

  // The grass channel tiles through a 35-degree rotation to hide axis
  // alignment. Its tangent normal therefore arrives in rotated UV axes and has
  // to come back through the inverse rotation, or the grass lighting sits 35
  // degrees off its own albedo.
  const float TERRAIN_GRASS_COS = 0.819152;
  const float TERRAIN_GRASS_SIN = 0.573576;

  void computeTerrain(vec2 worldXZ) {
    vec2 splatUV = (worldXZ - uTerrainBoundsMin) / (uTerrainBoundsMax - uTerrainBoundsMin);
    vec4 splat = texture2D(uSplatMap, splatUV);

    float totalWeight = splat.r + splat.g + splat.b + splat.a + 0.001;
    vec4 weights = splat / totalWeight;

    vec2 grassUV = vec2(
      worldXZ.x * TERRAIN_GRASS_COS - worldXZ.y * TERRAIN_GRASS_SIN,
      worldXZ.x * TERRAIN_GRASS_SIN + worldXZ.y * TERRAIN_GRASS_COS
    ) / uGrassScale;
    // A continuous, low-frequency warp bends the 6.5 m tile lattice without
    // another texture tap. Both albedo and packed relief follow the same UV.
    // Its Jacobian stays positive, so no folds or hard cell boundaries appear.
    vec2 grassWarpPhase = vec2(
      dot(grassUV, vec2(0.11, 0.37)),
      dot(grassUV, vec2(0.29, -0.13))
    );
    vec2 grassWarpSlope = vec2(0.68, 0.53) * cos(grassWarpPhase);
    grassUV += vec2(0.68, 0.53) * sin(grassWarpPhase);
    vec2 asphaltUV = worldXZ / uAsphaltScale;
    vec2 roadUV = worldXZ / uRoadScale;
    vec2 dirtUV = worldXZ / uDirtScale;

    bool hasSurface = uHasSurfaceMaps > 0.5;

    // Per-channel gates. Splat regions are painted at full intensity with soft
    // edges only a few units wide, so these branches are strongly screen-space
    // coherent: the pure-grass majority of the frame pays for one channel, not
    // four. Do not replace the gate with anything driven by per-pixel noise.
    vec3 albedoGrass = uGrassColor;
    vec3 albedoAsphalt = uAsphaltColor;
    vec3 albedoRoad = uRoadColor;
    vec3 albedoDirt = uDirtColor;
    vec4 surfGrass = TERRAIN_FLAT_SURFACE;
    vec4 surfAsphalt = TERRAIN_FLAT_SURFACE;
    vec4 surfRoad = TERRAIN_FLAT_SURFACE;
    vec4 surfDirt = TERRAIN_FLAT_SURFACE;

    if (weights.r > TERRAIN_WEIGHT_EPS) {
      if (uHasGrassTexture > 0.5) {
        albedoGrass = texture2D(uGrassTexture, grassUV).rgb * uGrassColor;
      }
      // The grass tile-break term used to be a SECOND tap of this same surface
      // texture at 0.1369x the UV rate. It now rides in the alpha channel of
      // the macro map, which is already being sampled a few lines below, at the
      // same calibrated spread (see MACRO_BREAK_STDDEV in terrainTextures.ts).
      // That deletes one texture tap from every grass fragment on every tier
      // above 'low' - and it was the worst tap in the shader, because two wildly
      // different mip levels of one texture means two separate cache footprints.
      if (hasSurface) surfGrass = texture2D(uGrassSurface, grassUV);
    }
    if (weights.g > TERRAIN_WEIGHT_EPS) {
      if (uHasAsphaltTexture > 0.5) {
        albedoAsphalt = texture2D(uAsphaltTexture, asphaltUV).rgb * uAsphaltColor;
      }
      if (hasSurface) surfAsphalt = texture2D(uTarmacSurface, asphaltUV);
    }
    if (weights.b > TERRAIN_WEIGHT_EPS) {
      if (uHasAsphaltTexture > 0.5) {
        albedoRoad = texture2D(uAsphaltTexture, roadUV).rgb * uRoadColor;
      }
      if (hasSurface) surfRoad = texture2D(uTarmacSurface, roadUV);
    }
    if (weights.a > TERRAIN_WEIGHT_EPS) {
      if (uHasDirtTexture > 0.5) {
        albedoDirt = texture2D(uDirtTexture, dirtUV).rgb * uDirtColor;
      }
      if (hasSurface) surfDirt = texture2D(uDirtSurface, dirtUV);
    }

    float viewDist = length(vWorldPosition - cameraPosition);

    // Height-based blend. Instead of cross-fading four colours through a band
    // of half-and-half pixels, the taller surface wins locally, so gravel pokes
    // through grass and grass grows into the asphalt joints. ~10 ALU, no extra
    // taps: the height already arrived in the packed surface alpha.
    //
    // Skipped where one channel already owns the fragment, which is most of the
    // frame: with weights (w, 0, 0, 0) the whole operation provably reduces to
    // the identity - the cut only ever subtracts, the three zero channels stay
    // zero, and the surviving channel renormalises back to 1. Measured worst
    // case for the skipped path is a 0.2% weight difference on the one live
    // channel, which cannot be seen. The 0.995 test is screen-space
    // coherent for exactly the reason the per-channel gates above are.
    float peakWeight = max(max(weights.r, weights.g), max(weights.b, weights.a));
    if (hasSurface && peakWeight < 0.995) {
      vec4 heights = vec4(surfGrass.a, surfAsphalt.a, surfRoad.a, surfDirt.a);
      vec4 w = weights * (heights + 0.05);
      float peak = max(max(w.r, w.g), max(w.b, w.a));
      // Relax toward a soft blend with distance: once the surface maps mip out
      // the heights converge on their means, and a hard threshold on converged
      // values would snap the boundary to a straight line.
      float sharpness = mix(uBlendSharpness, 0.65, smoothstep(60.0, 180.0, viewDist));
      // The cut MUST be clamped at zero. Whenever sharpness exceeds the peak -
      // which happens on every pure-grass fragment past 180 units, and in the
      // low tail of the height distribution up close - an unclamped
      // "w - (peak - sharpness)" subtracts a negative and therefore ADDS weight
      // to channels whose weight is exactly zero, washing distant grass with
      // ~10% each of asphalt, road and dirt. Clamped, the operation can only
      // ever reduce, so a zero weight stays zero and the peak channel always
      // retains min(peak, sharpness) > 0.
      float cut = max(peak - sharpness, 0.0);
      w = max(w - cut, 0.0);
      weights = w / (w.r + w.g + w.b + w.a + 1e-4);
    }

    vec3 albedo =
      albedoGrass * weights.r +
      albedoAsphalt * weights.g +
      albedoRoad * weights.b +
      albedoDirt * weights.a;

    // Macro variation. A low-frequency control map at 175 world units, plus an
    // optional second tap at 38 units (rotated to decorrelate it), shared by all
    // four channels, so the field changes character over spans the eye reads as
    // terrain rather than as texture.
    //
    // The second tap is a REAL branch on a uniform, not a multiply by zero: it
    // is coherent across the entire draw, so on tiers below 'high' the sample
    // is genuinely never issued.
    //
    // The two-tap and one-tap forms are RMS-MATCHED, which is not the same as
    // "give the far tap the whole weight". The control channels are
    // standardised to a known spread and the two taps are decorrelated, so a
    // weighted sum of both partially cancels: 0.65*far + 0.35*near carries
    // sqrt(0.65^2 + 0.35^2) = 0.738 of one channel's spread, not 1.0. Simply
    // dropping the near term would have left medium's ground with 36% MORE
    // macro mottling than ultra's and 14% less hue drift - a tier inversion.
    // Mixing in signed space against the matching gains keeps the variation
    // strength identical across tiers and changes only its frequency content.
    // The nearW = 1 arm is algebraically identical to the original expression.
    if (uMacroAmount > 0.0) {
      vec4 macroFar = texture2D(uMacroNoise, worldXZ / 175.0);
      float nearW = uMacroNearAmount;
      vec3 macroNear = vec3(0.5);
      if (nearW > 0.0) {
        vec2 macroNearUV = vec2(
          worldXZ.x * 0.6 - worldXZ.y * 0.8,
          worldXZ.x * 0.8 + worldXZ.y * 0.6
        ) / 38.0;
        macroNear = texture2D(uMacroNoise, macroNearUV).rgb;
      }

      vec3 farSigned = macroFar.rgb - 0.5;
      vec3 nearSigned = macroNear - 0.5;

      // 0.738241 = length(vec2(0.65, 0.35)), 0.710634 = length(vec2(0.55, 0.45)),
      // 1.166190 = length(vec2(1.0, 0.6)).
      float dry = clamp(0.5 + mix(
        farSigned.r * 0.738241,
        farSigned.r * 0.65 + nearSigned.r * 0.35, nearW), 0.0, 1.0);
      float soil = clamp(0.5 + mix(
        farSigned.g * 0.710634,
        farSigned.g * 0.55 + nearSigned.g * 0.45, nearW), 0.0, 1.0);
      float hue = mix(
        farSigned.b * 1.166190,
        farSigned.b + nearSigned.b * 0.6, nearW);

      // Range kept inside 0.78-1.22 so the field cannot be pushed bright enough
      // to clip against the sky.
      vec3 macroTint = mix(vec3(0.78, 0.80, 0.70), vec3(1.22, 1.18, 1.26), dry);
      // Soiling is centred on 1.0, not on 1.0-to-darker: "soil" has mean 0.5, so
      // a mix(1.0, 0.88, soil) would have cost a flat 6% brightness everywhere
      // in exchange for the variation. This keeps the variation and the mean.
      macroTint *= mix(1.06, 0.94, soil);
      macroTint += vec3(hue * 0.10, hue * 0.02, -hue * 0.08);

      albedo *= mix(vec3(1.0), macroTint, uMacroAmount);
      // Grass tile break, mean-centred on 0.5 by the generator and standardised
      // to the same spread the grass surface height channel had, so the 0.55
      // stays the value it was calibrated at when this cost its own tap.
      albedo *= 1.0 + (macroFar.a - 0.5) * 0.55 * weights.r * uMacroAmount;
    }

    float blendedHeight = dot(
      vec4(surfGrass.a, surfAsphalt.a, surfRoad.a, surfDirt.a),
      weights
    );
    // Cavity AO from the height field. This is the contact darkening the ground
    // has never had; SSAO handles where objects meet the ground, this handles
    // the ground's own crevices.
    // The remap is deliberately NOT linear in height. The height channel is
    // mean-centred on 0.5 by the generator (that is what makes it usable as a
    // signed detail term), so a linear mix would put the AVERAGE texel at 0.775
    // and dim all 1.44M square units by a flat 8-18% - a global darkening
    // dressed up as occlusion, on the one surface the audit called too dark.
    // smoothstep leaves the typical texel at ~0.99 and only bites in the low
    // tail, which is what a cavity map is supposed to do.
    gTerrainAO = hasSurface ? mix(0.55, 1.0, smoothstep(0.05, 0.55, blendedHeight)) : 1.0;
    albedo *= mix(1.0, gTerrainAO, 0.35);

    gTerrainAlbedo = albedo;

    vec4 channelRoughness = vec4(
      surfGrass.b, surfAsphalt.b, surfRoad.b, surfDirt.b
    ) * uRoughnessRemap;
    gTerrainRoughness = hasSurface
      ? clamp(dot(channelRoughness, weights), 0.05, 1.0)
      : 0.8;

    vec3 worldNormal = normalize(vWorldNormal);
    gTerrainNormalWorld = worldNormal;

    if (hasSurface) {
      vec2 nGrass = surfGrass.rg * 2.0 - 1.0;
      // Transform the sampled relief gradient by the warp Jacobian transpose
      // before undoing the grass UV rotation, keeping light on the right slope.
      nGrass = vec2(
        (1.0 + 0.11 * grassWarpSlope.x) * nGrass.x + 0.29 * grassWarpSlope.y * nGrass.y,
        0.37 * grassWarpSlope.x * nGrass.x + (1.0 - 0.13 * grassWarpSlope.y) * nGrass.y
      );
      nGrass = vec2(
        TERRAIN_GRASS_COS * nGrass.x + TERRAIN_GRASS_SIN * nGrass.y,
        -TERRAIN_GRASS_SIN * nGrass.x + TERRAIN_GRASS_COS * nGrass.y
      );
      vec2 nAsphalt = surfAsphalt.rg * 2.0 - 1.0;
      vec2 nRoad = surfRoad.rg * 2.0 - 1.0;
      vec2 nDirt = surfDirt.rg * 2.0 - 1.0;

      vec2 tangentXY =
        nGrass * (weights.r * uNormalStrength.x) +
        nAsphalt * (weights.g * uNormalStrength.y) +
        nRoad * (weights.b * uNormalStrength.z) +
        nDirt * (weights.a * uNormalStrength.w);

      // Fade micro-relief out with distance. Beyond ~165 units a texel is far
      // smaller than a pixel and the perturbation only aliases into sparkle.
      tangentXY *= 1.0 - smoothstep(70.0, 165.0, viewDist);

      float tangentZ = sqrt(max(1.0 - dot(tangentXY, tangentXY), 0.05));

      // The tiling UV IS world XZ, so the tangent basis is analytically the
      // world X and Z axes - no derivative-based TBN, no cross product, and no
      // degenerate case to guard against.
      gTerrainNormalWorld = normalize(
        vec3(tangentXY.x, 0.0, tangentXY.y) + worldNormal * max(tangentZ, 0.05)
      );
    }
  }
`;

// Replace the diffuseColor calculation
const fragmentShaderDiffuseReplace = `
  computeTerrain(vWorldPosition.xz);
  diffuseColor.rgb *= gTerrainAlbedo;
`;

const fragmentShaderRoughnessReplace = `
  roughnessFactor = gTerrainRoughness;
`;

// <normal_fragment_maps> compiles to nothing without USE_NORMALMAP, and sits
// immediately after <normal_fragment_begin> where `normal` is defined - the
// correct anchor for replacing the shading normal.
const fragmentShaderNormalReplace = `
  normal = normalize((viewMatrix * vec4(gTerrainNormalWorld, 0.0)).xyz);
`;

// <aomap_fragment> is the first point at which reflectedLight is in scope.
const fragmentShaderAOReplace = `
  float terrainAOFactor = mix(1.0, gTerrainAO, uAOIntensity);
  reflectedLight.indirectDiffuse *= terrainAOFactor;
  reflectedLight.indirectSpecular *= terrainAOFactor;
`;

/**
 * Replace a three.js shader chunk include, failing loudly in development.
 *
 * A missing anchor makes String.replace a silent no-op, which shows up as
 * "the feature just does nothing" rather than as an error - the exact failure
 * mode the normal/roughness/AO injections are most exposed to.
 */
function injectAfter(source: string, anchor: string, addition: string): string {
  if (!source.includes(anchor)) {
    if (import.meta.env.DEV) {
      console.error(`[TerrainMaterial] shader anchor not found: ${anchor}`);
    }
    return source;
  }
  return source.replace(anchor, `${anchor}\n${addition}`);
}

/** Apply every terrain injection to a compiled-in shader object. */
function injectTerrainShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = injectAfter(shader.vertexShader, '#include <common>', vertexShaderPreamble);
  shader.vertexShader = injectAfter(
    shader.vertexShader,
    '#include <beginnormal_vertex>',
    vertexShaderWorldNormal
  );
  shader.vertexShader = injectAfter(
    shader.vertexShader,
    '#include <begin_vertex>',
    vertexShaderDisplacement
  );
  shader.vertexShader = injectAfter(
    shader.vertexShader,
    '#include <worldpos_vertex>',
    vertexShaderWorldPos
  );

  shader.fragmentShader = injectAfter(
    shader.fragmentShader,
    '#include <common>',
    fragmentShaderPreamble
  );
  shader.fragmentShader = injectAfter(
    shader.fragmentShader,
    '#include <color_fragment>',
    fragmentShaderDiffuseReplace
  );
  shader.fragmentShader = injectAfter(
    shader.fragmentShader,
    '#include <roughnessmap_fragment>',
    fragmentShaderRoughnessReplace
  );
  shader.fragmentShader = injectAfter(
    shader.fragmentShader,
    '#include <normal_fragment_maps>',
    fragmentShaderNormalReplace
  );
  shader.fragmentShader = injectAfter(
    shader.fragmentShader,
    '#include <aomap_fragment>',
    fragmentShaderAOReplace
  );
}

/**
 * TerrainMaterial component - use as <meshStandardMaterial> replacement
 *
 * Usage:
 * <mesh>
 *   <planeGeometry args={[width, height]} />
 *   <TerrainMaterial splatMap={mySplatMap} />
 * </mesh>
 */
export function TerrainMaterial(props: TerrainMaterialProps) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  // Lazy: useRef's argument is evaluated on every render, which would build and
  // discard a whole uniform set each time.
  const uniformsRef = useRef<ReturnType<typeof createTerrainUniforms> | null>(null);
  if (uniformsRef.current === null) uniformsRef.current = createTerrainUniforms(props);

  // Update uniforms when props change
  useEffect(() => {
    const uniforms = uniformsRef.current!;
    if (props.splatMap) {
      uniforms.uSplatMap.value = props.splatMap;
    }
    if (props.heightmap !== undefined) {
      uniforms.uHeightmap.value = props.heightmap;
      uniforms.uHasHeightmap.value = props.heightmap ? 1.0 : 0.0;
    }
    if (props.displacementDepth !== undefined) {
      uniforms.uDisplacementDepth.value = props.displacementDepth;
    }
    // CRITICAL: Update bounds uniforms - without this, UV mapping is wrong!
    if (props.bounds) {
      uniforms.uTerrainBoundsMin.value.set(props.bounds.minX, props.bounds.minZ);
      uniforms.uTerrainBoundsMax.value.set(props.bounds.maxX, props.bounds.maxZ);
    }
    uniforms.uGrassColor.value.copy(
      resolveChannelColor(props.grassTexture, props.grassColor, TerrainChannel.GRASS)
    );
    uniforms.uAsphaltColor.value.copy(
      resolveChannelColor(props.asphaltTexture, props.asphaltColor, TerrainChannel.ASPHALT)
    );
    uniforms.uRoadColor.value.copy(
      resolveChannelColor(props.asphaltTexture, props.roadColor, TerrainChannel.ROAD)
    );
    uniforms.uDirtColor.value.copy(
      resolveChannelColor(props.dirtTexture, props.dirtColor, TerrainChannel.DIRT)
    );
    if (props.grassTexture !== undefined) {
      uniforms.uGrassTexture.value = props.grassTexture;
      uniforms.uHasGrassTexture.value = props.grassTexture ? 1.0 : 0.0;
    }
    if (props.asphaltTexture !== undefined) {
      uniforms.uAsphaltTexture.value = props.asphaltTexture;
      uniforms.uHasAsphaltTexture.value = props.asphaltTexture ? 1.0 : 0.0;
    }
    if (props.dirtTexture !== undefined) {
      uniforms.uDirtTexture.value = props.dirtTexture;
      uniforms.uHasDirtTexture.value = props.dirtTexture ? 1.0 : 0.0;
    }
    // Surface maps arrive or disappear as a set when the quality tier changes.
    uniforms.uGrassSurface.value = props.grassSurface ?? null;
    uniforms.uTarmacSurface.value = props.tarmacSurface ?? null;
    uniforms.uDirtSurface.value = props.dirtSurface ?? null;
    uniforms.uHasSurfaceMaps.value =
      props.grassSurface || props.tarmacSurface || props.dirtSurface ? 1.0 : 0.0;
    uniforms.uMacroNoise.value = props.macroNoise ?? null;
    uniforms.uMacroAmount.value = props.macroNoise ? (props.macroAmount ?? 1.0) : 0.0;
    uniforms.uMacroNearAmount.value = props.macroNoise ? (props.macroNearAmount ?? 1.0) : 0.0;
    if (props.grassScale !== undefined) {
      uniforms.uGrassScale.value = props.grassScale;
    }
    if (props.asphaltScale !== undefined) {
      uniforms.uAsphaltScale.value = props.asphaltScale;
    }
    if (props.roadScale !== undefined) {
      uniforms.uRoadScale.value = props.roadScale;
    }
    if (props.dirtScale !== undefined) {
      uniforms.uDirtScale.value = props.dirtScale;
    }
    if (props.normalStrength) {
      uniforms.uNormalStrength.value.set(...props.normalStrength);
    }
    if (props.roughnessRemap) {
      uniforms.uRoughnessRemap.value.set(...props.roughnessRemap);
    }
    if (props.aoIntensity !== undefined) {
      uniforms.uAOIntensity.value = props.aoIntensity;
    }
    if (props.blendSharpness !== undefined) {
      uniforms.uBlendSharpness.value = props.blendSharpness;
    }
  }, [props]);

  // Create material with custom shader injection
  // IMPORTANT: Include heightmap in deps so material recreates when texture changes
  const displacementScale = props.displacementDepth ?? 2.5;
  const material = useMemo(() => {
    const hasDisplacement = !!props.heightmap;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // White base, terrain colors applied in shader
      roughness: 0.8, // Overridden per fragment when surface maps are bound
      metalness: 0.0,
      side: THREE.FrontSide,
      // The unified terrain is the exterior base layer. Bias it away from the
      // camera so authored roads, paths, shorelines, and water remain visible.
      polygonOffset: true,
      polygonOffsetFactor: POLYGON_OFFSET.exteriorBase.factor,
      polygonOffsetUnits: POLYGON_OFFSET.exteriorBase.units,
      // NOTE: We use CUSTOM vertex shader displacement instead of built-in displacementMap
      // This is more reliable when combined with onBeforeCompile shader injection
    });

    // Stable cache key - only changes when displacement config changes (not every frame!)
    // Everything added since is gated on uniform floats rather than #defines, so
    // there are still exactly two program variants and this key stays correct.
    const hasDisplacementKey = hasDisplacement ? 'disp' : 'nodisp';
    // v12: continuous grass UV warp and matching relief Jacobian. three uses this key
    // INSTEAD of hashing the injected source, so it has to be bumped whenever
    // that source changes or a warm program cache could serve the old one.
    mat.customProgramCacheKey = () => `terrain_v12_${hasDisplacementKey}`;

    // Inject custom shader code
    mat.onBeforeCompile = (shader) => {
      // Uniforms are shared BY REFERENCE, so textures that arrive later flip a
      // uniform without triggering a shader recompile.
      Object.assign(shader.uniforms, uniformsRef.current!);
      injectTerrainShader(shader);
    };

    // Force shader recompilation when uniforms change
    mat.needsUpdate = true;

    return mat;
  }, [props.heightmap, displacementScale]);

  // Update material ref
  useEffect(() => {
    if (materialRef.current !== material) {
      (materialRef as React.MutableRefObject<THREE.MeshStandardMaterial | null>).current = material;
    }
  }, [material]);

  // Dispose the material (and its compiled shader program) when it is replaced
  // or the terrain unmounts, preventing a GPU resource leak on quality toggles.
  useEffect(() => () => material.dispose(), [material]);

  return <primitive object={material} attach="material" />;
}
