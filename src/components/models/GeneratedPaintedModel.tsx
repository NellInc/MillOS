/** Preserve the authored parked-car palette while sharing each generated atlas and mesh. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS, type GeneratedAssetId } from '../../utils/modelLoader';

export type GeneratedPaintProfile = 'ochre' | 'green' | 'blue';

export function applyGeneratedPaint(
  material: THREE.MeshStandardMaterial,
  color: string,
  profile: GeneratedPaintProfile
): void {
  const tint = { value: new THREE.Color(color) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.millosPaintColor = tint;
    shader.fragmentShader = `uniform vec3 millosPaintColor;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      // Work in decoded linear albedo, before any scene lighting is applied.
      vec3 paintSample = diffuseColor.rgb;
      float paintPeak = max(max(paintSample.r, paintSample.g), paintSample.b);
      float paintMask = ${
        profile === 'ochre'
          ? 'smoothstep(0.08, 0.25, (paintSample.r - paintSample.b) / max(paintPeak, 0.001)) * smoothstep(0.025, 0.08, paintSample.g) * smoothstep(1.05, 1.3, paintSample.r / max(paintSample.g, 0.001))'
          : profile === 'blue'
            ? 'smoothstep(0.35, 0.6, (paintSample.b - max(paintSample.r, paintSample.g)) / max(paintPeak, 0.001))'
            : 'smoothstep(0.15, 0.4, (paintSample.g - max(paintSample.r, paintSample.b)) / max(paintPeak, 0.001))'
      };
      // Neutral wheels/trim and blue glazing stay outside the paint mask.
      float paintShade = clamp(paintPeak / ${profile === 'green' ? '0.558' : '0.913'}, 0.0, 1.2);
      diffuseColor.rgb = mix(paintSample, millosPaintColor * paintShade, paintMask);
      `
    );
  };
  material.customProgramCacheKey = () => `millos-generated-paint-${profile}-v1`;
  material.needsUpdate = true;
}

export function GeneratedPaintedModel({
  asset,
  color,
  profile,
}: {
  asset: GeneratedAssetId;
  color: string;
  profile: GeneratedPaintProfile;
}) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (
        Array.isArray(object.material) ||
        !(object.material instanceof THREE.MeshStandardMaterial)
      )
        throw new Error('Generated paint requires a single standard material per mesh');
      const source = object.material;
      let material = materials.get(source);
      if (!material) {
        material = source.clone();
        applyGeneratedPaint(material, color, profile);
        materials.set(source, material);
      }
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    return { model, materials: [...materials.values()] };
  }, [scene, color, profile]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}
