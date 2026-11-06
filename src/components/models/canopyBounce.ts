import * as THREE from 'three';

/**
 * Ground bounce on the underside of an open canopy.
 *
 * The picnic shelter's roof soffit read as a dark stepped slab with no light
 * in it (picnic-shelter, asset-accepted-20261105). Under a real canopy the
 * underside is lit mostly by the sunlit ground around it: ground of albedo
 * ~0.2 seen over most of a downward hemisphere returns roughly that fraction
 * of the sun's horizontal irradiance, in proportion to how much of its view
 * is ground. The scene's hemisphere and IBL fill do
 * not model a bright local ground, so this adds exactly that term to the
 * indirect diffuse of fragments that see the ground, driven by the existing
 * shadowed key (`directionalLights[0]`) and its elevation. No light is added,
 * nothing new casts a shadow, and at night the moonlit key makes it vanish.
 *
 * Working if the soffit and beam sides lift at noon while upward faces keep
 * their exact response, and the term goes dark after sunset.
 */
export const CANOPY_GROUND_BOUNCE = 0.2;
export const CANOPY_BOUNCE_CACHE_KEY = 'millos-canopy-ground-bounce-v2';

export function applyCanopyBounce(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vCanopyNormal;\n${shader.vertexShader}`.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      vCanopyNormal = mat3(modelMatrix) * objectNormal;`
    );
    shader.fragmentShader = `varying vec3 vCanopyNormal;\n${shader.fragmentShader}`.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        // The fraction of the view that is ground: 1 facing down, 0.5 for a
        // beam side, 0 facing up. Back faces of the double-sided sheet flip.
        float canopyDown = clamp(0.5 - 0.5 * normalize(vCanopyNormal).y * faceDirection, 0.0, 1.0);
        vec3 canopyUp = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
        float canopySun = clamp(dot(directionalLights[0].direction, canopyUp), 0.0, 1.0);
        reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb)
          * directionalLights[0].color * canopySun * canopyDown
          * ${CANOPY_GROUND_BOUNCE.toFixed(2)};
      #endif`
    );
  };
  material.customProgramCacheKey = () => CANOPY_BOUNCE_CACHE_KEY;
  material.needsUpdate = true;
}
