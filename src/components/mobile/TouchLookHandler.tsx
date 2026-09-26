import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { ORBIT_POLAR_LIMITS } from '../../utils/cameraNavigation';

// Reusable offset so a drag does not allocate a Vector3 per touchmove.
const _offset = new THREE.Vector3();

interface TouchLookHandlerProps {
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
  sensitivity?: number;
}

/**
 * React Three Fiber component that handles touch gestures on the canvas.
 * - Single-finger drag: rotates the camera view (orbit)
 * - Two fingers: left to OrbitControls, which owns dolly and pan and applies
 *   the orbit rig's distance limits. A second pinch here double-zoomed.
 * This is a behavior-only component that returns null.
 */
export const TouchLookHandler: React.FC<TouchLookHandlerProps> = ({
  orbitControlsRef,
  sensitivity = 0.004,
}) => {
  const { gl, camera } = useThree();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const setIsTouchLooking = useMobileControlStore((s) => s.setIsTouchLooking);

  useEffect(() => {
    const canvas = gl.domElement;
    const TOUCH_THROTTLE_MS = 16; // ~60fps

    const handleTouchStart = (e: TouchEvent) => {
      // Check if touch started on a UI element
      const target = e.target as HTMLElement;
      if (target.closest('.pointer-events-auto')) return;

      // No preventDefault here: cancelling touchstart suppresses the
      // synthesized click that R3F onClick (forklifts, props) listens for.
      // OrbitControls already sets touch-action: none on the canvas.

      // Use targetTouches to only count touches on this element (canvas)
      // This allows D-pad and look to work simultaneously
      if (e.targetTouches.length === 1) {
        // Single touch on canvas - start look/drag
        touchStartRef.current = {
          x: e.targetTouches[0].clientX,
          y: e.targetTouches[0].clientY,
        };
        setIsTouchLooking(true);
      } else if (e.targetTouches.length === 2) {
        // Two fingers belong to OrbitControls. Drop the single-finger drag so
        // lifting one finger does not resume look from a stale start point.
        touchStartRef.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Throttle touch events for performance
      const now = Date.now();
      if (now - lastTouchTimeRef.current < TOUCH_THROTTLE_MS) return;
      lastTouchTimeRef.current = now;

      e.preventDefault();

      // Handle single-finger drag (look) - use targetTouches for simultaneous D-pad + look
      if (!touchStartRef.current || e.targetTouches.length !== 1) return;

      const deltaX = e.targetTouches[0].clientX - touchStartRef.current.x;
      const deltaY = e.targetTouches[0].clientY - touchStartRef.current.y;

      // Apply rotation by manipulating camera position around target
      const controls = orbitControlsRef.current;
      if (controls) {
        const target = controls.target;
        const offset = _offset.copy(camera.position).sub(target);

        // Convert to spherical coordinates
        const radius = offset.length();
        let theta = Math.atan2(offset.x, offset.z); // azimuthal angle
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))); // polar angle

        // Apply rotation (deltaX rotates horizontally, deltaY rotates vertically)
        theta -= deltaX * sensitivity;
        phi += deltaY * sensitivity;

        // Same limits as the orbit rig and the D-pad look, so the first drag
        // from a low preset does not snap the camera upward.
        phi = Math.max(ORBIT_POLAR_LIMITS.min, Math.min(ORBIT_POLAR_LIMITS.max, phi));

        // Convert back to cartesian
        offset.x = radius * Math.sin(phi) * Math.sin(theta);
        offset.y = radius * Math.cos(phi);
        offset.z = radius * Math.sin(phi) * Math.cos(theta);

        camera.position.copy(target).add(offset);
        camera.lookAt(target);
      }

      // Update start position for continuous drag
      touchStartRef.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Only end look state if all touches are released
      if (e.touches.length === 0) {
        touchStartRef.current = null;
        setIsTouchLooking(false);
      }
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      setIsTouchLooking(false);
    };

    // Add event listeners with passive: false to allow preventDefault
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [gl, camera, orbitControlsRef, sensitivity, setIsTouchLooking]);

  // This is a behavior-only component
  return null;
};
