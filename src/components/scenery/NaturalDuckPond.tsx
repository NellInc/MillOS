import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

/** The authored atlas reserves strongly blue texels for the level water disc.
 * Shade those texels in place so brickwork, limestone and reeds share one draw
 * with the animated water. Working if day/night close-ups retain continuous
 * muted water and clean masonry without an extra surface or light.
 */
export function applyPondWater(material: THREE.MeshStandardMaterial, time: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pondTime = time;
    shader.uniforms.pondDeep = { value: new THREE.Color('#345c60') };
    shader.uniforms.pondShallow = { value: new THREE.Color('#5b7861') };
    shader.vertexShader =
      `varying vec3 vPondPosition;\nvarying vec3 vPondUp;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPondPosition = position;\nvPondUp = normalMatrix * vec3(0.0, 1.0, 0.0);'
      );
    shader.fragmentShader =
      `varying vec3 vPondPosition;\nvarying vec3 vPondUp;\nuniform float pondTime;\nuniform vec3 pondDeep;\nuniform vec3 pondShallow;\n${shader.fragmentShader}`
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
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.24, pondWater);'
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - pondWater;'
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        // Small, curved reflection ripples; no displacement across the bank.
        float pondPhase = vPondPosition.x * 2.05 + vPondPosition.z * 1.35
          + sin(vPondPosition.z * 0.8 + pondTime * 0.12);
        vec3 pondRipple = vec3(cos(pondPhase + pondTime * 0.2) * 0.025,
          0.0, sin(pondPhase * 1.5 - pondTime * 0.13) * 0.018);
        vec3 pondNormal = normalize(vPondUp + mat3(viewMatrix) * pondRipple);
        normal = normalize(mix(normal, pondNormal, pondWater));`
        );
  };
  material.customProgramCacheKey = () => 'millos-retained-pond-water-v1';
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
    if (!reducedMotion) time.value += Math.min(delta, 0.1);
  });
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} position={[0, -0.45, 0]} />;
}
