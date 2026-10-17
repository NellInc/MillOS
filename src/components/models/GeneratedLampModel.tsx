/** Generated lantern lenses follow the existing dusk and weather lighting driver. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import { civicUnderlyingHooks } from '../../shaders/civicLampShadows';

export type LampStyle = 'modern' | 'victorian';

const lampHooks = new WeakMap<
  THREE.Material,
  {
    style: LampStyle;
    before: THREE.Material['onBeforeCompile'];
    key: THREE.Material['customProgramCacheKey'];
  }
>();

/** Only this exact lens shader can instance safely without baking rest-space Y.
 * Working if tampered hooks stay excluded, while the verified civic wrapper survives.
 */
export function lampLensStyle(material: THREE.Material): LampStyle | null {
  const entry = lampHooks.get(material);
  if (!entry) return null;
  const civic = civicUnderlyingHooks(material);
  return (civic?.before ?? material.onBeforeCompile) === entry.before &&
    (civic?.key ?? material.customProgramCacheKey) === entry.key
    ? entry.style
    : null;
}

// Metre-space lens bounds from the authored optic shells, not the old
// normalized provider mesh. Working if the post and cap never emit light.
export const LAMP_LENS_HEIGHTS: Record<LampStyle, readonly [number, number]> = {
  modern: [3.76, 3.95],
  victorian: [3.935, 4.245],
};

export function applyLampLens(material: THREE.MeshStandardMaterial, style: LampStyle): void {
  if (lampLensStyle(material) === style) return;
  const strength = {
    get value() {
      return EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity;
    },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lampLensStrength = strength;
    shader.uniforms.lampLensHeights = { value: new THREE.Vector2(...LAMP_LENS_HEIGHTS[style]) };
    shader.uniforms.lampLensColor = { value: EXTERIOR_LAMP_LENS_MATERIAL.emissive };
    shader.vertexShader = `varying float vLampRestHeight;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLampRestHeight = position.y;'
    );
    shader.fragmentShader =
      `varying float vLampRestHeight;\nuniform float lampLensStrength;\nuniform vec2 lampLensHeights;\nuniform vec3 lampLensColor;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
       float lens = step(lampLensHeights.x, vLampRestHeight)
         * (1.0 - step(lampLensHeights.y, vLampRestHeight))
         * smoothstep(0.12, 0.30, min(diffuseColor.r, diffuseColor.g));
       totalEmissiveRadiance += lampLensColor * lampLensStrength * lens;`
      );
  };
  material.customProgramCacheKey = () => 'millos-generated-lamp-lens-v2';
  lampHooks.set(material, {
    style,
    before: material.onBeforeCompile,
    key: material.customProgramCacheKey,
  });
}

export function GeneratedLampModel({ style }: { style: LampStyle }) {
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
      applyLampLens(material, style);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials };
  }, [scene, style]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}
