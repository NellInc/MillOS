/**
 * HumanModel - Detailed animated human worker model
 * Handles all limb animations, breathing, blinking, idle behaviors, and special actions
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { shouldRunThisFrame, getThrottleLevel } from '../../utils/frameThrottle';
import {
  SHARED_WORKER_MATERIALS,
  getSkinMaterial,
  getSkinSoftMaterial,
  getHairMaterial,
  getUniformMaterial,
  getPantsMaterial,
} from './SharedWorkerMaterials';
import { SHARED_WORKER_GEOMETRY } from './SharedWorkerGeometries';
import { Hair } from './WorkerHair';
import { ToolAccessory } from './WorkerTools';
import type { HairStyle, ToolType } from './workerTypes';
import type { IdleAnimationType, SpecialAction } from './shared';
import { ROLE_WORKING_POSES } from './shared';

interface HumanModelProps {
  walkCycleRef: React.MutableRefObject<number>;
  uniformColor: string;
  skinTone: string;
  hatColor: string;
  hasVest: boolean;
  pantsColor: string;
  headRotation?: number;
  hairColor: string;
  hairStyle: HairStyle;
  tool: ToolType;
  role?: string;
  isWaving?: boolean;
  isIdle?: boolean;
  isStartled?: boolean;
  alertDirection?: number;
  fatigueLevel?: number;
  nearbyWorkerDirection?: number;
  specialAction?: SpecialAction;
  pointDirection?: number;
  distanceToCamera?: number;
}

export const HumanModel: React.FC<HumanModelProps> = React.memo(
  ({
    walkCycleRef,
    uniformColor,
    skinTone,
    hatColor,
    hasVest,
    pantsColor,
    headRotation = 0,
    hairColor,
    hairStyle,
    tool,
    role = 'Operator',
    isWaving = false,
    isIdle = false,
    isStartled = false,
    alertDirection,
    fatigueLevel = 0,
    nearbyWorkerDirection,
    specialAction = 'none',
    pointDirection = 0,
    distanceToCamera = 0,
  }) => {
    // Body part refs for animation
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const torsoRef = useRef<THREE.Group>(null);
    const chestRef = useRef<THREE.Mesh>(null);
    const hipsRef = useRef<THREE.Mesh>(null);
    const leftEyelidRef = useRef<THREE.Mesh>(null);
    const rightEyelidRef = useRef<THREE.Mesh>(null);
    const leftFingersRef = useRef<THREE.Mesh>(null);
    const rightFingersRef = useRef<THREE.Mesh>(null);

    // Animation state refs (avoid re-renders)
    const wavePhaseRef = useRef(0);
    const idleAnimationRef = useRef<IdleAnimationType>('breathing');
    const idlePhaseRef = useRef(0);
    const idleLookTargetRef = useRef(0);
    const weightShiftRef = useRef(0);
    const blinkTimerRef = useRef(Math.random() * 3 + 2);
    const blinkPhaseRef = useRef(0);
    const startledPhaseRef = useRef(0);
    const workingPhaseRef = useRef(0);
    const gripAmountRef = useRef(0);
    const celebratePhaseRef = useRef(0);
    const sittingTransitionRef = useRef(0);
    const carryBobRef = useRef(0);

    // Cache graphics settings (updated every ~1 second instead of every frame)
    const cachedThrottleLevelRef = useRef(2);
    const cachedLodDistanceRef = useRef(50);
    const settingsCacheFrameRef = useRef(0);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

    // Animate limbs, torso, and head with enhanced secondary motion
    useFrame((state, delta) => {
      // PERFORMANCE: Skip all worker animations when tab is hidden
      if (!isTabVisible) return;

      // Update cached settings every 60 frames (~1 second at 60fps)
      if (settingsCacheFrameRef.current % 60 === 0) {
        const graphics = useGraphicsStore.getState().graphics;
        cachedThrottleLevelRef.current = getThrottleLevel(graphics.quality);
        cachedLodDistanceRef.current = graphics.workerLodDistance;
      }
      settingsCacheFrameRef.current++;

      // PERFORMANCE: Skip ALL limb animations on LOW quality - just show static workers
      const graphics = useGraphicsStore.getState().graphics;
      if (graphics.quality === 'low') {
        return; // Workers are static on LOW quality
      }

      // Frame throttling for performance - worker animations don't need 60fps
      if (!shouldRunThisFrame(cachedThrottleLevelRef.current)) {
        return; // Skip this frame
      }

      // Cap delta to prevent huge jumps (max 100ms)
      const cappedDelta = Math.min(delta, 0.1);
      const walkCycle = walkCycleRef.current;
      const time = state.clock.elapsedTime;
      const isDoingSomething = isIdle && tool !== 'none';

      // Get LOD distance from cached settings
      const lodDistance = cachedLodDistanceRef.current;

      // Animation LOD - tiered complexity reduction for distant workers
      // LOD thresholds scale with the user's workerLodDistance setting
      // Tier 1 (0-25% of lodDistance): Full detail - all animations including blinking, idle variations
      // Tier 2 (25-50% of lodDistance): Medium detail - basic walk/idle, no blinking or facial animations
      // Tier 3 (50-80% of lodDistance): Low detail - just breathing and basic limb movement
      // Tier 4 (80%+ of lodDistance): Minimal - static pose with breathing only
      const fullDetailThreshold = lodDistance * 0.25;
      const mediumDetailThreshold = lodDistance * 0.5;
      const lowDetailThreshold = lodDistance * 0.8;

      const isFullDetail = distanceToCamera < fullDetailThreshold;
      const isLowDetail =
        distanceToCamera >= mediumDetailThreshold && distanceToCamera < lowDetailThreshold;
      const isMinimalDetail = distanceToCamera >= lowDetailThreshold;

      // Skip most animation for very distant workers (Tier 4)
      if (isMinimalDetail) {
        // Only breathing for distant workers
        if (chestRef.current) {
          const breathScale = 1 + Math.sin(time * 1.2) * 0.015;
          chestRef.current.scale.y = breathScale;
        }
        return;
      }

      // Low detail tier (Tier 3) - skip idle variations and facial animations
      if (isLowDetail) {
        // Basic breathing
        const breathScale = 1 + Math.sin(time * 1.2) * 0.015;
        if (chestRef.current) {
          chestRef.current.scale.y = breathScale;
        }
        // Simplified arm swing only when walking
        const armSwing = isIdle ? 0 : Math.sin(walkCycle) * 0.3;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = armSwing;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -armSwing;
        }
        // Basic leg movement
        const legSwing = isIdle ? 0 : Math.sin(walkCycle) * 0.4;
        if (leftLegRef.current) {
          leftLegRef.current.rotation.x = -legSwing;
        }
        if (rightLegRef.current) {
          rightLegRef.current.rotation.x = legSwing;
        }
        return;
      }

      // === BREATHING (always active) ===
      const breathCycle = time * 1.2;
      const breathScale = 1 + Math.sin(breathCycle) * 0.015;
      const breathScaleX = 1 + Math.sin(breathCycle) * 0.008;

      if (chestRef.current) {
        chestRef.current.scale.y = THREE.MathUtils.lerp(chestRef.current.scale.y, breathScale, 0.1);
        chestRef.current.scale.x = THREE.MathUtils.lerp(
          chestRef.current.scale.x,
          breathScaleX,
          0.1
        );
      }

      // === EYE BLINKING (only for close-up detail) ===
      if (isFullDetail) {
        blinkTimerRef.current -= cappedDelta;
        if (blinkTimerRef.current <= 0) {
          blinkPhaseRef.current = 0.15; // Start blink (duration in seconds)
          blinkTimerRef.current = Math.random() * 4 + 2; // Next blink in 2-6s
        }
        if (blinkPhaseRef.current > 0) {
          blinkPhaseRef.current -= cappedDelta;
          const blinkAmount =
            blinkPhaseRef.current > 0.075
              ? (0.15 - blinkPhaseRef.current) / 0.075 // Closing
              : blinkPhaseRef.current / 0.075; // Opening
          if (leftEyelidRef.current) {
            leftEyelidRef.current.scale.y = 0.3 + blinkAmount * 0.7;
          }
          if (rightEyelidRef.current) {
            rightEyelidRef.current.scale.y = 0.3 + blinkAmount * 0.7;
          }
        }
      }

      // === STARTLED REACTION ===
      if (isStartled) {
        startledPhaseRef.current = Math.min(startledPhaseRef.current + cappedDelta * 8, 1);
      } else {
        startledPhaseRef.current = Math.max(startledPhaseRef.current - cappedDelta * 3, 0);
      }
      const startledAmount = startledPhaseRef.current;

      // === SPECIAL ACTIONS (override normal animations) ===
      if (specialAction !== 'none' && isFullDetail) {
        switch (specialAction) {
          case 'running': {
            // Fast, exaggerated run cycle
            const runCycle = walkCycle * 1.8; // Faster cycle
            const runArmSwing = Math.sin(runCycle) * 0.9; // Bigger arm swing
            const runLegSwing = Math.sin(runCycle) * 0.85; // Bigger leg swing
            const runLean = 0.15; // Strong forward lean

            if (leftArmRef.current) {
              leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
                leftArmRef.current.rotation.x,
                runArmSwing - 0.5,
                0.2
              );
              leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
                leftArmRef.current.rotation.z,
                0.3,
                0.1
              );
            }
            if (rightArmRef.current) {
              rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.x,
                -runArmSwing - 0.5,
                0.2
              );
              rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.z,
                -0.3,
                0.1
              );
            }
            if (leftLegRef.current) {
              leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
                leftLegRef.current.rotation.x,
                -runLegSwing,
                0.2
              );
            }
            if (rightLegRef.current) {
              rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
                rightLegRef.current.rotation.x,
                runLegSwing,
                0.2
              );
            }
            if (torsoRef.current) {
              torsoRef.current.rotation.x = THREE.MathUtils.lerp(
                torsoRef.current.rotation.x,
                runLean,
                0.1
              );
              torsoRef.current.position.y = Math.abs(Math.sin(runCycle * 2)) * 0.04; // Bounce
            }
            if (headRef.current) {
              headRef.current.rotation.x = THREE.MathUtils.lerp(
                headRef.current.rotation.x,
                -0.1,
                0.1
              );
            }
            return; // Skip normal animations
          }

          case 'carrying': {
            // Arms in front holding position, slower walk
            carryBobRef.current = Math.sin(walkCycle * 0.5) * 0.02;
            if (leftArmRef.current) {
              leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
                leftArmRef.current.rotation.x,
                -1.0,
                0.1
              );
              leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
                leftArmRef.current.rotation.z,
                0.3,
                0.1
              );
            }
            if (rightArmRef.current) {
              rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.x,
                -1.0,
                0.1
              );
              rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.z,
                -0.3,
                0.1
              );
            }
            if (torsoRef.current) {
              torsoRef.current.rotation.x = THREE.MathUtils.lerp(
                torsoRef.current.rotation.x,
                0.1,
                0.05
              ); // Lean back
              torsoRef.current.position.y = carryBobRef.current;
            }
            // Slower leg movement for carrying
            const carryLegSwing = Math.sin(walkCycle * 0.7) * 0.3;
            if (leftLegRef.current) {
              leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
                leftLegRef.current.rotation.x,
                -carryLegSwing,
                0.1
              );
            }
            if (rightLegRef.current) {
              rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
                rightLegRef.current.rotation.x,
                carryLegSwing,
                0.1
              );
            }
            return;
          }

          case 'sitting': {
            // Transition to seated pose
            sittingTransitionRef.current = THREE.MathUtils.lerp(
              sittingTransitionRef.current,
              1,
              0.05
            );
            const sitAmount = sittingTransitionRef.current;

            if (leftLegRef.current) {
              leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
                leftLegRef.current.rotation.x,
                -1.5 * sitAmount,
                0.08
              );
            }
            if (rightLegRef.current) {
              rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
                rightLegRef.current.rotation.x,
                -1.5 * sitAmount,
                0.08
              );
            }
            if (torsoRef.current) {
              torsoRef.current.position.y = THREE.MathUtils.lerp(
                torsoRef.current.position.y,
                -0.4 * sitAmount,
                0.05
              );
              torsoRef.current.rotation.x = THREE.MathUtils.lerp(
                torsoRef.current.rotation.x,
                -0.1 * sitAmount,
                0.05
              );
            }
            if (leftArmRef.current) {
              leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
                leftArmRef.current.rotation.x,
                -0.3 * sitAmount,
                0.08
              );
            }
            if (rightArmRef.current && !isWaving) {
              rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.x,
                -0.3 * sitAmount,
                0.08
              );
            }
            if (hipsRef.current) {
              hipsRef.current.position.y = THREE.MathUtils.lerp(
                hipsRef.current.position.y || 0,
                -0.3 * sitAmount,
                0.05
              );
            }
            return;
          }

          case 'celebrating': {
            // Fist pump celebration
            celebratePhaseRef.current += cappedDelta * 4;
            const celebrateCycle = Math.sin(celebratePhaseRef.current);
            const pumpHeight = Math.max(0, celebrateCycle) * 0.8;

            if (rightArmRef.current) {
              rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.x,
                -2.5 - pumpHeight * 0.5,
                0.2
              );
              rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.z,
                -0.3,
                0.1
              );
            }
            if (leftArmRef.current) {
              // Subtle secondary arm movement
              leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
                leftArmRef.current.rotation.x,
                -0.5 + celebrateCycle * 0.2,
                0.1
              );
            }
            if (torsoRef.current) {
              torsoRef.current.rotation.x = THREE.MathUtils.lerp(
                torsoRef.current.rotation.x,
                -0.05,
                0.1
              );
              torsoRef.current.position.y = Math.max(0, celebrateCycle) * 0.03; // Slight bounce
            }
            if (headRef.current) {
              headRef.current.rotation.x = THREE.MathUtils.lerp(
                headRef.current.rotation.x,
                -0.2,
                0.1
              ); // Look up
            }
            // Grip fist for pump
            gripAmountRef.current = THREE.MathUtils.lerp(gripAmountRef.current, 1, 0.2);
            return;
          }

          case 'pointing': {
            // Extend right arm to point
            const clampedPointDir = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pointDirection));
            if (rightArmRef.current) {
              rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.x,
                -1.3,
                0.12
              );
              rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.z,
                clampedPointDir * 0.5 - 0.5,
                0.1
              );
            }
            if (headRef.current) {
              headRef.current.rotation.y = THREE.MathUtils.lerp(
                headRef.current.rotation.y,
                clampedPointDir,
                0.1
              );
              headRef.current.rotation.x = THREE.MathUtils.lerp(
                headRef.current.rotation.x,
                0.1,
                0.1
              );
            }
            if (torsoRef.current) {
              torsoRef.current.rotation.y = THREE.MathUtils.lerp(
                torsoRef.current.rotation.y,
                clampedPointDir * 0.3,
                0.08
              );
            }
            // Keep index finger extended (minimal grip)
            gripAmountRef.current = THREE.MathUtils.lerp(gripAmountRef.current, 0.3, 0.1);
            return;
          }
        }
      } else {
        // Reset sitting transition when not sitting
        sittingTransitionRef.current = THREE.MathUtils.lerp(sittingTransitionRef.current, 0, 0.1);
        celebratePhaseRef.current = 0;
      }

      // === WALK CYCLE CALCULATIONS ===
      const isWalking = !isIdle && !isDoingSomething;

      // Primary limb motion
      const legSwing = isIdle ? 0 : Math.sin(walkCycle) * 0.6;

      // Secondary motion (only for full detail)
      const hipSway = isWalking && isFullDetail ? Math.sin(walkCycle) * 0.025 : 0;
      const shoulderCounter = isWalking && isFullDetail ? Math.sin(walkCycle) * 0.06 : 0;
      const headBob = isWalking && isFullDetail ? Math.abs(Math.sin(walkCycle * 2)) * 0.015 : 0;
      const torsoLean = isWalking ? 0.04 : 0; // Slight forward lean when walking

      // === IDLE ANIMATION VARIETY ===
      if (isIdle && !isDoingSomething && isFullDetail) {
        idlePhaseRef.current += cappedDelta;

        // Cycle through idle animations every 3-6 seconds
        if (idlePhaseRef.current > 4) {
          const animations: IdleAnimationType[] = [
            'breathing',
            'looking',
            'shifting',
            'stretching',
          ];
          idleAnimationRef.current = animations[Math.floor(Math.random() * animations.length)];
          idlePhaseRef.current = 0;
          // Set new look target for 'looking' animation
          idleLookTargetRef.current = (Math.random() - 0.5) * 1.2; // ±60 degrees
        }

        // Apply idle animation effects
        switch (idleAnimationRef.current) {
          case 'looking':
            // Smooth head turn to look around
            if (headRef.current) {
              const lookProgress = Math.min(idlePhaseRef.current / 1.5, 1);
              const easedProgress = 1 - Math.pow(1 - lookProgress, 3); // Ease out cubic
              headRef.current.rotation.y = THREE.MathUtils.lerp(
                headRef.current.rotation.y,
                idleLookTargetRef.current * easedProgress,
                0.05
              );
            }
            break;

          case 'shifting':
            // Weight shift side to side
            weightShiftRef.current = Math.sin(time * 0.8) * 0.03;
            if (hipsRef.current) {
              hipsRef.current.position.x = THREE.MathUtils.lerp(
                hipsRef.current.position.x,
                weightShiftRef.current,
                0.05
              );
            }
            if (torsoRef.current) {
              torsoRef.current.rotation.z = THREE.MathUtils.lerp(
                torsoRef.current.rotation.z,
                -weightShiftRef.current * 0.5,
                0.05
              );
            }
            break;

          case 'stretching':
            // Subtle arm stretch (only first 2 seconds of idle)
            if (idlePhaseRef.current < 2 && rightArmRef.current && !isWaving) {
              const stretchProgress = Math.sin((idlePhaseRef.current * Math.PI) / 2);
              rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.x,
                -0.3 * stretchProgress,
                0.08
              );
              rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
                rightArmRef.current.rotation.z,
                -0.2 * stretchProgress,
                0.08
              );
            }
            break;

          case 'breathing':
          default:
            // Just enhanced breathing (already handled above)
            break;
        }
      } else {
        // Reset idle animation state when not idle
        idlePhaseRef.current = 0;
      }

      // === TORSO ANIMATION ===
      if (torsoRef.current) {
        // Hip sway during walking
        torsoRef.current.position.x = THREE.MathUtils.lerp(
          torsoRef.current.position.x,
          hipSway,
          0.12
        );
        // Forward lean when walking
        torsoRef.current.rotation.x = THREE.MathUtils.lerp(
          torsoRef.current.rotation.x,
          torsoLean,
          0.08
        );
        // Shoulder counter-rotation
        if (!isIdle || idleAnimationRef.current !== 'shifting') {
          torsoRef.current.rotation.y = THREE.MathUtils.lerp(
            torsoRef.current.rotation.y,
            shoulderCounter,
            0.1
          );
          torsoRef.current.rotation.z = THREE.MathUtils.lerp(torsoRef.current.rotation.z, 0, 0.05);
        }
        // Head bob via torso Y position
        torsoRef.current.position.y = THREE.MathUtils.lerp(
          torsoRef.current.position.y,
          headBob,
          0.15
        );
      }

      // === ARM ANIMATION ===
      // Get role-specific working pose
      const workingPose = ROLE_WORKING_POSES[role] || ROLE_WORKING_POSES['Operator'];
      workingPhaseRef.current += cappedDelta * 2; // Subtle oscillation for working animation

      if (leftArmRef.current) {
        if (startledAmount > 0) {
          // Startled: arms raise defensively
          leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
            leftArmRef.current.rotation.x,
            -1.2 * startledAmount,
            0.2
          );
          leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
            leftArmRef.current.rotation.z,
            0.5 * startledAmount,
            0.2
          );
        } else if (isDoingSomething) {
          // Role-specific working pose with subtle motion
          const workOscillation = Math.sin(workingPhaseRef.current) * 0.05;
          leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
            leftArmRef.current.rotation.x,
            workingPose.leftArm.x + workOscillation,
            0.05
          );
          leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
            leftArmRef.current.rotation.z,
            workingPose.leftArm.z,
            0.05
          );
        } else {
          // Natural arm swing with slight phase offset
          const leftArmTarget = Math.sin(walkCycle + 0.1) * (isIdle ? 0.05 : 0.5);
          leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
            leftArmRef.current.rotation.x,
            leftArmTarget,
            0.1
          );
          leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
            leftArmRef.current.rotation.z,
            0,
            0.1
          );
        }
      }

      if (rightArmRef.current) {
        if (startledAmount > 0 && !isWaving) {
          // Startled: arms raise defensively
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.x,
            -1.2 * startledAmount,
            0.2
          );
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.z,
            -0.5 * startledAmount,
            0.2
          );
        } else if (isWaving) {
          // Waving animation
          wavePhaseRef.current += cappedDelta * 12;
          const waveAngle = Math.sin(wavePhaseRef.current) * 0.4;
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.x,
            -2.2,
            0.15
          );
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.z,
            -0.8 + waveAngle,
            0.2
          );
        } else if (isDoingSomething) {
          // Role-specific working pose with subtle motion
          const workOscillation = Math.sin(workingPhaseRef.current + 1) * 0.08;
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.x,
            workingPose.rightArm.x + workOscillation,
            0.05
          );
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.z,
            workingPose.rightArm.z,
            0.05
          );
        } else if (idleAnimationRef.current !== 'stretching' || !isIdle) {
          // Natural arm swing (opposite phase from left arm)
          const rightArmTarget = -Math.sin(walkCycle + 0.1) * (isIdle ? 0.05 : 0.5);
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.x,
            rightArmTarget,
            0.1
          );
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.z,
            0,
            0.1
          );
          wavePhaseRef.current = 0;
        }
      }

      // === FINGER GRIP ANIMATION ===
      // Curl fingers when holding tools
      const shouldGrip = tool !== 'none' && (isDoingSomething || isWaving);
      const targetGrip = shouldGrip ? 1 : 0;
      gripAmountRef.current = THREE.MathUtils.lerp(gripAmountRef.current, targetGrip, 0.1);

      if (leftFingersRef.current && isFullDetail) {
        // Curl fingers by rotating them inward (around X axis)
        leftFingersRef.current.rotation.x = gripAmountRef.current * 0.8;
        leftFingersRef.current.scale.y = 1 - gripAmountRef.current * 0.3; // Compress slightly
      }
      if (rightFingersRef.current && isFullDetail) {
        rightFingersRef.current.rotation.x = gripAmountRef.current * 0.5; // Less curl on right (often empty)
        rightFingersRef.current.scale.y = 1 - gripAmountRef.current * 0.2;
      }

      // === LEG ANIMATION ===
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
          leftLegRef.current.rotation.x,
          -legSwing,
          0.1
        );
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
          rightLegRef.current.rotation.x,
          legSwing,
          0.1
        );
      }

      // === HEAD ANIMATION ===
      // Fatigue adds a slight droop to head
      const fatigueHeadDroop = fatigueLevel * 0.15;

      if (headRef.current) {
        if (startledAmount > 0) {
          // Startled: head jerks back
          headRef.current.rotation.x = THREE.MathUtils.lerp(
            headRef.current.rotation.x,
            -0.3 * startledAmount,
            0.25
          );
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            headRotation,
            0.15
          );
        } else if (alertDirection !== undefined && isFullDetail) {
          // Alert reaction: quickly look toward alert source
          const clampedAlertDir = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, alertDirection));
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            clampedAlertDir,
            0.15
          );
          headRef.current.rotation.x = THREE.MathUtils.lerp(
            headRef.current.rotation.x,
            -0.1 + fatigueHeadDroop,
            0.1
          ); // Slight upward look
        } else if (nearbyWorkerDirection !== undefined && isIdle && isFullDetail) {
          // Social: nod toward nearby worker
          const clampedSocialDir = Math.max(
            -Math.PI / 3,
            Math.min(Math.PI / 3, nearbyWorkerDirection)
          );
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            clampedSocialDir,
            0.08
          );
          // Subtle nod
          const nodAmount = Math.sin(time * 2) * 0.05;
          headRef.current.rotation.x = THREE.MathUtils.lerp(
            headRef.current.rotation.x,
            nodAmount + fatigueHeadDroop,
            0.1
          );
        } else if (isIdle && idleAnimationRef.current === 'looking') {
          // Already handled in idle animation section
          headRef.current.rotation.x = THREE.MathUtils.lerp(
            headRef.current.rotation.x,
            fatigueHeadDroop,
            0.05
          );
        } else if (isDoingSomething) {
          // Role-specific head tilt while working
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            workingPose.headTilt.y,
            0.1
          );
          headRef.current.rotation.x = THREE.MathUtils.lerp(
            headRef.current.rotation.x,
            workingPose.headTilt.x + fatigueHeadDroop,
            0.1
          );
        } else {
          // Normal head tracking (forklift awareness) or forward
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            headRotation,
            0.1
          );
          headRef.current.rotation.x = THREE.MathUtils.lerp(
            headRef.current.rotation.x,
            fatigueHeadDroop,
            0.1
          );
        }
      }

      // === FATIGUE EFFECTS ON POSTURE ===
      if (fatigueLevel > 0 && torsoRef.current) {
        // Shoulders droop, slight slouch
        const slouch = fatigueLevel * 0.08;
        torsoRef.current.rotation.x = THREE.MathUtils.lerp(
          torsoRef.current.rotation.x,
          torsoRef.current.rotation.x + slouch,
          0.02
        );
      }

      // === CROUCH FOR WORKING ROLES ===
      if (isDoingSomething && workingPose.crouch > 0) {
        if (leftLegRef.current) {
          leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
            leftLegRef.current.rotation.x,
            -workingPose.crouch * 0.8,
            0.05
          );
        }
        if (rightLegRef.current) {
          rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
            rightLegRef.current.rotation.x,
            -workingPose.crouch * 0.8,
            0.05
          );
        }
        if (torsoRef.current) {
          torsoRef.current.rotation.x = THREE.MathUtils.lerp(
            torsoRef.current.rotation.x,
            workingPose.torsoLean,
            0.05
          );
        }
      }

      // === HIPS RESET (when not shifting) ===
      if (hipsRef.current && (!isIdle || idleAnimationRef.current !== 'shifting')) {
        hipsRef.current.position.x = THREE.MathUtils.lerp(hipsRef.current.position.x, 0, 0.05);
      }
    });

    return (
      <group scale={[0.85, 0.85, 0.85]} position={[0, 0.22, 0]}>
        {/* === TORSO === */}
        <group ref={torsoRef} position={[0, 1.15, 0]}>
          {/* Upper torso / chest */}
          <mesh
            ref={chestRef}
            castShadow
            position={[0, 0.2, 0]}
            geometry={SHARED_WORKER_GEOMETRY.torso}
            material={getUniformMaterial(uniformColor)}
          />

          {/* Shoulders - rounded */}
          <mesh
            castShadow
            position={[-0.28, 0.32, 0]}
            geometry={SHARED_WORKER_GEOMETRY.sphere_med}
            scale={[0.1, 0.1, 0.1]}
            material={getUniformMaterial(uniformColor)}
          />
          <mesh
            castShadow
            position={[0.28, 0.32, 0]}
            geometry={SHARED_WORKER_GEOMETRY.sphere_med}
            scale={[0.1, 0.1, 0.1]}
            material={getUniformMaterial(uniformColor)}
          />

          {/* Lower torso / waist */}
          <mesh
            castShadow
            position={[0, -0.15, 0]}
            geometry={SHARED_WORKER_GEOMETRY.box_small}
            scale={[0.42, 0.3, 0.22]}
            material={getUniformMaterial(uniformColor)}
          />

          {/* Safety vest overlay - pushed forward to z=0.03 to prevent z-fighting with chest */}
          {hasVest && (
            <>
              <mesh
                castShadow
                position={[0, 0.15, 0.03]}
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.5, 0.52, 0.22]}
                material={SHARED_WORKER_MATERIALS.vestOrange}
              />
              {/* Reflective stripes - raised above vest surface */}
              <mesh
                position={[0, 0.32, 0.145]}
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.51, 0.035, 0.01]}
                material={SHARED_WORKER_MATERIALS.offWhite}
              />
              <mesh
                position={[0, 0.12, 0.145]}
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.51, 0.035, 0.01]}
                material={SHARED_WORKER_MATERIALS.offWhite}
              />
              <mesh
                position={[0, -0.08, 0.145]}
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.51, 0.035, 0.01]}
                material={SHARED_WORKER_MATERIALS.offWhite}
              />
            </>
          )}

          {/* Collar */}
          <mesh
            castShadow
            position={[0, 0.48, 0.02]}
            geometry={SHARED_WORKER_GEOMETRY.box_small}
            scale={[0.2, 0.08, 0.15]}
            material={getUniformMaterial(uniformColor)}
          />

          {/* Neck */}
          <mesh
            castShadow
            position={[0, 0.58, 0]}
            geometry={SHARED_WORKER_GEOMETRY.cylinder_med}
            scale={[0.08, 0.12, 0.08]}
            material={getSkinMaterial(skinTone)}
          />

          {/* === HEAD === */}
          <group ref={headRef} position={[0, 0.82, 0]}>
            {/* Head base - slightly elongated sphere */}
            <mesh
              castShadow
              geometry={SHARED_WORKER_GEOMETRY.head}
              material={getSkinSoftMaterial(skinTone)}
            />

            {/* Jaw / chin area */}
            <mesh
              castShadow
              position={[0, -0.08, 0.05]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_med}
              scale={[0.1, 0.1, 0.1]}
              material={getSkinSoftMaterial(skinTone)}
            />

            {/* Nose */}
            <mesh castShadow position={[0, -0.02, 0.155]} material={getSkinMaterial(skinTone)}>
              <coneGeometry args={[0.025, 0.05, 8]} />
            </mesh>
            <mesh
              castShadow
              position={[0, -0.045, 0.16]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.022, 0.022, 0.022]}
              material={getSkinMaterial(skinTone)}
            />

            {/* Eyes - whites */}
            <mesh
              position={[-0.055, 0.025, 0.135]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_med}
              scale={[0.028, 0.028, 0.028]}
              material={SHARED_WORKER_MATERIALS.eyeWhite}
            />
            <mesh
              position={[0.055, 0.025, 0.135]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_med}
              scale={[0.028, 0.028, 0.028]}
              material={SHARED_WORKER_MATERIALS.eyeWhite}
            />

            {/* Irises */}
            <mesh
              position={[-0.055, 0.025, 0.158]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.016, 0.016, 0.016]}
              material={SHARED_WORKER_MATERIALS.iris}
            />
            <mesh
              position={[0.055, 0.025, 0.158]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.016, 0.016, 0.016]}
              material={SHARED_WORKER_MATERIALS.iris}
            />

            {/* Pupils */}
            <mesh
              position={[-0.055, 0.025, 0.168]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.008, 0.008, 0.008]}
              material={SHARED_WORKER_MATERIALS.pupil}
            />
            <mesh
              position={[0.055, 0.025, 0.168]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.008, 0.008, 0.008]}
              material={SHARED_WORKER_MATERIALS.pupil}
            />

            {/* Eyelids (for blinking) */}
            <mesh
              ref={leftEyelidRef}
              position={[-0.055, 0.045, 0.155]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.04, 0.025, 0.02]}
              material={getSkinMaterial(skinTone)}
            />
            <mesh
              ref={rightEyelidRef}
              position={[0.055, 0.045, 0.155]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.04, 0.025, 0.02]}
              material={getSkinMaterial(skinTone)}
            />

            {/* Eyebrows */}
            <mesh
              position={[-0.055, 0.07, 0.14]}
              rotation={[0.15, 0, 0.12]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.045, 0.012, 0.015]}
              material={getHairMaterial(hairColor)}
            />
            <mesh
              position={[0.055, 0.07, 0.14]}
              rotation={[0.15, 0, -0.12]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.045, 0.012, 0.015]}
              material={getHairMaterial(hairColor)}
            />

            {/* Mouth */}
            <mesh
              position={[0, -0.075, 0.14]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.06, 0.015, 0.01]}
              material={SHARED_WORKER_MATERIALS.lips}
            />

            {/* Ears */}
            <mesh
              castShadow
              position={[-0.165, 0, 0]}
              rotation={[0, -0.2, 0]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.035, 0.035, 0.035]}
              material={getSkinMaterial(skinTone)}
            />
            <mesh
              castShadow
              position={[0.165, 0, 0]}
              rotation={[0, 0.2, 0]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_low}
              scale={[0.035, 0.035, 0.035]}
              material={getSkinMaterial(skinTone)}
            />

            {/* Hair (visible under hard hat) */}
            <Hair style={hairStyle} color={hairColor} />

            {/* Hard Hat */}
            <group position={[0, 0.1, 0]}>
              {/* Hat dome */}
              <mesh castShadow>
                <sphereGeometry args={[0.19, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={hatColor} metalness={0.35} roughness={0.45} />
              </mesh>
              {/* Hat brim */}
              <mesh castShadow position={[0, -0.02, 0]}>
                <cylinderGeometry args={[0.21, 0.21, 0.025, 32]} />
                <meshStandardMaterial color={hatColor} metalness={0.35} roughness={0.45} />
              </mesh>
              {/* Hat ridge */}
              <mesh castShadow position={[0, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.015, 0.3, 4, 8]} />
                <meshStandardMaterial color={hatColor} metalness={0.35} roughness={0.45} />
              </mesh>
            </group>
          </group>

          {/* === LEFT ARM === */}
          <group ref={leftArmRef} position={[-0.34, 0.22, 0]}>
            {/* Upper arm */}
            <mesh
              castShadow
              position={[0, -0.15, 0]}
              geometry={SHARED_WORKER_GEOMETRY.limb_capsule}
              material={getUniformMaterial(uniformColor)}
            />
            {/* Elbow */}
            <mesh
              castShadow
              position={[0, -0.3, 0]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_med}
              scale={[0.055, 0.055, 0.055]}
              material={getUniformMaterial(uniformColor)}
            />
            {/* Forearm */}
            <mesh
              castShadow
              position={[0, -0.45, 0]}
              geometry={SHARED_WORKER_GEOMETRY.capsule_med}
              scale={[0.045, 0.045, 0.045]}
              material={getSkinMaterial(skinTone)}
            />
            {/* Hand */}
            <group position={[0, -0.62, 0]}>
              <mesh
                castShadow
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.06, 0.08, 0.03]}
                material={getSkinMaterial(skinTone)}
              />
              {/* Fingers */}
              <mesh
                ref={leftFingersRef}
                castShadow
                position={[0, -0.055, 0]}
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.055, 0.04, 0.025]}
                material={getSkinMaterial(skinTone)}
              />
              {/* Tool accessory */}
              <ToolAccessory tool={tool} />
            </group>
          </group>

          {/* === RIGHT ARM === */}
          <group ref={rightArmRef} position={[0.34, 0.22, 0]}>
            {/* Upper arm */}
            <mesh
              castShadow
              position={[0, -0.15, 0]}
              geometry={SHARED_WORKER_GEOMETRY.limb_capsule}
              material={getUniformMaterial(uniformColor)}
            />
            {/* Elbow */}
            <mesh
              castShadow
              position={[0, -0.3, 0]}
              geometry={SHARED_WORKER_GEOMETRY.sphere_med}
              scale={[0.055, 0.055, 0.055]}
              material={getUniformMaterial(uniformColor)}
            />
            {/* Forearm */}
            <mesh
              castShadow
              position={[0, -0.45, 0]}
              geometry={SHARED_WORKER_GEOMETRY.capsule_med}
              scale={[0.045, 0.045, 0.045]}
              material={getSkinMaterial(skinTone)}
            />
            {/* Hand */}
            <group position={[0, -0.62, 0]}>
              <mesh
                castShadow
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.06, 0.08, 0.03]}
                material={getSkinMaterial(skinTone)}
              />
              {/* Fingers */}
              <mesh
                ref={rightFingersRef}
                castShadow
                position={[0, -0.055, 0]}
                geometry={SHARED_WORKER_GEOMETRY.box_small}
                scale={[0.055, 0.04, 0.025]}
                material={getSkinMaterial(skinTone)}
              />
            </group>
          </group>
        </group>

        {/* === HIPS / PELVIS === */}
        <mesh
          ref={hipsRef}
          castShadow
          position={[0, 0.72, 0]}
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.38, 0.14, 0.2]}
          material={getPantsMaterial(pantsColor)}
        />

        {/* Belt */}
        <mesh
          castShadow
          position={[0, 0.78, 0]}
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.4, 0.04, 0.22]}
          material={SHARED_WORKER_MATERIALS.darkGray}
        />
        {/* Belt buckle */}
        <mesh
          castShadow
          position={[0, 0.78, 0.115]}
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.05, 0.035, 0.01]}
        >
          <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* === LEFT LEG === */}
        <group ref={leftLegRef} position={[-0.1, 0.62, 0]}>
          {/* Upper thigh */}
          <mesh
            castShadow
            position={[0, -0.18, 0]}
            geometry={SHARED_WORKER_GEOMETRY.capsule_med}
            scale={[0.075, 0.075, 0.075]}
            material={getPantsMaterial(pantsColor)}
          />
          {/* Knee */}
          <mesh
            castShadow
            position={[0, -0.38, 0.02]}
            geometry={SHARED_WORKER_GEOMETRY.sphere_med}
            scale={[0.065, 0.065, 0.065]}
            material={getPantsMaterial(pantsColor)}
          />
          {/* Lower leg / shin */}
          <mesh
            castShadow
            position={[0, -0.58, 0]}
            geometry={SHARED_WORKER_GEOMETRY.capsule_med}
            scale={[0.055, 0.055, 0.055]}
            material={getPantsMaterial(pantsColor)}
          />
          {/* Boot */}
          <group position={[0, -0.78, 0.03]}>
            <mesh
              castShadow
              geometry={SHARED_WORKER_GEOMETRY.boot}
              material={SHARED_WORKER_MATERIALS.darkGray}
            />
            {/* Boot sole */}
            <mesh
              castShadow
              position={[0, -0.05, 0]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.11, 0.02, 0.17]}
              material={SHARED_WORKER_MATERIALS.black}
            />
            {/* Boot toe cap */}
            <mesh
              castShadow
              position={[0, -0.02, 0.07]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.09, 0.06, 0.04]}
              material={SHARED_WORKER_MATERIALS.mediumGray}
            />
          </group>
        </group>

        {/* === RIGHT LEG === */}
        <group ref={rightLegRef} position={[0.1, 0.62, 0]}>
          {/* Upper thigh */}
          <mesh
            castShadow
            position={[0, -0.18, 0]}
            geometry={SHARED_WORKER_GEOMETRY.capsule_med}
            scale={[0.075, 0.075, 0.075]}
            material={getPantsMaterial(pantsColor)}
          />
          {/* Knee */}
          <mesh
            castShadow
            position={[0, -0.38, 0.02]}
            geometry={SHARED_WORKER_GEOMETRY.sphere_med}
            scale={[0.065, 0.065, 0.065]}
            material={getPantsMaterial(pantsColor)}
          />
          {/* Lower leg / shin */}
          <mesh
            castShadow
            position={[0, -0.58, 0]}
            geometry={SHARED_WORKER_GEOMETRY.capsule_med}
            scale={[0.055, 0.055, 0.055]}
            material={getPantsMaterial(pantsColor)}
          />
          {/* Boot */}
          <group position={[0, -0.78, 0.03]}>
            <mesh
              castShadow
              geometry={SHARED_WORKER_GEOMETRY.boot}
              material={SHARED_WORKER_MATERIALS.darkGray}
            />
            {/* Boot sole */}
            <mesh
              castShadow
              position={[0, -0.05, 0]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.11, 0.02, 0.17]}
              material={SHARED_WORKER_MATERIALS.black}
            />
            {/* Boot toe cap */}
            <mesh
              castShadow
              position={[0, -0.02, 0.07]}
              geometry={SHARED_WORKER_GEOMETRY.box_small}
              scale={[0.09, 0.06, 0.04]}
              material={SHARED_WORKER_MATERIALS.mediumGray}
            />
          </group>
        </group>
      </group>
    );
  }
);

HumanModel.displayName = 'HumanModel';
