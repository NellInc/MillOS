/**
 * Mood Aura Shader
 *
 * Creates a subtle colored glow on the ground beneath workers
 * that indicates their emotional state.
 *
 * Features:
 * - Soft radial gradient
 * - Breathing animation (speed affected by energy)
 * - Subtle shimmer effect
 * - Additive blending for glowing appearance
 */

import * as THREE from 'three';

/**
 * Create a new mood aura shader material
 * Each worker gets their own instance for independent uniform updates
 */
export const createMoodAuraMaterial = (): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    uniforms: {
      moodColor: { value: new THREE.Color('#10b981') },
      intensity: { value: 0.5 },
      time: { value: 0.0 },
      energy: { value: 0.8 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 moodColor;
      uniform float intensity;
      uniform float time;
      uniform float energy;

      varying vec2 vUv;

      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0;

        // Soft radial gradient - falls off smoothly from center
        float aura = 1.0 - smoothstep(0.0, 1.0, dist);
        aura = pow(aura, 2.0); // More concentrated in center

        // Breathing animation - speed affected by energy
        // Tired workers breathe slower
        float breathRate = 1.0 + (1.0 - energy) * 0.5;
        float breath = sin(time * breathRate) * 0.15 + 0.85;

        // Subtle shimmer for life-like quality
        float shimmer = sin(time * 3.0 + dist * 10.0) * 0.05 + 0.95;

        // Final alpha with all effects combined
        // Cap at 0.4 to keep it subtle
        float alpha = aura * intensity * breath * shimmer * 0.4;

        gl_FragColor = vec4(moodColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
};

/**
 * Shared geometry for all mood auras
 * Reused across all workers to reduce memory
 */
let sharedAuraGeometry: THREE.PlaneGeometry | null = null;

export const getSharedAuraGeometry = (): THREE.PlaneGeometry => {
  if (!sharedAuraGeometry) {
    sharedAuraGeometry = new THREE.PlaneGeometry(3, 3);
  }
  return sharedAuraGeometry;
};
