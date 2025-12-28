/**
 * Focus Indicator
 *
 * Shows a dashed line from worker to their focus target
 * (colleague or machine). Only renders when focus is not 'task'.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

interface FocusIndicatorProps {
  workerId: string;
  workerPosition: [number, number, number];
  visible?: boolean;
}

export const FocusIndicator: React.FC<FocusIndicatorProps> = React.memo(
  ({ workerId, workerPosition, visible = true }) => {
    const groupRef = useRef<THREE.Group>(null);
    const lineRef = useRef<THREE.Line | null>(null);
    const workerState = useWorkerPersonalityStore((s) => s.getWorkerState(workerId));
    const workers = useProductionStore((s) => s.workers);
    const machines = useProductionStore((s) => s.machines);
    const isTabVisible = useGameSimulationStore((s) => s.isTabVisible);
    const quality = useGraphicsStore((s) => s.graphics.quality);

    // Dashed line material
    const material = useMemo(
      () =>
        new THREE.LineDashedMaterial({
          color: '#60a5fa',
          opacity: 0.3,
          transparent: true,
          dashSize: 0.3,
          gapSize: 0.2,
        }),
      []
    );

    // Initial geometry with 2 points
    const geometry = useMemo(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      return geo;
    }, []);

    // Create Three.js line object imperatively to avoid JSX type conflicts
    useEffect(() => {
      if (!groupRef.current) return;

      const line = new THREE.Line(geometry, material);
      lineRef.current = line;
      groupRef.current.add(line);

      return () => {
        if (groupRef.current && lineRef.current) {
          groupRef.current.remove(lineRef.current);
        }
        lineRef.current = null;
      };
    }, [geometry, material]);

    // Calculate target position based on focus
    const targetPosition = useMemo((): [number, number, number] | null => {
      if (!workerState?.focusTargetId) return null;

      if (workerState.focus === 'colleague') {
        const target = workers.find((w) => w.id === workerState.focusTargetId);
        if (target) return target.position;
      }

      if (workerState.focus === 'machine') {
        const target = machines.find((m) => m.id === workerState.focusTargetId);
        if (target) return target.position;
      }

      return null;
    }, [workerState?.focus, workerState?.focusTargetId, workers, machines]);

    // Update line geometry each frame
    useFrame(() => {
      if (!isTabVisible) return;
      if (quality === 'low') return;
      if (!lineRef.current || !targetPosition) return;

      // Update line geometry
      const positions = lineRef.current.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, workerPosition[0], workerPosition[1] + 1.5, workerPosition[2]);
      positions.setXYZ(1, targetPosition[0], targetPosition[1] + 1, targetPosition[2]);
      positions.needsUpdate = true;

      lineRef.current.computeLineDistances();
    });

    // Don't render if no target or focus is on task/break
    if (
      !visible ||
      !targetPosition ||
      workerState?.focus === 'task' ||
      workerState?.focus === 'break'
    ) {
      return null;
    }

    return <group ref={groupRef} />;
  }
);

FocusIndicator.displayName = 'FocusIndicator';
