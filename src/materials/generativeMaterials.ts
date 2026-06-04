/**
 * Generative Materials Factory
 *
 * Pre-built materials using procedurally generated textures.
 * All textures generated on first use, then cached.
 *
 * "Even the textures are agent-generated. No image files, just algorithms."
 */

import * as THREE from 'three';
import { generateBrushedMetal } from '../textures/brushedMetal';
import { generatePaintedMetal } from '../textures/paintedMetal';
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
import { generateProceduralNormal, generatePanelNormal } from '../textures/normalGenerator';
import { generateSafetyStripe } from '../textures/safetyStripe';
import { generateGrainPattern } from '../textures/grain';
import { generateRustPattern } from '../textures/rust';

/**
 * Brushed metal material for machine frames and housings.
 * Subtle directional scratches with high metalness.
 */
export const createBrushedMetalMaterial = (
  color: string = '#6b7280'
): THREE.MeshStandardMaterial => {
  const roughnessMap = generateBrushedMetal(256, 0.4, 'horizontal');

  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.9,
    roughness: 0.3,
    roughnessMap,
    envMapIntensity: 1.0,
  });
};

/**
 * Painted metal material with subtle wear for equipment.
 * Uses custom shader modification to apply wear from texture.
 */
export const createPaintedMetalMaterial = (
  color: string = '#2563eb',
  wear: number = 0.2
): THREE.MeshStandardMaterial => {
  const wearMap = generatePaintedMetal(256, wear, 8);
  const normalMap = generateProceduralNormal(256, 0.5, 15);

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.6,
    normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });

  // Custom shader chunk to apply wear
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wearMap = { value: wearMap };

    // Add uniform declaration
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D wearMap;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec4 wearSample = texture2D(wearMap, vNormalMapUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7, wearSample.a * 0.3);`
    );
  };

  return material;
};

/**
 * Concrete material for walls with panel normals.
 */
export const createConcreteMaterial = (): THREE.MeshStandardMaterial => {
  const colorMap = generateConcrete(512, 64, true);
  const roughnessMap = generateConcreteRoughness(512);
  const normalMap = generatePanelNormal(512, 8, 0.03);

  return new THREE.MeshStandardMaterial({
    map: colorMap,
    roughnessMap,
    roughness: 0.8,
    metalness: 0.0,
    normalMap,
    normalScale: new THREE.Vector2(0.2, 0.2),
  });
};

/**
 * Industrial floor material with wear paths.
 */
export const createIndustrialFloorMaterial = (): THREE.MeshStandardMaterial => {
  const colorMap = generateConcrete(512, 128, true);
  const roughnessMap = generateConcreteRoughness(512);

  return new THREE.MeshStandardMaterial({
    map: colorMap,
    roughnessMap,
    roughness: 0.75,
    metalness: 0.0,
    envMapIntensity: 0.3,
  });
};

/**
 * Safety stripe material for hazard areas.
 */
export const createSafetyStripeMaterial = (
  primaryColor: string = '#f59e0b',
  secondaryColor: string = '#1f2937'
): THREE.MeshStandardMaterial => {
  const stripeMap = generateSafetyStripe(256, 32, {
    primary: primaryColor,
    secondary: secondaryColor,
  });

  return new THREE.MeshStandardMaterial({
    map: stripeMap,
    roughness: 0.7,
    metalness: 0.0,
  });
};

/**
 * Grain texture material for silos.
 */
export const createGrainMaterial = (): THREE.MeshStandardMaterial => {
  const grainMap = generateGrainPattern(256, 0.5);

  return new THREE.MeshStandardMaterial({
    map: grainMap,
    roughness: 0.9,
    metalness: 0.0,
  });
};

/**
 * Rusty metal material for aged equipment accents.
 */
export const createRustyMetalMaterial = (
  baseColor: string = '#6b7280',
  rustAmount: number = 0.3
): THREE.MeshStandardMaterial => {
  const rustMap = generateRustPattern(256, rustAmount, 'down');
  const brushedMap = generateBrushedMetal(256, 0.3, 'horizontal');

  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: 0.7,
    roughness: 0.4,
    roughnessMap: brushedMap,
  });

  // Custom shader to blend rust overlay
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rustMap = { value: rustMap };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D rustMap;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec4 rustSample = texture2D(rustMap, vRoughnessMapUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, rustSample.rgb, rustSample.a);`
    );
  };

  return material;
};
