/**
 * Worker Personality Types
 *
 * Extended state model for worker personality visualization.
 * Complements the existing WorkerMood system in types.ts with
 * internal state tracking for visual representation.
 */

// Re-export existing MoodState for consistency
export type { MoodState } from '../types';

// Personality traits that affect idle behavior and interactions
export type PersonalityTrait = 'diligent' | 'social' | 'cautious' | 'efficient' | 'curious';

// What the worker is currently focused on
export type FocusType = 'task' | 'colleague' | 'machine' | 'break' | 'concern';

/**
 * Internal state for personality visualization
 * This is separate from WorkerMood to allow independent visual updates
 */
export interface WorkerInternalState {
  // Core mood (affects visual aura) - maps to existing MoodState
  mood: 'content' | 'focused' | 'stressed' | 'tired' | 'alert';
  moodIntensity: number; // 0-1

  // Energy level (affects animation speed, posture)
  energy: number; // 0-1

  // Current focus (what they're thinking about)
  focus: FocusType;
  focusTargetId?: string;

  // Social state
  recentInteractions: string[]; // IDs of recently interacted workers
  relationshipStrength: Map<string, number>; // workerId -> 0-1

  // Personality (persistent)
  traits: PersonalityTrait[];

  // Momentary thoughts (for thought bubbles)
  currentThought?: string;
  thoughtExpiry?: number;
}

/**
 * Mood colors for visual aura representation
 * Designed for additive blending on dark backgrounds
 */
export const MOOD_COLORS: Record<WorkerInternalState['mood'], string> = {
  content: '#10b981', // Green - calm, satisfied
  focused: '#3b82f6', // Blue - concentrated
  stressed: '#f59e0b', // Amber - pressured
  tired: '#8b5cf6', // Purple - low energy
  alert: '#ef4444', // Red - heightened awareness
};

/**
 * Personality trait icons (Lucide icon names for UI)
 */
export const TRAIT_ICONS: Record<PersonalityTrait, string> = {
  diligent: 'CheckCircle',
  social: 'Users',
  cautious: 'Shield',
  efficient: 'Zap',
  curious: 'Eye',
};

/**
 * Default state for new workers
 */
export const DEFAULT_INTERNAL_STATE: WorkerInternalState = {
  mood: 'content',
  moodIntensity: 0.5,
  energy: 0.8,
  focus: 'task',
  recentInteractions: [],
  relationshipStrength: new Map(),
  traits: [],
  currentThought: undefined,
  thoughtExpiry: undefined,
};
