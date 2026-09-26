/** Generated lantern lenses follow the existing dusk and weather lighting driver. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

export function applyLampLens(material: THREE.MeshStandardMaterial): void {
  const strength = {
    get value() {
      return EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity;
    },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lampLensStrength = strength;
    shader.uniforms.lampLensColor = { value: EXTERIOR_LAMP_LENS_MATERIAL.emissive };
    shader.vertexShader = `varying float vLampRestHeight;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLampRestHeight = position.y;'
    );
    shader.fragmentShader =
      `varying float vLampRestHeight;\nuniform float lampLensStrength;\nuniform vec3 lampLensColor;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
       float lens = step(0.30, vLampRestHeight)
         * smoothstep(0.12, 0.30, min(diffuseColor.r, diffuseColor.g));
       totalEmissiveRadiance += lampLensColor * lampLensStrength * lens;`
      );
  };
  material.customProgramCacheKey = () => 'millos-generated-lamp-lens-v1';
}

export function GeneratedLampModel({ style }: { style: 'modern' | 'victorian' }) {
  const asset = style === 'modern' ? 'pathLampModern' : 'pathLampVictorian';
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!(object.material instanceof THREE.MeshStandardMaterial))
        throw new Error('Generated lamp requires a standard material');
      const material = object.material.clone();
      applyLampLens(material);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials };
  }, [scene]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}
