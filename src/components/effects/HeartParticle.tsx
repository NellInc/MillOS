import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { shouldRunThisFrame } from '../../utils/frameThrottle';

const HEART_SHAPE = new THREE.Shape();
HEART_SHAPE.moveTo(0, -0.42);
HEART_SHAPE.bezierCurveTo(-0.62, -0.08, -0.64, 0.48, -0.28, 0.56);
HEART_SHAPE.bezierCurveTo(-0.08, 0.61, 0, 0.48, 0, 0.35);
HEART_SHAPE.bezierCurveTo(0, 0.48, 0.08, 0.61, 0.28, 0.56);
HEART_SHAPE.bezierCurveTo(0.64, 0.48, 0.62, -0.08, 0, -0.42);
const HEART_GEOMETRY = new THREE.ShapeGeometry(HEART_SHAPE, 4);
HEART_GEOMETRY.center();
const HEART_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ef4444',
  side: THREE.DoubleSide,
  toneMapped: false,
});

// Heart particle for petting interaction
export const HeartParticle = React.memo<{
  position: [number, number, number];
  onComplete: () => void;
}>(({ position, onComplete }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ageRef = useRef(0);

  useFrame((_, delta) => {
    // Throttle heart animation to every 2nd frame (~30 FPS)
    const throttle = 2;
    if (!shouldRunThisFrame(throttle)) return;

    // Compensate for skipped frames; cap to avoid jumps on tab refocus
    const cappedDelta = Math.min(delta * throttle, 0.1);

    if (groupRef.current) {
      groupRef.current.position.y += cappedDelta * 1.5; // Float up

      // Lifecycle by SCALE, not opacity: the heart geometry and material are
      // module-level singletons shared by every simultaneous heart, so fading
      // `material.opacity` would fade all of them together (and animating a
      // shared material's opacity per instance is a per-frame material diff).
      // The 1 s here matches the removal timer below.
      ageRef.current = Math.min(1, ageRef.current + cappedDelta);
      const t = ageRef.current;
      const pop = Math.min(1, t / 0.12); // quick pop-in
      const settle = 1 - Math.max(0, (t - 0.6) / 0.4) ** 2; // shrink away
      groupRef.current.scale.setScalar(Math.max(0.001, pop * settle));
    }
  });

  // One removal timer per heart, started on mount. Callers pass an inline
  // `onComplete`, so keying the timer on it restarted every live heart's clock
  // on each parent re-render (including the one that spawns the next heart).
  const onCompleteRef = useRef(onComplete);
  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    const timer = setTimeout(() => onCompleteRef.current(), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <group ref={groupRef} position={position} dispose={null}>
      <Billboard>
        <mesh geometry={HEART_GEOMETRY} material={HEART_MATERIAL} scale={0.48} />
      </Billboard>
    </group>
  );
});
HeartParticle.displayName = 'HeartParticle';
