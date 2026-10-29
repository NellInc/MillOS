import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { CANAL_OUTLET, CANAL_WEIR_IMPACT } from './canalOutletGeometry';

export const WATER_SCENE_REFLECTION = {
  texture: { value: null as THREE.Texture | null },
  matrix: { value: new THREE.Matrix4() },
  ready: { value: 0 },
  gain: { value: 1 },
};
const CAPTURE_LAYER = 29;
const MAX_DRAWS = 96;
const MAX_TRIANGLES = 180000;
const centre = new THREE.Vector3(
  CANAL_WEIR_IMPACT.position[0],
  CANAL_OUTLET.lowerLevel,
  CANAL_WEIR_IMPACT.position[1]
);
type Request = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
let request: Request | null = null;
export function captureWaterScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
) {
  request?.(renderer, scene, camera);
}

/** Select final visible geometry, including final static batches. Borrow only;
 * sources, materials, transforms and cached textures never change ownership.
 */
export function selectWaterReflectionObjects(scene: THREE.Scene, layers?: THREE.Layers) {
  const candidates: { mesh: THREE.Mesh; distance: number; triangles: number }[] = [];
  const point = new THREE.Vector3();
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (
      !mesh.isMesh ||
      (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
      (layers && !mesh.layers.test(layers))
    )
      return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (
      materials.some(
        (m) =>
          m instanceof THREE.ShaderMaterial ||
          m.transparent ||
          (m as THREE.MeshPhysicalMaterial).transmission > 0
      )
    )
      return;
    const instanced = mesh as THREE.InstancedMesh;
    const sphere = instanced.isInstancedMesh
      ? instanced.boundingSphere
      : mesh.geometry.boundingSphere;
    if (!sphere) return;
    point.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
    const distance = point.distanceTo(centre),
      radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    if (distance - radius > 75) return;
    const triangles =
      ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3) *
      (instanced.isInstancedMesh ? instanced.count : 1);
    if (triangles > MAX_TRIANGLES) return;
    candidates.push({ mesh, distance, triangles });
  });
  candidates.sort((a, b) => a.distance - b.distance);
  const selected: THREE.Mesh[] = [];
  let triangles = 0;
  let draws = 0;
  for (const candidate of candidates) {
    if (draws >= MAX_DRAWS) break;
    const cost = Array.isArray(candidate.mesh.material)
      ? Math.max(1, candidate.mesh.geometry.groups.length)
      : 1;
    if (triangles + candidate.triangles > MAX_TRIANGLES || draws + cost > MAX_DRAWS) continue;
    selected.push(candidate.mesh);
    draws += cost;
    triangles += candidate.triangles;
  }
  return { selected, triangles, draws };
}

/** One regional reflected plane, at the river's actual -2m datum. No composer
 * takeover; the receiving water requests a due capture at its final camera pose.
 * Working if High/Ultra gets recognizable borrowed scenery, other tiers retain
 * analytic water, and capture failure/unmount restores every borrowed state.
 */
