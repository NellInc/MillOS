/**
 * TerrainMaterial - Custom material with splat map-based blending
 *
 * Extends MeshStandardMaterial to blend 4 terrain types based on a
 * splat map texture. Each RGBA channel controls blend weight for:
 * - R: Grass
 * - G: Asphalt
 * - B: Road
 * - A: Cobblestone
 *
 * This eliminates z-fighting because there's only ONE surface.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TerrainChannel, DEFAULT_TERRAIN_MATERIALS, TERRAIN_BOUNDS } from './terrainTypes';

interface TerrainMaterialProps {
  /** The splat map texture (RGBA = grass/asphalt/road/cobble weights) */
  splatMap: THREE.Texture;
  /** Optional: Heightmap texture for vertex displacement (R channel = height) */
  heightmap?: THREE.Texture;
  /** Maximum displacement depth (world units, positive = downward) */
  displacementDepth?: number;
  /** Optional: Override default material colors */
  grassColor?: THREE.ColorRepresentation;
  asphaltColor?: THREE.ColorRepresentation;
  roadColor?: THREE.ColorRepresentation;
  cobbleColor?: THREE.ColorRepresentation;
  /** Optional: Texture for each terrain type */
  grassTexture?: THREE.Texture;
  asphaltTexture?: THREE.Texture;
  roadTexture?: THREE.Texture;
  cobbleTexture?: THREE.Texture;
  /** Texture tiling scales (world units per repeat) */
  grassScale?: number;
  asphaltScale?: number;
  roadScale?: number;
  cobbleScale?: number;
  /** World bounds for UV mapping */
  bounds?: typeof TERRAIN_BOUNDS;
}

/**
 * Creates the custom shader uniforms for terrain blending
 */
