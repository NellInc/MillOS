/**
 * Worker Animation System Types
 * Centralized type definitions for the animation manager
 */

import * as THREE from 'three';

// Animation states
export type AnimationState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'sitting'
  | 'waving'
  | 'startled'
  | 'evacuating';

// Idle animation variations
export type IdleVariation = 'breathing' | 'looking' | 'shifting' | 'stretching';

// LOD levels
export type LODLevel = 'high' | 'medium' | 'low';

// Worker pose refs (for animation manager to manipulate)
export interface WorkerPoseRefs {
  group: THREE.Group;
  torso: THREE.Group | null;
  head: THREE.Group | null;
  leftArm: THREE.Group | null;
  rightArm: THREE.Group | null;
  leftLeg: THREE.Group | null;
  rightLeg: THREE.Group | null;
  hips: THREE.Mesh | null;
  // Optional detailed refs (high LOD only)
  leftEyelid?: THREE.Mesh | null;
  rightEyelid?: THREE.Mesh | null;
  leftFingers?: THREE.Mesh | null;
  rightFingers?: THREE.Mesh | null;
  chest?: THREE.Mesh | null;
}

// Worker data passed to animation manager
export interface WorkerAnimationConfig {
  id: string;
  position: [number, number, number];
  speed: number;
  direction: 1 | -1;
  role: string;
  status: 'working' | 'break' | 'responding' | 'idle';
}

// Internal animation state tracked by manager
export interface WorkerAnimationData {
  // Identity
  id: string;
  role: string;

  // Position state
  position: THREE.Vector3;
  baseX: number; // Original X position for return after evasion
  direction: 1 | -1;
  speed: number;

  // Animation state machine
  currentState: AnimationState;
  previousState: AnimationState;
  stateTransition: number; // 0-1 for blending

  // Animation timers
  walkCycle: number;
  idleTimer: number;
  idleVariation: IdleVariation;
  idleVariationTimer: number;

  // Blinking (Tier 3)
  blinkTimer: number;
  blinkPhase: number;

  // Fatigue (Tier 2)
  fatigueLevel: number;
  shiftStartTime: number;

  // Head tracking
  headTarget: number;
  alertDirection: number | null;

  // Evasion state
  isEvading: boolean;
  wasEvading: boolean;
  evadeDirection: -1 | 1;
  evadeCooldown: number;
  isStartled: boolean;

  // Waving state
  isWaving: boolean;
  wavePhase: number;
  waveTimer: number;

  // Fire drill
  hasEvacuated: boolean;
  evacuationTarget: THREE.Vector3 | null;

  // LOD
  lodLevel: LODLevel;
  distanceToCamera: number;

  // Refs (set during registration)
  refs: WorkerPoseRefs | null;

  // Worker status
  status: 'working' | 'break' | 'responding' | 'idle';
}

// Manager configuration
export interface AnimationManagerConfig {
  // LOD thresholds (multiplied by workerLodDistance setting)
  lodHighThreshold: number; // 0-1, below this = high LOD
  lodMediumThreshold: number; // 0-1, below this = medium, above = low
  lodHysteresis: number; // Prevents LOD flickering

  // Animation speeds
  walkSpeed: number;
  runSpeed: number;
  evasionSpeed: number;

  // Detection ranges
  forkliftDetectionRange: number;
  evasionDistance: number;
  evasionCooldown: number;

  // Throttling
  lodUpdateFrequency: number; // Frames between LOD checks
  forkliftCheckFrequency: number; // Frames between forklift checks
}

// Default configuration
export const DEFAULT_ANIMATION_CONFIG: AnimationManagerConfig = {
  lodHighThreshold: 0.25,
  lodMediumThreshold: 0.5,
  lodHysteresis: 0.1,

  walkSpeed: 2.0, // Slower for natural ~3s gait cycle
  runSpeed: 4.0, // Running cycle
  evasionSpeed: 4,

  forkliftDetectionRange: 8,
  evasionDistance: 3,
  evasionCooldown: 1.5,

  lodUpdateFrequency: 10,
  forkliftCheckFrequency: 3,
};

// Factory function to create initial animation data
export function createWorkerAnimationData(config: WorkerAnimationConfig): WorkerAnimationData {
  return {
    id: config.id,
    role: config.role,

    position: new THREE.Vector3(...config.position),
    baseX: config.position[0],
    direction: config.direction,
    speed: config.speed,

    currentState: 'walking', // Start walking immediately
    previousState: 'walking',
    stateTransition: 1,

    walkCycle: Math.random() * Math.PI * 2, // Randomize starting phase
    idleTimer: Math.random() * 8 + 4, // Time until next idle (shorter)
    idleVariation: 'breathing',
    idleVariationTimer: Math.random() * 3 + 3,

    blinkTimer: Math.random() * 4 + 2,
    blinkPhase: 0,

    fatigueLevel: 0,
    shiftStartTime: Date.now(),

    headTarget: 0,
    alertDirection: null,

    isEvading: false,
    wasEvading: false,
    evadeDirection: 1,
    evadeCooldown: 0,
    isStartled: false,

    isWaving: false,
    wavePhase: 0,
    waveTimer: 0,

    hasEvacuated: false,
    evacuationTarget: null,

    lodLevel: 'high',
    distanceToCamera: 0,

    refs: null,

    status: config.status,
  };
}
