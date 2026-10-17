import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WATER_MICRO_NORMAL_GLSL, WATER_PROFILES, WATER_WIND } from '../../utils/waterAppearance';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

/** At pond speed0.025,8000PI gives63,162,109cycles for the actual micro trains.
 * Working if the existing pause/wrap test verifies each actual shader frequency. */
export const POND_VISUAL_PERIOD = Math.PI * 8000;

/** The authored atlas reserves strongly blue texels for the level water disc.
 * Shade those texels in place so brickwork, limestone and reeds share one draw
 * with the animated water. Working if day/night close-ups retain continuous
 * muted water and clean masonry without an extra surface or light.
 */
export function applyPondWater(material: THREE.MeshStandardMaterial, time: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pondTime = time;
    shader.uniforms.pondWind = WATER_WIND;
    shader.uniforms.pondSpeed = { value: WATER_PROFILES.pond.speed };
    shader.uniforms.pondSlope = { value: WATER_PROFILES.pond.rippleStrength };
    shader.uniforms.pondRoughness = { value: WATER_PROFILES.pond.roughness };
    shader.uniforms.pondDeep = { value: new THREE.Color('#345c60') };
    shader.uniforms.pondShallow = { value: new THREE.Color('#5b7861') };
    shader.vertexShader =
      `varying vec3 vPondPosition;\nvarying vec3 vPondUp;\nvarying vec3 vPondWorldPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPondPosition = position;\nvPondWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;\nvPondUp = normalMatrix * vec3(0.0, 1.0, 0.0);'
      );
    shader.fragmentShader =
      `varying vec3 vPondPosition;\nvarying vec3 vPondUp;\nvarying vec3 vPondWorldPosition;\nuniform float pondTime;\nuniform float pondWind;\nuniform float pondSpeed;\nuniform float pondSlope;\nuniform float pondRoughness;\nuniform vec3 pondDeep;\nuniform vec3 pondShallow;\n${WATER_MICRO_NORMAL_GLSL}\n${shader.fragmentShader}`
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
        // Atlas water is strongly blue; reeds are green, masonry warm mineral.
        // Test relative chroma so shaded blue texels retain the same identity.
        float pondWater = smoothstep(0.22, 0.48,
          (diffuseColor.b - max(diffuseColor.r, diffuseColor.g)) / max(0.001, diffuseColor.b));
        float pondMargin = smoothstep(3.5, 4.85, length(vPondPosition.xz));
        vec3 pondColour = mix(pondDeep, pondShallow, pondMargin);
        diffuseColor.rgb = mix(diffuseColor.rgb, pondColour, pondWater);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, pondRoughness, pondWater);'
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - pondWater;'
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        // Almost still: the same filtered micro-relief as the other water,
        // with the pond's sheltered slope and speed. No bank displacement.
        vec2 pondSlopeValue = millosWaterSlope(vPondWorldPosition.xz, pondTime * pondSpeed,
          pondSlope * mix(0.7, 1.25, clamp(pondWind, 0.0, 1.0)));
        vec3 pondNormal = normalize(vPondUp + mat3(viewMatrix) * vec3(pondSlopeValue.x, 0.0, pondSlopeValue.y));
        normal = normalize(mix(normal, pondNormal, pondWater));`
        );
  };
  material.customProgramCacheKey = () => 'millos-retained-pond-water-v3';
}

export function NaturalDuckPond() {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.duckpond);
  const reducedMotion = useReducedMotion();
  const { model, materials, time } = useMemo(() => {
    const model = scene.clone(true);
    const time = { value: 0 };
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!(object.material instanceof THREE.MeshStandardMaterial))
        throw new Error('Pond water requires the authored standard material');
      const material = object.material.clone();
      applyPondWater(material, time);
      object.material = material;
      // Stable runtime inspection identifier, also used by existing capture tools.
      object.name = 'duckpond-natural-water-and-retained-bank';
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials, time };
  }, [scene]);
  useFrame((_, delta) => {
    const { gameSpeed, isTabVisible } = useGameSimulationStore.getState();
    // The pond belongs to the same paused/hidden world as its ducks. Holding
    // this accumulated phase avoids catching up skipped wall time on resume.
    // Working if pause/hidden/reduced holds all retain the exact water phase.
    if (!reducedMotion && isTabVisible && gameSpeed > 0)
      time.value = (time.value + Math.min(delta, 0.1)) % POND_VISUAL_PERIOD;
  });
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} position={[0, -0.45, 0]} />;
}
