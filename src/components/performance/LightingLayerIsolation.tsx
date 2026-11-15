import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { HEMISPHERE_LIGHT_NAME } from '../environment/SceneEnvironmentIBL';

/**
 * A/B instrument: remove one lighting layer from the finished frame.
 *
 * WHY. The question "what does each layer contribute" can only be answered by
 * taking it out of the finished frame, because the layers interact: a sky fill
 * that looks right on its own may be what the sun's shadow side is leaning on.
 * `scripts/measure-surface-contrast.mjs --toggle-key=` reads the pixel side and
 * `--frame-pairs=` the cost side, in one page load.
 *
 * WHY THE LAYER IS REMOVED ONLY FOR THE RENDER. `OptimizedSkySystem` and
 * `SceneEnvironmentIBL` write sun, ambient, hemisphere and fog every frame, and
 * they DAMP from the current value. Writing a zero into the light would be
 * overwritten within a frame while the clock runs, and under `holdFrame` (delta
 * 0, where `damp(x, target, r, 0) === x`) it would never come back at all. So
 * the zero is applied in `scene.onBeforeRender`, before three projects the
 * lights, builds the shadow list and reads `environmentIntensity`, and the
 * authored values are put back in `scene.onAfterRender`. The writers never see
 * the change.
 *
 * NESTED RENDERS. The water's `captureWaterScene` renders this same scene from
 * a mesh's `onBeforeRender`, inside the outer render. Only the outermost render
 * saves and restores; a nested one draws with the layer already removed, which
 * is what the frame it feeds is drawn with.
 *
 * WHAT `disableSkyFill` LEAVES. Metals above the adoption threshold carry the
 * PMREM as their own `envMap` (`adoptEnvironmentMap`), and three uses their
 * own `envMapIntensity` rather than `scene.environmentIntensity`. Their sky
 * reflection stays; the diffuse fill and dielectric IBL go.
 *
 * `report()` says what the last render actually removed. A pixel delta of
 * exactly zero for a new layer means the lever missed far more often than that
 * the layer is inert, and this is how to tell the two apart.
 */

// Names owned by `OptimizedSkySystem` (`<directionalLight name=...>`,
// `<ambientLight name=...>`); `SunShadowRig` finds the sun by the same name.
const SUN_LIGHT_NAME = 'sun-key-light';
const AMBIENT_LIGHT_NAME = 'celestial-ambient-light';

export interface LightingLayerIsolationReport {
  /** Outermost renders drawn with at least one layer removed. */
  renders: number;
  /** The sun intensity the last render zeroed, or null if it zeroed none. */
  sunIntensityRemoved: number | null;
  /** True if the last render drew with the sun's shadow switched off. */
  sunShadowRemoved: boolean;
  /** Fill the last render zeroed, or null if it zeroed none. */
  skyFillRemoved: { ambient: number; hemisphere: number; environment: number } | null;
  /** True if the last render drew without fog. */
  fogRemoved: boolean;
}

const report: LightingLayerIsolationReport = {
  renders: 0,
  sunIntensityRemoved: null,
  sunShadowRemoved: false,
  skyFillRemoved: null,
  fogRemoved: false,
};

/** A copy, so a caller cannot write into the live record. */
export function readLightingLayerIsolationReport(): LightingLayerIsolationReport {
  return {
    ...report,
    skyFillRemoved: report.skyFillRemoved ? { ...report.skyFillRemoved } : null,
  };
}

interface Layers {
  sunShadows: boolean;
  sunLight: boolean;
  skyFill: boolean;
  fog: boolean;
}

/** Live light found by name, re-resolved once it has left the graph. */
function resolve<T extends THREE.Object3D>(scene: THREE.Scene, cached: T | null, name: string) {
  if (cached && cached.parent) return cached;
  return (scene.getObjectByName(name) as T | undefined) ?? null;
}

