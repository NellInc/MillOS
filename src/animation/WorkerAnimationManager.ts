/**
 * WorkerAnimationManager
 *
 * Centralized animation orchestrator for all workers.
 * Replaces per-worker useFrame hooks with a single manager.
 *
 * Based on v0.10.0 simple patterns with maath for smooth interpolation.
 */

import { useRef, useCallback, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { damp } from 'maath/easing';
import * as THREE from 'three';

import {
  WorkerAnimationData,
  WorkerAnimationConfig,
  WorkerPoseRefs,
  LODLevel,
  IdleVariation,
  DEFAULT_ANIMATION_CONFIG,
  createWorkerAnimationData,
} from './workerAnimationTypes';
import { AnimationFeatures, GraphicsQuality, getFeaturesForQuality } from './animationFeatures';
import { positionRegistry, EntityPosition } from '../utils/positionRegistry';
import { shouldRunThisFrame, getThrottleLevel, incrementGlobalFrame } from '../utils/frameThrottle';
import { calculateGaitPose, getGaitParamsForState } from './gaitAnimation';

// Fire drill exit type (matches gameSimulationStore)
interface FireDrillExit {
  id: string;
  position: { x: number; z: number };
  label: string;
}

/**
 * Worker Animation Manager Class
 * Manages animation state for all workers in a centralized loop
 */
export class WorkerAnimationManager {
  private workers: Map<string, WorkerAnimationData> = new Map();
  private config = DEFAULT_ANIMATION_CONFIG;
  private features: AnimationFeatures;
  private frameCount = 0;
  private isTabVisible = true;
  private quality: GraphicsQuality = 'medium';
  private workerLodDistance = 100;

  // Fire drill state (injected from store)
  private emergencyDrillMode = false;
  private getNearestExitFn: ((x: number, z: number) => FireDrillExit) | null = null;
  private markWorkerEvacuatedFn: ((id: string) => void) | null = null;

  // LOD change callbacks
  private lodChangeCallbacks: Map<string, (lod: LODLevel) => void> = new Map();

  constructor(quality: GraphicsQuality = 'medium') {
    this.quality = quality;
    this.features = getFeaturesForQuality(quality);
  }

  /**
   * Register a worker with the manager (call once on mount)
   */
  register(config: WorkerAnimationConfig, refs: WorkerPoseRefs): () => void {
    // New worker - create fresh animation data
    const data = createWorkerAnimationData(config);
    data.refs = refs;

    // Set initial position on the group
    if (refs.group) {
      refs.group.position.set(...config.position);
    }

    this.workers.set(config.id, data);

    // Return unregister function
    return () => this.unregister(config.id);
  }

  /**
   * Update refs for existing worker (for LOD changes)
   * Does NOT reset position or animation state
   */
  updateRefs(id: string, refs: WorkerPoseRefs): void {
    const data = this.workers.get(id);
    if (data) {
      // Preserve current position from old group
      const oldGroup = data.refs?.group;
      const currentPos = oldGroup ? oldGroup.position.clone() : null;
      const currentRot = oldGroup ? oldGroup.rotation.y : 0;

      // Update refs
      data.refs = refs;

      // Restore position to new group
      if (refs.group && currentPos) {
        refs.group.position.copy(currentPos);
        refs.group.rotation.y = currentRot;
      }
    }
  }

  /**
   * Unregister a worker
   */
  unregister(id: string): void {
    this.workers.delete(id);
    this.lodChangeCallbacks.delete(id);
    positionRegistry.unregister(id);
  }

  /**
   * Subscribe to LOD changes for a specific worker
   */
  onLodChange(id: string, callback: (lod: LODLevel) => void): () => void {
    this.lodChangeCallbacks.set(id, callback);
    return () => this.lodChangeCallbacks.delete(id);
  }

  /**
   * Get current LOD level for a worker
   */
  getLOD(id: string): LODLevel {
    return this.workers.get(id)?.lodLevel ?? 'high';
  }

  /**
   * Update settings from stores
   */
  updateSettings(
    isTabVisible: boolean,
    quality: GraphicsQuality,
    workerLodDistance: number,
    emergencyDrillMode: boolean,
    getNearestExit: (x: number, z: number) => FireDrillExit,
    markWorkerEvacuated: (id: string) => void
  ): void {
    this.isTabVisible = isTabVisible;

    if (this.quality !== quality) {
      this.quality = quality;
      this.features = getFeaturesForQuality(quality);
    }

    this.workerLodDistance = workerLodDistance;
    this.emergencyDrillMode = emergencyDrillMode;
    this.getNearestExitFn = getNearestExit;
    this.markWorkerEvacuatedFn = markWorkerEvacuated;
  }

  /**
   * Update worker status (from external state)
   */
  updateWorkerStatus(id: string, status: WorkerAnimationData['status']): void {
    const data = this.workers.get(id);
    if (data) {
      data.status = status;
    }
  }

  /**
   * Reset evacuation state (when drill ends)
   */
  resetEvacuation(): void {
    this.workers.forEach((data) => {
      data.hasEvacuated = false;
      data.evacuationTarget = null;
    });
  }

  /**
   * Main update loop - called once per frame for ALL workers
   */
  update(delta: number, camera: THREE.Camera): void {
    // Skip if tab not visible
    if (!this.isTabVisible) return;

    // Frame throttling based on quality
    const throttle = getThrottleLevel(this.quality);
    if (!shouldRunThisFrame(throttle)) {
      this.frameCount++;
      return;
    }

    // Cap delta to prevent large jumps
    const cappedDelta = Math.min(delta, 0.1);

    // Process all workers
    this.workers.forEach((data) => {
      if (!data.refs?.group) return;

      // 1. Update LOD (throttled)
      if (this.frameCount % this.config.lodUpdateFrequency === 0) {
        this.updateLOD(data, camera);
      }

      // 2. Update position/movement
      this.updatePosition(data, cappedDelta);

      // 3. Update limb animations (if not billboard LOD)
      if (data.lodLevel !== 'low') {
        this.updateLimbAnimation(data, cappedDelta);
      }

      // 4. Update Tier 2-3 features
      this.updateTier2Features(data, cappedDelta);
      if (data.lodLevel === 'high') {
        this.updateTier3Features(data, cappedDelta);
      }

      // 5. Register position in registry
      positionRegistry.register(
        data.id,
        data.refs.group.position.x,
        data.refs.group.position.z,
        'worker'
      );
    });

    this.frameCount++;
    incrementGlobalFrame();
  }

  // =====================
  // POSITION UPDATE LOGIC
  // =====================

  private updatePosition(data: WorkerAnimationData, delta: number): void {
    if (!data.refs?.group) return;
    const group = data.refs.group;

    // Fire drill evacuation (highest priority)
    if (this.emergencyDrillMode && !data.hasEvacuated) {
      this.updateEvacuation(data, delta);
      return;
    }

    // Reset evacuation target when drill ends
    if (!this.emergencyDrillMode && data.evacuationTarget) {
      data.evacuationTarget = null;
      data.hasEvacuated = false;
    }

    // Check for nearby forklifts (throttled)
    if (this.frameCount % this.config.forkliftCheckFrequency === 0) {
      this.checkForkliftProximity(data);
    }

    // Handle forklift evasion
    if (data.isEvading) {
      this.updateEvasion(data, delta);
      return;
    }

    // Handle evasion cooldown
    if (data.evadeCooldown > 0) {
      data.evadeCooldown -= delta;

      // Return to original path after cooldown
      if (data.evadeCooldown <= 0) {
        const diffX = data.baseX - group.position.x;
        if (Math.abs(diffX) > 0.1) {
          group.position.x += Math.sign(diffX) * this.config.evasionSpeed * 0.5 * delta;
        }
      }
    }

    // Update animation state based on status
    this.updateAnimationState(data, delta);

    // Movement based on state
    switch (data.currentState) {
      case 'idle':
        this.updateIdlePosition(data, delta);
        break;
      case 'walking':
        this.updateWalkingPosition(data, delta);
        break;
      case 'sitting':
        // No movement when sitting
        break;
      case 'running':
        this.updateRunningPosition(data, delta);
        break;
    }

    // Apply bob height
    const bobHeight = data.currentState === 'idle' ? 0 : Math.abs(Math.sin(data.walkCycle)) * 0.025;
    group.position.y = bobHeight;

    // Update rotation based on direction
    group.rotation.y = data.direction > 0 ? 0 : Math.PI;

    // Boundary check - turn around at edges
    if (group.position.z > 25 || group.position.z < -25) {
      data.direction *= -1;
    }
  }

  private updateEvacuation(data: WorkerAnimationData, delta: number): void {
    if (!data.refs?.group || !this.getNearestExitFn || !this.markWorkerEvacuatedFn) return;

    const group = data.refs.group;

    // Get evacuation target
    if (!data.evacuationTarget) {
      const exit = this.getNearestExitFn(group.position.x, group.position.z);
      data.evacuationTarget = new THREE.Vector3(exit.position.x, 0, exit.position.z);
    }

    // Move toward exit (running speed)
    const dx = data.evacuationTarget.x - group.position.x;
    const dz = data.evacuationTarget.z - group.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 1.5) {
      // Reached exit
      data.hasEvacuated = true;
      this.markWorkerEvacuatedFn(data.id);
      return;
    }

    // Normalize and apply running speed
    const RUN_SPEED = 6;
    const nx = dx / distance;
    const nz = dz / distance;

    group.position.x += nx * RUN_SPEED * delta;
    group.position.z += nz * RUN_SPEED * delta;

    // Face direction of movement
    group.rotation.y = Math.atan2(nx, nz);

    // Update walk cycle for running animation
    data.walkCycle += delta * this.config.runSpeed * 1.8;
    data.currentState = 'running';
  }

  private checkForkliftProximity(data: WorkerAnimationData): void {
    if (!data.refs?.group) return;

    const group = data.refs.group;
    const nearestForklift = positionRegistry.getNearestForklift(
      group.position.x,
      group.position.z,
      this.config.forkliftDetectionRange
    );

    if (
      nearestForklift &&
      positionRegistry.isForkliftApproaching(group.position.x, group.position.z, nearestForklift)
    ) {
      if (!data.isEvading) {
        // Start evasion - determine direction
        const toWorkerX = group.position.x - nearestForklift.x;
        const toWorkerZ = group.position.z - nearestForklift.z;
        const crossProduct =
          (nearestForklift.dirX ?? 0) * toWorkerZ - (nearestForklift.dirZ ?? 0) * toWorkerX;
        data.evadeDirection = crossProduct > 0 ? 1 : -1;
        data.isEvading = true;
      }

      // Check if startled (very close)
      const dist = Math.sqrt(
        Math.pow(group.position.x - nearestForklift.x, 2) +
          Math.pow(group.position.z - nearestForklift.z, 2)
      );
      data.isStartled = dist < 3;

      // Update head target to look at forklift
      this.updateHeadTarget(data, nearestForklift);
    } else {
      // Track when evasion ends for waving
      if (data.isEvading && !data.wasEvading) {
        // Was evading, now safe - trigger wave
        if (this.features.waving) {
          data.isWaving = true;
          data.waveTimer = 1.5;
        }
      }
      data.wasEvading = data.isEvading;
      data.isEvading = false;
      data.isStartled = false;

      // Decay head target
      data.headTarget *= 0.9;
    }
  }

  private updateHeadTarget(data: WorkerAnimationData, forklift: EntityPosition): void {
    if (!data.refs?.group) return;

    const group = data.refs.group;
    const dx = forklift.x - group.position.x;
    const dz = forklift.z - group.position.z;
    const angleToForklift = Math.atan2(dx, dz);
    const bodyAngle = data.direction > 0 ? 0 : Math.PI;
    let relativeAngle = angleToForklift - bodyAngle;

    // Clamp to realistic head rotation range
    relativeAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, relativeAngle));
    data.headTarget = relativeAngle;
  }

  private updateEvasion(data: WorkerAnimationData, delta: number): void {
    if (!data.refs?.group) return;

    const group = data.refs.group;
    const targetX = data.baseX + data.evadeDirection * this.config.evasionDistance;
    const diffX = targetX - group.position.x;

    if (Math.abs(diffX) > 0.1) {
      group.position.x += Math.sign(diffX) * this.config.evasionSpeed * delta;
    }

    // Slow walk cycle while evading
    data.walkCycle += delta * 2;
  }

  private updateAnimationState(data: WorkerAnimationData, delta: number): void {
    // Priority: sitting > running > walking > idle
    if (data.status === 'break') {
      data.currentState = 'sitting';
      return;
    }

    // Check for running (Safety Officers responding to alerts, etc.)
    // For now, default to walking/idle behavior
    if (data.currentState === 'idle') {
      data.idleTimer -= delta;
      if (data.idleTimer <= 0) {
        data.currentState = 'walking';
        data.idleTimer = Math.random() * 12 + 8;
      }
    } else if (data.currentState === 'walking') {
      data.idleDuration -= delta;
      // Random chance to idle
      if (Math.random() < 0.001) {
        data.currentState = 'idle';
        data.idleDuration = Math.random() * 4 + 2;
      }
    }
  }

  private updateIdlePosition(data: WorkerAnimationData, delta: number): void {
    // Just slow breathing animation
    data.walkCycle += delta * 0.5;
  }

  private updateWalkingPosition(data: WorkerAnimationData, delta: number): void {
    if (!data.refs?.group) return;

    const group = data.refs.group;
    group.position.z += data.speed * delta * data.direction;
    data.walkCycle += delta * this.config.walkSpeed;
  }

  private updateRunningPosition(data: WorkerAnimationData, delta: number): void {
    if (!data.refs?.group) return;

    const group = data.refs.group;
    group.position.z += data.speed * 1.5 * delta * data.direction;
    data.walkCycle += delta * this.config.runSpeed;
  }

  // =====================
  // LIMB ANIMATION LOGIC
  // =====================

  private updateLimbAnimation(data: WorkerAnimationData, delta: number): void {
    const { refs, walkCycle, currentState, isStartled, isWaving, fatigueLevel } = data;
    if (!refs) return;

    // Handle special animations first (these override normal gait)

    // STARTLED POSE - Defensive reaction to nearby forklift
    if (isStartled && this.features.startledReaction) {
      this.applyStartledPose(refs, delta);
      return;
    }

    // WAVING ANIMATION - After forklift passes
    if (isWaving && this.features.waving) {
      this.applyWavingAnimation(data, refs, delta);
      // Continue with normal lower body gait below
    }

    // =====================
    // BIOMECHANICAL GAIT SYSTEM
    // =====================

    // Determine gait state
    const gaitState: 'idle' | 'walking' | 'running' | 'sitting' =
      currentState === 'running'
        ? 'running'
        : currentState === 'walking'
          ? 'walking'
          : currentState === 'sitting'
            ? 'sitting'
            : 'idle';

    // Get gait parameters (blends with tired preset based on fatigue)
    const gaitParams = getGaitParamsForState(gaitState, fatigueLevel);

    // Calculate blend factor for smooth state transitions
    const blendFactor = data.stateTransition;

    // Normalize walk cycle (0-2π radians) to phase (0-1)
    const cyclePhase = (walkCycle / (Math.PI * 2)) % 1;

    // Calculate full body pose from gait cycle
    const pose = calculateGaitPose(cyclePhase, gaitParams, blendFactor);

    // =====================
    // APPLY POSE TO REFS
    // =====================

    const smoothing = gaitState === 'running' ? 0.12 : 0.15;

    // Left leg - hip swing and knee bend
    if (refs.leftLeg) {
      damp(refs.leftLeg.rotation, 'x', pose.leftHip.x, smoothing, delta);
    }

    // Right leg - hip swing and knee bend
    if (refs.rightLeg) {
      damp(refs.rightLeg.rotation, 'x', pose.rightHip.x, smoothing, delta);
    }

    // Left arm - shoulder swing (unless waving overrides)
    if (refs.leftArm) {
      damp(refs.leftArm.rotation, 'x', pose.leftShoulder.x, smoothing, delta);
    }

    // Right arm - shoulder swing (unless waving overrides)
    if (refs.rightArm && !isWaving) {
      damp(refs.rightArm.rotation, 'x', pose.rightShoulder.x, smoothing, delta);
      damp(refs.rightArm.rotation, 'z', 0, smoothing, delta);
    }

    // Torso - forward lean and counter-rotation to hips
    if (refs.torso) {
      damp(refs.torso.rotation, 'x', pose.torsoRotation.x, smoothing, delta);
      damp(refs.torso.rotation, 'y', pose.torsoRotation.y, smoothing, delta);
      damp(refs.torso.rotation, 'z', pose.torsoRotation.z, smoothing * 0.5, delta);
    }

    // Hips - pelvis rotation and lateral sway
    if (refs.hips) {
      damp(refs.hips.rotation, 'y', pose.pelvisRotation.y, smoothing, delta);
      damp(refs.hips.position, 'x', pose.lateralOffset, smoothing * 0.5, delta);
    }

    // Head - slight bob and look direction
    if (refs.head) {
      // Combine gait head bob with manual look target
      damp(refs.head.rotation, 'x', pose.headRotation.x, smoothing, delta);
      damp(refs.head.rotation, 'y', data.headTarget, smoothing, delta);
    }
  }

  /**
   * Apply startled/defensive pose when forklift is very close
   */
  private applyStartledPose(refs: WorkerPoseRefs, delta: number): void {
    // Arms raised defensively
    if (refs.leftArm) {
      damp(refs.leftArm.rotation, 'x', -1.2, 0.2, delta);
      damp(refs.leftArm.rotation, 'z', 0.3, 0.2, delta);
    }
    if (refs.rightArm) {
      damp(refs.rightArm.rotation, 'x', -1.2, 0.2, delta);
      damp(refs.rightArm.rotation, 'z', -0.3, 0.2, delta);
    }

    // Legs slightly bent (brace position)
    if (refs.leftLeg) {
      damp(refs.leftLeg.rotation, 'x', 0.15, 0.2, delta);
    }
    if (refs.rightLeg) {
      damp(refs.rightLeg.rotation, 'x', 0.15, 0.2, delta);
    }

    // Head jerks back slightly
    if (refs.head) {
      damp(refs.head.rotation, 'x', -0.3, 0.2, delta);
    }

    // Torso leans back
    if (refs.torso) {
      damp(refs.torso.rotation, 'x', -0.15, 0.2, delta);
    }
  }

  /**
   * Apply waving animation after forklift passes
   */
  private applyWavingAnimation(
    data: WorkerAnimationData,
    refs: WorkerPoseRefs,
    delta: number
  ): void {
    // Animate wave phase
    data.wavePhase += delta * 12;
    const waveAngle = Math.sin(data.wavePhase) * 0.4;

    // Right arm waves (raised and waving)
    if (refs.rightArm) {
      refs.rightArm.rotation.x = -2.2;
      refs.rightArm.rotation.z = -0.8 + waveAngle;
    }

    // Decrement wave timer
    data.waveTimer -= delta;
    if (data.waveTimer <= 0) {
      data.isWaving = false;
      data.wavePhase = 0;
    }
  }

  // =====================
  // TIER 2 FEATURES
  // =====================

  private updateTier2Features(data: WorkerAnimationData, delta: number): void {
    // Idle variations
    if (this.features.idleVariations && data.currentState === 'idle') {
      this.updateIdleVariations(data, delta);
    }

    // Fatigue
    if (this.features.fatigue) {
      this.updateFatigue(data, delta);
    }
  }

  private updateIdleVariations(data: WorkerAnimationData, delta: number): void {
    data.idleVariationTimer -= delta;

    if (data.idleVariationTimer <= 0) {
      // Pick new variation
      const variations: IdleVariation[] = ['breathing', 'looking', 'shifting'];
      data.idleVariation = variations[Math.floor(Math.random() * variations.length)];
      data.idleVariationTimer = Math.random() * 3 + 3;
    }

    const { refs } = data;
    if (!refs) return;

    switch (data.idleVariation) {
      case 'looking':
        if (refs.head) {
          const lookTarget = Math.sin(data.walkCycle * 0.3) * 0.5;
          damp(refs.head.rotation, 'y', lookTarget, 0.05, delta);
        }
        break;
      case 'shifting':
        if (refs.hips) {
          const shiftAmount = Math.sin(data.walkCycle * 0.8) * 0.03;
          damp(refs.hips.position, 'x', shiftAmount, 0.05, delta);
        }
        break;
      case 'breathing':
      default:
        // Just subtle breathing handled by base animation
        break;
    }
  }

  private updateFatigue(data: WorkerAnimationData, delta: number): void {
    // Accumulate fatigue over shift (cap at 0.8)
    const shiftDuration = (Date.now() - data.shiftStartTime) / 1000 / 60; // minutes
    data.fatigueLevel = Math.min(0.8, shiftDuration / 60); // Max at 1 hour

    // Reset on break
    if (data.status === 'break') {
      data.fatigueLevel = Math.max(0, data.fatigueLevel - delta * 0.1);
    }

    // Apply fatigue effects (head droop, slouch)
    const { refs } = data;
    if (!refs || data.fatigueLevel < 0.1) return;

    if (refs.head && data.currentState === 'idle') {
      const headDroop = data.fatigueLevel * 0.15;
      damp(refs.head.rotation, 'x', headDroop, 0.02, delta);
    }

    if (refs.torso && data.fatigueLevel > 0.3) {
      const slouch = (data.fatigueLevel - 0.3) * 0.1;
      damp(refs.torso.rotation, 'x', slouch, 0.02, delta);
    }
  }

  // =====================
  // TIER 3 FEATURES
  // =====================

  private updateTier3Features(data: WorkerAnimationData, delta: number): void {
    // Blinking
    if (this.features.blinking) {
      this.updateBlinking(data, delta);
    }

    // Secondary motion (high LOD only)
    if (this.features.headBob || this.features.shoulderRotation || this.features.hipSway) {
      this.updateSecondaryMotion(data, delta);
    }
  }

  private updateBlinking(data: WorkerAnimationData, delta: number): void {
    const { refs } = data;
    if (!refs?.leftEyelid || !refs?.rightEyelid) return;

    data.blinkTimer -= delta;

    if (data.blinkTimer <= 0) {
      // Start blink
      data.blinkPhase = 0.15;
      data.blinkTimer = Math.random() * 4 + 2;
    }

    if (data.blinkPhase > 0) {
      data.blinkPhase -= delta;

      // Calculate blink amount (close then open)
      const blinkAmount =
        data.blinkPhase > 0.075
          ? (0.15 - data.blinkPhase) / 0.075 // Closing
          : data.blinkPhase / 0.075; // Opening

      const scaleY = 0.3 + (1 - blinkAmount) * 0.7;
      refs.leftEyelid.scale.y = scaleY;
      refs.rightEyelid.scale.y = scaleY;
    }
  }

  private updateSecondaryMotion(data: WorkerAnimationData, delta: number): void {
    if (data.currentState !== 'walking' && data.currentState !== 'running') return;

    const { refs, walkCycle } = data;
    if (!refs) return;

    // Head bob
    if (this.features.headBob && refs.torso) {
      const headBob = Math.abs(Math.sin(walkCycle * 2)) * 0.015;
      damp(refs.torso.position, 'y', headBob, 0.1, delta);
    }

    // Hip sway
    if (this.features.hipSway && refs.hips) {
      const hipSway = Math.sin(walkCycle) * 0.025;
      damp(refs.hips.position, 'x', hipSway, 0.1, delta);
    }
  }

  // =====================
  // LOD MANAGEMENT
  // =====================

  private updateLOD(data: WorkerAnimationData, camera: THREE.Camera): void {
    if (!data.refs?.group) return;

    const distance = camera.position.distanceTo(data.refs.group.position);
    data.distanceToCamera = distance;

    const lodDist = this.workerLodDistance;
    let newLod = data.lodLevel;

    // With hysteresis to prevent flickering
    const hysteresis = this.config.lodHysteresis;

    if (
      data.lodLevel === 'high' &&
      distance > lodDist * (this.config.lodHighThreshold + hysteresis)
    ) {
      newLod = 'medium';
    } else if (
      data.lodLevel === 'medium' &&
      distance < lodDist * (this.config.lodHighThreshold - hysteresis)
    ) {
      newLod = 'high';
    } else if (
      data.lodLevel === 'medium' &&
      distance > lodDist * (this.config.lodMediumThreshold + hysteresis)
    ) {
      newLod = 'low';
    } else if (
      data.lodLevel === 'low' &&
      distance < lodDist * (this.config.lodMediumThreshold - hysteresis)
    ) {
      newLod = 'medium';
    }

    // Notify if LOD changed
    if (newLod !== data.lodLevel) {
      data.lodLevel = newLod;
      const callback = this.lodChangeCallbacks.get(data.id);
      if (callback) {
        callback(newLod);
      }
    }
  }
}

