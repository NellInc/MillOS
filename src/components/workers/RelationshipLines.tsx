/**
 * Relationship Lines
 *
 * Visualizes connections between workers who interact frequently.
 * Subtle lines show the social fabric forming in the factory.
 *
 * Performance notes:
 * - Limited to maxLines (default 20) connections
 * - Only shows relationships above minStrength threshold
 * - Uses single BufferGeometry for all lines
 * - Custom shader for animated pulse effect
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

interface RelationshipLinesProps {
  minStrength?: number; // Only show lines above this threshold
  maxLines?: number; // Performance limit
}

export const RelationshipLines: React.FC<RelationshipLinesProps> = React.memo(
  ({ minStrength = 0.3, maxLines = 20 }) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const workers = useProductionStore((s) => s.workers);
    const workerStates = useWorkerPersonalityStore((s) => s.workerStates);
    const isTabVisible = useGameSimulationStore((s) => s.isTabVisible);
    const quality = useGraphicsStore((s) => s.graphics.quality);

    // Build line geometry from relationships
    const { geometry, hasLines } = useMemo(() => {
      const positions: number[] = [];
      const strengthValues: number[] = [];

      let lineCount = 0;
      const processedPairs = new Set<string>();

      workerStates.forEach((state, workerId) => {
        if (lineCount >= maxLines) return;

        const worker = workers.find((w) => w.id === workerId);
        if (!worker) return;

        state.relationshipStrength.forEach((strength, otherId) => {
          if (lineCount >= maxLines) return;
          if (strength < minStrength) return;

          // Avoid duplicate lines
          const pairKey = [workerId, otherId].sort().join('-');
          if (processedPairs.has(pairKey)) return;
          processedPairs.add(pairKey);

          const otherWorker = workers.find((w) => w.id === otherId);
          if (!otherWorker) return;

          // Add line segment
          positions.push(
            worker.position[0],
            worker.position[1] + 1,
            worker.position[2],
            otherWorker.position[0],
            otherWorker.position[1] + 1,
            otherWorker.position[2]
          );
          strengthValues.push(strength, strength);
          lineCount++;
        });
      });

      const geo = new THREE.BufferGeometry();
      if (positions.length > 0) {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('strength', new THREE.Float32BufferAttribute(strengthValues, 1));
      }

      return { geometry: geo, hasLines: positions.length > 0 };
    }, [workers, workerStates, minStrength, maxLines]);

    // Dispose each replaced BufferGeometry (and the last on unmount) so the
    // GPU buffers from prior recomputes are not leaked.
    useEffect(() => () => geometry.dispose(), [geometry]);

    // Shader material with pulse animation
    const material = useMemo(
      () =>
        new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            baseColor: { value: new THREE.Color('#60a5fa') },
          },
          vertexShader: `
        attribute float strength;
        varying float vStrength;

        void main() {
          vStrength = strength;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
          fragmentShader: `
        uniform float time;
        uniform vec3 baseColor;
        varying float vStrength;

        void main() {
          // Pulse animation
          float pulse = sin(time * 2.0) * 0.2 + 0.8;

          // Strength affects opacity
          float alpha = vStrength * pulse * 0.4;

          gl_FragColor = vec4(baseColor, alpha);
        }
      `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      []
    );

    // Animate time uniform
    useFrame((state) => {
      if (!isTabVisible) return;
      if (quality === 'low') return;
      if (materialRef.current) {
        materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      }
    });

    if (!hasLines) return null;

    return (
      <lineSegments geometry={geometry}>
        <primitive object={material} ref={materialRef} attach="material" />
      </lineSegments>
    );
  }
);

RelationshipLines.displayName = 'RelationshipLines';
