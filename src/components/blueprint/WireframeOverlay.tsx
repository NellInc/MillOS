/**
 * WireframeOverlay Component
 *
 * Applies wireframe rendering to all scene meshes in Blueprint Mode.
 * Uses scene traversal to toggle wireframe property on materials.
 * Also adds a holographic grid and scan-line effect.
 */
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../utils/digitalTwinPalette';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

interface WireframeOverlayProps {
  transition: number;
}

// Store original material states for restoration
interface MaterialState {
  wireframe: boolean;
  opacity: number;
  transparent: boolean;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
}

const originalStates = new Map<THREE.Material, MaterialState>();

// Hoisted to avoid per-frame allocation inside applyWireframeToScene's
// transitioning branch (called from useFrame across every scene material).
const BLUEPRINT_EMISSIVE = new THREE.Color(0x38bdf8);

/**
 * Traverse scene and apply wireframe effect to all meshes
 */
function applyWireframeToScene(scene: THREE.Scene, transition: number) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach((mat) => {
        if (!mat || mat.type === 'ShaderMaterial' || mat.type === 'RawShaderMaterial') return;

        // Store original state on first encounter
        if (!originalStates.has(mat)) {
          originalStates.set(mat, {
            wireframe: (mat as THREE.MeshBasicMaterial).wireframe ?? false,
            opacity: mat.opacity,
            transparent: mat.transparent,
            emissive: (mat as THREE.MeshStandardMaterial).emissive?.clone(),
            emissiveIntensity: (mat as THREE.MeshStandardMaterial).emissiveIntensity,
          });
        }

        const original = originalStates.get(mat)!;

        // Apply wireframe based on transition
        if (transition > 0.5) {
          // Blueprint mode active
          if ('wireframe' in mat) {
            (mat as THREE.MeshBasicMaterial).wireframe = true;
          }
          mat.transparent = true;
          mat.opacity = Math.max(0.3, original.opacity * (1 - transition * 0.5));
          mat.needsUpdate = true;

          // Add cyan emissive glow for "data" aesthetic
          if ('emissive' in mat && mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(0x38bdf8);
            mat.emissiveIntensity = transition * 0.3;
          }
        } else if (transition < 0.01) {
          // Fully restored
          if ('wireframe' in mat) {
            (mat as THREE.MeshBasicMaterial).wireframe = original.wireframe;
          }
          mat.opacity = original.opacity;
          mat.transparent = original.transparent;
          mat.needsUpdate = true;

          if ('emissive' in mat && mat instanceof THREE.MeshStandardMaterial && original.emissive) {
            mat.emissive.copy(original.emissive);
            mat.emissiveIntensity = original.emissiveIntensity ?? 0;
          }
        } else {
          // Transitioning - blend between states
          if ('wireframe' in mat) {
            (mat as THREE.MeshBasicMaterial).wireframe = transition > 0.3;
          }
          const blendedOpacity = original.opacity * (1 - transition * 0.5) + 0.3 * transition;
          mat.opacity = blendedOpacity;
          mat.transparent = true;
          mat.needsUpdate = true;

          if ('emissive' in mat && mat instanceof THREE.MeshStandardMaterial) {
            if (original.emissive) {
              mat.emissive.lerpColors(original.emissive, BLUEPRINT_EMISSIVE, transition);
            } else {
              mat.emissive.setHex(0x38bdf8);
            }
            mat.emissiveIntensity = (original.emissiveIntensity ?? 0) + transition * 0.3;
          }
        }
      });
    }
  });
}

/**
 * Restore all materials to original state
 */
function restoreScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach((mat) => {
        const original = originalStates.get(mat);
        if (original) {
          if ('wireframe' in mat) {
            (mat as THREE.MeshBasicMaterial).wireframe = original.wireframe;
          }
          mat.opacity = original.opacity;
          mat.transparent = original.transparent;

          if ('emissive' in mat && mat instanceof THREE.MeshStandardMaterial && original.emissive) {
            mat.emissive.copy(original.emissive);
            mat.emissiveIntensity = original.emissiveIntensity ?? 0;
          }
          mat.needsUpdate = true;
        }
      });
    }
  });
}

// Custom shader for floor grid overlay
const gridVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const gridFragmentShader = `
  uniform float time;
  uniform float transition;
  uniform vec3 gridColor;
  uniform vec3 scanColor;
  
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  void main() {
    // Grid pattern
    float gridSize = 5.0;
    vec2 grid = abs(fract(vWorldPosition.xz / gridSize - 0.5) - 0.5) / fwidth(vWorldPosition.xz / gridSize);
    float line = min(grid.x, grid.y);
    float gridLine = 1.0 - min(line, 1.0);
    
    // Moving scan line effect
    float scanSpeed = 0.3;
    float scanWidth = 40.0;
    float scanPos = mod(time * scanSpeed * 100.0, 200.0) - 100.0;
    float scanDist = abs(vWorldPosition.z - scanPos);
    float scanLine = smoothstep(scanWidth, 0.0, scanDist) * 0.5;
    
    // Combine effects
    vec3 color = mix(gridColor, scanColor, scanLine);
    float alpha = (gridLine * 0.4 + scanLine * 0.5) * transition;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

export const WireframeOverlay: React.FC<WireframeOverlayProps> = ({ transition }) => {
  const { scene } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const lastTransitionRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      transition: { value: 0 },
      gridColor: { value: new THREE.Color(PALETTE.data.grid) },
      scanColor: { value: new THREE.Color(PALETTE.glow.cool) },
    }),
    []
  );

  // Apply wireframe effect to scene based on transition
  useFrame((state) => {
    // Update grid shader
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.transition.value = transition;
    }

    // Only update scene materials when transition changes significantly
    if (Math.abs(transition - lastTransitionRef.current) > 0.02) {
      applyWireframeToScene(scene, transition);
      lastTransitionRef.current = transition;
    }
  });

  // Cleanup: restore scene when unmounting or fully transitioned out
  useEffect(() => {
    return () => {
      restoreScene(scene);
      originalStates.clear();
    };
  }, [scene]);

  // Restore when transition hits zero
  useEffect(() => {
    if (transition < 0.01) {
      restoreScene(scene);
    }
  }, [transition, scene]);

  if (transition < 0.01) return null;

  return (
    <mesh
      position={[0, FLOOR_LAYERS.grid, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorText}
    >
      <planeGeometry args={[200, 200, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={gridVertexShader}
        fragmentShader={gridFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

export default WireframeOverlay;
