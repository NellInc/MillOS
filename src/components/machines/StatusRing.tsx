/**
 * StatusRing Component
 *
 * Animated status ring at machine base that indicates operational status.
 * Uses shader-based animation for performance.
 */
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getStatusColor, getPulseSpeed, getGlowIntensity } from '../../utils/digitalTwinPalette';
import { INDICATOR_HEIGHTS, POLYGON_OFFSET } from '../../constants/renderLayers';

export type StatusType = 'running' | 'idle' | 'warning' | 'critical' | 'maintenance';

interface StatusRingProps {
  status: StatusType;
  radius: number;
  position: [number, number, number];
  /** Optional: disable animation for performance */
  static?: boolean;
}

/**
 * Create the status ring shader material
 */
const createStatusRingMaterial = (color: string, opacity: number): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
      opacity: { value: opacity },
      pulseSpeed: { value: 2.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float opacity;
      uniform float pulseSpeed;
      varying vec2 vUv;

      void main() {
        // Ring shape
        float dist = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.75, 0.8, dist) * (1.0 - smoothstep(0.95, 1.0, dist));

        // Animated pulse
        float pulse = sin(time * pulseSpeed) * 0.2 + 0.8;

        // Rotating highlight
        float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
        float highlight = sin(angle * 2.0 + time * 2.0) * 0.3 + 0.7;

        float alpha = ring * opacity * pulse * highlight;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.moderate.factor,
    polygonOffsetUnits: POLYGON_OFFSET.moderate.units,
  });
};

export const StatusRing: React.FC<StatusRingProps> = ({
  status,
  radius,
  position,
  static: isStatic = false,
}) => {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const color = getStatusColor(status);
  const pulseSpeed = getPulseSpeed(status);
  const glowIntensity = getGlowIntensity(status);
  const opacity = status === 'idle' ? 0.3 : glowIntensity * 0.6;

  // Create the ShaderMaterial exactly ONCE. The status-change effect below
  // already keeps color/opacity/pulseSpeed uniforms in sync in place, so
  // recreating the material on every status transition (the old
  // [color, opacity, pulseSpeed] deps) only leaked the previous material's
  // GPU program - accumulating across all machines as statuses cycle.
  const material = useMemo(() => {
    const mat = createStatusRingMaterial(color, opacity);
    mat.uniforms.pulseSpeed.value = pulseSpeed;
    materialRef.current = mat;
    return mat;
  }, []);

  // Dispose the material on unmount
  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // Update time uniform for animation
  useFrame((state) => {
    if (!isStatic && materialRef.current?.uniforms.time) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  // Update uniforms when status changes
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.color.value.set(color);
      materialRef.current.uniforms.opacity.value = opacity;
      materialRef.current.uniforms.pulseSpeed.value = pulseSpeed;
    }
  }, [color, opacity, pulseSpeed]);

  const floorRotation = useMemo<[number, number, number]>(() => [-Math.PI / 2, 0, 0], []);
  const ringPosition = useMemo<[number, number, number]>(
    () => [position[0], INDICATOR_HEIGHTS.machineRing, position[2]],
    [position]
  );

  return (
    <mesh position={ringPosition} rotation={floorRotation} material={material}>
      <planeGeometry args={[radius * 2.5, radius * 2.5]} />
    </mesh>
  );
};

/**
 * Memoized version for lists
 */
export const MemoizedStatusRing = React.memo(StatusRing);
