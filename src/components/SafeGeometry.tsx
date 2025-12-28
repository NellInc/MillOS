/**
 * SafeGeometry Components
 *
 * These components wrap Three.js geometries to automatically guard against NaN values
 * that would otherwise crash the renderer with "Computed radius is NaN" errors.
 */
import React, { useMemo, useEffect, useRef } from 'react';
import type * as THREE from 'three';

interface WindowWithTHREE {
  THREE?: typeof THREE;
}

const isDev = import.meta.env.DEV;

/**
 * Ensures a dimension value is a valid positive finite number
 */
function safeDim(value: number | undefined, fallback: number, label?: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    if (isDev && (value === undefined || !Number.isFinite(value))) {
      console.warn(
        `[SafeGeometry] Invalid dimension${label ? ` for ${label}` : ''}: ${value} -> using ${fallback}`
      );
    }
    return fallback;
  }
  return value;
}

interface SafePlaneGeometryProps {
  args: [number?, number?, number?, number?];
  attach?: string;
}

/**
 * SafePlaneGeometry - A wrapper for planeGeometry that guards against NaN values.
 *
 * Usage:
 * ```tsx
 * // Instead of:
 * <planeGeometry args={[width, height]} />
 *
 * // Use:
 * <SafePlaneGeometry args={[width, height]} />
 * ```
 */
export const SafePlaneGeometry: React.FC<SafePlaneGeometryProps> = ({
  args,
  attach = 'geometry',
}) => {
  const safeArgs = useMemo(() => {
    const [width = 1, height = 1, widthSegments, heightSegments] = args;
    const safeWidth = safeDim(width, 1, 'PlaneGeometry.width');
    const safeHeight = safeDim(height, 1, 'PlaneGeometry.height');

    return [safeWidth, safeHeight, widthSegments ?? 1, heightSegments ?? 1] as [
      number,
      number,
      number,
      number,
    ];
  }, [args]);

  return <planeGeometry attach={attach} args={safeArgs} />;
};

interface SafeBoxGeometryProps {
  args: [number?, number?, number?, number?, number?, number?];
  attach?: string;
}

/**
 * SafeBoxGeometry - A wrapper for boxGeometry that guards against NaN values.
 */
export const SafeBoxGeometry: React.FC<SafeBoxGeometryProps> = ({ args, attach = 'geometry' }) => {
  const safeArgs = useMemo(() => {
    const [width = 1, height = 1, depth = 1, widthSegs, heightSegs, depthSegs] = args;
    return [
      safeDim(width, 1, 'BoxGeometry.width'),
      safeDim(height, 1, 'BoxGeometry.height'),
      safeDim(depth, 1, 'BoxGeometry.depth'),
      widthSegs,
      heightSegs,
      depthSegs,
    ] as [number, number, number, number?, number?, number?];
  }, [args]);

  return <boxGeometry attach={attach} args={safeArgs} />;
};

/**
 * Global NaN detector for development.
 * Add this to your main App component to catch geometry NaN errors.
 *
 * Usage:
 * ```tsx
 * import { useGeometryNaNDetector } from './SafeGeometry';
 *
 * function App() {
 *   useGeometryNaNDetector();
 *   return ...
 * }
 * ```
 */
export function useGeometryNaNDetector() {
  const errorCountRef = useRef(0);
  const patchedRef = useRef(false);

  useEffect(() => {
    if (!isDev) return;

    // Patch console.error to catch NaN errors
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const message = String(args[0]);
      if (message.includes('Computed radius is NaN')) {
        errorCountRef.current++;
        if (errorCountRef.current <= 10) {
          console.warn(
            `[NaN Geometry Error #${errorCountRef.current}]`,
            'PlaneGeometry has NaN values. Check component props.',
            args[1] // Usually the geometry object
          );
        }
      }
      originalError.apply(console, args);
    };

    // Also patch THREE.PlaneGeometry constructor to catch NaN at source
    if (!patchedRef.current && typeof window !== 'undefined') {
      patchedRef.current = true;
      const windowWithTHREE = window as unknown as WindowWithTHREE;
      const THREE = windowWithTHREE.THREE;
      if (THREE?.PlaneGeometry) {
        const OriginalPlaneGeometry = THREE.PlaneGeometry;
        (THREE as Record<string, unknown>).PlaneGeometry = class PatchedPlaneGeometry extends (
          OriginalPlaneGeometry
        ) {
          constructor(
            width?: number,
            height?: number,
            widthSegments?: number,
            heightSegments?: number
          ) {
            if (!Number.isFinite(width) || !Number.isFinite(height)) {
              console.warn(
                '[NaN PlaneGeometry DETECTED at construction]',
                { width, height, widthSegments, heightSegments },
                new Error().stack
              );
            }
            super(
              Number.isFinite(width) && width! > 0 ? width : 1,
              Number.isFinite(height) && height! > 0 ? height : 1,
              widthSegments,
              heightSegments
            );
          }
        };
      }
    }

    return () => {
      console.error = originalError;
    };
  }, []);
}

export default SafePlaneGeometry;
