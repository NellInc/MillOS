/** Keep the narrowboat's eight night portholes on its generated cabin. */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

/**
 * `night` is a live uniform shared with the component, so a dusk or dawn flip
 * writes one float instead of re-cloning the model and all of its materials.
 */
export function applyBoatPortholes(material: THREE.MeshStandardMaterial, night: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.boatNight = night;
    shader.uniforms.boatGlow = { value: new THREE.Color('#ffaa00').multiplyScalar(2) };
    shader.vertexShader = `varying vec3 vBoatPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvBoatPosition = position;'
    );
    shader.fragmentShader =
      `varying vec3 vBoatPosition;\nuniform float boatNight;\nuniform vec3 boatGlow;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      // Gold-ring vertices sampled from the real UV atlas locate the four
      // bays. Object-rest coordinates keep the cabin glow off the blue hull.
      float dz = min(min(abs(vBoatPosition.z + 0.24), abs(vBoatPosition.z + 0.122)),
                     min(abs(vBoatPosition.z + 0.008), abs(vBoatPosition.z - 0.107)));
      float radius = length(vec2(dz, vBoatPosition.y - 0.023));
      float porthole = boatNight * step(0.075, abs(vBoatPosition.x))
        * (1.0 - smoothstep(0.010, 0.012, radius));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.402, 0.0), porthole);
      totalEmissiveRadiance += boatGlow * porthole;`
      );
  };
  material.customProgramCacheKey = () => 'millos-generated-boat-portholes-v1';
}

export function GeneratedBoatModel({ isNight }: { isNight: boolean }) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.canalBoat);
  const [night] = useState(() => ({ value: isNight ? 1 : 0 }));
  useEffect(() => {
    night.value = isNight ? 1 : 0;
  }, [isNight, night]);
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!(object.material instanceof THREE.MeshStandardMaterial))
        throw new Error('Boat lighting requires a standard material');
      const material = object.material.clone();
      applyBoatPortholes(material, night);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials };
  }, [scene, night]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}
