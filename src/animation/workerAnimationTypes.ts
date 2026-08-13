/**
 * Worker Animation System Types
 * Centralized type definitions for the animation manager
 */

import * as THREE from 'three';
import type { WorkerWorkAction } from '../components/workers/workerTypes';

// Animation states
export type AnimationState =
  'idle' | 'walking' | 'working' | 'running' | 'sitting' | 'waving' | 'startled' | 'evacuating';

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

/**
 * Secondary-animation signals published by the manager and consumed by the
 * authored skinned model (WorkerModel).
 *
 * The authored GLB owns its own AnimationMixer, so the manager cannot write
 * bone transforms directly without an ordering hazard. Instead it writes this
 * plain mutable record once per manager tick and WorkerModel applies it to real
 * joints immediately after `mixer.update()` inside the same `useFrame`.
 *
 * Every angle is in radians. `head*`, `chest*` and `wave*` are ADDITIVE offsets
 * pre-multiplied onto a bone the clips already animate (non-accumulating,
 * because the mixer rewrites those bones every frame). `hip*` are ABSOLUTE
 * values: no clip in either GLB carries a channel for the Hips bone, so an
 * additive write there would integrate without bound.
 */
export interface WorkerSecondarySignals {
  /** Head yaw toward a point of interest (local Y). */
  headYaw: number;
  /** Head pitch: fatigue droop positive, startle recoil negative (local X). */
  headPitch: number;
  /** Chest pitch: fatigue slouch positive, startle lean-back negative. */
  chestPitch: number;
  /** Absolute Hips roll — the idle weight shift. */
  hipRoll: number;
  /** Absolute Hips yaw — the idle weight shift. */
  hipYaw: number;
  /** Absolute Hips lateral offset in metres — the idle weight shift. */
  hipShiftX: number;
  /** 0-1 blend of the acknowledgement wave. */
  waveAmount: number;
  /** Oscillator phase for the acknowledgement wave. */
  wavePhase: number;
  /** 0-1 eyelid closure shared by procedural and authored faces. */
  blinkAmount: number;
  /** Small signed chest expansion signal for idle breathing. */
  breathAmount: number;
  /** Stable identity phase used to desynchronise authored clips. */
  animationPhase: number;
  /** Authoritative world ground speed in m/s (survives manager frame throttling). */
  groundSpeed: number;
  /** Locomotion intent chosen by the manager. */
  gait: 'idle' | 'walk' | 'run';
}

export function createSecondarySignals(id: string = ''): WorkerSecondarySignals {
  return {
    headYaw: 0,
    headPitch: 0,
    chestPitch: 0,
    hipRoll: 0,
    hipYaw: 0,
    hipShiftX: 0,
    waveAmount: 0,
    wavePhase: 0,
    blinkAmount: 0,
    breathAmount: 0,
    animationPhase: id ? workerDeterministicFraction(id, 17) * Math.PI * 2 : 0,
    groundSpeed: 0,
    gait: 'idle',
  };
}

// Worker data passed to animation manager
export interface WorkerAnimationConfig {
  id: string;
  position: [number, number, number];
  speed: number;
  direction: 1 | -1;
  role: string;
  workAction: WorkerWorkAction;
  task: string;
  status: 'working' | 'break' | 'responding' | 'idle';
}

// Internal animation state tracked by manager
export interface WorkerAnimationData {
  // Identity
  id: string;
  role: string;
  workAction: WorkerWorkAction;
  task: string;

  // Position state
  position: THREE.Vector3;
  baseX: number; // Original X position for return after evasion
  direction: 1 | -1;
  speed: number;

  // Facing. `direction` still selects the patrol heading; `currentYaw` is the
  // damped value actually written to the group so a turn is a turn, not a
  // one-frame teleport through 180 degrees.
  currentYaw: number;
  targetYaw: number;

  /** Deterministic per-person weight-bearing side for the idle stance (-1 or 1). */
  stanceSign: 1 | -1;

  // Blend accumulators for the secondary-animation layer
  startleBlend: number;
  idleBlend: number;

  // Animation state machine
  currentState: AnimationState;
  previousState: AnimationState;
  stateTransition: number; // 0-1 for blending

  // Animation timers
  walkCycle: number;
  idleTimer: number;
  idleVariation: IdleVariation;
  idleVariationTimer: number;
  workTimer: number;
  workPhase: number;

  // Blinking (Tier 3)
  blinkTimer: number;
  blinkPhase: number;
  blinkCount: number;

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

  // Secondary-animation channel for the authored skinned model
  secondary: WorkerSecondarySignals;

  // Worker status
  status: 'working' | 'break' | 'responding' | 'idle';
}

// Manager configuration
export interface AnimationManagerConfig {
  // LOD thresholds (multiplied by workerLodDistance setting)
  lodHighThreshold: number; // Multiplier below which close-detail personnel are preferred
  lodMediumThreshold: number; // Multiplier below which medium detail is preferred
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
  // Medium quality uses a 35 m LOD distance. These values give detailed
  // personnel a 20.3 m entry / 28.7 m exit band and reserve billboards for
  // genuinely distant workers beyond roughly 60 m.
  lodHighThreshold: 0.7,
  lodMediumThreshold: 1.6,
  lodHysteresis: 0.12,

  walkSpeed: 2.0, // Slower for natural ~3s gait cycle
  runSpeed: 4.0, // Running cycle
  evasionSpeed: 4,

  forkliftDetectionRange: 8,
  evasionDistance: 3,
  evasionCooldown: 1.5,

  lodUpdateFrequency: 10,
  forkliftCheckFrequency: 3,
};

export function normalizeWorkerSpeed(rosterSpeed: number): number {
  if (!Number.isFinite(rosterSpeed)) return 1.25;
  return THREE.MathUtils.clamp(rosterSpeed * 0.22, 1, 1.8);
}

export function workerDeterministicFraction(id: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

// Factory function to create initial animation data
export function createWorkerAnimationData(config: WorkerAnimationConfig): WorkerAnimationData {
  return {
    id: config.id,
    role: config.role,
    workAction: config.workAction,
    task: config.task,

    position: new THREE.Vector3(...config.position),
    baseX: config.position[0],
    direction: config.direction,
    speed: normalizeWorkerSpeed(config.speed),

    currentYaw: config.direction > 0 ? 0 : Math.PI,
    targetYaw: config.direction > 0 ? 0 : Math.PI,
    stanceSign: workerDeterministicFraction(config.id, 7) > 0.5 ? 1 : -1,

    startleBlend: 0,
    idleBlend: 0,

    currentState: 'walking', // Start walking immediately
    previousState: 'walking',
    stateTransition: 1,

    walkCycle: workerDeterministicFraction(config.id, 1) * Math.PI * 2,
    idleTimer: workerDeterministicFraction(config.id, 2) * 4 + 3,
    idleVariation: 'breathing',
    idleVariationTimer: workerDeterministicFraction(config.id, 3) * 3 + 3,
    workTimer: workerDeterministicFraction(config.id, 4) * 6 + 6,
    workPhase: workerDeterministicFraction(config.id, 5) * Math.PI * 2,

    blinkTimer: workerDeterministicFraction(config.id, 6) * 4 + 2,
    blinkPhase: 0,
    blinkCount: 0,

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
    secondary: createSecondarySignals(config.id),

    status: config.status,
  };
}
