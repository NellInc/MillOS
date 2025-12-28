/**
 * Panel Grid Shader
 *
 * Adds procedural grid/panel lines to surfaces.
 * Creates an industrial, technical appearance.
 */
import * as THREE from 'three';

export interface PanelGridMaterialOptions {
  baseColor: string;
  lineColor: string;
  gridSize?: number;
  lineWidth?: number;
  metalness?: number;
}

/**
 * Create a panel grid material
 */
export const createPanelGridMaterial = (
  options: PanelGridMaterialOptions
): THREE.ShaderMaterial => {
  const { baseColor, lineColor, gridSize = 2.0, lineWidth = 0.02, metalness = 0.5 } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      lineColor: { value: new THREE.Color(lineColor) },
      gridSize: { value: gridSize },
      lineWidth: { value: lineWidth },
      metalness: { value: metalness },
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
      uniform vec3 lineColor;
      uniform float gridSize;
      uniform float lineWidth;
      uniform float metalness;
      uniform vec3 lightDirection;

      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        // Grid lines based on world position
        vec3 grid = abs(fract(vWorldPos / gridSize - 0.5) - 0.5);
        float minGrid = min(min(grid.x, grid.y), grid.z);
        float lineFactor = 1.0 - smoothstep(0.0, lineWidth, minGrid);

        // Basic lighting
        float diffuse = max(dot(vNormal, lightDirection), 0.0);
        float ambient = 0.35;
        float lighting = ambient + diffuse * 0.65;

        // Apply metalness
        vec3 metalBase = baseColor * (1.0 + metalness * 0.1);

        // Mix base with grid lines
        vec3 color = mix(metalBase, lineColor, lineFactor * 0.5);

        gl_FragColor = vec4(color * lighting, 1.0);
      }
    `,
  });
};

/**
 * Factory for factory wall panel material
 */
export const createWallPanelMaterial = (
  baseColor: string,
  lineColor: string
): THREE.ShaderMaterial => {
  return createPanelGridMaterial({
    baseColor,
    lineColor,
    gridSize: 3.0,
    lineWidth: 0.015,
    metalness: 0.4,
  });
};
