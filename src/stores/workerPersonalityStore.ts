/**
 * Worker Personality Store
 *
 * Manages internal personality state for all workers.
 * Separate from workerMoodStore to allow independent visual updates
 * without triggering mood simulation recalculations.
 */

import { create } from 'zustand';
import {
  WorkerInternalState,
  PersonalityTrait,
  FocusType,
  DEFAULT_INTERNAL_STATE,
} from '../types/workerPersonality';

interface WorkerPersonalityState {
  workerStates: Map<string, WorkerInternalState>;

  // Actions
  initializeWorker: (workerId: string, traits?: PersonalityTrait[]) => void;
  updateMood: (workerId: string, mood: WorkerInternalState['mood'], intensity?: number) => void;
  updateEnergy: (workerId: string, delta: number) => void;
  setFocus: (workerId: string, focus: FocusType, targetId?: string) => void;
  recordInteraction: (worker1Id: string, worker2Id: string) => void;
  setThought: (workerId: string, thought: string, durationMs?: number) => void;
  clearThought: (workerId: string) => void;

  // Getters
  getWorkerState: (workerId: string) => WorkerInternalState | undefined;
  getRelationshipStrength: (worker1Id: string, worker2Id: string) => number;
}

// Random trait assignment for variety
const TRAIT_POOL: PersonalityTrait[] = ['diligent', 'social', 'cautious', 'efficient', 'curious'];

const getRandomTraits = (count: number = 2): PersonalityTrait[] => {
  const shuffled = [...TRAIT_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

export const useWorkerPersonalityStore = create<WorkerPersonalityState>((set, get) => ({
  workerStates: new Map(),

  initializeWorker: (workerId, traits) => {
    set((state) => {
      const newStates = new Map(state.workerStates);
      if (!newStates.has(workerId)) {
        newStates.set(workerId, {
          ...DEFAULT_INTERNAL_STATE,
          traits: traits || getRandomTraits(),
          energy: 0.7 + Math.random() * 0.3, // Slight variation
          relationshipStrength: new Map(),
        });
      }
      return { workerStates: newStates };
    });
  },

  updateMood: (workerId, mood, intensity = 0.7) => {
    set((state) => {
      const newStates = new Map(state.workerStates);
      const current = newStates.get(workerId);
      if (current) {
        newStates.set(workerId, { ...current, mood, moodIntensity: intensity });
      }
      return { workerStates: newStates };
    });
  },

  updateEnergy: (workerId, delta) => {
    set((state) => {
      const newStates = new Map(state.workerStates);
      const current = newStates.get(workerId);
      if (current) {
        const newEnergy = Math.max(0, Math.min(1, current.energy + delta));
        newStates.set(workerId, { ...current, energy: newEnergy });
      }
      return { workerStates: newStates };
    });
  },

  setFocus: (workerId, focus, targetId) => {
    set((state) => {
      const newStates = new Map(state.workerStates);
      const current = newStates.get(workerId);
      if (current) {
        newStates.set(workerId, { ...current, focus, focusTargetId: targetId });
      }
      return { workerStates: newStates };
    });
  },

  recordInteraction: (worker1Id, worker2Id) => {
    set((state) => {
      const newStates = new Map(state.workerStates);

      // Update both workers
      [worker1Id, worker2Id].forEach((id, i) => {
        const otherId = i === 0 ? worker2Id : worker1Id;
        const current = newStates.get(id);
        if (current) {
          const newRelationships = new Map(current.relationshipStrength);
          const currentStrength = newRelationships.get(otherId) || 0;
          newRelationships.set(otherId, Math.min(1, currentStrength + 0.1));

          const newInteractions = [otherId, ...current.recentInteractions.slice(0, 4)];

          newStates.set(id, {
            ...current,
            relationshipStrength: newRelationships,
            recentInteractions: newInteractions,
          });
        }
      });

      return { workerStates: newStates };
    });
  },

  setThought: (workerId, thought, durationMs = 5000) => {
    set((state) => {
      const newStates = new Map(state.workerStates);
      const current = newStates.get(workerId);
      if (current) {
        newStates.set(workerId, {
          ...current,
          currentThought: thought,
          thoughtExpiry: Date.now() + durationMs,
        });
      }
      return { workerStates: newStates };
    });
  },

  clearThought: (workerId) => {
    set((state) => {
      const newStates = new Map(state.workerStates);
      const current = newStates.get(workerId);
      if (current) {
        newStates.set(workerId, {
          ...current,
          currentThought: undefined,
          thoughtExpiry: undefined,
        });
      }
      return { workerStates: newStates };
    });
  },

  getWorkerState: (workerId) => get().workerStates.get(workerId),

  getRelationshipStrength: (worker1Id, worker2Id) => {
    const state = get().workerStates.get(worker1Id);
    return state?.relationshipStrength.get(worker2Id) || 0;
  },
}));
