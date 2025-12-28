/**
 * Procedural Surface Shader
 *
 * Adds subtle noise variation to break up flat surfaces.
 * Creates visual interest without external textures.
 */
import * as THREE from 'three';

export interface ProceduralSurfaceMaterialOptions {
  baseColor: string;
  noiseScale?: number;
  noiseIntensity?: number;
  metalness?: number;
  roughness?: number;
}

/**
 * Create a procedural surface material with noise variation
 */
export const createProceduralSurfaceMaterial = (
  options: ProceduralSurfaceMaterialOptions
): THREE.ShaderMaterial => {
  const {
    baseColor,
    noiseScale = 0.5,
    noiseIntensity = 0.1,
    metalness = 0.6,
    roughness = 0.4,
  } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      noiseScale: { value: noiseScale },
      noiseIntensity: { value: noiseIntensity },
      metalness: { value: metalness },
      roughness: { value: roughness },
      lightDirection: { value: new THREE.Vector3(1, 1, 0.5).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform float noiseScale;
      uniform float noiseIntensity;
      uniform float metalness;
      uniform float roughness;
      uniform vec3 lightDirection;

      varying vec3 vWorldPos;
      varying vec3 vNormal;

      // Simple 3D hash function
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      // 3D noise function
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        // Generate noise based on world position
        float n = noise(vWorldPos * noiseScale);

        // Apply noise as subtle color variation
        vec3 color = baseColor * (1.0 + (n - 0.5) * noiseIntensity);

        // Apply metalness effect
        color = color * (1.0 + metalness * 0.1);

        // Basic lighting
        float diffuse = max(dot(vNormal, lightDirection), 0.0);
        float ambient = 0.35;
        float lighting = ambient + diffuse * 0.65;

        // Apply roughness as slight desaturation at grazing angles
        float fresnel = 1.0 - max(dot(vNormal, normalize(cameraPosition - vWorldPos)), 0.0);
        color = mix(color, color * 0.9, fresnel * roughness * 0.3);

        gl_FragColor = vec4(color * lighting, 1.0);
      }
    `,
  });
};

/**
 * Factory for industrial floor material
 */
export const createFloorMaterial = (baseColor: string): THREE.ShaderMaterial => {
  return createProceduralSurfaceMaterial({
    baseColor,
    noiseScale: 0.3,
    noiseIntensity: 0.08,
    metalness: 0.2,
    roughness: 0.7,
  });
};
