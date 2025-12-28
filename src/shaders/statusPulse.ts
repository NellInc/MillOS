/**
 * Status Pulse Shader
 *
 * Creates a pulsing/breathing glow effect for status indicators.
 * Pulse speed and intensity vary by machine status.
 */
import * as THREE from 'three';

export interface StatusPulseMaterialOptions {
  statusColor: string;
  pulseSpeed?: number;
  pulseIntensity?: number;
  baseIntensity?: number;
}

/**
 * Create a status pulse material for status indicators
 */
export const createStatusPulseMaterial = (
  options: StatusPulseMaterialOptions
): THREE.ShaderMaterial => {
  const { statusColor, pulseSpeed = 2.0, pulseIntensity = 0.3, baseIntensity = 1.0 } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      statusColor: { value: new THREE.Color(statusColor) },
      time: { value: 0 },
      pulseSpeed: { value: pulseSpeed },
      pulseIntensity: { value: pulseIntensity },
      baseIntensity: { value: baseIntensity },
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 statusColor;
      uniform float time;
      uniform float pulseSpeed;
      uniform float pulseIntensity;
      uniform float baseIntensity;

      void main() {
        // Smooth sine wave pulse
        float pulse = sin(time * pulseSpeed) * 0.5 + 0.5;

        // Apply pulse to intensity
        float intensity = baseIntensity + pulse * pulseIntensity;

        // Output with slight HDR for bloom pickup
        gl_FragColor = vec4(statusColor * intensity, 1.0);
      }
    `,
    transparent: false,
  });
};

/**
 * Update time uniform on status materials
 * Call this from useFrame
 */
export const updateStatusMaterialTime = (material: THREE.ShaderMaterial, time: number): void => {
  if (material.uniforms.time) {
    material.uniforms.time.value = time;
  }
};

/**
 * Update status color on existing material
 */
export const updateStatusMaterialColor = (
  material: THREE.ShaderMaterial,
  color: string,
  pulseSpeed: number,
  intensity: number
): void => {
  if (material.uniforms.statusColor) {
    material.uniforms.statusColor.value.set(color);
  }
  if (material.uniforms.pulseSpeed) {
    material.uniforms.pulseSpeed.value = pulseSpeed;
  }
  if (material.uniforms.baseIntensity) {
    material.uniforms.baseIntensity.value = intensity;
  }
};
