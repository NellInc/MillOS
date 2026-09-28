/** Keep the narrowboat's eight night portholes on its generated cabin. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import { EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';

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
      // The authored portholes are in metres, matching the delivered mesh.
      // Restrict the glow to the glass inside each physical brass rim.
      float glass = smoothstep(0.035, 0.07, diffuseColor.b - diffuseColor.r);
      float porthole = boatNight * glass * step(1.18, abs(vBoatPosition.x))
        * (1.0 - step(1.20, abs(vBoatPosition.x)))
        * step(1.80, vBoatPosition.y) * (1.0 - step(2.26, vBoatPosition.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.402, 0.0), porthole);
      totalEmissiveRadiance += boatGlow * porthole;`
      );
  };
  material.customProgramCacheKey = () => 'millos-authored-boat-portholes-v2';
}

export function GeneratedBoatModel() {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.canalBoat);
  const night = EXTERIOR_LAMP_LEVEL;
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
