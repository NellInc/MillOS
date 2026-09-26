/**
 * Animation System for Truck Bay
 * Centralized animation registries and animation manager for truck bay components
 */

import React from 'react';
import { useFrame } from '@react-three/fiber';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import * as THREE from 'three';
import { selectSafetyHoldActive, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import type { TruckAnimState } from './useTruckPhysics';

// --- Animation Registries ---
export type AnimationType = 'rotation' | 'pulse' | 'lerp' | 'oscillation' | 'custom';

/** Animation data types for each animation type */
export interface RotationAnimData {
  axis?: 'x' | 'y' | 'z';
  speed?: number;
}

export interface PulseAnimData {
  speed?: number;
  min?: number;
  max?: number;
  offset?: number;
}

export interface LerpAnimData {
  target: number;
  speed?: number;
  property?: 'position' | 'rotation' | 'scale';
  axis?: 'x' | 'y' | 'z';
  autoHide?: boolean;
  hideThreshold?: number;
}

export interface OscillationAnimData {
  axis?: 'x' | 'y' | 'z';
  speed?: number;
  amplitude?: number;
  offset?: number;
  base?: number;
}

/** Union of all animation data types */
export type AnimationData =
  | RotationAnimData
  | PulseAnimData
  | LerpAnimData
  | OscillationAnimData
  | Record<string, unknown>; // For custom animations

/** Callback signature for custom animations */
export type AnimationCallback = (
  time: number,
  delta: number,
  mesh: THREE.Object3D | THREE.Material | null,
  data: AnimationData
) => void;

export interface AnimationState {
  type: AnimationType;
  mesh: THREE.Object3D | THREE.Material | null;
  data: AnimationData;
  // For 'custom' type: a callback function that receives (time, delta, mesh)
  callback?: AnimationCallback;
}

const animationRegistry = new Map<string, AnimationState>();

/**
 * Converts an authored 60 Hz smoothing fraction into a delta-time-correct
 * damping fraction. This preserves the original feel at 60 fps without making
 * doors, steering or suspension animate faster on high-refresh displays.
 */
export const getAnimationDampingAlpha = (perFrameAlpha: number, deltaSeconds: number): number => {
  if (!Number.isFinite(perFrameAlpha) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0;
  }
  const safeAlpha = THREE.MathUtils.clamp(perFrameAlpha, 0, 1);
  if (safeAlpha >= 1) return 1;
  return 1 - Math.pow(1 - safeAlpha, deltaSeconds * 60);
};

export const registerAnimation = (
  id: string,
  type: AnimationType,
  mesh: THREE.Object3D | THREE.Material | null,
  data: AnimationData,
  callback?: AnimationCallback
) => {
  animationRegistry.set(id, { type, mesh, data, callback });
};

export const unregisterAnimation = (id: string) => {
  animationRegistry.delete(id);
};

// --- Particle Systems Registry ---
export interface ParticleSystem {
  ref: React.RefObject<THREE.Points | null>;
  positions: Float32Array;
  velocities: Float32Array;
  lifetimes: Float32Array;
  maxLifetimes: Float32Array;
  particleCount: number;
  throttle: number;
  isRunning: boolean;
}

const particleRegistry = new Map<string, ParticleSystem>();

export const registerParticleSystem = (id: string, system: ParticleSystem) => {
  particleRegistry.set(id, system);
};

export const unregisterParticleSystem = (id: string) => {
  particleRegistry.delete(id);
};

export const updateParticleSystem = (
  id: string,
  updates: Partial<Pick<ParticleSystem, 'throttle' | 'isRunning'>>
) => {
  const system = particleRegistry.get(id);
  if (system) {
    Object.assign(system, updates);
  }
};

// --- Truck Components Registry ---
export interface TruckComponents {
  // Main refs
  cabRef?: React.RefObject<THREE.Object3D | null>;
  trailerRef: React.RefObject<THREE.Object3D | null>;

  // Wheel refs
  frontLeftWheelRef: React.RefObject<THREE.Object3D | null>;
  frontRightWheelRef: React.RefObject<THREE.Object3D | null>;
  rearWheelsRef: React.RefObject<THREE.Object3D | null>;

  // Door refs
  leftDoorRef: React.RefObject<THREE.Object3D | null>;
  rightDoorRef: React.RefObject<THREE.Object3D | null>;

  // Light refs
  brakeLightLeftRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  brakeLightRightRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  reverseLightLeftRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  reverseLightRightRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  leftSignalRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  rightSignalRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  markerLightsRef: React.MutableRefObject<THREE.MeshStandardMaterial[]>;

  // Physics refs
  cabBodyRef: React.RefObject<THREE.Object3D | null>;
  wheelRotation: React.MutableRefObject<number>;
  trailerAngle: React.MutableRefObject<number>;

  // Steering refs
  steerLeftRef?: React.RefObject<THREE.Object3D | null>;
  steerRightRef?: React.RefObject<THREE.Object3D | null>;

  // State getter
  getTruckState: () => TruckAnimState;
}

const truckComponentsRegistry = new Map<string, TruckComponents>();

export const registerTruckComponents = (id: string, components: TruckComponents) => {
  truckComponentsRegistry.set(id, components);
};

export const unregisterTruckComponents = (id: string) => {
  truckComponentsRegistry.delete(id);
};

// Centralized Animation Manager Component
export const TruckAnimationManager: React.FC = () => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  // The rotation, oscillation and custom channels (yard machinery such as the
  // jockey tractor, crane, wash brush, wrapper and compactor, plus the small
  // displays registered as custom callbacks) run on their own clock, which holds
  // while the game is paused and during a safety hold or drill. 'pulse' lamps
  // and the state-driven lerps stay on the wall clock.
  const equipmentClockRef = React.useRef(0);

  useFrame((state, delta) => {
    if (!isTabVisible) return;

    const time = state.clock.elapsedTime;
    const simulation = useGameSimulationStore.getState();
    const equipmentRunning = simulation.gameSpeed > 0 && !selectSafetyHoldActive(simulation);
    if (equipmentRunning) equipmentClockRef.current += delta;
    const equipmentTime = equipmentClockRef.current;

    // --- 1. Process Generic Animation Registry ---
    // Throttle based on quality
    // Ultra: 1 (60fps), High: 2 (30fps), Medium: 3 (20fps), Low: 4 (15fps)
    const throttle =
      graphicsQuality === 'ultra'
        ? 1
        : graphicsQuality === 'high'
          ? 2
          : graphicsQuality === 'medium'
            ? 3
            : 4;

    // Structural motion must remain smooth at every preset. Throttling a dock
    // leveler or door to 20 Hz made its transform visibly step even when the
    // renderer itself sustained 60 Hz. Decorative loops remain throttled.
    animationRegistry.forEach((anim) => {
      if (anim.type !== 'lerp') return;
      const mesh = anim.mesh as THREE.Object3D;
      const {
        target,
        speed = 0.1,
        property = 'position',
        axis = 'x',
        autoHide,
        hideThreshold,
      } = anim.data as LerpAnimData;
      if (!mesh) return;

      const currVal = mesh[property][axis];
      const settled = Math.abs(currVal - target) <= 0.001;
      const newVal = settled
        ? currVal
        : THREE.MathUtils.lerp(currVal, target, getAnimationDampingAlpha(speed, delta));
      if (!settled) mesh[property][axis] = newVal;
      // autoHide hides the object once it has retracted past hideThreshold, and
      // is evaluated even when settled so an object mounted retracted starts hidden.
      if (autoHide && property === 'position') {
        mesh.visible = newVal < (hideThreshold ?? Infinity);
      }
    });

    if (shouldRunThisFrame(throttle)) {
      const adjustDelta = delta * throttle;
      const equipmentDelta = equipmentRunning ? adjustDelta : 0;

      animationRegistry.forEach((anim) => {
        if (anim.type === 'lerp') return;
        // 1. Rotation Animation
        if (anim.type === 'rotation') {
          const mesh = anim.mesh as THREE.Object3D;
          const { axis = 'y', speed = 1 } = anim.data as { axis?: 'x' | 'y' | 'z'; speed?: number };
          if (mesh) {
            mesh.rotation[axis] += speed * equipmentDelta;
          }
        }

        // 2. Pulse (Emissive) Animation
        else if (anim.type === 'pulse') {
          const mat = anim.mesh as THREE.MeshStandardMaterial;
          const { speed = 2, min = 0.5, max = 1.0, offset = 0 } = anim.data as PulseAnimData;
          if (mat) {
            mat.emissiveIntensity =
              min + (Math.sin(time * (speed as number) + offset) * 0.5 + 0.5) * (max - min);
          }
        }

        // 4. Oscillation
        else if (anim.type === 'oscillation') {
          const mesh = anim.mesh as THREE.Object3D;
          const {
            axis = 'x',
            speed = 1,
            amplitude = 1,
            offset = 0,
            base = 0,
          } = anim.data as {
            axis?: 'x' | 'y' | 'z';
            speed?: number;
            amplitude?: number;
            offset?: number;
            base?: number;
          };
          if (mesh) {
            mesh.position[axis] = base + Math.sin(equipmentTime * speed + offset) * amplitude;
          }
        }

        // 5. Custom callback animation
        else if (anim.type === 'custom' && anim.callback) {
          anim.callback(equipmentTime, equipmentDelta, anim.mesh, anim.data);
        }
      });
    }

    // --- 2. Process Particle Systems (throttled to 30fps) ---
    if (shouldRunThisFrame(2)) {
      const particleDelta = delta * 2;
      particleRegistry.forEach((system) => {
        if (!system.ref.current || !system.isRunning) return;

        const posAttr = system.ref.current.geometry.attributes.position;
        const posArray = posAttr.array as Float32Array;

        for (let i = 0; i < system.particleCount; i++) {
          system.lifetimes[i] += particleDelta * (0.5 + system.throttle * 0.5);

          if (system.lifetimes[i] > system.maxLifetimes[i]) {
            // Reset particle
            system.lifetimes[i] = 0;
            posArray[i * 3] = (Math.random() - 0.5) * 0.1;
            posArray[i * 3 + 1] = 0;
            posArray[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
            system.velocities[i * 3] = (Math.random() - 0.5) * 0.03;
            system.velocities[i * 3 + 1] = 0.04 + Math.random() * 0.03 + system.throttle * 0.02;
            system.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
          } else {
            // Update position
            posArray[i * 3] += system.velocities[i * 3] * particleDelta * 60;
            posArray[i * 3 + 1] += system.velocities[i * 3 + 1] * particleDelta * 60;
            posArray[i * 3 + 2] += system.velocities[i * 3 + 2] * particleDelta * 60;
            // Spread out as it rises
            const spread = Math.pow(1.01, particleDelta * 60);
            system.velocities[i * 3] *= spread;
            system.velocities[i * 3 + 2] *= spread;
          }
        }

        posAttr.needsUpdate = true;
      });
    }

    // --- 3. Process Truck Component Animations (no throttle, needs smooth updates) ---
    truckComponentsRegistry.forEach((truck) => {
      const truckState = truck.getTruckState();

      // Rotate wheels
      if (truck.frontLeftWheelRef.current) {
        truck.frontLeftWheelRef.current.rotation.x = truck.wheelRotation.current;
      }
      if (truck.frontRightWheelRef.current) {
        truck.frontRightWheelRef.current.rotation.x = truck.wheelRotation.current;
      }
      if (truck.rearWheelsRef.current) {
        truck.rearWheelsRef.current.children.forEach((child) => {
          if (child instanceof THREE.Group) {
            child.children.forEach((wheel) => {
              if (wheel instanceof THREE.Mesh) {
                wheel.rotation.x = truck.wheelRotation.current;
              }
            });
          }
        });
      }

      // Trailer articulation
      if (truck.trailerRef.current) {
        truck.trailerRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.trailerRef.current.rotation.y,
          truck.trailerAngle.current,
          getAnimationDampingAlpha(0.1, delta)
        );
      }

      // Animated trailer doors
      if (truck.leftDoorRef.current && truck.rightDoorRef.current) {
        const targetAngle = truckState.doorsOpen ? -Math.PI * 0.45 : 0;
        truck.leftDoorRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.leftDoorRef.current.rotation.y,
          -targetAngle,
          getAnimationDampingAlpha(0.08, delta)
        );
        truck.rightDoorRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.rightDoorRef.current.rotation.y,
          targetAngle,
          getAnimationDampingAlpha(0.08, delta)
        );
      }

      // Update lights
      if (truck.brakeLightLeftRef.current) {
        truck.brakeLightLeftRef.current.emissiveIntensity = truckState.brakeLights ? 1.5 : 0.2;
      }
      if (truck.brakeLightRightRef.current) {
        truck.brakeLightRightRef.current.emissiveIntensity = truckState.brakeLights ? 1.5 : 0.2;
      }
      if (truck.reverseLightLeftRef.current) {
        truck.reverseLightLeftRef.current.emissiveIntensity = truckState.reverseLights ? 1.2 : 0;
      }
      if (truck.reverseLightRightRef.current) {
        truck.reverseLightRightRef.current.emissiveIntensity = truckState.reverseLights ? 1.2 : 0;
      }
      if (truck.leftSignalRef.current) {
        truck.leftSignalRef.current.emissiveIntensity = truckState.leftSignal ? 1.5 : 0.1;
      }
      if (truck.rightSignalRef.current) {
        truck.rightSignalRef.current.emissiveIntensity = truckState.rightSignal ? 1.5 : 0.1;
      }

      // Marker lights pulsing when engine running
      truck.markerLightsRef.current.forEach((mat) => {
        if (mat) {
          mat.emissiveIntensity = 0.4 + Math.sin(time * 2) * 0.1;
        }
      });

      // Apply Cab Physics (Suspension)
      if (truck.cabBodyRef.current) {
        truck.cabBodyRef.current.rotation.z = THREE.MathUtils.lerp(
          truck.cabBodyRef.current.rotation.z,
          truckState.cabRoll,
          getAnimationDampingAlpha(0.1, delta)
        );
        truck.cabBodyRef.current.rotation.x = THREE.MathUtils.lerp(
          truck.cabBodyRef.current.rotation.x,
          truckState.cabPitch,
          getAnimationDampingAlpha(0.1, delta)
        );
      }

      // Apply Steering
      if (truck.steerLeftRef?.current) {
        truck.steerLeftRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.steerLeftRef.current.rotation.y,
          truckState.steeringAngle,
          getAnimationDampingAlpha(0.2, delta)
        );
      }
      if (truck.steerRightRef?.current) {
        truck.steerRightRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.steerRightRef.current.rotation.y,
          truckState.steeringAngle,
          getAnimationDampingAlpha(0.2, delta)
        );
      }
    });
  });

  return null;
};
