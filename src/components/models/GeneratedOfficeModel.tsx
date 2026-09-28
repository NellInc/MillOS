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

/** Existing atlas blue identifies glazing; alternating storeys retain dark
 * rooms. Only emission changes at dusk, with no light, draw or texture added.
 * Both delivered apartments retain the same 16.1-metre source Y scale after
 * the middle-storey cut. Working if the actual night views light window panes
 * while roof, concrete and daylight views remain unchanged.
 */
export function applyApartmentWindows(
  material: THREE.MeshStandardMaterial,
  night: { value: number }
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.officeNight = night;
    shader.uniforms.officeGlow = { value: new THREE.Color('#ffdcb0').multiplyScalar(0.38) };
    shader.vertexShader = `varying vec3 vOfficePosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvOfficePosition = position;'
    );
    shader.fragmentShader =
      `varying vec3 vOfficePosition;\nuniform float officeNight;\nuniform vec3 officeGlow;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      float roomHeight = (vOfficePosition.y + 0.5) * 16.1;
      float occupiedFloor = mod(floor(roomHeight / 3.5), 2.0);
      // Cyan cornice trim shares the glass colour, but sits below each sill.
      float aboveSill = step(0.52, mod(roomHeight, 3.5));
      // Absolute channel differences also accepted the blue-grey concrete.
      // Relative chroma distinguishes the measured cyan panes from masonry.
      float glazing = smoothstep(0.40, 0.55,
        (diffuseColor.b - diffuseColor.r) / max(0.001, diffuseColor.b))
        * smoothstep(0.32, 0.46,
        (diffuseColor.g - diffuseColor.r) / max(0.001, diffuseColor.g));
      float windowMask = officeNight * occupiedFloor * aboveSill * glazing
        * step(1.3, roomHeight) * (1.0 - step(13.8, roomHeight));
      // Shallow horizontal blind bands add depth inside the retained panes.
      float blinds = 0.78 + 0.22 * smoothstep(0.15, 0.45, fract(roomHeight * 5.0));
      totalEmissiveRadiance += officeGlow * windowMask * blinds;`
      );
  };
  material.customProgramCacheKey = () => 'millos-generated-apartment-window-v2';
}

type OfficeAsset = 'smallOffice' | 'officeApartment' | 'officeApartmentThree';
export function GeneratedOfficeModel({
  isNight,
  asset = 'smallOffice',
}: {
  isNight: boolean;
  asset?: OfficeAsset;
}) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);
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
      (asset === 'smallOffice' ? applyOfficeWindows : applyApartmentWindows)(material, night);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials };
  }, [scene, night, asset]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}
