/**
 * Edge Highlight Shader
 *
 * Highlights edges on box geometry for a CAD/holographic appearance.
 * Works best with normalized box geometry (unit cube scaled up).
 */
import * as THREE from 'three';

export interface EdgeHighlightMaterialOptions {
  baseColor: string;
  edgeColor: string;
  edgeWidth?: number;
  metalness?: number;
}

/**
 * Create an edge highlight material for box geometry
 */
export const createEdgeHighlightMaterial = (
  options: EdgeHighlightMaterialOptions
): THREE.ShaderMaterial => {
  const { baseColor, edgeColor, edgeWidth = 0.02, metalness = 0.7 } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      edgeColor: { value: new THREE.Color(edgeColor) },
      edgeWidth: { value: edgeWidth },
      metalness: { value: metalness },
      lightDirection: { value: new THREE.Vector3(1, 1, 0.5).normalize() },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;

      void main() {
        vPosition = position;
        vNormal = normal;
        vWorldNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 edgeColor;
      uniform float edgeWidth;
      uniform float metalness;
      uniform vec3 lightDirection;

      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;

      void main() {
        // Detect edges based on position relative to unit cube
        vec3 absPos = abs(vPosition);
        vec3 edgeDist = vec3(0.5) - absPos;  // Distance from edge (0.5 is half-size of unit cube)

        // Minimum distance to any edge
        float minEdge = min(min(edgeDist.x, edgeDist.y), edgeDist.z);
        float edgeFactor = 1.0 - smoothstep(0.0, edgeWidth, minEdge);

        // Basic lighting
        float diffuse = max(dot(vWorldNormal, lightDirection), 0.0);
        float ambient = 0.35;
        float lighting = ambient + diffuse * 0.65;

        // Apply metalness
        vec3 metalBase = baseColor * (1.0 + metalness * 0.15);

        // Mix base with edge highlight
        vec3 finalColor = mix(metalBase, edgeColor, edgeFactor * 0.7);
        finalColor *= lighting;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
};

/**
 * Factory for creating edge-highlighted panel material
 */
export const createPanelMaterial = (baseColor: string, edgeColor: string): THREE.ShaderMaterial => {
  return createEdgeHighlightMaterial({
    baseColor,
    edgeColor,
    edgeWidth: 0.03,
    metalness: 0.6,
  });
};
