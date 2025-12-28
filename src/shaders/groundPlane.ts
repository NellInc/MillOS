/**
 * Ground Plane Shader
 *
 * Creates a gradient ground plane with fading grid lines.
 * Provides atmospheric depth by fading to transparent at edges.
 */
import * as THREE from 'three';

export interface GroundPlaneMaterialOptions {
  centerColor: string;
  edgeColor: string;
  gridColor: string;
  fadeDistance?: number;
  gridSize?: number;
  gridWidth?: number;
}

/**
 * Create a ground plane material with gradient and grid
 */
export const createGroundPlaneMaterial = (
  options: GroundPlaneMaterialOptions
): THREE.ShaderMaterial => {
  const {
    centerColor,
    edgeColor,
    gridColor,
    fadeDistance = 80.0,
    gridSize = 5.0,
    gridWidth = 0.02,
  } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: new THREE.Color(centerColor) },
      edgeColor: { value: new THREE.Color(edgeColor) },
      gridColor: { value: new THREE.Color(gridColor) },
      fadeDistance: { value: fadeDistance },
      gridSize: { value: gridSize },
      gridWidth: { value: gridWidth },
    },
    vertexShader: `
      varying vec3 vWorldPos;

      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      uniform vec3 gridColor;
      uniform float fadeDistance;
      uniform float gridSize;
      uniform float gridWidth;

      varying vec3 vWorldPos;

      void main() {
        // Distance from center
        float dist = length(vWorldPos.xz);
        float fadeFactor = smoothstep(0.0, fadeDistance, dist);

        // Base color with distance fade
        vec3 baseColor = mix(centerColor, edgeColor, fadeFactor);

        // Subtle grid
        vec2 grid = abs(fract(vWorldPos.xz / gridSize - 0.5) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, gridWidth, min(grid.x, grid.y));
        gridLine *= (1.0 - fadeFactor); // Fade grid with distance

        // Mix grid lines
        vec3 color = mix(baseColor, gridColor, gridLine * 0.3);

        // Fade to transparent at edges
        float alpha = 1.0 - smoothstep(fadeDistance * 0.8, fadeDistance, dist);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
};

/**
 * Factory for digital twin ground plane
 */
export const createDigitalTwinGround = (): THREE.ShaderMaterial => {
  return createGroundPlaneMaterial({
    centerColor: '#2d3548',
    edgeColor: '#1a1f2e',
    gridColor: '#3d4a5c',
    fadeDistance: 100.0,
    gridSize: 5.0,
    gridWidth: 0.015,
  });
};
