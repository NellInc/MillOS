import * as THREE from 'three';

interface PreparedTransparencyPass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  needsDepthTexture: boolean;
  renderTransparency: (renderer: THREE.WebGLRenderer) => void;
}

/**
 * N8AOPostPass follows the composer's beauty RenderPass. Both transparency
 * renders use that same scene and camera, with no intervening animation tick.
 * Reuse their prepared transforms, retaining all draws and shader effects.
 * Working if two redundant world updates disappear and next-frame poses,
 * transparency, original update flags and pass cleanup remain unchanged.
 */
export function reuseBeautyTransforms(candidate: unknown): () => void {
  const pass = candidate as PreparedTransparencyPass | null;
  if (
    !(pass?.scene instanceof THREE.Scene) ||
    !(pass.camera instanceof THREE.Camera) ||
    pass.needsDepthTexture !== true ||
    typeof pass.renderTransparency !== 'function'
  )
    return () => {};

  const original = pass.renderTransparency;
  const reused = (renderer: THREE.WebGLRenderer): void => {
    const sceneUpdates = pass.scene.matrixWorldAutoUpdate;
    const cameraUpdates = pass.camera.matrixWorldAutoUpdate;
    pass.scene.matrixWorldAutoUpdate = false;
    pass.camera.matrixWorldAutoUpdate = false;
    try {
      original.call(pass, renderer);
    } finally {
      pass.scene.matrixWorldAutoUpdate = sceneUpdates;
      pass.camera.matrixWorldAutoUpdate = cameraUpdates;
    }
  };
  pass.renderTransparency = reused;
  return () => {
    if (pass.renderTransparency === reused) pass.renderTransparency = original;
  };
}
