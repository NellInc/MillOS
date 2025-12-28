import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { SHADOW_CONFIG } from '../constants/renderLayers';

// Vertex Shader for SkyDome - Ultrathink Sky System
const skyVertexShader = `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vHeight = normalize(position).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment Shader for SkyDome with Procedural Clouds - Enhanced Ultrathink version
const skyFragmentShader = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform float time;
uniform float cloudDensity;
uniform float sunAngle;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;

// Improved pseudo-random noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Smooth 2D Noise
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractal Brownian Motion for realistic clouds
float fbm(vec2 st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 6; ++i) {
        v += a * noise(st);
        st = rot * st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    float h = normalize(vWorldPosition).y;

    // Multi-layer sky gradient with horizon band
    vec3 skyColor;
    if (h < 0.0) {
        // Below horizon - use ground color to match ground plane (prevents dark dome artifact)
        skyColor = mix(horizonColor * 0.9, groundColor, min(-h * 3.0, 1.0));
    } else if (h < 0.15) {
        // Horizon band - smooth transition
        float horizonFactor = h / 0.15;
        skyColor = mix(horizonColor, bottomColor, smoothstep(0.0, 1.0, horizonFactor));
    } else if (h < 0.5) {
        // Lower sky
        float t = (h - 0.15) / 0.35;
        skyColor = mix(bottomColor, mix(bottomColor, topColor, 0.5), smoothstep(0.0, 1.0, t));
    } else {
        // Upper sky
        float t = (h - 0.5) / 0.5;
        skyColor = mix(mix(bottomColor, topColor, 0.5), topColor, smoothstep(0.0, 1.0, t));
    }

    // Procedural clouds with drift animation
    vec2 cloudUV = vUv * 3.0;
    cloudUV.x += time * 0.015;
    cloudUV.y += time * 0.005;

    float n = fbm(cloudUV);
    float n2 = fbm(cloudUV * 2.0 + vec2(time * 0.01, 0.0));
    float cloudShape = (n + n2 * 0.5) / 1.5;

    // Cloud mask - only show clouds in upper sky, fade near horizon
    float cloudMask = smoothstep(0.1, 0.4, h) * (1.0 - smoothstep(0.85, 1.0, h));
    float cloudThreshold = 0.45 - cloudDensity * 0.15;
    float clouds = smoothstep(cloudThreshold, cloudThreshold + 0.2, cloudShape) * cloudMask;

    // Cloud lighting - brighter on sun side
    vec3 cloudColorLit = vec3(1.0, 0.98, 0.95);
    vec3 cloudColorShadow = vec3(0.7, 0.75, 0.85);
    float sunInfluence = max(0.0, sin(sunAngle));
    vec3 cloudColor = mix(cloudColorShadow, cloudColorLit, sunInfluence * 0.5 + 0.5);

    // Mix sky and clouds
    vec3 finalColor = mix(skyColor, cloudColor, clouds * cloudDensity * 0.8);

    // Add subtle atmospheric scattering near horizon during dawn/dusk
    float horizonGlow = smoothstep(0.2, 0.0, abs(h)) * (1.0 - abs(sin(sunAngle)));
    finalColor += horizonColor * horizonGlow * 0.3;

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// =============================================================================
// CENTRALIZED SKY ANIMATION MANAGER
// =============================================================================

// Registries to track animated objects without React re-renders
interface SkyDomeAnimationState {
  material: THREE.ShaderMaterial;
  skyColors: {
    top: string;
    bottom: string;
    horizon: string;
    ground: string;
  };
  cloudDensity: number;
  sunAngle: number;
}
const skyDomeRegistry = new Map<string, SkyDomeAnimationState>();

interface StarsAnimationState {
  starsRef: THREE.Points;
  brightStarsRef: THREE.Points;
  visible: boolean;
}
const starsRegistry = new Map<string, StarsAnimationState>();

interface BuildingShaderAnimationState {
  material: THREE.ShaderMaterial;
  buildingColor: string;
  windowLightColor: string;
  isNight: boolean;
}
const buildingShaderRegistry = new Map<string, BuildingShaderAnimationState>();

interface CityLightsAnimationState {
  lightsRef: THREE.Points;
  isNight: boolean;
}
const cityLightsRegistry = new Map<string, CityLightsAnimationState>();

interface MountainShaderAnimationState {
  material: THREE.ShaderMaterial;
  rockColor: string;
  treeColor: string;
  snowColor: string;
  atmosphereColor: string;
  atmosphereStrength: number;
  opacity: number;
}
const mountainShaderRegistry = new Map<string, MountainShaderAnimationState>();

interface LayerColorAnimationState {
  material: THREE.ShaderMaterial;
  layerColor: string;
  opacity: number;
}
const layerColorRegistry = new Map<string, LayerColorAnimationState>();

interface WaterAnimationState {
  material: THREE.ShaderMaterial;
}
const waterRegistry = new Map<string, WaterAnimationState>();

interface LightingAnimationState {
  sunLightRef: THREE.DirectionalLight;
  moonLightRef: THREE.DirectionalLight;
  ambientLightRef: THREE.AmbientLight;
  sunPosition: THREE.Vector3;
  moonPosition: THREE.Vector3;
  sunIntensity: number;
  moonIntensity: number;
  sunColor: string;
  ambientColor: string;
  sunVisible: boolean;
}
const lightingRegistry = new Map<string, LightingAnimationState>();

// Expose registries to globalThis in dev mode for debugging
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).skyDomeRegistry = skyDomeRegistry;
  (globalThis as Record<string, unknown>).lightingRegistry = lightingRegistry;
}

export const registerSkyDome = (id: string, state: SkyDomeAnimationState) => {
  skyDomeRegistry.set(id, state);
};
export const unregisterSkyDome = (id: string) => {
  skyDomeRegistry.delete(id);
};

export const registerStars = (id: string, state: StarsAnimationState) => {
  starsRegistry.set(id, state);
};
export const unregisterStars = (id: string) => {
  starsRegistry.delete(id);
};

export const registerBuildingShader = (id: string, state: BuildingShaderAnimationState) => {
  buildingShaderRegistry.set(id, state);
};
export const unregisterBuildingShader = (id: string) => {
  buildingShaderRegistry.delete(id);
};

export const registerCityLights = (id: string, state: CityLightsAnimationState) => {
  cityLightsRegistry.set(id, state);
};
export const unregisterCityLights = (id: string) => {
  cityLightsRegistry.delete(id);
};

export const registerMountainShader = (id: string, state: MountainShaderAnimationState) => {
  mountainShaderRegistry.set(id, state);
};
export const unregisterMountainShader = (id: string) => {
  mountainShaderRegistry.delete(id);
};

export const registerLayerColor = (id: string, state: LayerColorAnimationState) => {
  layerColorRegistry.set(id, state);
};
export const unregisterLayerColor = (id: string) => {
  layerColorRegistry.delete(id);
};

export const registerWater = (id: string, state: WaterAnimationState) => {
  waterRegistry.set(id, state);
};
export const unregisterWater = (id: string) => {
  waterRegistry.delete(id);
};

export const registerLighting = (id: string, state: LightingAnimationState) => {
  lightingRegistry.set(id, state);
};
export const unregisterLighting = (id: string) => {
  lightingRegistry.delete(id);
};

// Define color palettes for each time period
const nightPalette = {
  layerColors: { far: '#0a0f1a', mid: '#0d1420', near: '#101824', ground: '#080c12' },
  waterColors: { water: '#0a1525', reflection: '#1a2540' },
  mountainColors: { snow: '#2a3545', rock: '#151a24', tree: '#0a1210' },
  atmosphereColor: '#0a1020',
  cityColors: { building: '#050810', windowLight: '#ffd080' },
};

const dawnPalette = {
  layerColors: { far: '#1a1520', mid: '#25151a', near: '#301f30', ground: '#120e18' },
  waterColors: { water: '#1a2535', reflection: '#f0a060' },
  mountainColors: { snow: '#f0d0c0', rock: '#6a5060', tree: '#2a3528' },
  atmosphereColor: '#a08090',
  cityColors: { building: '#201520', windowLight: '#ffcc66' },
};

const dayPalette = {
  layerColors: { far: '#c8dce8', mid: '#a8c8dc', near: '#88b4cc', ground: '#5a8a5a' },
  waterColors: { water: '#40a0c0', reflection: '#e0ffff' },
  mountainColors: { snow: '#ffffff', rock: '#7080a0', tree: '#3a6040' },
  atmosphereColor: '#b0d0e8',
  cityColors: { building: '#405060', windowLight: '#ffffff' },
};

const duskPalette = {
  layerColors: { far: '#1a1015', mid: '#25151a', near: '#301a20', ground: '#100a0d' },
  waterColors: { water: '#1a1525', reflection: '#e07040' },
  mountainColors: { snow: '#e0b0a0', rock: '#5a4048', tree: '#252820' },
  atmosphereColor: '#804050',
  cityColors: { building: '#1a1015', windowLight: '#ffaa44' },
};

// Helper function to interpolate between hex colors
const lerpColor = (color1: string, color2: string, t: number): string => {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  const r1 = (c1 >> 16) & 0xff,
    g1 = (c1 >> 8) & 0xff,
    b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff,
    g2 = (c2 >> 8) & 0xff,
    b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const lerpPalette = (p1: typeof nightPalette, p2: typeof nightPalette, t: number) => ({
  layerColors: {
    far: lerpColor(p1.layerColors.far, p2.layerColors.far, t),
    mid: lerpColor(p1.layerColors.mid, p2.layerColors.mid, t),
    near: lerpColor(p1.layerColors.near, p2.layerColors.near, t),
    ground: lerpColor(p1.layerColors.ground, p2.layerColors.ground, t),
  },
  waterColors: {
    water: lerpColor(p1.waterColors.water, p2.waterColors.water, t),
    reflection: lerpColor(p1.waterColors.reflection, p2.waterColors.reflection, t),
  },
  mountainColors: {
    snow: lerpColor(p1.mountainColors.snow, p2.mountainColors.snow, t),
    rock: lerpColor(p1.mountainColors.rock, p2.mountainColors.rock, t),
    tree: lerpColor(p1.mountainColors.tree, p2.mountainColors.tree, t),
  },
  atmosphereColor: lerpColor(p1.atmosphereColor, p2.atmosphereColor, t),
  cityColors: {
    building: lerpColor(p1.cityColors.building, p2.cityColors.building, t),
    windowLight: lerpColor(p1.cityColors.windowLight, p2.cityColors.windowLight, t),
  },
});

// Smooth game time tracker for perceptually smooth sun/moon movement
// Uses deltaTime interpolation to avoid the 100ms store update quantization
let smoothGameTime = 10; // Will sync on first frame

// Manager component to handle all sky animations in a single consolidated loop
// CRITICAL: Reads store IMPERATIVELY in useFrame to avoid stale closures
const SkyAnimationManager: React.FC = () => {
  useFrame((state, delta) => {
    // Read store state IMPERATIVELY to get fresh values every frame
    // This avoids stale closure issues with Zustand subscriptions + useFrame
    const { isTabVisible, gameTime, gameSpeed, weather } = useGameSimulationStore.getState();

    // Smooth sun/moon movement: interpolate between discrete store updates
    // The store updates gameTime every 100ms, but we need 60fps smooth movement
    if (gameSpeed > 0) {
      // Apply real-time delta to smoothGameTime for continuous movement
      const hoursPerSecond = gameSpeed / 3600;
      smoothGameTime = (((smoothGameTime + delta * hoursPerSecond) % 24) + 24) % 24;

      // Re-sync if store time jumped significantly (user changed time, or drift correction)
      const timeDiff = Math.abs(smoothGameTime - gameTime);
      // Allow larger drift at high speeds, sync if difference > 0.1 hours (~6 min game time)
      if (timeDiff > 0.1 && timeDiff < 23.9) {
        smoothGameTime = gameTime;
      }
    } else {
      // Paused - sync to store time exactly
      smoothGameTime = gameTime;
    }

    // Skip if tab not visible
    if (!isTabVisible) return;

    const time = state.clock.getElapsedTime();

    if (skyDomeRegistry.size > 0) {
      // Sky color keyframes for smooth interpolation
      // Each entry: [hour, {top, bottom, horizon, ground}]
      const skyKeyframes: [
        number,
        { top: string; bottom: string; horizon: string; ground: string },
      ][] = [
        [0, { top: '#050810', bottom: '#0a1628', horizon: '#1a2744', ground: '#030508' }], // Midnight - very dark (darker ground)
        [4, { top: '#050810', bottom: '#0a1628', horizon: '#1a2744', ground: '#030508' }], // Late night - still dark (darker ground)
        [5, { top: '#1a1a2e', bottom: '#2d1f3d', horizon: '#3d2952', ground: '#0a0a12' }], // Pre-dawn - first hint of light
        [6, { top: '#7c4a1a', bottom: '#d97706', horizon: '#f59e0b', ground: '#451a03' }], // Dawn - warm orange
        [7, { top: '#c2410c', bottom: '#fb923c', horizon: '#fcd34d', ground: '#78350f' }], // Sunrise - golden
        [8, { top: '#0284c7', bottom: '#7dd3fc', horizon: '#fef3c7', ground: '#4a7c59' }], // Morning - transitioning to blue
        [10, { top: '#0369a1', bottom: '#7dd3fc', horizon: '#f0f9ff', ground: '#5a8a5a' }], // Late morning
        [12, { top: '#0284c7', bottom: '#38bdf8', horizon: '#f0f9ff', ground: '#6b936b' }], // Noon - bright blue
        [16, { top: '#0369a1', bottom: '#67d4fc', horizon: '#fef3c7', ground: '#5a8a5a' }], // Afternoon
        [18, { top: '#92400e', bottom: '#ea580c', horizon: '#fbbf24', ground: '#451a03' }], // Golden hour - warm amber
        [19, { top: '#7c2d12', bottom: '#c2410c', horizon: '#f97316', ground: '#451a03' }], // Sunset
        [20, { top: '#451a03', bottom: '#78350f', horizon: '#92400e', ground: '#1c1917' }], // Dusk - transitioning to dark
        [21, { top: '#0f172a', bottom: '#1e293b', horizon: '#334155', ground: '#050a12' }], // Night begins (darker ground)
        [24, { top: '#050810', bottom: '#0a1628', horizon: '#1a2744', ground: '#030508' }], // Midnight wrap (darker ground)
      ];

      // Find the two keyframes to interpolate between
      let fromIdx = 0;
      let toIdx = 1;
      for (let i = 0; i < skyKeyframes.length - 1; i++) {
        if (smoothGameTime >= skyKeyframes[i][0] && smoothGameTime < skyKeyframes[i + 1][0]) {
          fromIdx = i;
          toIdx = i + 1;
          break;
        }
      }

      const fromTime = skyKeyframes[fromIdx][0];
      const toTime = skyKeyframes[toIdx][0];
      const fromColors = skyKeyframes[fromIdx][1];
      const toColors = skyKeyframes[toIdx][1];

      // Calculate lerp factor (0-1)
      const t = (smoothGameTime - fromTime) / (toTime - fromTime);

      // Helper to lerp hex colors
      const lerpColor = (from: string, to: string, factor: number): string => {
        const fromR = parseInt(from.slice(1, 3), 16);
        const fromG = parseInt(from.slice(3, 5), 16);
        const fromB = parseInt(from.slice(5, 7), 16);
        const toR = parseInt(to.slice(1, 3), 16);
        const toG = parseInt(to.slice(3, 5), 16);
        const toB = parseInt(to.slice(5, 7), 16);
        const r = Math.round(fromR + (toR - fromR) * factor);
        const g = Math.round(fromG + (toG - fromG) * factor);
        const b = Math.round(fromB + (toB - fromB) * factor);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      };

      const skyColors = {
        top: lerpColor(fromColors.top, toColors.top, t),
        bottom: lerpColor(fromColors.bottom, toColors.bottom, t),
        horizon: lerpColor(fromColors.horizon, toColors.horizon, t),
        ground: lerpColor(fromColors.ground, toColors.ground, t),
      };

      // Compute cloud density from weather
      const cloudDensity =
        weather === 'clear'
          ? 0.3
          : weather === 'cloudy'
            ? 0.7
            : weather === 'rain'
              ? 0.9
              : weather === 'storm'
                ? 1.0
                : 0.5;

      // Compute sun angle from smoothGameTime for consistency
      const sunAngle = ((smoothGameTime - 6) / 12) * Math.PI;

      // Update uniforms via .set() / .copy() to mutate existing objects
      skyDomeRegistry.forEach((data) => {
        if (!data.material?.uniforms) return;

        data.material.uniforms.time.value = time;
        data.material.uniforms.topColor.value.set(skyColors.top);
        data.material.uniforms.bottomColor.value.set(skyColors.bottom);
        data.material.uniforms.horizonColor.value.set(skyColors.horizon);
        data.material.uniforms.groundColor.value.set(skyColors.ground);
        data.material.uniforms.cloudDensity.value = cloudDensity;
        data.material.uniforms.sunAngle.value = sunAngle;
      });
    }

    // 2. Update Stars twinkling and visibility (30fps)
    if (starsRegistry.size > 0 && shouldRunThisFrame(2)) {
      const areStarsVisible = smoothGameTime >= 20 || smoothGameTime < 6;

      starsRegistry.forEach((data) => {
        // Update visibility on the mesh directly
        if (data.starsRef) data.starsRef.visible = areStarsVisible;
        if (data.brightStarsRef) data.brightStarsRef.visible = areStarsVisible;

        if (!areStarsVisible) return;

        const material = data.starsRef.material as THREE.PointsMaterial;
        material.opacity = 0.75 + Math.sin(time * 0.3) * 0.15;

        const brightMaterial = data.brightStarsRef.material as THREE.PointsMaterial;
        brightMaterial.opacity = 0.8 + Math.sin(time * 1.5) * 0.2;
      });
    }

    // Calculate environment colors based on smoothGameTime
    let envColors = dayPalette;
    const hour = smoothGameTime;

    if (hour >= 5 && hour < 6) {
      // Night -> Dawn
      envColors = lerpPalette(nightPalette, dawnPalette, hour - 5);
    } else if (hour >= 6 && hour < 7) {
      // Solid Dawn
      envColors = dawnPalette;
    } else if (hour >= 7 && hour < 8) {
      // Dawn -> Day
      envColors = lerpPalette(dawnPalette, dayPalette, hour - 7);
    } else if (hour >= 8 && hour < 17) {
      // Solid Day
      envColors = dayPalette;
    } else if (hour >= 17 && hour < 18) {
      // Day -> Dusk
      envColors = lerpPalette(dayPalette, duskPalette, hour - 17);
    } else if (hour >= 18 && hour < 19) {
      // Solid Dusk
      envColors = duskPalette;
    } else if (hour >= 19 && hour < 20) {
      // Dusk -> Night
      envColors = lerpPalette(duskPalette, nightPalette, hour - 19);
    } else {
      // Night
      envColors = nightPalette;
    }

    const isNightOrDusk = hour >= 17 || hour < 6;

    // 3. Update Building shaders (15fps for color updates)
    if (buildingShaderRegistry.size > 0 && shouldRunThisFrame(4)) {
      buildingShaderRegistry.forEach((data) => {
        data.material.uniforms.buildingColor.value.set(envColors.cityColors.building);
        data.material.uniforms.windowLightColor.value.set(envColors.cityColors.windowLight);
        data.material.uniforms.isNight.value = isNightOrDusk ? 1.0 : 0.0;
        data.material.uniforms.time.value = time;
      });
    }

    // 4. Update City lights twinkling (30fps)
    if (cityLightsRegistry.size > 0 && shouldRunThisFrame(2)) {
      cityLightsRegistry.forEach((data) => {
        // Toggle visibility based on time (night/dusk) ignoring registry 'isNight'
        if (data.lightsRef) data.lightsRef.visible = isNightOrDusk;

        if (!isNightOrDusk) return;
        const material = data.lightsRef.material as THREE.PointsMaterial;
        material.opacity = 0.7 + Math.sin(time * 2) * 0.2;
      });
    }

    // 5. Update Mountain shader colors (15fps for color updates)
    if (mountainShaderRegistry.size > 0 && shouldRunThisFrame(4)) {
      mountainShaderRegistry.forEach((data) => {
        data.material.uniforms.rockColor.value.set(envColors.mountainColors.rock);
        data.material.uniforms.treeColor.value.set(envColors.mountainColors.tree);
        data.material.uniforms.snowColor.value.set(envColors.mountainColors.snow);
        data.material.uniforms.atmosphereColor.value.set(envColors.atmosphereColor);
        data.material.uniforms.atmosphereStrength.value = data.atmosphereStrength;
        data.material.uniforms.opacity.value = data.opacity;
      });
    }

    // 6. Update Layer colors (15fps)
    if (layerColorRegistry.size > 0 && shouldRunThisFrame(4)) {
      layerColorRegistry.forEach((data) => {
        // We need a way to map specific layers to colors.
        // For now, assume 'ground' is the main one used.
        // Ideally registry should contain type.
        // fallback: use ground color for all layers for now
        data.material.uniforms.layerColor.value.set(envColors.layerColors.ground);
        data.material.uniforms.opacity.value = data.opacity;
      });
    }

    // 7. Update Water animation (needs 60fps for smooth waves)
    if (waterRegistry.size > 0) {
      waterRegistry.forEach((data) => {
        data.material.uniforms.time.value = time;
        data.material.uniforms.waterColor.value.set(envColors.waterColors.water);
        data.material.uniforms.reflectionColor.value.set(envColors.waterColors.reflection);
      });
    }

    // 8. Update Sun/Moon/Ambient lights (60fps - smooth position updates)
    // SMOOTH SUN/MOON: Compute positions directly from smoothGameTime for 60fps movement
    if (lightingRegistry.size > 0) {
      // Compute sun angle from smooth game time (not discrete store time)
      const smoothSunAngle = ((smoothGameTime - 6) / 12) * Math.PI;

      // Compute sun position (same formula as SkySystem but using smooth time)
      const radius = 340;
      const heightMultiplier = 1.3;
      const smoothSunX = Math.cos(smoothSunAngle) * -radius;
      const smoothSunY = Math.sin(smoothSunAngle) * radius * heightMultiplier + 60;
      const smoothSunZ = Math.cos(smoothSunAngle) * 50;

      // Moon position is opposite to sun
      const smoothMoonX = -smoothSunX;
      const smoothMoonY = -smoothSunY;
      const smoothMoonZ = -smoothSunZ;

      // Sun visibility and intensity
      const smoothSunVisible = smoothSunY > -5;
      const smoothSunIntensity = smoothSunVisible
        ? Math.max(0, Math.sin(smoothSunAngle)) * 3.5 + 0.8
        : 0;
      const smoothMoonVisible = smoothMoonY > -5;
      const smoothMoonIntensity = smoothMoonVisible ? 0.3 : 0;

      // Sun color
      const smoothSunColor = smoothSunAngle < 0.3 || smoothSunAngle > 2.84 ? '#ff6b35' : '#fff7ed';

      lightingRegistry.forEach((data) => {
        if (data.sunLightRef) {
          data.sunLightRef.position.set(smoothSunX, smoothSunY, smoothSunZ);
          data.sunLightRef.intensity = smoothSunIntensity;
          data.sunLightRef.color.set(smoothSunColor);
        }

        if (data.moonLightRef) {
          data.moonLightRef.position.set(smoothMoonX, smoothMoonY, smoothMoonZ);
          data.moonLightRef.intensity = smoothMoonIntensity;
        }

        if (data.ambientLightRef) {
          data.ambientLightRef.color.set(data.ambientColor);
          data.ambientLightRef.intensity = smoothSunVisible ? 1.0 : 0.03;
        }
      });
    }
  });

  return null;
};

// Component to lock sky dome to camera position and scale within far plane
// This ensures the dome is always visible regardless of camera position
interface SkyDomeFollowerProps {
  meshRef: React.RefObject<THREE.Mesh | null>;
}
const SkyDomeFollower: React.FC<SkyDomeFollowerProps> = ({ meshRef }) => {
  const { camera } = useThree();
  const baseRadiusRef = useRef<number>(1);

  // Compute base radius once when mesh is available
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.geometry.computeBoundingSphere();
    baseRadiusRef.current = mesh.geometry.boundingSphere?.radius ?? 350;
  }, [meshRef]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Keep camera inside the dome by centering dome on camera
    mesh.position.copy(camera.position);

    // Keep dome inside far plane (prevents clipping)
    // Use 95% of far to leave margin
    const targetRadius = camera.far * 0.95;
    const scale = targetRadius / baseRadiusRef.current;
    mesh.scale.setScalar(scale);
  });

  return null;
};

// Smooth Sun visual component - updates position every frame for perceptually smooth movement
const SmoothSun: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame(() => {
    if (!isTabVisible || !groupRef.current) return;

    // Compute sun position from smoothGameTime (set by SkyAnimationManager)
    const smoothSunAngle = ((smoothGameTime - 6) / 12) * Math.PI;
    const radius = 340;
    const heightMultiplier = 1.3;
    const smoothSunX = Math.cos(smoothSunAngle) * -radius;
    const smoothSunY = Math.sin(smoothSunAngle) * radius * heightMultiplier + 60;
    const smoothSunZ = Math.cos(smoothSunAngle) * 50;

    groupRef.current.position.set(smoothSunX, smoothSunY, smoothSunZ);

    // Toggle visibility based on height
    groupRef.current.visible = smoothSunY > -5;

    // Update color for sunset/sunrise
    if (glowMaterialRef.current) {
      // Orange at sunrise/sunset (< 0.3 rad or > 2.84 rad)
      const isGoldenHour = smoothSunAngle < 0.3 || smoothSunAngle > 2.84;
      glowMaterialRef.current.color.set(isGoldenHour ? '#ff6b35' : '#fff7ed');
    }
  });

  return (
    <group ref={groupRef}>
      {/* Core sun - bright white */}
      <mesh renderOrder={-990}>
        <sphereGeometry args={[22, 32, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Inner glow */}
      <mesh renderOrder={-990}>
        <sphereGeometry args={[36, 32, 32]} />
        <meshBasicMaterial color="#fffde7" transparent opacity={0.6} />
      </mesh>
      {/* Mid glow */}
      <mesh renderOrder={-990}>
        <sphereGeometry args={[55, 32, 32]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color="#fff7ed"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      {/* Outer glow - large corona */}
      <mesh renderOrder={-990}>
        <sphereGeometry args={[85, 32, 32]} />
        <meshBasicMaterial color="#fff8e1" transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  );
};

// Smooth Moon visual component - updates position every frame for perceptually smooth movement
const SmoothMoon: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame(() => {
    if (!isTabVisible || !groupRef.current) return;

    // Compute moon position (opposite to sun) from smoothGameTime
    const smoothSunAngle = ((smoothGameTime - 6) / 12) * Math.PI;
    const radius = 340;
    const heightMultiplier = 1.3;
    const smoothSunX = Math.cos(smoothSunAngle) * -radius;
    const smoothSunY = Math.sin(smoothSunAngle) * radius * heightMultiplier + 60;
    const smoothSunZ = Math.cos(smoothSunAngle) * 50;

    // Moon is opposite
    const smoothMoonX = -smoothSunX;
    const smoothMoonY = -smoothSunY;
    const smoothMoonZ = -smoothSunZ;

    groupRef.current.position.set(smoothMoonX, smoothMoonY, smoothMoonZ);

    // Toggle visibility based on height
    groupRef.current.visible = smoothMoonY > -5;
  });

  return (
    <group ref={groupRef}>
      {/* Moon surface */}
      <mesh renderOrder={-990}>
        <sphereGeometry args={[15, 32, 32]} />
        <meshStandardMaterial
          color="#e2e8f0"
          emissive="#94a3b8"
          emissiveIntensity={0.3}
          fog={false}
        />
      </mesh>
      {/* Moon glow */}
      <mesh renderOrder={-990}>
        <sphereGeometry args={[22, 32, 32]} />
        <meshBasicMaterial color="#a5f3fc" transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  );
};

export const SkySystem: React.FC = () => {
  // PERFORMANCE: Removed subscriptions to prevent re-renders. Animation handled by SkyAnimationManager.
  // const gameTime = useGameSimulationStore((state) => state.gameTime);
  // const weather = useGameSimulationStore((state) => state.weather);
  // FIX: Select primitives individually to avoid new object references causing infinite loops
  const shadowMapSize = useGraphicsStore((state) => state.graphics.shadowMapSize);
  const enableHighResShadows = useGraphicsStore((state) => state.graphics.enableHighResShadows);
  // Use high-res shadow map only when toggle is enabled, otherwise default to 2048
  const effectiveShadowMapSize = enableHighResShadows ? shadowMapSize : 2048;
  const meshRef = useRef<THREE.Mesh>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);

  // Enhanced sky colors with horizon color for each time of day
  // Initial values for registry - subsequent updates handled by SkyAnimationManager
  const skyColors = useMemo(
    () => ({
      top: '#0ea5e9',
      bottom: '#a5d8ff',
      horizon: '#fff7ed',
      ambient: '#f0f9ff',
      ground: '#5a7a5a',
    }),
    []
  );

  // Cloud density based on weather
  // Initial defaults
  const cloudDensity = 0.5;
  const sunAngle = Math.PI / 2; // High noon default

  // Sun position - orbits from East (negative Z) to West (positive Z)
  // Adjusted orbit to track across the sky properly
  // Radius 340 places sun BEHIND all mountain layers (260-320) for proper occlusion at sunrise/sunset
  // Static initial positions/values (overridden immediately by manager)
  const sunPosition = useMemo(() => new THREE.Vector3(0, 100, 0), []);
  const moonPosition = useMemo(() => new THREE.Vector3(0, -100, 0), []);
  const sunColor = '#fff7ed';
  const sunIntensity = 1.0;
  const moonIntensity = 0.0;
  const sunVisible = true;
  // moonVisible removed

  // Register sky dome with animation manager ONCE when mesh becomes available
  // CRITICAL: Empty deps [] to prevent registry thrashing that leaves registry empty
  // The SkyAnimationManager reads gameTime imperatively, so we don't need to re-register on time changes
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const material = mesh.material as THREE.ShaderMaterial;
    const id = mesh.uuid;

    registerSkyDome(id, {
      material,
      skyColors,
      cloudDensity,
      sunAngle,
    });

    return () => {
      unregisterSkyDome(id);
    };
  }, []); // INTENTIONALLY EMPTY - register once, SkyAnimationManager updates uniforms imperatively

  // Register lights with animation manager (replaces direct useFrame for lights)
  useEffect(() => {
    if (sunLightRef.current && moonLightRef.current && ambientLightRef.current) {
      registerLighting('main', {
        sunLightRef: sunLightRef.current,
        moonLightRef: moonLightRef.current,
        ambientLightRef: ambientLightRef.current,
        sunPosition,
        moonPosition,
        sunIntensity,
        moonIntensity,
        sunColor,
        ambientColor: skyColors.ambient,
        sunVisible,
      });
      return () => unregisterLighting('main');
    }
  }, [
    sunPosition,
    moonPosition,
    sunIntensity,
    moonIntensity,
    sunColor,
    skyColors.ambient,
    sunVisible,
  ]);

  return (
    <group>
      {/* Centralized Animation Manager */}
      <SkyAnimationManager />
      {/* Camera follower - locks dome to camera position and scales within far plane */}
      <SkyDomeFollower meshRef={meshRef} />

      {/* Dynamic Lighting */}
      <ambientLight ref={ambientLightRef} intensity={0.4} />

      <directionalLight
        ref={sunLightRef}
        castShadow
        shadow-mapSize={[effectiveShadowMapSize, effectiveShadowMapSize]}
        shadow-camera-far={200}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-bias={SHADOW_CONFIG.bias}
        shadow-normalBias={SHADOW_CONFIG.normalBias}
      />

      <directionalLight
        ref={moonLightRef}
        color="#a5f3fc"
        castShadow={false} // Disable moon shadows for performance
      />

      {/* Ground Plane - Infinite Environment */}
      {/* fog={false} prevents dark artifacts at far distances */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <circleGeometry args={[400, 64]} />
        <meshStandardMaterial color={skyColors.ground} roughness={1} metalness={0} fog={false} />
      </mesh>

      {/* Sky Dome - renderOrder -1000 ensures it renders behind everything */}
      {/* frustumCulled={false} ensures dome is always rendered even when camera is inside */}
      {/* depthTest={false} alone is sufficient - depthWrite is redundant when not testing */}
      <mesh ref={meshRef} renderOrder={-1000} frustumCulled={false}>
        <sphereGeometry args={[350, 64, 64]} />
        <shaderMaterial
          vertexShader={skyVertexShader}
          fragmentShader={skyFragmentShader}
          uniforms={{
            topColor: { value: new THREE.Color(skyColors.top) },
            bottomColor: { value: new THREE.Color(skyColors.bottom) },
            horizonColor: { value: new THREE.Color(skyColors.horizon) },
            groundColor: { value: new THREE.Color(skyColors.ground) },
            time: { value: 0 },
            cloudDensity: { value: cloudDensity },
            sunAngle: { value: sunAngle },
          }}
          side={THREE.BackSide}
          depthTest={false}
        />
      </mesh>

      {/* Sun Visuals - Smooth 60fps movement via SmoothSun component */}
      <SmoothSun />

      {/* Moon Visuals - Smooth 60fps movement via SmoothMoon component */}
      <SmoothMoon />

      {/* Stars - visible at night (controlled by animation manager) */}
      <Stars visible={true} />

      {/* Horizon Silhouette Ring - provides mountains and distant city */}
      <HorizonRing />
    </group>
  );
};

// Stars for nighttime sky - enhanced with more stars, colors, and twinkling
const Stars: React.FC<{ visible: boolean }> = React.memo(({ visible }) => {
  const starsRef = useRef<THREE.Points>(null);
  const brightStarsRef = useRef<THREE.Points>(null);
  const twinkleOffsetsRef = useRef<Float32Array | null>(null);

  const STAR_COUNT = 1500;
  const BRIGHT_STAR_COUNT = 50;

  // Generate star positions on a sphere
  const { positions: starPositions, colors: starColors } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);

    // Star color palette - slightly warm and cool tints
    const starTints = [
      [1.0, 1.0, 1.0], // Pure white
      [1.0, 0.95, 0.9], // Warm white
      [0.9, 0.95, 1.0], // Cool white
      [1.0, 0.9, 0.8], // Yellow-ish
      [0.85, 0.9, 1.0], // Blue-ish
    ];

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 340 + Math.random() * 5;

      const y = Math.cos(phi) * radius;
      if (y > 15) {
        positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      } else {
        positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
        positions[i * 3 + 1] = Math.abs(y) + 25 + Math.random() * 50;
        positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      }

      // Random color tint
      const tint = starTints[Math.floor(Math.random() * starTints.length)];
      colors[i * 3] = tint[0];
      colors[i * 3 + 1] = tint[1];
      colors[i * 3 + 2] = tint[2];
    }
    return { positions, colors };
  }, []);

  // Bright stars (bigger, more prominent)
  const brightStarPositions = useMemo(() => {
    const positions = new Float32Array(BRIGHT_STAR_COUNT * 3);
    for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random()); // Bias toward upper hemisphere
      const radius = 338;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius + 50;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    return positions;
  }, []);

  // Star sizes for variety
  const starSizes = useMemo(() => {
    const sizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      sizes[i] = 0.3 + Math.random() * 1.2;
    }
    return sizes;
  }, []);

  // Initialize twinkle offsets
  useMemo(() => {
    twinkleOffsetsRef.current = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      twinkleOffsetsRef.current[i] = Math.random() * Math.PI * 2;
    }
  }, []);

  // Register stars with animation manager
  useEffect(() => {
    if (starsRef.current && brightStarsRef.current) {
      registerStars('main', {
        starsRef: starsRef.current,
        brightStarsRef: brightStarsRef.current,
        visible,
      });
      return () => unregisterStars('main');
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <group>
      {/* Main star field - renderOrder -995 ensures stars are behind mountains and sun/moon */}
      <points ref={starsRef} renderOrder={-995}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[starColors, 3]} />
          <bufferAttribute attach="attributes-size" args={[starSizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          size={1.2}
          vertexColors
          transparent
          opacity={0.85}
          sizeAttenuation={false}
          depthWrite={false}
        />
      </points>

      {/* Bright prominent stars */}
      <points ref={brightStarsRef} renderOrder={-995}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[brightStarPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={2.5}
          color="#fffef0"
          transparent
          opacity={0.95}
          sizeAttenuation={false}
          depthWrite={false}
        />
      </points>
    </group>
  );
});

// Hash function for 2D noise
const hash2D = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// Smooth noise interpolation
const smoothNoise = (x: number, seed: number): number => {
  const i = Math.floor(x);
  const f = x - i;
  // Smooth interpolation (cubic Hermite)
  const u = f * f * (3.0 - 2.0 * f);
  return (1 - u) * hash2D(i, seed) + u * hash2D(i + 1, seed);
};

// FBM (Fractal Brownian Motion) - the key to realistic mountains
// Based on Inigo Quilez's techniques: G=0.5 for natural mountain profiles
const fbm = (x: number, seed: number, octaves: number = 6): number => {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  const gain = 0.5; // G=0.5 gives -9dB/octave, matching real mountain frequency profiles
  const lacunarity = 2.02; // Slightly detuned to avoid pattern alignment

  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, seed + i * 100);
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return value;
};

// Generate realistic mountain profile using FBM with sharp ridges
const generateMountainProfile = (
  width: number,
  segments: number,
  baseHeight: number,
  amplitude: number,
  frequency: number,
  seed: number
): number[] => {
  const heights: number[] = [];

  for (let i = 0; i <= segments; i++) {
    // Use modular arithmetic to ensure seamless wrap (position 0 and segments have same x value conceptually)
    const normalizedPos = i / segments;
    // Map to 0-1 range that wraps seamlessly
    const x = normalizedPos * width;

    // Base terrain using FBM
    let h = fbm(x * frequency * 0.01, seed, 6) * amplitude;

    // Add sharp ridgelines using absolute value trick (creates peaks)
    // This is the "ridged multifractal" technique
    const ridge = 1.0 - Math.abs(fbm(x * frequency * 0.02, seed + 500, 4) * 2 - 1);
    h += ridge * ridge * amplitude * 0.6;

    // Add occasional dramatic peaks
    const peakNoise = fbm(x * frequency * 0.005, seed + 1000, 3);
    if (peakNoise > 0.6) {
      const peakIntensity = (peakNoise - 0.6) * 2.5;
      h += peakIntensity * amplitude * 0.8;
    }

    heights.push(Math.max(2, baseHeight + h));
  }

  // Ensure seamless wrap: blend first and last heights together
  if (heights.length > 1) {
    const blendedHeight = (heights[0] + heights[heights.length - 1]) / 2;
    heights[0] = blendedHeight;
    heights[heights.length - 1] = blendedHeight;
  }

  return heights;
};

// Building type definitions for varied skyline
interface BuildingDef {
  width: number;
  height: number;
  hasSpire: boolean;
  stepBack: boolean; // Art deco style step-back
}

// Generate city skyline with realistic building variety
const generateCitySkyline = (
  segments: number,
  baseHeight: number,
  maxBuildingHeight: number,
  density: number,
  seed: number
): { heights: number[]; buildings: BuildingDef[] } => {
  const heights: number[] = [];
  const buildings: BuildingDef[] = [];
  let i = 0;

  const rand = (offset: number) => {
    const x = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  while (i <= segments) {
    const r = rand(i);

    if (r < density) {
      // Create a building
      const buildingWidth = Math.floor(rand(i + 1000) * 5) + 2;
      let buildingHeight = baseHeight + rand(i + 2000) * maxBuildingHeight;

      // Building type variety
      const typeRand = rand(i + 3000);
      const hasSpire = typeRand > 0.9;
      const stepBack = typeRand > 0.7 && typeRand <= 0.9;

      // Occasional landmark skyscraper
      if (rand(i + 4000) > 0.92) {
        buildingHeight *= 1.8;
      }
      // Medium tall buildings
      else if (rand(i + 4500) > 0.7) {
        buildingHeight *= 1.3;
      }

      buildings.push({ width: buildingWidth, height: buildingHeight, hasSpire, stepBack });

      // Add building profile with optional step-back effect
      for (let w = 0; w < buildingWidth && i + w <= segments; w++) {
        let h = buildingHeight;

        // Step-back effect (art deco style) - building gets narrower at top
        if (stepBack && buildingWidth > 3) {
          const progress = w / buildingWidth;
          const stepFactor = Math.sin(progress * Math.PI); // Wider in middle
          h = buildingHeight * (0.7 + 0.3 * stepFactor);
        }

        // Spire at center
        if (hasSpire && w === Math.floor(buildingWidth / 2)) {
          h = buildingHeight * 1.25;
        }

        heights.push(h);
      }
      i += buildingWidth;

      // Gap between buildings (varied)
      const gap = Math.floor(rand(i + 5000) * 2) + 1;
      for (let g = 0; g < gap && i <= segments; g++) {
        heights.push(baseHeight * 0.3); // Low base between buildings
        i++;
      }
    } else {
      // Empty space or very small structure
      heights.push(baseHeight * (0.2 + rand(i + 6000) * 0.3));
      i++;
    }
  }

  // Ensure correct length
  while (heights.length <= segments) heights.push(baseHeight * 0.2);
  return { heights: heights.slice(0, segments + 1), buildings };
};

// City skyline layer with procedural lit windows
// Based on Shamus Young's technique: buildings as dark silhouettes with lit windows
const CitySkylineLayer: React.FC<{
  startAngle: number;
  endAngle: number;
  radius: number;
  baseY: number;
  heights: number[];
  buildingColor: string;
  windowLightColor: string;
  isNight: boolean;
  time: number;
  renderOrder?: number;
}> = React.memo(
  ({
    startAngle,
    endAngle,
    radius,
    baseY,
    heights,
    buildingColor,
    windowLightColor,
    isNight,
    time: _time,
    renderOrder = -700,
  }) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    // Register building shader with animation manager
    useEffect(() => {
      if (materialRef.current) {
        registerBuildingShader(`city-${startAngle}`, {
          material: materialRef.current,
          buildingColor,
          windowLightColor,
          isNight,
        });
        return () => unregisterBuildingShader(`city-${startAngle}`);
      }
    }, [buildingColor, windowLightColor, isNight, startAngle]);

    // Direct uniform update to ensure building colors stay in sync with game time
    useEffect(() => {
      if (materialRef.current?.uniforms) {
        materialRef.current.uniforms.buildingColor.value.set(buildingColor);
        materialRef.current.uniforms.windowLightColor.value.set(windowLightColor);
        materialRef.current.uniforms.isNight.value = isNight ? 1.0 : 0.0;
      }
    }, [buildingColor, windowLightColor, isNight]);

    const geometry = useMemo(() => {
      const segments = heights.length - 1;
      const geo = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const angleSpan = endAngle - startAngle;
      const maxHeight = Math.max(...heights);

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + t * angleSpan;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const h = heights[i];

        // Bottom vertex
        positions.push(x, baseY, z);
        uvs.push(t * 20.0, 0); // Scaled UV for window grid
        // Top vertex (building height)
        positions.push(x, baseY + h, z);
        uvs.push(t * 20.0, (h / maxHeight) * 8.0); // Scaled for window rows
      }

      // Create faces (facing inward)
      for (let i = 0; i < segments; i++) {
        const bl = i * 2;
        const br = (i + 1) * 2;
        const tl = i * 2 + 1;
        const tr = (i + 1) * 2 + 1;

        indices.push(bl, tl, br);
        indices.push(br, tl, tr);
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      return geo;
    }, [startAngle, endAngle, radius, baseY, heights]);

    const shaderMaterial = useMemo(
      () => ({
        uniforms: {
          buildingColor: { value: new THREE.Color(buildingColor) },
          windowLightColor: { value: new THREE.Color(windowLightColor) },
          isNight: { value: isNight ? 1.0 : 0.0 },
          time: { value: 0.0 },
        },
        vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: `
      uniform vec3 buildingColor;
      uniform vec3 windowLightColor;
      uniform float isNight;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      // Hash function for procedural randomness
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // Create window grid pattern
      float windowPattern(vec2 uv, float seed) {
        // Window grid dimensions
        vec2 windowSize = vec2(0.8, 0.6); // Window aspect ratio
        vec2 gridSize = vec2(1.2, 1.0); // Grid cell size

        // Get grid cell
        vec2 gridPos = floor(uv / gridSize);
        vec2 cellUV = fract(uv / gridSize);

        // Random per-window: is this window lit?
        float windowSeed = hash(gridPos + seed);

        // Window probability varies by floor (lower floors more lit)
        float floorFactor = 1.0 - smoothstep(0.0, 8.0, uv.y) * 0.3;
        float litProbability = 0.4 * floorFactor;

        // Some windows are always dark (structure, corners)
        if (cellUV.x < 0.1 || cellUV.x > 0.9) return 0.0; // Column gaps
        if (cellUV.y < 0.15 || cellUV.y > 0.85) return 0.0; // Floor gaps

        // Occasional fully lit floor (office late night)
        float floorHash = hash(vec2(gridPos.y, seed));
        if (floorHash > 0.92) litProbability = 0.9;

        // Is this window lit?
        float isLit = windowSeed < litProbability ? 1.0 : 0.0;

        // Add slight flicker to some windows
        if (isLit > 0.5 && hash(gridPos + seed + 100.0) > 0.8) {
          isLit *= 0.7 + 0.3 * sin(time * 3.0 + windowSeed * 10.0);
        }

        return isLit;
      }

      void main() {
        vec3 color = buildingColor;

        // Only show windows at night or dusk
        if (isNight > 0.3) {
          // Get window pattern
          float window = windowPattern(vUv, floor(vUv.x) * 7.77);

          // Window light color with warm variation
          vec3 warmLight = windowLightColor;
          float warmth = hash(floor(vUv)) * 0.3;
          warmLight.r += warmth * 0.2;
          warmLight.g += warmth * 0.1;

          // Mix window light with building color
          float windowIntensity = window * isNight * 0.9;
          color = mix(buildingColor, warmLight, windowIntensity);

          // Add slight glow around lit windows
          if (windowIntensity > 0.3) {
            color += warmLight * 0.05;
          }
        }

        // Smooth fade at building tops
        float peakFade = 1.0 - smoothstep(0.85, 1.0, vUv.y / 8.0);

        // Base fade
        float baseFade = smoothstep(0.0, 0.1, vUv.y / 8.0);

        gl_FragColor = vec4(color, peakFade * baseFade);
      }
    `,
      }),
      // Empty dependencies - colors are controlled by game time
      []
    );

    return (
      <mesh geometry={geometry} frustumCulled={false} renderOrder={renderOrder}>
        <shaderMaterial
          ref={materialRef}
          {...shaderMaterial}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    );
  }
);

// City lights component for nighttime
const CityLights: React.FC<{
  startAngle: number;
  endAngle: number;
  radius: number;
  baseY: number;
  isNight: boolean;
}> = React.memo(({ startAngle, endAngle, radius, baseY, isNight }) => {
  const lightsRef = useRef<THREE.Points>(null);

  const lightPositions = useMemo(() => {
    const positions: number[] = [];
    const lightCount = 80;
    const angleSpan = endAngle - startAngle;

    for (let i = 0; i < lightCount; i++) {
      const angle = startAngle + (i / lightCount) * angleSpan + (Math.random() - 0.5) * 0.02;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = baseY + Math.random() * 12 + 2;
      positions.push(x, y, z);
    }
    return new Float32Array(positions);
  }, [startAngle, endAngle, radius, baseY]);

  const lightColors = useMemo(() => {
    const colors: number[] = [];
    const colorOptions = [
      [1.0, 0.95, 0.7], // Warm yellow
      [1.0, 1.0, 1.0], // White
      [1.0, 0.85, 0.6], // Orange-ish
      [0.9, 0.95, 1.0], // Cool white
      [1.0, 0.4, 0.3], // Red (aircraft warning)
    ];

    for (let i = 0; i < 80; i++) {
      const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];
      colors.push(color[0], color[1], color[2]);
    }
    return new Float32Array(colors);
  }, []);

  // Register city lights with animation manager
  useEffect(() => {
    if (lightsRef.current) {
      registerCityLights(`lights-${startAngle}`, {
        lightsRef: lightsRef.current,
        isNight,
      });
      return () => unregisterCityLights(`lights-${startAngle}`);
    }
  }, [isNight, startAngle]);

  if (!isNight) return null;

  return (
    <points ref={lightsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[lightPositions, 3]} />
        <bufferAttribute attach="attributes-color" args={[lightColors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={2}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation={false}
        depthWrite={false}
      />
    </points>
  );
});

// Snow-capped mountain layer with atmospheric perspective
// Based on techniques from Inigo Quilez and atmospheric scattering research
const SnowCappedMountainLayer: React.FC<{
  radius: number;
  baseY: number;
  heights: number[];
  snowLineHeight: number;
  treeLineHeight: number;
  rockColor: string;
  treeColor: string;
  snowColor: string;
  atmosphereColor: string; // Color to fade toward (blue for day, dark for night)
  atmosphereStrength: number; // 0-1, how much atmospheric haze
  opacity: number;
  renderOrder?: number;
}> = React.memo(
  ({
    radius,
    baseY,
    heights,
    snowLineHeight,
    treeLineHeight,
    rockColor,
    treeColor,
    snowColor,
    atmosphereColor,
    atmosphereStrength,
    opacity,
    renderOrder = -900,
  }) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    // Register mountain shader with animation manager
    useEffect(() => {
      if (materialRef.current) {
        registerMountainShader(`mountain-${radius}`, {
          material: materialRef.current,
          rockColor,
          treeColor,
          snowColor,
          atmosphereColor,
          atmosphereStrength,
          opacity,
        });
        return () => unregisterMountainShader(`mountain-${radius}`);
      }
    }, [radius, rockColor, treeColor, snowColor, atmosphereColor, atmosphereStrength, opacity]);

    // Direct uniform update to ensure mountain colors stay in sync with game time
    // This bypasses potential registry timing issues (same pattern as SkyDome)
    useEffect(() => {
      if (materialRef.current?.uniforms) {
        materialRef.current.uniforms.rockColor.value.set(rockColor);
        materialRef.current.uniforms.treeColor.value.set(treeColor);
        materialRef.current.uniforms.snowColor.value.set(snowColor);
        materialRef.current.uniforms.atmosphereColor.value.set(atmosphereColor);
        materialRef.current.uniforms.atmosphereStrength.value = atmosphereStrength;
        materialRef.current.uniforms.opacity.value = opacity;
      }
    }, [rockColor, treeColor, snowColor, atmosphereColor, atmosphereStrength, opacity]);

    const geometry = useMemo(() => {
      const segments = heights.length - 1;
      const geo = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const maxHeight = Math.max(...heights);

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const h = heights[i % heights.length];

        // Bottom vertex
        positions.push(x, baseY, z);
        uvs.push(i / segments, 0);
        // Top vertex
        positions.push(x, baseY + h, z);
        uvs.push(i / segments, h / maxHeight); // UV.y = normalized height
      }

      for (let i = 0; i < segments; i++) {
        const bl = i * 2;
        const br = (i + 1) * 2;
        const tl = i * 2 + 1;
        const tr = (i + 1) * 2 + 1;
        indices.push(bl, tl, br);
        indices.push(br, tl, tr);
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      return geo;
    }, [radius, baseY, heights]);

    const shaderMaterial = useMemo(
      () => ({
        uniforms: {
          rockColor: { value: new THREE.Color(rockColor) },
          treeColor: { value: new THREE.Color(treeColor) },
          snowColor: { value: new THREE.Color(snowColor) },
          atmosphereColor: { value: new THREE.Color(atmosphereColor) },
          atmosphereStrength: { value: atmosphereStrength },
          snowLineHeight: { value: snowLineHeight },
          treeLineHeight: { value: treeLineHeight },
          opacity: { value: opacity },
        },
        vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: `
      uniform vec3 rockColor;
      uniform vec3 treeColor;
      uniform vec3 snowColor;
      uniform vec3 atmosphereColor;
      uniform float atmosphereStrength;
      uniform float snowLineHeight;
      uniform float treeLineHeight;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      // Stable world-space noise with smooth interpolation (no jitter, no pixelation)
      float hash3(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }

      // Smooth 3D noise using trilinear interpolation
      float smoothNoise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        // Smooth interpolation curve (cubic Hermite)
        vec3 u = f * f * (3.0 - 2.0 * f);
        
        // Sample 8 corners of the cube
        float n000 = hash3(i);
        float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
        
        // Trilinear interpolation
        float nx00 = mix(n000, n100, u.x);
        float nx10 = mix(n010, n110, u.x);
        float nx01 = mix(n001, n101, u.x);
        float nx11 = mix(n011, n111, u.x);
        float nxy0 = mix(nx00, nx10, u.y);
        float nxy1 = mix(nx01, nx11, u.y);
        return mix(nxy0, nxy1, u.z);
      }

      void main() {
        float h = vUv.y; // Normalized height 0-1
        vec3 color;

        // Smooth world-space noise for stable texture variation
        // Higher frequency = finer detail (mountains are at radius ~300)
        float worldNoise = smoothNoise3D(vWorldPos * 3.0) * 0.08;

        // Height thresholds with subtle world-space variation
        float snowLine = snowLineHeight + worldNoise;
        float treeLine = treeLineHeight + worldNoise * 0.5;

        if (h > snowLine) {
          // Snow cap with gradient and subtle world-space texture
          float snowBlend = smoothstep(snowLine, snowLine + 0.12, h);
          // Add slight blue tint to shadowed snow areas
          vec3 shadowedSnow = mix(snowColor, snowColor * vec3(0.9, 0.95, 1.0), 0.3);
          color = mix(rockColor, mix(shadowedSnow, snowColor, snowBlend), snowBlend);
        } else if (h > treeLine) {
          // Rocky area with smooth world-space texture variation
          float rockBlend = smoothstep(treeLine, treeLine + 0.08, h);
          vec3 variedRock = rockColor * (0.9 + smoothNoise3D(vWorldPos * 2.0) * 0.2);
          color = mix(treeColor, variedRock, rockBlend);
        } else {
          // Tree line at base with smooth world-space texture variation
          color = treeColor * (0.85 + smoothNoise3D(vWorldPos * 1.5) * 0.3);
        }

        // ATMOSPHERIC PERSPECTIVE (Rayleigh scattering simulation)
        // Distant objects shift toward atmosphere color (blue during day)
        // Multi-channel fog: red fades fastest, blue slowest
        vec3 atmosphereMix = mix(color, atmosphereColor, atmosphereStrength);

        // Apply different fog rates per channel (warm colors fade first)
        float redFog = atmosphereStrength * 1.2;
        float greenFog = atmosphereStrength * 1.0;
        float blueFog = atmosphereStrength * 0.8;

        color.r = mix(color.r, atmosphereColor.r, clamp(redFog, 0.0, 1.0));
        color.g = mix(color.g, atmosphereColor.g, clamp(greenFog, 0.0, 1.0));
        color.b = mix(color.b, atmosphereColor.b, clamp(blueFog, 0.0, 1.0));

        // Smooth gradient fade at peaks (natural horizon blend)
        float peakFade = 1.0 - smoothstep(0.7, 0.95, h);

        // Also fade at very bottom to blend with ground
        float baseFade = smoothstep(0.0, 0.08, h);

        gl_FragColor = vec4(color, opacity * peakFade * baseFade);
      }
    `,
      }),
      // Only depend on static properties - colors are updated via useEffect above
      [snowLineHeight, treeLineHeight]
    );

    return (
      <mesh geometry={geometry} frustumCulled={false} renderOrder={renderOrder}>
        <shaderMaterial
          ref={materialRef}
          {...shaderMaterial}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    );
  }
);

// Create a single horizon layer mesh with smooth top fade
const HorizonLayer: React.FC<{
  radius: number;
  baseY: number;
  heights: number[];
  color: string;
  opacity: number;
  renderOrder?: number;
}> = React.memo(({ radius, baseY, heights, color, opacity, renderOrder = -900 }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Register layer color with animation manager
  useEffect(() => {
    if (materialRef.current) {
      registerLayerColor(`layer-${radius}`, {
        material: materialRef.current,
        layerColor: color,
        opacity,
      });
      return () => unregisterLayerColor(`layer-${radius}`);
    }
  }, [radius, color, opacity]);

  // Direct uniform update to ensure layer colors stay in sync with game time
  useEffect(() => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.layerColor.value.set(color);
      materialRef.current.uniforms.opacity.value = opacity;
    }
  }, [color, opacity]);

  const geometry = useMemo(() => {
    const segments = heights.length - 1;
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const maxHeight = Math.max(...heights);

    // Create vertices for the silhouette ring
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const h = heights[i % heights.length];

      // Bottom vertex (at base)
      positions.push(x, baseY, z);
      uvs.push(i / segments, 0);
      // Top vertex (at height)
      positions.push(x, baseY + h, z);
      uvs.push(i / segments, h / maxHeight);
    }

    // Create faces
    for (let i = 0; i < segments; i++) {
      const bl = i * 2;
      const br = (i + 1) * 2;
      const tl = i * 2 + 1;
      const tr = (i + 1) * 2 + 1;

      // Two triangles per quad (facing inward)
      indices.push(bl, tl, br);
      indices.push(br, tl, tr);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [radius, baseY, heights]);

  const shaderMaterial = useMemo(
    () => ({
      uniforms: {
        layerColor: { value: new THREE.Color(color) },
        opacity: { value: opacity },
      },
      vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      uniform vec3 layerColor;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      
      // Hash function for procedural noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      // 2D noise function
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      
      // FBM for multi-scale variation
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }
      
      void main() {
        // Use world position for stable noise (no swimming when camera moves)
        vec2 noiseCoord = vWorldPos.xz * 0.008;
        
        // Multi-scale noise for terrain variation
        float largeScale = fbm(noiseCoord * 0.5) * 0.15;
        float mediumScale = fbm(noiseCoord * 2.0) * 0.08;
        float fineDetail = noise(noiseCoord * 8.0) * 0.05;
        
        // Combine noise layers for color variation
        float variation = largeScale + mediumScale + fineDetail - 0.14;
        
        // Create subtle color modulation (darker/lighter patches)
        vec3 color = layerColor * (1.0 + variation);
        
        // Add slight color shift for grass/foliage feel
        color.g += variation * 0.08; // Greener in lighter areas
        color.r -= variation * 0.03; // Less red
        
        // Smooth fade at the peaks to blend into sky
        float peakFade = 1.0 - smoothstep(0.6, 1.0, vUv.y);
        
        gl_FragColor = vec4(color, opacity * peakFade);
      }
    `,
    }),
    // Empty dependencies - colors are updated via useEffect above
    []
  );

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={renderOrder}>
      <shaderMaterial
        ref={materialRef}
        {...shaderMaterial}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
});

