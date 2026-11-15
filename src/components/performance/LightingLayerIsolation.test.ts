import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  installLightingLayerIsolation,
  readLightingLayerIsolationReport,
} from './LightingLayerIsolation';
import { HEMISPHERE_LIGHT_NAME } from '../environment/SceneEnvironmentIBL';

function rig() {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight('#fff1cf', 3.1);
  sun.name = 'sun-key-light';
  sun.castShadow = true;
  const ambient = new THREE.AmbientLight('#c9e7f4', 0.22);
  ambient.name = 'celestial-ambient-light';
  const hemisphere = new THREE.HemisphereLight('#e3f1f2', '#6f806c', 0.22);
  hemisphere.name = HEMISPHERE_LIGHT_NAME;
  scene.add(sun, ambient, hemisphere);
  scene.environmentIntensity = 0.3;
  const fog = new THREE.FogExp2('#b9dce7', 0.002);
  scene.fog = fog;
  return { scene, sun, ambient, hemisphere, fog };
}

// The renderer calls these with (renderer, scene, camera, target); the lever
// reads none of them, so stand-ins are enough.
const args = [null, null, null, null] as unknown as Parameters<THREE.Scene['onBeforeRender']>;
const before = (scene: THREE.Scene) => scene.onBeforeRender(...args);
const after = (scene: THREE.Scene) =>
  scene.onAfterRender(...(args as unknown as Parameters<THREE.Scene['onAfterRender']>));

describe('LightingLayerIsolation', () => {
  it('removes every layer for the render and restores the authored values after', () => {
    const { scene, sun, ambient, hemisphere, fog } = rig();
    const uninstall = installLightingLayerIsolation(scene, {
      sunShadows: false,
      sunLight: true,
      skyFill: true,
      fog: true,
    });

    before(scene);
    expect(sun.intensity).toBe(0);
    expect(sun.castShadow).toBe(false);
    expect(ambient.intensity).toBe(0);
    expect(hemisphere.intensity).toBe(0);
    expect(scene.environmentIntensity).toBe(0);
    expect(scene.fog).toBeNull();
    after(scene);

    expect(sun.intensity).toBe(3.1);
    expect(sun.castShadow).toBe(true);
    expect(ambient.intensity).toBe(0.22);
    expect(hemisphere.intensity).toBe(0.22);
    expect(scene.environmentIntensity).toBe(0.3);
    expect(scene.fog).toBe(fog);

    const report = readLightingLayerIsolationReport();
    expect(report.renders).toBe(1);
    expect(report.sunIntensityRemoved).toBe(3.1);
    expect(report.skyFillRemoved).toEqual({ ambient: 0.22, hemisphere: 0.22, environment: 0.3 });
    expect(report.fogRemoved).toBe(true);
    uninstall();
  });

  it('keeps the sun lit when only its shadow is removed', () => {
    const { scene, sun } = rig();
    const uninstall = installLightingLayerIsolation(scene, {
      sunShadows: true,
      sunLight: false,
      skyFill: false,
      fog: false,
    });
    before(scene);
    expect(sun.intensity).toBe(3.1);
    expect(sun.castShadow).toBe(false);
    after(scene);
    expect(sun.castShadow).toBe(true);
    expect(readLightingLayerIsolationReport().sunIntensityRemoved).toBeNull();
    expect(readLightingLayerIsolationReport().sunShadowRemoved).toBe(true);
    uninstall();
  });

  it('lets a per-frame writer change the light between renders', () => {
    const { scene, sun } = rig();
    const uninstall = installLightingLayerIsolation(scene, {
      sunShadows: false,
      sunLight: true,
      skyFill: false,
      fog: false,
    });
    before(scene);
    after(scene);
    // The sky system damps from the current value: it must see its own value,
    // never the zero, or a held clock would leave the sun dark for good.
    sun.intensity = 2.4;
    before(scene);
    expect(sun.intensity).toBe(0);
    after(scene);
    expect(sun.intensity).toBe(2.4);
    uninstall();
  });

  it('restores once, at the outermost render, through a nested render of the same scene', () => {
    const { scene, sun, fog } = rig();
    const uninstall = installLightingLayerIsolation(scene, {
      sunShadows: false,
      sunLight: true,
      skyFill: false,
      fog: true,
    });
    before(scene);
    // The water's capture pass renders this scene from inside the outer one.
    before(scene);
    expect(sun.intensity).toBe(0);
    after(scene);
    expect(sun.intensity).toBe(0);
    expect(scene.fog).toBeNull();
    after(scene);
    expect(sun.intensity).toBe(3.1);
    expect(scene.fog).toBe(fog);
    expect(readLightingLayerIsolationReport().renders).toBe(1);
    uninstall();
  });

  it('puts back whatever render hooks the scene had', () => {
    const { scene } = rig();
    const originalBefore = scene.onBeforeRender;
    const originalAfter = scene.onAfterRender;
    const uninstall = installLightingLayerIsolation(scene, {
      sunShadows: true,
      sunLight: false,
      skyFill: false,
      fog: false,
    });
    expect(scene.onBeforeRender).not.toBe(originalBefore);
    uninstall();
    expect(scene.onBeforeRender).toBe(originalBefore);
    expect(scene.onAfterRender).toBe(originalAfter);
  });
});
