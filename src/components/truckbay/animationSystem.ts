/**
 * Animation System for Truck Bay
 * Centralized animation registries and animation manager for truck bay components
 */

import React from 'react';
import { useFrame } from '@react-three/fiber';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import * as THREE from 'three';
import { audioManager } from '../../utils/audioManager';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';

// --- Animation Registries ---
export type AnimationType = 'rotation' | 'pulse' | 'lerp' | 'oscillation' | 'custom';

export interface AnimationState {
  type: AnimationType;
  mesh: THREE.Object3D | THREE.Material | null;
  data: any;
  // For 'custom' type: a callback function that receives (time, delta, mesh)
  callback?: (
    time: number,
    delta: number,
    mesh: THREE.Object3D | THREE.Material | null,
    data: any
  ) => void;
}

const animationRegistry = new Map<string, AnimationState>();

export const registerAnimation = (
  id: string,
  type: AnimationType,
  mesh: THREE.Object3D | THREE.Material | null,
  data: any,
  callback?: (
    time: number,
    delta: number,
    mesh: THREE.Object3D | THREE.Material | null,
    data: any
  ) => void
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

// --- Worker Movement Registry ---
export interface WorkerMovement {
  ref: React.RefObject<THREE.Group | null>;
  targetPos: React.MutableRefObject<{ x: number; z: number }>;
  lastBeepTime: React.MutableRefObject<number>;
  isActive: boolean;
  workAreaBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const workerRegistry = new Map<string, WorkerMovement>();

export const registerWorker = (id: string, worker: WorkerMovement) => {
  workerRegistry.set(id, worker);
};

export const unregisterWorker = (id: string) => {
  workerRegistry.delete(id);
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
  getTruckState: () => any;
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

  useFrame((state, delta) => {
    if (!isTabVisible) return;

    const time = state.clock.elapsedTime;

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

    if (shouldRunThisFrame(throttle)) {
      const adjustDelta = delta * throttle;

      animationRegistry.forEach((anim) => {
        // 1. Rotation Animation
        if (anim.type === 'rotation') {
          const mesh = anim.mesh as THREE.Object3D;
          const { axis = 'y', speed = 1 } = anim.data as { axis?: 'x' | 'y' | 'z'; speed?: number };
          if (mesh) {
            mesh.rotation[axis] += speed * adjustDelta;
          }
        }

        // 2. Pulse (Emissive) Animation
        else if (anim.type === 'pulse') {
          const mat = anim.mesh as THREE.MeshStandardMaterial;
          const { speed = 2, min = 0.5, max = 1.0, offset = 0 } = anim.data;
          if (mat) {
            mat.emissiveIntensity =
              min + (Math.sin(time * speed + offset) * 0.5 + 0.5) * (max - min);
          }
        }

        // 3. Lerp (Position/Rotation/Scale) Animation
        else if (anim.type === 'lerp') {
          const mesh = anim.mesh as THREE.Object3D;
          const {
            target,
            speed = 0.1,
            property = 'position',
            axis = 'x',
          } = anim.data as {
            target: number;
            speed?: number;
            property?: 'position' | 'rotation' | 'scale';
            axis?: 'x' | 'y' | 'z';
            autoHide?: boolean;
            hideThreshold?: number;
          };

          if (mesh) {
            const currVal = mesh[property][axis];
            if (Math.abs(currVal - target) > 0.001) {
              const newVal = THREE.MathUtils.lerp(currVal, target, speed * (60 * adjustDelta));
              mesh[property][axis] = newVal;

              // Optional visibility toggle for "slide out" effects
              if (anim.data.autoHide && property === 'position') {
                mesh.visible = newVal > anim.data.hideThreshold;
              }
            }
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
            mesh.position[axis] = base + Math.sin(time * speed + offset) * amplitude;
          }
        }

        // 5. Custom callback animation
        else if (anim.type === 'custom' && anim.callback) {
          anim.callback(time, adjustDelta, anim.mesh, anim.data);
        }
      });
    }

    // --- 2. Process Particle Systems (throttled to 30fps) ---
    if (shouldRunThisFrame(2)) {
      particleRegistry.forEach((system) => {
        if (!system.ref.current || !system.isRunning) return;

        const posAttr = system.ref.current.geometry.attributes.position;
        const posArray = posAttr.array as Float32Array;

        for (let i = 0; i < system.particleCount; i++) {
          system.lifetimes[i] += delta * (0.5 + system.throttle * 0.5);

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
            posArray[i * 3] += system.velocities[i * 3] * delta * 60;
            posArray[i * 3 + 1] += system.velocities[i * 3 + 1] * delta * 60;
            posArray[i * 3 + 2] += system.velocities[i * 3 + 2] * delta * 60;
            // Spread out as it rises
            system.velocities[i * 3] *= 1.01;
            system.velocities[i * 3 + 2] *= 1.01;
          }
        }

        posAttr.needsUpdate = true;
      });
    }

    // --- 3. Process Worker Movement (throttled to 20fps) ---
    if (shouldRunThisFrame(3)) {
      workerRegistry.forEach((worker) => {
        if (!worker.ref.current || !worker.isActive) return;

        // Move around work area
        if (Math.random() < 0.005) {
          worker.targetPos.current = {
            x:
              worker.workAreaBounds.minX +
              Math.random() * (worker.workAreaBounds.maxX - worker.workAreaBounds.minX),
            z:
              worker.workAreaBounds.minZ +
              Math.random() * (worker.workAreaBounds.maxZ - worker.workAreaBounds.minZ),
          };
        }

        worker.ref.current.position.x = THREE.MathUtils.lerp(
          worker.ref.current.position.x,
          worker.targetPos.current.x,
          0.01
        );
        worker.ref.current.position.z = THREE.MathUtils.lerp(
          worker.ref.current.position.z,
          worker.targetPos.current.z,
          0.01
        );

        // Face direction of travel
        const dx = worker.targetPos.current.x - worker.ref.current.position.x;
        const dz = worker.targetPos.current.z - worker.ref.current.position.z;
        if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
          worker.ref.current.rotation.y = Math.atan2(dx, dz);
        }

        // Play beep periodically while moving
        if (time - worker.lastBeepTime.current > 3 && (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1)) {
          worker.lastBeepTime.current = time;
          audioManager.playPalletJackBeep?.();
        }
      });
    }

    // --- 4. Process Truck Component Animations (no throttle, needs smooth updates) ---
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
          0.1
        );
      }

      // Animated trailer doors
      if (truck.leftDoorRef.current && truck.rightDoorRef.current) {
        const targetAngle = truckState.doorsOpen ? -Math.PI * 0.45 : 0;
        truck.leftDoorRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.leftDoorRef.current.rotation.y,
          -targetAngle,
          0.08
        );
        truck.rightDoorRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.rightDoorRef.current.rotation.y,
          targetAngle,
          0.08
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
          0.1
        );
        truck.cabBodyRef.current.rotation.x = THREE.MathUtils.lerp(
          truck.cabBodyRef.current.rotation.x,
          truckState.cabPitch,
          0.1
        );
      }

      // Apply Steering
      if (truck.steerLeftRef?.current) {
        truck.steerLeftRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.steerLeftRef.current.rotation.y,
          truckState.steeringAngle,
          0.2
        );
      }
      if (truck.steerRightRef?.current) {
        truck.steerRightRef.current.rotation.y = THREE.MathUtils.lerp(
          truck.steerRightRef.current.rotation.y,
          truckState.steeringAngle,
          0.2
        );
      }
    });
  });

  return null;
};