function createTerrainUniforms(props: TerrainMaterialProps) {
  const grassColor = new THREE.Color(
    props.grassColor ?? DEFAULT_TERRAIN_MATERIALS[TerrainChannel.GRASS].color
  );
  const asphaltColor = new THREE.Color(
    props.asphaltColor ?? DEFAULT_TERRAIN_MATERIALS[TerrainChannel.ASPHALT].color
  );
  const roadColor = new THREE.Color(
    props.roadColor ?? DEFAULT_TERRAIN_MATERIALS[TerrainChannel.ROAD].color
  );
  const cobbleColor = new THREE.Color(
    props.cobbleColor ?? DEFAULT_TERRAIN_MATERIALS[TerrainChannel.COBBLE].color
  );

  return {
    uSplatMap: { value: props.splatMap },
    uHeightmap: { value: props.heightmap ?? null },
    uHasHeightmap: { value: props.heightmap ? 1.0 : 0.0 },
    uDisplacementDepth: { value: props.displacementDepth ?? 2.5 },
    uGrassColor: { value: grassColor },
    uAsphaltColor: { value: asphaltColor },
    uRoadColor: { value: roadColor },
    uCobbleColor: { value: cobbleColor },
    uGrassTexture: { value: props.grassTexture ?? null },
    uAsphaltTexture: { value: props.asphaltTexture ?? null },
    uRoadTexture: { value: props.roadTexture ?? null },
    uCobbleTexture: { value: props.cobbleTexture ?? null },
    uHasGrassTexture: { value: props.grassTexture ? 1.0 : 0.0 },
    uHasAsphaltTexture: { value: props.asphaltTexture ? 1.0 : 0.0 },
    uHasRoadTexture: { value: props.roadTexture ? 1.0 : 0.0 },
    uHasCobbleTexture: { value: props.cobbleTexture ? 1.0 : 0.0 },
    uGrassScale: { value: props.grassScale ?? 10.0 },
    uAsphaltScale: { value: props.asphaltScale ?? 5.0 },
    uRoadScale: { value: props.roadScale ?? 8.0 },
    uCobbleScale: { value: props.cobbleScale ?? 25.0 },
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
`;

// Custom vertex displacement - placeholder for future heightmap-based displacement
// CPU-side displacement is now handled in TerrainGround.tsx via createDisplacedGeometry
const vertexShaderDisplacement = `
  // No additional shader displacement - CPU geometry handles terrain carving
`;

// World position calculation for fragment shader
const vertexShaderWorldPos = `
  vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/**
 * Fragment shader additions - sample splat map and blend terrain colors/textures
 */
const fragmentShaderPreamble = `
  uniform sampler2D uSplatMap;
  uniform sampler2D uHeightmap;
  uniform float uHasHeightmap;
  uniform vec3 uGrassColor;
  uniform vec3 uAsphaltColor;
  uniform vec3 uRoadColor;
  uniform vec3 uCobbleColor;
  uniform sampler2D uGrassTexture;
  uniform sampler2D uAsphaltTexture;
  uniform sampler2D uRoadTexture;
  uniform sampler2D uCobbleTexture;
  uniform float uHasGrassTexture;
  uniform float uHasAsphaltTexture;
  uniform float uHasRoadTexture;
  uniform float uHasCobbleTexture;
  uniform float uGrassScale;
  uniform float uAsphaltScale;
  uniform float uRoadScale;
  uniform float uCobbleScale;
  uniform vec2 uTerrainBoundsMin;
  uniform vec2 uTerrainBoundsMax;

  varying vec3 vWorldPosition;

  vec3 getTerrainColor(vec2 worldXZ) {
    // Calculate splat map UV from world position
    vec2 splatUV = (worldXZ - uTerrainBoundsMin) / (uTerrainBoundsMax - uTerrainBoundsMin);
    vec4 splat = texture2D(uSplatMap, splatUV);

    // Normalize weights to sum to 1
    float totalWeight = splat.r + splat.g + splat.b + splat.a + 0.001;
    vec4 weights = splat / totalWeight;

    // Sample textures at tiled coordinates (world-space tiling)
    vec3 grassSample = uHasGrassTexture > 0.5
      ? texture2D(uGrassTexture, worldXZ / uGrassScale).rgb
      : vec3(1.0);
    vec3 asphaltSample = uHasAsphaltTexture > 0.5
      ? texture2D(uAsphaltTexture, worldXZ / uAsphaltScale).rgb
      : vec3(1.0);
    vec3 roadSample = uHasRoadTexture > 0.5
      ? texture2D(uRoadTexture, worldXZ / uRoadScale).rgb
      : vec3(1.0);
    vec3 cobbleSample = uHasCobbleTexture > 0.5
      ? texture2D(uCobbleTexture, worldXZ / uCobbleScale).rgb
      : vec3(1.0);

    // Blend colors based on weights
    vec3 color =
      (uGrassColor * grassSample) * weights.r +
      (uAsphaltColor * asphaltSample) * weights.g +
      (uRoadColor * roadSample) * weights.b +
      (uCobbleColor * cobbleSample) * weights.a;

    return color;
  }
`;

// Replace the diffuseColor calculation
const fragmentShaderDiffuseReplace = `
  vec3 terrainColor = getTerrainColor(vWorldPosition.xz);
  diffuseColor.rgb *= terrainColor;
`;

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
  const uniformsRef = useRef(createTerrainUniforms(props));

  // Update uniforms when props change
  useEffect(() => {
    const uniforms = uniformsRef.current;
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
    if (props.grassColor) {
      uniforms.uGrassColor.value.set(props.grassColor);
    }
    if (props.asphaltColor) {
      uniforms.uAsphaltColor.value.set(props.asphaltColor);
    }
    if (props.roadColor) {
      uniforms.uRoadColor.value.set(props.roadColor);
    }
    if (props.cobbleColor) {
      uniforms.uCobbleColor.value.set(props.cobbleColor);
    }
    if (props.grassTexture !== undefined) {
      uniforms.uGrassTexture.value = props.grassTexture;
      uniforms.uHasGrassTexture.value = props.grassTexture ? 1.0 : 0.0;
    }
    if (props.asphaltTexture !== undefined) {
      uniforms.uAsphaltTexture.value = props.asphaltTexture;
      uniforms.uHasAsphaltTexture.value = props.asphaltTexture ? 1.0 : 0.0;
    }
    if (props.roadTexture !== undefined) {
      uniforms.uRoadTexture.value = props.roadTexture;
      uniforms.uHasRoadTexture.value = props.roadTexture ? 1.0 : 0.0;
    }
    if (props.cobbleTexture !== undefined) {
      uniforms.uCobbleTexture.value = props.cobbleTexture;
      uniforms.uHasCobbleTexture.value = props.cobbleTexture ? 1.0 : 0.0;
    }
    if (props.grassScale !== undefined) {
      uniforms.uGrassScale.value = props.grassScale;
    }
    if (props.asphaltScale !== undefined) {
      uniforms.uAsphaltScale.value = props.asphaltScale;
    }
    if (props.roadScale !== undefined) {
      uniforms.uRoadScale.value = props.roadScale;
    }
    if (props.cobbleScale !== undefined) {
      uniforms.uCobbleScale.value = props.cobbleScale;
    }
  }, [props]);

  // Create material with custom shader injection
  // IMPORTANT: Include heightmap in deps so material recreates when texture changes
  const displacementScale = props.displacementDepth ?? 2.5;
  const material = useMemo(() => {
    const hasDisplacement = !!props.heightmap;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // White base, terrain colors applied in shader
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.FrontSide,
      // Polygon offset pushes terrain forward in depth buffer, preventing z-fighting at edges
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      // NOTE: We use CUSTOM vertex shader displacement instead of built-in displacementMap
      // This is more reliable when combined with onBeforeCompile shader injection
    });

    // Stable cache key - only changes when displacement config changes (not every frame!)
    const hasDisplacementKey = hasDisplacement ? 'disp' : 'nodisp';
    mat.customProgramCacheKey = () => `terrain_v10_${hasDisplacementKey}`;

    // Inject custom shader code
    mat.onBeforeCompile = (shader) => {
      // Add uniforms
      Object.assign(shader.uniforms, uniformsRef.current);

      // Inject vertex shader additions
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${vertexShaderPreamble}`
      );

      // Inject custom displacement after begin_vertex (which sets transformed = position)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${vertexShaderDisplacement}`
      );

      // Inject world position calculation
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n${vertexShaderWorldPos}`
      );

      // Inject fragment shader additions
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\n${fragmentShaderPreamble}`
      );

      // Replace diffuse color calculation with terrain blending
      // The color_fragment chunk applies diffuseColor, we modify it after
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${fragmentShaderDiffuseReplace}`
      );
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

  return <primitive object={material} attach="material" />;
}

/**
 * Hook to create and manage a terrain material
 * For use outside of JSX context
 */
export function useTerrainMaterial(props: TerrainMaterialProps) {
  const uniformsRef = useRef(createTerrainUniforms(props));

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.FrontSide,
    });

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniformsRef.current);

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${vertexShaderPreamble}`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n${vertexShaderWorldPos}`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\n${fragmentShaderPreamble}`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${fragmentShaderDiffuseReplace}`
      );
    };

    mat.needsUpdate = true;
    return mat;
  }, []);

  // Update uniforms reactively
  useEffect(() => {
    const uniforms = uniformsRef.current;
    uniforms.uSplatMap.value = props.splatMap;
    if (props.heightmap !== undefined) {
      uniforms.uHeightmap.value = props.heightmap;
      uniforms.uHasHeightmap.value = props.heightmap ? 1.0 : 0.0;
    }
    if (props.displacementDepth !== undefined) {
      uniforms.uDisplacementDepth.value = props.displacementDepth;
    }
    material.needsUpdate = true;
  }, [props.splatMap, props.heightmap, props.displacementDepth, material]);

  return material;
}