// =====================
// REACT HOOK
// =====================

/**
 * React hook to create and manage the WorkerAnimationManager
 */
export function useWorkerAnimationManager(
  isTabVisible: boolean,
  quality: GraphicsQuality,
  workerLodDistance: number,
  emergencyDrillMode: boolean,
  getNearestExit: (x: number, z: number) => FireDrillExit,
  markWorkerEvacuated: (id: string) => void
) {
  const managerRef = useRef<WorkerAnimationManager | null>(null);

  // Create manager once
  if (!managerRef.current) {
    managerRef.current = new WorkerAnimationManager(quality);
  }

  const manager = managerRef.current;

  // Update settings each frame
  manager.updateSettings(
    isTabVisible,
    quality,
    workerLodDistance,
    emergencyDrillMode,
    getNearestExit,
    markWorkerEvacuated
  );

  // Reset evacuation when drill ends (side effect runs at commit, not render)
  useEffect(() => {
    if (!emergencyDrillMode) {
      manager.resetEvacuation();
    }
  }, [emergencyDrillMode, manager]);

  // Single useFrame for ALL workers
  useFrame((state, delta) => {
    manager.update(delta, state.camera);
  });

  // Memoized callbacks
  const register = useCallback(
    (config: WorkerAnimationConfig, refs: WorkerPoseRefs) => {
      return manager.register(config, refs);
    },
    [manager]
  );

  const getLOD = useCallback((id: string) => manager.getLOD(id), [manager]);

  const onLodChange = useCallback(
    (id: string, callback: (lod: LODLevel) => void) => {
      return manager.onLodChange(id, callback);
    },
    [manager]
  );

  const updateWorkerStatus = useCallback(
    (id: string, status: WorkerAnimationData['status']) => {
      manager.updateWorkerStatus(id, status);
    },
    [manager]
  );

  const updateRefs = useCallback(
    (id: string, refs: WorkerPoseRefs) => {
      manager.updateRefs(id, refs);
    },
    [manager]
  );

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      register,
      getLOD,
      onLodChange,
      updateWorkerStatus,
      updateRefs,
    }),
    [register, getLOD, onLodChange, updateWorkerStatus, updateRefs]
  );
}