export function installLightingLayerIsolation(scene: THREE.Scene, layers: Layers): () => void {
  const previousBefore = scene.onBeforeRender;
  const previousAfter = scene.onAfterRender;
  const fill = { ambient: 0, hemisphere: 0, environment: 0 };

  let sun: THREE.DirectionalLight | null = null;
  let ambient: THREE.AmbientLight | null = null;
  let hemisphere: THREE.HemisphereLight | null = null;
  let depth = 0;

  // Saved at the outermost render, put back after it.
  let savedSunIntensity = 0;
  let savedSunCastShadow = false;
  let savedAmbient = 0;
  let savedHemisphere = 0;
  let savedEnvironment = 0;
  let savedFog: THREE.Scene['fog'] = null;
  let touchedSun = false;
  let touchedAmbient = false;
  let touchedHemisphere = false;

  report.renders = 0;
  report.sunIntensityRemoved = null;
  report.sunShadowRemoved = false;
  report.skyFillRemoved = null;
  report.fogRemoved = false;

  scene.onBeforeRender = function (renderer, renderScene, camera, target, ...rest) {
    previousBefore.call(this, renderer, renderScene, camera, target, ...rest);
    depth += 1;
    if (depth > 1) return;

    report.renders += 1;
    report.sunIntensityRemoved = null;
    report.sunShadowRemoved = false;
    report.skyFillRemoved = null;
    report.fogRemoved = false;
    touchedSun = touchedAmbient = touchedHemisphere = false;

    if (layers.sunShadows || layers.sunLight) {
      sun = resolve(scene, sun, SUN_LIGHT_NAME);
      if (sun) {
        touchedSun = true;
        savedSunIntensity = sun.intensity;
        savedSunCastShadow = sun.castShadow;
        if (layers.sunLight) {
          sun.intensity = 0;
          report.sunIntensityRemoved = savedSunIntensity;
        }
        // Without its light the shadow pass has nothing to darken, and
        // leaving it running would bill the "no sun" arm for a shadow map.
        sun.castShadow = false;
        report.sunShadowRemoved = savedSunCastShadow;
      }
    }

    if (layers.skyFill) {
      ambient = resolve(scene, ambient, AMBIENT_LIGHT_NAME);
      hemisphere = resolve(scene, hemisphere, HEMISPHERE_LIGHT_NAME);
      fill.ambient = fill.hemisphere = 0;
      if (ambient) {
        touchedAmbient = true;
        savedAmbient = ambient.intensity;
        fill.ambient = savedAmbient;
        ambient.intensity = 0;
      }
      if (hemisphere) {
        touchedHemisphere = true;
        savedHemisphere = hemisphere.intensity;
        fill.hemisphere = savedHemisphere;
        hemisphere.intensity = 0;
      }
      savedEnvironment = scene.environmentIntensity;
      fill.environment = savedEnvironment;
      scene.environmentIntensity = 0;
      report.skyFillRemoved = fill;
    }

    if (layers.fog) {
      savedFog = scene.fog;
      report.fogRemoved = savedFog !== null;
      scene.fog = null;
    }
  };

  scene.onAfterRender = function (renderer, renderScene, camera, ...rest) {
    depth -= 1;
    if (depth === 0) {
      if (touchedSun && sun) {
        sun.intensity = savedSunIntensity;
        sun.castShadow = savedSunCastShadow;
      }
      if (touchedAmbient && ambient) ambient.intensity = savedAmbient;
      if (touchedHemisphere && hemisphere) hemisphere.intensity = savedHemisphere;
      if (layers.skyFill) scene.environmentIntensity = savedEnvironment;
      if (layers.fog) scene.fog = savedFog;
    }
    previousAfter.call(this, renderer, renderScene, camera, ...rest);
  };

  return () => {
    scene.onBeforeRender = previousBefore;
    scene.onAfterRender = previousAfter;
  };
}

export function LightingLayerIsolation() {
  const scene = useThree((state) => state.scene);
  const sunShadows = useGraphicsStore((state) => state.graphics.perfDebug.disableSunShadows);
  const sunLight = useGraphicsStore((state) => state.graphics.perfDebug.disableSunLight);
  const skyFill = useGraphicsStore((state) => state.graphics.perfDebug.disableSkyFill);
  const fog = useGraphicsStore((state) => state.graphics.perfDebug.disableFog);

  useEffect(() => {
    // Nothing is installed in normal play: the hooks exist only while a layer
    // is removed.
    if (!sunShadows && !sunLight && !skyFill && !fog) return;
    return installLightingLayerIsolation(scene, { sunShadows, sunLight, skyFill, fog });
  }, [scene, sunShadows, sunLight, skyFill, fog]);

  return null;
}

export default LightingLayerIsolation;
