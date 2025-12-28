/**
 * Fresnel Rim Shader
 *
 * Adds a subtle edge glow at grazing angles - makes objects "pop" from background.
 * Part of the digital twin aesthetic for MillOS.
 */
import * as THREE from 'three';

export interface FresnelRimMaterialOptions {
  baseColor: string;
  rimColor: string;
  rimPower?: number;
  metalness?: number;
  roughness?: number;
}

/**
 * Create a fresnel rim glow material
 * @param options Material configuration
 * @returns THREE.ShaderMaterial with fresnel rim effect
 */
export const createFresnelRimMaterial = (
  options: FresnelRimMaterialOptions
): THREE.ShaderMaterial => {
  const { baseColor, rimColor, rimPower = 2.0, metalness = 0.7, roughness = 0.4 } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      rimColor: { value: new THREE.Color(rimColor) },
      rimPower: { value: rimPower },
      metalness: { value: metalness },
      roughness: { value: roughness },
      lightDirection: { value: new THREE.Vector3(1, 1, 0.5).normalize() },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 rimColor;
      uniform float rimPower;
      uniform float metalness;
      uniform float roughness;
      uniform vec3 lightDirection;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        // Fresnel effect - stronger at grazing angles
        float rimFactor = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        rimFactor = pow(rimFactor, rimPower);

        // Basic lighting
        float diffuse = max(dot(vNormal, lightDirection), 0.0);
        float ambient = 0.3;
        float lighting = ambient + diffuse * 0.7;

        // Metalness affects base color brightness
        vec3 metalColor = baseColor * (1.0 + metalness * 0.2);

        // Combine base color with rim glow
        vec3 finalColor = mix(metalColor, rimColor, rimFactor);
        finalColor *= lighting;

        // Add slight emissive from rim
        finalColor += rimColor * rimFactor * 0.3;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
};

/**
 * Factory for machine housing with fresnel rim
 */
export const createMachineHousingMaterial = (
  baseColor: string,
  zoneColor: string
): THREE.ShaderMaterial => {
  return createFresnelRimMaterial({
    baseColor,
    rimColor: zoneColor,
    rimPower: 3.0,
    metalness: 0.8,
    roughness: 0.3,
  });
};