// Animated water surface component
const DistantWater: React.FC<{
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  baseY: number;
  waterColor: string;
  reflectionColor: string;
  renderOrder?: number;
}> = React.memo(
  ({
    startAngle,
    endAngle,
    innerRadius,
    outerRadius,
    baseY,
    waterColor,
    reflectionColor,
    renderOrder = -600,
  }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    // Custom shader for animated water with flowing effects
    const waterShader = useMemo(
      () => ({
        uniforms: {
          time: { value: 0 },
          waterColor: { value: new THREE.Color(waterColor) },
          reflectionColor: { value: new THREE.Color(reflectionColor) },
        },
        vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        uniform float time;

        void main() {
          vUv = uv;
          vPosition = position;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;

          // Multi-layered wave displacement for more natural movement
          vec3 pos = position;
          float wave = sin(pos.x * 0.04 + time * 0.8) * 0.4;
          wave += sin(pos.z * 0.06 + time * 0.6) * 0.3;
          wave += sin((pos.x + pos.z) * 0.03 + time * 1.2) * 0.25;
          wave += sin(pos.x * 0.12 - time * 1.5) * 0.15; // Counter-flow ripples
          pos.y += wave;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
        fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 reflectionColor;
        uniform float time;
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        // Noise function for organic patterns
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          // Flowing UV distortion - water moves in a direction
          vec2 flowUV = vWorldPosition.xz * 0.02;
          flowUV.x += time * 0.15; // Flow direction
          flowUV.y += sin(time * 0.3 + vWorldPosition.x * 0.05) * 0.1;

          // Multi-layer ripple patterns
          float ripple1 = sin(vWorldPosition.x * 0.08 + vWorldPosition.z * 0.06 + time * 1.8) * 0.5 + 0.5;
          float ripple2 = sin(vWorldPosition.x * 0.12 - time * 2.2 + vWorldPosition.z * 0.1) * 0.5 + 0.5;
          float ripple3 = sin((vWorldPosition.x + vWorldPosition.z) * 0.15 + time * 1.4) * 0.5 + 0.5;

          // Combine ripples with varying weights
          float ripples = ripple1 * 0.4 + ripple2 * 0.35 + ripple3 * 0.25;

          // Caustic-like light patterns
          float caustic1 = noise(flowUV * 8.0 + time * 0.5);
          float caustic2 = noise(flowUV * 12.0 - time * 0.7);
          float caustics = (caustic1 + caustic2) * 0.5;
          caustics = pow(caustics, 1.5) * 1.2;

          // Dynamic shimmer based on view angle simulation
          float shimmer = ripples * caustics;
          shimmer = smoothstep(0.2, 0.8, shimmer);

          // Color mixing - base water with reflection highlights
          vec3 color = waterColor;
          color = mix(color, reflectionColor, shimmer * 0.4);

          // Add bright reflection streaks
          float streak = pow(ripple1 * ripple2, 4.0);
          color += reflectionColor * streak * 0.6;

          // Sparkle highlights on wave peaks
          float sparkle = pow(max(ripples, caustics), 12.0);
          color += vec3(1.0, 0.98, 0.95) * sparkle * 0.8;

          // Subtle color variation for depth
          float depthVar = noise(vWorldPosition.xz * 0.01 + time * 0.1);
          color = mix(color, color * 0.85, depthVar * 0.3);

          // Fade at edges
          float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          float radialFade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);

          gl_FragColor = vec4(color, 0.88 * edgeFade * radialFade);
        }
      `,
      }),
      // Empty dependencies - colors are updated via useEffect below
      []
    );

    // Register water with animation manager
    useEffect(() => {
      if (materialRef.current) {
        registerWater(`water-${startAngle}`, {
          material: materialRef.current,
        });
        return () => unregisterWater(`water-${startAngle}`);
      }
    }, [startAngle]);

    // Direct uniform update to ensure water colors stay in sync with game time
    useEffect(() => {
      if (materialRef.current?.uniforms) {
        materialRef.current.uniforms.waterColor.value.set(waterColor);
        materialRef.current.uniforms.reflectionColor.value.set(reflectionColor);
      }
    }, [waterColor, reflectionColor]);

    // Create water segment geometry
    const geometry = useMemo(() => {
      const segments = 64;
      const geo = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const angleSpan = endAngle - startAngle;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + t * angleSpan;

        // Inner edge
        positions.push(Math.cos(angle) * innerRadius, baseY, Math.sin(angle) * innerRadius);
        uvs.push(t, 0);

        // Outer edge
        positions.push(Math.cos(angle) * outerRadius, baseY, Math.sin(angle) * outerRadius);
        uvs.push(t, 1);
      }

      for (let i = 0; i < segments; i++) {
        const bl = i * 2;
        const br = (i + 1) * 2;
        const tl = i * 2 + 1;
        const tr = (i + 1) * 2 + 1;

        indices.push(bl, br, tl);
        indices.push(br, tr, tl);
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);

      return geo;
    }, [startAngle, endAngle, innerRadius, outerRadius, baseY]);

    return (
      <mesh ref={meshRef} geometry={geometry} frustumCulled={false} renderOrder={renderOrder}>
        <shaderMaterial
          ref={materialRef}
          {...waterShader}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    );
  }
);

export const HorizonRing: React.FC = () => {
  // Determine if it's night or dusk for city lights
  // Use day palette as default
  const { layerColors, waterColors, mountainColors, atmosphereColor, cityColors } = dayPalette;

  const isNight = false;
  // const isDusk = false; // Unused
  const showCityLights = false;

  // Generate different mountain profiles for each layer using FBM
  // Far mountains: tallest, most dramatic peaks
  const farMountains = useMemo(() => generateMountainProfile(360, 192, 35, 70, 1.0, 42), []);
  // Mid mountains: medium height
  const midMountains = useMemo(() => generateMountainProfile(360, 192, 25, 50, 1.5, 137), []);
  // Near hills: lower, more rolling
  const nearHills = useMemo(() => generateMountainProfile(360, 192, 15, 35, 2.0, 891), []);
  // Ground treeline: gentle undulation
  const groundLevel = useMemo(() => generateMountainProfile(360, 128, 6, 15, 3.0, 2023), []);

  // Generate city skyline with building variety
  const citySkylineData = useMemo(() => generateCitySkyline(96, 8, 40, 0.5, 7777), []);
  const citySkyline = citySkylineData.heights;

  return (
    <group>
      {/* Far mountains - tallest with heavy atmospheric perspective */}
      <SnowCappedMountainLayer
        radius={320}
        baseY={-5}
        heights={farMountains}
        snowLineHeight={0.65}
        treeLineHeight={0.25}
        rockColor={mountainColors.rock}
        treeColor={mountainColors.tree}
        snowColor={mountainColors.snow}
        atmosphereColor={atmosphereColor}
        atmosphereStrength={0.6} // Heavy atmospheric haze for distant mountains
        opacity={0.9}
        renderOrder={-950}
      />

      {/* Mid mountains - medium atmospheric perspective */}
      <SnowCappedMountainLayer
        radius={300}
        baseY={-3}
        heights={midMountains}
        snowLineHeight={0.7}
        treeLineHeight={0.3}
        rockColor={mountainColors.rock}
        treeColor={mountainColors.tree}
        snowColor={mountainColors.snow}
        atmosphereColor={atmosphereColor}
        atmosphereStrength={0.35} // Medium haze
        opacity={0.95}
        renderOrder={-900}
      />

      {/* Near hills - light atmospheric perspective, more forested */}
      <SnowCappedMountainLayer
        radius={280}
        baseY={-2}
        heights={nearHills}
        snowLineHeight={0.85}
        treeLineHeight={0.2}
        rockColor={mountainColors.rock}
        treeColor={mountainColors.tree}
        snowColor={mountainColors.snow}
        atmosphereColor={atmosphereColor}
        atmosphereStrength={0.15} // Light haze - clearer closer mountains
        opacity={1.0}
        renderOrder={-850}
      />

      {/* Ground/treeline (closest - all forest) */}
      <HorizonLayer
        radius={260}
        baseY={-1}
        heights={groundLevel}
        color={layerColors.ground}
        opacity={1.0}
        renderOrder={-800}
      />

      {/* Distant city skyline - positioned in one sector with procedural windows */}
      <CitySkylineLayer
        startAngle={Math.PI * 1.65}
        endAngle={Math.PI * 1.95}
        radius={275}
        baseY={-2}
        heights={citySkyline}
        buildingColor={cityColors.building}
        windowLightColor={cityColors.windowLight}
        isNight={showCityLights}
        time={0}
        renderOrder={-700}
      />

      {/* City lights at night */}
      <CityLights
        startAngle={Math.PI * 1.65}
        endAngle={Math.PI * 1.95}
        radius={275}
        baseY={-2}
        isNight={isNight}
      />

      {/* Distant lake - positioned in a valley between mountains */}
      <DistantWater
        startAngle={Math.PI * 0.15}
        endAngle={Math.PI * 0.45}
        innerRadius={270}
        outerRadius={310}
        baseY={-3}
        waterColor={waterColors.water}
        reflectionColor={waterColors.reflection}
        renderOrder={-650}
      />

      {/* Ocean/sea on opposite side */}
      <DistantWater
        startAngle={Math.PI * 1.1}
        endAngle={Math.PI * 1.6}
        innerRadius={265}
        outerRadius={340}
        baseY={-4}
        waterColor={waterColors.water}
        reflectionColor={waterColors.reflection}
        renderOrder={-650}
      />

      {/* Small river/inlet */}
      <DistantWater
        startAngle={Math.PI * 0.7}
        endAngle={Math.PI * 0.85}
        innerRadius={260}
        outerRadius={290}
        baseY={-2}
        waterColor={waterColors.water}
        reflectionColor={waterColors.reflection}
        renderOrder={-600}
      />

      {/* Solid ground plane below horizon */}
      <mesh
        position={[0, -1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        frustumCulled={false}
        renderOrder={-750}
      >
        <ringGeometry args={[0, 260, 64]} />
        <meshBasicMaterial color={layerColors.ground} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};
