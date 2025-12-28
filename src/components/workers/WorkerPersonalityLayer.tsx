/**
 * Worker Personality Layer
 *
 * Main integration component that combines all personality visualizations.
 * Initializes worker personality state, starts thought generation,
 * and renders visual overlays.
 *
 * Props allow toggling individual features for performance tuning.
 */

import React, { useEffect } from 'react';
import { useProductionStore } from '../../stores/productionStore';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { MoodAura } from './MoodAura';
import { ThoughtBubble } from './ThoughtBubble';
import { FocusIndicator } from './FocusIndicator';
import { RelationshipLines } from './RelationshipLines';
import { PersonalityAnimationManager } from './PersonalityAnimationManager';
import { startThoughtSystem } from '../../systems/thoughtGenerator';

interface WorkerPersonalityLayerProps {
  showAuras?: boolean;
  showThoughts?: boolean;
  showRelationships?: boolean;
  showFocusIndicators?: boolean;
}

export const WorkerPersonalityLayer: React.FC<WorkerPersonalityLayerProps> = ({
  showAuras = true,
  showThoughts = true,
  showRelationships = false, // Off by default, toggle-able
  showFocusIndicators = false, // Off by default, can be noisy
}) => {
  const workers = useProductionStore((s) => s.workers);
  const initializeWorker = useWorkerPersonalityStore((s) => s.initializeWorker);

  // Initialize personality state for all workers
  useEffect(() => {
    workers.forEach((worker) => {
      initializeWorker(worker.id);
    });
  }, [workers, initializeWorker]);

  // Start thought generation system
  useEffect(() => {
    const cleanup = startThoughtSystem(6000); // Every 6 seconds
    return cleanup;
  }, []);

  return (
    <group name="personality-layer">
      {/* Centralized animation manager */}
      <PersonalityAnimationManager />

      {/* Per-worker elements */}
      {workers.map((worker) => (
        <React.Fragment key={worker.id}>
          {showAuras && <MoodAura workerId={worker.id} position={worker.position} />}
          {showThoughts && <ThoughtBubble workerId={worker.id} position={worker.position} />}
          {showFocusIndicators && (
            <FocusIndicator workerId={worker.id} workerPosition={worker.position} />
          )}
        </React.Fragment>
      ))}

      {/* Global relationship visualization */}
      {showRelationships && <RelationshipLines minStrength={0.4} maxLines={15} />}
    </group>
  );
};

export default WorkerPersonalityLayer;
