/**
 * Thought Generator System
 *
 * Procedurally generates thoughts for workers based on their
 * current focus and mood state.
 *
 * NOT per-frame - uses setInterval for occasional thought generation.
 * Call startThoughtSystem() once to begin, returns cleanup function.
 */

import { useWorkerPersonalityStore } from '../stores/workerPersonalityStore';
import type { FocusType } from '../types/workerPersonality';

/**
 * Thought templates organized by focus context
 */
const THOUGHT_TEMPLATES: Record<FocusType, string[]> = {
  task: [
    'Almost there...',
    'Focus, focus...',
    'Step by step',
    'Looking good',
    'On schedule',
    'One thing at a time',
    'Steady progress',
  ],
  colleague: [
    'Good teamwork',
    'Need to sync up',
    'Nice coordination',
    'Working well today',
    'Team effort',
  ],
  machine: [
    'Sounds normal',
    'Check those readings',
    'Running smooth',
    'Keep monitoring',
    'All systems go',
  ],
  break: ['Coffee time soon', 'Just a moment', 'Quick breather', 'Stretch break', 'Need a rest'],
  concern: [
    "Something's off...",
    'Should mention this',
    'Double-checking...',
    'Hmm...',
    'Better check twice',
  ],
};

/**
 * Mood-specific thought modifiers
 * These override context thoughts when mood is not content/focused
 */
const MOOD_MODIFIERS: Record<string, string[]> = {
  stressed: ['Okay, okay...', 'Keep calm...', 'One thing at a time...', 'Deep breaths...'],
  tired: ['*yawn*', 'Long shift...', 'Almost there...', 'Need energy...'],
  alert: ['Stay sharp', 'Eyes open', "Something's happening", 'Pay attention'],
};

/**
 * Generate a contextual thought for a worker.
 * Returns null most of the time (random chance) to keep thoughts sparse.
 */
export const generateThought = (workerId: string): string | null => {
  const state = useWorkerPersonalityStore.getState().getWorkerState(workerId);
  if (!state) return null;

  // Random chance to generate thought (only 30% of calls produce thought)
  if (Math.random() > 0.3) return null;

  // Base thought from focus context
  const focusThoughts = THOUGHT_TEMPLATES[state.focus];
  let thought = focusThoughts[Math.floor(Math.random() * focusThoughts.length)];

  // Mood modifier (50% chance to override when not content/focused)
  if (state.mood !== 'content' && state.mood !== 'focused' && Math.random() > 0.5) {
    const modifiers = MOOD_MODIFIERS[state.mood];
    if (modifiers) {
      thought = modifiers[Math.floor(Math.random() * modifiers.length)];
    }
  }

  return thought;
};

/**
 * Start the thought generation system.
 *
 * Periodically generates thoughts for workers who don't have one.
 * Returns cleanup function to stop the system.
 *
 * @param intervalMs - How often to try generating thoughts (default 5000ms)
 */
export const startThoughtSystem = (intervalMs: number = 5000): (() => void) => {
  const interval = setInterval(() => {
    const store = useWorkerPersonalityStore.getState();

    store.workerStates.forEach((state, workerId) => {
      // Only generate for workers without current thought
      if (state.currentThought) return;

      const thought = generateThought(workerId);
      if (thought) {
        // Thought duration: 3-5 seconds
        store.setThought(workerId, thought, 3000 + Math.random() * 2000);
      }
    });
  }, intervalMs);

  return () => clearInterval(interval);
};