export function WaterSceneReflection() {
  const { gl, scene, camera } = useThree();
  const marker = useRef<THREE.Group>(null);
  useEffect(() => {
    let reflector: Reflector | null = null,
      active = false,
      failed = false,
      lastAttempt = -Infinity;
    const lastPosition = new THREE.Vector3(),
      lastRotation = new THREE.Quaternion();
    const viewport = new THREE.Vector4(),
      scissor = new THREE.Vector4(),
      clear = new THREE.Color();
    const inverse = new THREE.Matrix4(),
      projected = new THREE.Vector3(),
      captureGroup = new THREE.Group();
    const savedLayers: { object: THREE.Object3D; mask: number }[] = [];
    const reset = () => {
      WATER_SCENE_REFLECTION.ready.value = 0;
      WATER_SCENE_REFLECTION.texture.value = null;
      reflector?.dispose();
      reflector?.geometry.dispose();
      reflector = null;
      failed = false;
      lastAttempt = -Infinity;
    };
    const capture: Request = (renderer, world, view) => {
      const quality = useGraphicsStore.getState().graphics.quality;
      if (quality !== 'high' && quality !== 'ultra') {
        WATER_SCENE_REFLECTION.ready.value = 0;
        return;
      }
      if (
        active ||
        failed ||
        renderer !== gl ||
        world !== scene ||
        view !== camera ||
        scene.overrideMaterial ||
        !useGameSimulationStore.getState().isTabVisible
      )
        return;
      if (document.documentElement.dataset.millosStartupReady !== 'true') return;
      if (
        camera.position.y < CANAL_OUTLET.lowerLevel + 0.25 ||
        camera.position.distanceTo(centre) > 120
      ) {
        WATER_SCENE_REFLECTION.ready.value = 0;
        return;
      }
      projected.copy(centre).project(camera);
      if (
        Math.abs(projected.x) > 1.6 ||
        Math.abs(projected.y) > 1.6 ||
        projected.z < 0 ||
        projected.z > 1
      ) {
        WATER_SCENE_REFLECTION.ready.value = 0;
        return;
      }
      const now = performance.now();
      if (
        WATER_SCENE_REFLECTION.ready.value &&
        (lastPosition.distanceToSquared(camera.position) > 4 ||
          lastRotation.angleTo(camera.quaternion) > 0.1)
      )
        WATER_SCENE_REFLECTION.ready.value = 0;
      if (now - lastAttempt < 250) return;
      lastAttempt = now;
      const { selected, triangles } = selectWaterReflectionObjects(scene, camera.layers);
      if (!selected.length) return;
      if (!reflector) {
        reflector = new Reflector(new THREE.PlaneGeometry(1, 1), {
          textureWidth: 512,
          textureHeight: 256,
          multisample: 0,
          clipBias: 0.003,
        });
        reflector.rotation.x = -Math.PI / 2;
        reflector.position.y = CANAL_OUTLET.lowerLevel;
        reflector.updateMatrixWorld(true);
        reflector.getRenderTarget().texture.name =
          'MillOS junction reflection, linear borrowed scenery';
        reflector.getRenderTarget().texture.colorSpace = THREE.LinearSRGBColorSpace;
      }
      // All actual lights participate on the private capture layer, preserving
      // the existing NUM_LIGHTS shader configuration and borrowed shadow maps.
      savedLayers.length = 0;
      const save = (object: THREE.Object3D) => {
        savedLayers.push({ object, mask: object.layers.mask });
        object.layers.enable(CAPTURE_LAYER);
      };
      for (const mesh of selected) save(mesh);
      scene.traverseVisible((object) => {
        if ((object as THREE.Light).isLight && object.layers.test(camera.layers)) save(object);
      });
      const target = renderer.getRenderTarget(),
        face = renderer.getActiveCubeFace(),
        mip = renderer.getActiveMipmapLevel();
      const xr = renderer.xr.enabled,
        shadowAuto = renderer.shadowMap.autoUpdate,
        shadowNeeds = renderer.shadowMap.needsUpdate;
      const scissorTest = renderer.getScissorTest(),
        alpha = renderer.getClearAlpha(),
        background = scene.background,
        mask = camera.layers.mask;
      renderer.getViewport(viewport);
      renderer.getScissor(scissor);
      renderer.getClearColor(clear);
      const beforeStats = { ...renderer.info.render };
      const autoReset = renderer.info.autoReset;
      const started = performance.now();
      active = true;
      try {
        renderer.info.autoReset = false;
        camera.layers.set(CAPTURE_LAYER);
        scene.background = null;
        renderer.setClearColor(0, 0);
        renderer.setScissorTest(false);
        renderer.shadowMap.needsUpdate = false;
        reflector.onBeforeRender(
          renderer,
          scene,
          camera,
          reflector.geometry,
          reflector.material as THREE.ShaderMaterial,
          captureGroup
        );
        // The projector belongs to this successful image, never a newer camera.
        inverse.copy(reflector.matrixWorld).invert();
        WATER_SCENE_REFLECTION.matrix.value
          .copy((reflector.material as THREE.ShaderMaterial).uniforms.textureMatrix.value)
          .multiply(inverse);
        WATER_SCENE_REFLECTION.texture.value = reflector.getRenderTarget().texture;
        WATER_SCENE_REFLECTION.ready.value = 1;
        lastPosition.copy(camera.position);
        lastRotation.copy(camera.quaternion);
        if (marker.current)
          Object.assign(marker.current.userData, {
            captures: (marker.current.userData.captures ?? 0) + 1,
            firstCpuMs: marker.current.userData.firstCpuMs ?? performance.now() - started,
            lastCpuMs: performance.now() - started,
            submittedCalls: renderer.info.render.calls - beforeStats.calls,
            draws: selected.length,
            triangles,
            plane: CANAL_OUTLET.lowerLevel,
            lastCaptureSuccessful: true,
          });
      } catch (error) {
        failed = true;
        WATER_SCENE_REFLECTION.ready.value = 0;
        if (marker.current) marker.current.userData.error = String(error);
        console.error('MillOS junction reflection failed', error);
      } finally {
        // Keep nested submissions in the frame total. Three's render-call
        // frame counter stays monotonic; startup owns a separate draw serial.
        renderer.info.autoReset = autoReset;
        camera.layers.mask = mask;
        scene.background = background;
        for (const saved of savedLayers) saved.object.layers.mask = saved.mask;
        renderer.xr.enabled = xr;
        renderer.shadowMap.autoUpdate = shadowAuto;
        renderer.shadowMap.needsUpdate = shadowNeeds;
        renderer.setRenderTarget(target, face, mip);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.setClearColor(clear, alpha);
        active = false;
      }
    };
    const unsubscribe = useGraphicsStore.subscribe((state, previous) => {
      if (state.graphics.quality !== previous.graphics.quality) reset();
    });
    request = capture;
    gl.domElement.addEventListener('webglcontextlost', reset);
    gl.domElement.addEventListener('webglcontextrestored', reset);
    window.addEventListener('resize', reset);
    return () => {
      unsubscribe();
      if (request === capture) request = null;
      gl.domElement.removeEventListener('webglcontextlost', reset);
      gl.domElement.removeEventListener('webglcontextrestored', reset);
      window.removeEventListener('resize', reset);
      reset();
    };
  }, [gl, scene, camera]);
  return (
    <group ref={marker} name="junction-reflection-capture" userData={{ noStaticBatch: true }} />
  );
}
