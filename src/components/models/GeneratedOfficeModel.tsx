/** The small office retains its two illuminated outer windows at night. */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

/**
 * `night` is a live uniform shared with the component, so a dusk or dawn flip
 * writes one float instead of re-cloning the model and all of its materials.
 */
export function applyOfficeWindows(material: THREE.MeshStandardMaterial, night: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.officeNight = night;
    shader.uniforms.officeGlow = { value: new THREE.Color('#ffb74d').multiplyScalar(0.9) };
    shader.uniforms.officeGlass = { value: new THREE.Color('#ffd28a') };
    shader.vertexShader = `varying vec3 vOfficePosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvOfficePosition = position;'
    );
    shader.fragmentShader =
      `varying vec3 vOfficePosition;\nuniform float officeNight;\nuniform vec3 officeGlow;\nuniform vec3 officeGlass;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      // Blue glazing only. Source vertices span x=-0.5..0.5 before normalization;
      // the central bay stays dark. Height and front-face bounds exclude blue roof trim.
      float officeWindow = officeNight * step(0.095, abs(vOfficePosition.x))
        * step(-0.16, vOfficePosition.y) * (1.0 - step(0.14, vOfficePosition.y))
        * step(0.30, vOfficePosition.z)
        * smoothstep(0.015, 0.055, diffuseColor.b - diffuseColor.r)
        * smoothstep(0.008, 0.035, diffuseColor.g - diffuseColor.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, officeGlass, officeWindow);
      totalEmissiveRadiance += officeGlow * officeWindow;`
      );
  };
  material.customProgramCacheKey = () => 'millos-generated-office-window-v2';
}

export function GeneratedOfficeModel({ isNight }: { isNight: boolean }) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.smallOffice);
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
        throw new Error('Office lighting requires a standard material');
      const material = object.material.clone();
      applyOfficeWindows(material, night);
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
