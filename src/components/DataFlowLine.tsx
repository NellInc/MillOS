/**
 * DataFlowLine Component
 *
 * Animated data flow lines between connected machines.
 * Shows material/data flow with animated dashed lines.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../utils/digitalTwinPalette';

interface DataFlowLineProps {
  start: [number, number, number];
  end: [number, number, number];
  /** Whether flow is active */
  active?: boolean;
  /** Custom flow color */
  color?: string;
  /** Number of dashes in the line */
  segments?: number;
}

/**
 * Create the data flow line shader material
 */
const createDataFlowMaterial = (color: string, active: boolean): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
      flowActive: { value: active ? 1.0 : 0.3 },
    },
    vertexShader: `
      attribute float lineProgress;
      varying float vProgress;

      void main() {
        vProgress = lineProgress;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float flowActive;

      varying float vProgress;

      void main() {
        // Moving dash pattern
        float dash = fract(vProgress * 10.0 - time * 2.0);
        dash = step(0.5, dash);

        float alpha = dash * flowActive * 0.8;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
};

export const DataFlowLine: React.FC<DataFlowLineProps> = ({
  start,
  end,
  active = true,
  color = PALETTE.data.primary,
  segments = 32,
}) => {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const material = useMemo(() => {
    const mat = createDataFlowMaterial(color, active);
    materialRef.current = mat;
    return mat;
  }, [color, active]);

  // Create line geometry with progress attribute
  const geometry = useMemo(() => {
    // Create curved path between start and end
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

    // Add height to midpoint for arc
    const distance = startVec.distanceTo(endVec);
    midPoint.y += distance * 0.15;

    // Create quadratic bezier curve
    const curve = new THREE.QuadraticBezierCurve3(startVec, midPoint, endVec);
    const points = curve.getPoints(segments);

    const geo = new THREE.BufferGeometry().setFromPoints(points);

    // Add progress attribute for dash animation
    const progress = new Float32Array(segments + 1);
    for (let i = 0; i <= segments; i++) {
      progress[i] = i / segments;
    }
    geo.setAttribute('lineProgress', new THREE.BufferAttribute(progress, 1));

    return geo;
  }, [start, end, segments]);

  // Stable Line identity + disposal. Building `new THREE.Line(...)` inline in
  // the JSX allocated a fresh Line every render (forcing R3F to detach and
  // reattach it), and superseded geometries/materials were never disposed -
  // a GPU leak that grew with every color/active/endpoint change.
  const line = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // Animate time uniform
  useFrame((state) => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.flowActive.value = active ? 1.0 : 0.3;
    }
  });

  // Use primitive element for Three.js Line
  return <primitive object={line} />;
};

/**
 * Memoized version for lists
 */
export const MemoizedDataFlowLine = React.memo(DataFlowLine);
