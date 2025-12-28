# Continuation Prompt: Worker Personality Visualization

## Objective

Make the AI workers feel *alive* through subtle visual cues that suggest personality, mood, relationships, and inner state. Transform generic avatars into characters that seem to have their own experience of the factory.

**The Pitch:** "Agents modeling agents. Each worker is an AI with its own state, and you can *see* it."

**Performance Constraints:**
- Must maintain 60fps with 12+ workers visible
- No per-worker useFrame hooks - use centralized animation manager
- Shader-based effects, minimal geometry additions
- LOD system: detailed near camera, simplified at distance

---

## Part 1: Worker State Model

### 1.1 Enhanced Worker State

Extend the existing worker data with personality and mood state.

**File:** `src/types/workerPersonality.ts`

```typescript
export type MoodState = 'content' | 'focused' | 'stressed' | 'tired' | 'alert';
export type PersonalityTrait = 'diligent' | 'social' | 'cautious' | 'efficient' | 'curious';

export interface WorkerInternalState {
  // Core mood (affects visual aura)
  mood: MoodState;
  moodIntensity: number; // 0-1

  // Energy level (affects animation speed, posture)
  energy: number; // 0-1

  // Current focus (what they're thinking about)
  focus: 'task' | 'colleague' | 'machine' | 'break' | 'concern';
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

// Mood colors for visual representation
export const MOOD_COLORS: Record<MoodState, string> = {
  content: '#10b981',   // Green - calm, satisfied
  focused: '#3b82f6',   // Blue - concentrated
  stressed: '#f59e0b',  // Amber - pressured
  tired: '#8b5cf6',     // Purple - low energy
  alert: '#ef4444',     // Red - heightened awareness
};

// Personality trait icons (for UI)
export const TRAIT_ICONS: Record<PersonalityTrait, string> = {
  diligent: 'CheckCircle',
  social: 'Users',
  cautious: 'Shield',
  efficient: 'Zap',
  curious: 'Eye',
};
```

### 1.2 Worker Personality Store

**File:** `src/stores/workerPersonalityStore.ts`

```typescript
import { create } from 'zustand';
import { WorkerInternalState, MoodState, PersonalityTrait } from '../types/workerPersonality';

interface WorkerPersonalityState {
  workerStates: Map<string, WorkerInternalState>;

  // Actions
  initializeWorker: (workerId: string, traits?: PersonalityTrait[]) => void;
  updateMood: (workerId: string, mood: MoodState, intensity?: number) => void;
  updateEnergy: (workerId: string, delta: number) => void;
  setFocus: (workerId: string, focus: WorkerInternalState['focus'], targetId?: string) => void;
  recordInteraction: (worker1Id: string, worker2Id: string) => void;
  setThought: (workerId: string, thought: string, durationMs?: number) => void;
  clearThought: (workerId: string) => void;

  // Getters
  getWorkerState: (workerId: string) => WorkerInternalState | undefined;
  getRelationshipStrength: (worker1Id: string, worker2Id: string) => number;
}

const DEFAULT_STATE: WorkerInternalState = {
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
          ...DEFAULT_STATE,
          traits: traits || getRandomTraits(),
          energy: 0.7 + Math.random() * 0.3, // Slight variation
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
```

---

## Part 2: Mood Aura Visualization

### 2.1 Mood Aura Shader

Subtle colored glow around workers that indicates their emotional state.

**File:** `src/shaders/moodAura.ts`

```typescript
import * as THREE from 'three';

export const createMoodAuraMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      moodColor: { value: new THREE.Color('#10b981') },
      intensity: { value: 0.5 },
      time: { value: 0.0 },
      energy: { value: 0.8 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 moodColor;
      uniform float intensity;
      uniform float time;
      uniform float energy;

      varying vec2 vUv;

      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0;

        // Soft radial gradient
        float aura = 1.0 - smoothstep(0.0, 1.0, dist);
        aura = pow(aura, 2.0);

        // Breathing animation (speed affected by energy)
        float breathRate = 1.0 + (1.0 - energy) * 0.5; // Tired = slower
        float breath = sin(time * breathRate) * 0.15 + 0.85;

        // Subtle shimmer
        float shimmer = sin(time * 3.0 + dist * 10.0) * 0.05 + 0.95;

        float alpha = aura * intensity * breath * shimmer * 0.4;

        gl_FragColor = vec4(moodColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
};
```

### 2.2 Mood Aura Component

**File:** `src/components/workers/MoodAura.tsx`

```tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createMoodAuraMaterial } from '../../shaders/moodAura';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { MOOD_COLORS } from '../../types/workerPersonality';

interface MoodAuraProps {
  workerId: string;
  position: [number, number, number];
  visible?: boolean;
}

export const MoodAura: React.FC<MoodAuraProps> = ({ workerId, position, visible = true }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const workerState = useWorkerPersonalityStore((s) => s.getWorkerState(workerId));

  const material = useMemo(() => createMoodAuraMaterial(), []);

  // Update material uniforms when mood changes
  useEffect(() => {
    if (!materialRef.current || !workerState) return;

    const color = MOOD_COLORS[workerState.mood];
    materialRef.current.uniforms.moodColor.value.set(color);
    materialRef.current.uniforms.intensity.value = workerState.moodIntensity;
    materialRef.current.uniforms.energy.value = workerState.energy;
  }, [workerState?.mood, workerState?.moodIntensity, workerState?.energy]);

  if (!visible || !workerState) return null;

  return (
    <mesh position={[position[0], 0.05, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3, 3]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};
```

---

## Part 3: Relationship Visualization

### 3.1 Relationship Lines Between Workers

Subtle lines connecting workers who interact frequently.

**File:** `src/components/workers/RelationshipLines.tsx`

```tsx
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { useProductionStore } from '../../stores/productionStore';

interface RelationshipLinesProps {
  minStrength?: number; // Only show lines above this threshold
  maxLines?: number;    // Performance limit
}

export const RelationshipLines: React.FC<RelationshipLinesProps> = ({
  minStrength = 0.3,
  maxLines = 20,
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const workers = useProductionStore((s) => s.workers);
  const workerStates = useWorkerPersonalityStore((s) => s.workerStates);

  // Build line geometry from relationships
  const { geometry, strengths } = useMemo(() => {
    const positions: number[] = [];
    const strengthValues: number[] = [];

    let lineCount = 0;
    const processedPairs = new Set<string>();

    workerStates.forEach((state, workerId) => {
      if (lineCount >= maxLines) return;

      const worker = workers.find(w => w.id === workerId);
      if (!worker) return;

      state.relationshipStrength.forEach((strength, otherId) => {
        if (lineCount >= maxLines) return;
        if (strength < minStrength) return;

        // Avoid duplicate lines
        const pairKey = [workerId, otherId].sort().join('-');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const otherWorker = workers.find(w => w.id === otherId);
        if (!otherWorker) return;

        // Add line segment
        positions.push(
          worker.position[0], worker.position[1] + 1, worker.position[2],
          otherWorker.position[0], otherWorker.position[1] + 1, otherWorker.position[2]
        );
        strengthValues.push(strength, strength);
        lineCount++;
      });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('strength', new THREE.Float32BufferAttribute(strengthValues, 1));

    return { geometry: geo, strengths: strengthValues };
  }, [workers, workerStates, minStrength, maxLines]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new THREE.Color('#60a5fa') },
    },
    vertexShader: `
      attribute float strength;
      varying float vStrength;

      void main() {
        vStrength = strength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 baseColor;
      varying float vStrength;

      void main() {
        // Pulse animation
        float pulse = sin(time * 2.0) * 0.2 + 0.8;

        // Strength affects opacity
        float alpha = vStrength * pulse * 0.4;

        gl_FragColor = vec4(baseColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  if (strengths.length === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <primitive object={material} ref={materialRef} attach="material" />
    </lineSegments>
  );
};
```

---

## Part 4: Thought Bubbles

### 4.1 Procedural Thought Display

Shows worker's current thought as floating text.

**File:** `src/components/workers/ThoughtBubble.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { Text, Billboard } from '@react-three/drei';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { useFrame } from '@react-three/fiber';

interface ThoughtBubbleProps {
  workerId: string;
  position: [number, number, number];
}

// Procedural thought templates based on context
const THOUGHT_TEMPLATES = {
  task: [
    'Almost done...',
    'Focus...',
    'One step at a time',
    'Looking good',
  ],
  colleague: [
    'Good team today',
    'Need to sync up',
    'Working well together',
  ],
  machine: [
    'Running smooth',
    'Check the readings',
    'Sounds normal',
    'Keep an eye on this',
  ],
  break: [
    'Need coffee',
    'Just five minutes',
    'Stretch break',
  ],
  concern: [
    'Something\'s off...',
    'Should report this',
    'Better check twice',
  ],
};

export const ThoughtBubble: React.FC<ThoughtBubbleProps> = ({ workerId, position }) => {
  const workerState = useWorkerPersonalityStore((s) => s.getWorkerState(workerId));
  const [opacity, setOpacity] = useState(0);
  const [displayText, setDisplayText] = useState('');

  // Handle thought visibility and expiry
  useEffect(() => {
    if (!workerState?.currentThought) {
      setOpacity(0);
      return;
    }

    setDisplayText(workerState.currentThought);
    setOpacity(1);

    // Check expiry
    const checkExpiry = () => {
      if (workerState.thoughtExpiry && Date.now() > workerState.thoughtExpiry) {
        setOpacity(0);
      }
    };

    const interval = setInterval(checkExpiry, 100);
    return () => clearInterval(interval);
  }, [workerState?.currentThought, workerState?.thoughtExpiry]);

  if (opacity === 0 || !displayText) return null;

  return (
    <Billboard position={[position[0], position[1] + 2.5, position[2]]}>
      <group>
        {/* Background */}
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[displayText.length * 0.12 + 0.4, 0.4]} />
          <meshBasicMaterial color="#1a1f2e" opacity={0.85} transparent />
        </mesh>

        {/* Border */}
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[displayText.length * 0.12 + 0.45, 0.45]} />
          <meshBasicMaterial color="#3b82f6" opacity={0.5} transparent />
        </mesh>

        {/* Text */}
        <Text
          fontSize={0.15}
          color="#e2e8f0"
          anchorX="center"
          anchorY="middle"
          fillOpacity={opacity}
        >
          {displayText}
        </Text>

        {/* Pointer triangle */}
        <mesh position={[0, -0.28, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.08, 0.15, 3]} />
          <meshBasicMaterial color="#1a1f2e" opacity={0.85} transparent />
        </mesh>
      </group>
    </Billboard>
  );
};
```

### 4.2 Thought Generation System

Procedurally generates thoughts based on worker state.

**File:** `src/systems/thoughtGenerator.ts`

```typescript
import { useWorkerPersonalityStore } from '../stores/workerPersonalityStore';
import { WorkerInternalState } from '../types/workerPersonality';

const THOUGHT_TEMPLATES: Record<WorkerInternalState['focus'], string[]> = {
  task: [
    'Almost there...',
    'Focus, focus...',
    'Step by step',
    'Looking good',
    'On schedule',
  ],
  colleague: [
    'Good teamwork',
    'Need to sync up',
    'Nice coordination',
    'Working well today',
  ],
  machine: [
    'Sounds normal',
    'Check those readings',
    'Running smooth',
    'Keep monitoring',
  ],
  break: [
    'Coffee time soon',
    'Just a moment',
    'Quick breather',
    'Stretch break',
  ],
  concern: [
    'Something\'s off...',
    'Should mention this',
    'Double-checking...',
    'Hmm...',
  ],
};

const MOOD_MODIFIERS: Record<string, string[]> = {
  stressed: ['Okay, okay...', 'Keep calm...', 'One thing at a time...'],
  tired: ['*yawn*', 'Long shift...', 'Almost there...'],
  alert: ['Stay sharp', 'Eyes open', 'Something\'s happening'],
};

/**
 * Generate a contextual thought for a worker.
 * Call periodically (not every frame) for occasional thoughts.
 */
export const generateThought = (workerId: string): string | null => {
  const state = useWorkerPersonalityStore.getState().getWorkerState(workerId);
  if (!state) return null;

  // Random chance to generate thought (not every call)
  if (Math.random() > 0.3) return null;

  // Base thought from focus
  const focusThoughts = THOUGHT_TEMPLATES[state.focus];
  let thought = focusThoughts[Math.floor(Math.random() * focusThoughts.length)];

  // Mood modifier (occasionally)
  if (state.mood !== 'content' && state.mood !== 'focused' && Math.random() > 0.5) {
    const modifiers = MOOD_MODIFIERS[state.mood];
    if (modifiers) {
      thought = modifiers[Math.floor(Math.random() * modifiers.length)];
    }
  }

  return thought;
};

/**
 * System to periodically generate thoughts for active workers.
 * Run in a setInterval, not in useFrame.
 */
export const startThoughtSystem = (intervalMs: number = 5000): () => void => {
  const interval = setInterval(() => {
    const store = useWorkerPersonalityStore.getState();

    store.workerStates.forEach((state, workerId) => {
      // Only generate for workers without current thought
      if (state.currentThought) return;

      const thought = generateThought(workerId);
      if (thought) {
        store.setThought(workerId, thought, 3000 + Math.random() * 2000);
      }
    });
  }, intervalMs);

  return () => clearInterval(interval);
};
```

---

## Part 5: Idle Animations

### 5.1 Subtle Idle Behaviors

Workers have subtle idle animations that vary by personality.

**File:** `src/components/workers/IdleAnimations.tsx`

```tsx
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { WorkerData } from '../../types';

interface IdleAnimationState {
  workerId: string;
  meshRef: THREE.Object3D;
  baseRotation: number;
  personalityOffset: number;
}

// Centralized registry for idle animations
const idleRegistry = new Map<string, IdleAnimationState>();

export const registerWorkerIdle = (
  workerId: string,
  meshRef: THREE.Object3D,
  baseRotation: number = 0
) => {
  const state = useWorkerPersonalityStore.getState().getWorkerState(workerId);
  const personalityOffset = state?.traits.includes('curious') ? 0.3 :
                           state?.traits.includes('cautious') ? 0.1 : 0.2;

  idleRegistry.set(workerId, {
    workerId,
    meshRef,
    baseRotation,
    personalityOffset,
  });
};

export const unregisterWorkerIdle = (workerId: string) => {
  idleRegistry.delete(workerId);
};

/**
 * Centralized idle animation manager.
 * One useFrame for all workers.
 */
export const IdleAnimationManager: React.FC = () => {
  const statesRef = useRef(useWorkerPersonalityStore.getState().workerStates);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = useWorkerPersonalityStore.subscribe((state) => {
      statesRef.current = state.workerStates;
    });
    return unsubscribe;
  }, []);

  useFrame((frameState) => {
    const time = frameState.clock.elapsedTime;

    idleRegistry.forEach((idle) => {
      const workerState = statesRef.current.get(idle.workerId);
      if (!workerState) return;

      const mesh = idle.meshRef;
      const energy = workerState.energy;
      const personalityOffset = idle.personalityOffset;

      // Head look-around (subtle)
      // Curious workers look around more
      const lookSpeed = 0.5 + personalityOffset * 2;
      const lookAmount = 0.1 + personalityOffset * 0.2;

      // Reduce movement when tired
      const energyMod = 0.5 + energy * 0.5;

      // Subtle rotation
      const lookX = Math.sin(time * lookSpeed + idle.workerId.charCodeAt(0)) * lookAmount * energyMod;
      const lookY = Math.sin(time * lookSpeed * 0.7) * lookAmount * 0.5 * energyMod;

      // Apply to mesh rotation (assuming mesh has a head bone or we rotate whole model slightly)
      mesh.rotation.y = idle.baseRotation + lookX;
      mesh.rotation.x = lookY * 0.3;

      // Subtle breathing/bobbing
      const breathRate = 1.5 - (1 - energy) * 0.5; // Tired = slower breathing
      const breathAmount = 0.02 + (1 - energy) * 0.01; // Tired = deeper breaths
      mesh.position.y = Math.sin(time * breathRate) * breathAmount;
    });
  });

  return null;
};
```

---

## Part 6: Focus Indicator

### 6.1 Attention Direction Visualization

Shows what/who the worker is focused on.

**File:** `src/components/workers/FocusIndicator.tsx`

```tsx
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { useProductionStore } from '../../stores/productionStore';

interface FocusIndicatorProps {
  workerId: string;
  workerPosition: [number, number, number];
  visible?: boolean;
}

export const FocusIndicator: React.FC<FocusIndicatorProps> = ({
  workerId,
  workerPosition,
  visible = true,
}) => {
  const lineRef = useRef<THREE.Line>(null);
  const workerState = useWorkerPersonalityStore((s) => s.getWorkerState(workerId));
  const workers = useProductionStore((s) => s.workers);
  const machines = useProductionStore((s) => s.machines);

  const material = useMemo(() => new THREE.LineDashedMaterial({
    color: '#60a5fa',
    opacity: 0.3,
    transparent: true,
    dashSize: 0.3,
    gapSize: 0.2,
  }), []);

  // Calculate target position based on focus
  const targetPosition = useMemo(() => {
    if (!workerState?.focusTargetId) return null;

    if (workerState.focus === 'colleague') {
      const target = workers.find(w => w.id === workerState.focusTargetId);
      if (target) return target.position;
    }

    if (workerState.focus === 'machine') {
      const target = machines.find(m => m.id === workerState.focusTargetId);
      if (target) return target.position;
    }

    return null;
  }, [workerState, workers, machines]);

  useFrame(() => {
    if (!lineRef.current || !targetPosition) return;

    // Update line geometry
    const positions = lineRef.current.geometry.attributes.position;
    positions.setXYZ(0, workerPosition[0], workerPosition[1] + 1.5, workerPosition[2]);
    positions.setXYZ(1, targetPosition[0], targetPosition[1] + 1, targetPosition[2]);
    positions.needsUpdate = true;

    lineRef.current.computeLineDistances();
  });

  if (!visible || !targetPosition || workerState?.focus === 'task') return null;

  return (
    <line ref={lineRef} material={material}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array(6)}
          itemSize={3}
        />
      </bufferGeometry>
    </line>
  );
};
```

---

## Part 7: Centralized Personality Animation Manager

### 7.1 Single Update Loop

**File:** `src/components/workers/PersonalityAnimationManager.tsx`

```tsx
import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { MOOD_COLORS } from '../../types/workerPersonality';

// Registries
interface MoodAuraEntry {
  material: THREE.ShaderMaterial;
  workerId: string;
}

const moodAuraRegistry = new Map<string, MoodAuraEntry>();

export const registerMoodAura = (workerId: string, material: THREE.ShaderMaterial) => {
  moodAuraRegistry.set(workerId, { material, workerId });
};

export const unregisterMoodAura = (workerId: string) => {
  moodAuraRegistry.delete(workerId);
};

export const PersonalityAnimationManager: React.FC = () => {
  const statesRef = useRef(useWorkerPersonalityStore.getState().workerStates);

  useEffect(() => {
    const unsubscribe = useWorkerPersonalityStore.subscribe((state) => {
      statesRef.current = state.workerStates;
    });
    return unsubscribe;
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // Update all mood auras
    moodAuraRegistry.forEach((entry) => {
      const workerState = statesRef.current.get(entry.workerId);
      if (!workerState || !entry.material.uniforms) return;

      // Update color based on mood
      const color = MOOD_COLORS[workerState.mood];
      entry.material.uniforms.moodColor.value.set(color);

      // Update uniforms
      entry.material.uniforms.intensity.value = workerState.moodIntensity;
      entry.material.uniforms.energy.value = workerState.energy;
      entry.material.uniforms.time.value = time;
    });
  });

  return null;
};
```

---

## Part 8: Integration

### 8.1 Worker Personality Layer

**File:** `src/components/workers/WorkerPersonalityLayer.tsx`

```tsx
import React, { useEffect } from 'react';
import { useProductionStore } from '../../stores/productionStore';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { MoodAura } from './MoodAura';
import { ThoughtBubble } from './ThoughtBubble';
import { RelationshipLines } from './RelationshipLines';
import { PersonalityAnimationManager } from './PersonalityAnimationManager';
import { IdleAnimationManager } from './IdleAnimations';
import { startThoughtSystem } from '../../systems/thoughtGenerator';

interface WorkerPersonalityLayerProps {
  showAuras?: boolean;
  showThoughts?: boolean;
  showRelationships?: boolean;
}

export const WorkerPersonalityLayer: React.FC<WorkerPersonalityLayerProps> = ({
  showAuras = true,
  showThoughts = true,
  showRelationships = false, // Off by default, toggle-able
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
    const cleanup = startThoughtSystem(8000); // Every 8 seconds
    return cleanup;
  }, []);

  return (
    <group name="personality-layer">
      {/* Centralized animation managers */}
      <PersonalityAnimationManager />
      <IdleAnimationManager />

      {/* Per-worker elements */}
      {workers.map((worker) => (
        <React.Fragment key={worker.id}>
          {showAuras && (
            <MoodAura
              workerId={worker.id}
              position={worker.position}
            />
          )}
          {showThoughts && (
            <ThoughtBubble
              workerId={worker.id}
              position={worker.position}
            />
          )}
        </React.Fragment>
      ))}

      {/* Global relationship visualization */}
      {showRelationships && <RelationshipLines minStrength={0.4} maxLines={15} />}
    </group>
  );
};
```

### 8.2 Add to Scene

**File:** Update `src/components/MillScene.tsx`

```tsx
import { WorkerPersonalityLayer } from './workers/WorkerPersonalityLayer';

// Inside MillScene
<WorkerPersonalityLayer
  showAuras={true}
  showThoughts={true}
  showRelationships={false}  // Toggle with UI or keyboard
/>
```

---

## Part 9: UI Toggle

### 9.1 Personality Visualization Controls

**File:** Add to UI overlay

```tsx
const PersonalityControls: React.FC = () => {
  const [showAuras, setShowAuras] = useState(true);
  const [showThoughts, setShowThoughts] = useState(true);
  const [showRelationships, setShowRelationships] = useState(false);

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-800/80 rounded-lg">
      <span className="text-xs text-slate-400 uppercase tracking-wide">Worker Personality</span>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={showAuras}
          onChange={(e) => setShowAuras(e.target.checked)}
          className="rounded"
        />
        Mood Auras
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={showThoughts}
          onChange={(e) => setShowThoughts(e.target.checked)}
          className="rounded"
        />
        Thought Bubbles
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={showRelationships}
          onChange={(e) => setShowRelationships(e.target.checked)}
          className="rounded"
        />
        Relationship Lines
      </label>
    </div>
  );
};
```

---

## Performance Notes

### Throttling
- Thought generation: Every 8 seconds (not per-frame)
- Mood aura updates: Per-frame but lightweight (uniform updates only)
- Relationship lines: Recalculated only when relationships change

### LOD Strategy
- Mood auras: Hide beyond 50 units from camera
- Thought bubbles: Hide beyond 30 units
- Relationship lines: Limit to 15-20 max lines
- Idle animations: Reduce complexity for distant workers

### Memory
- Single material per aura type (shared)
- Geometry instancing where possible
- WeakMap for temporary references

---

## Validation Checklist

- [ ] `npm run build` passes
- [ ] Worker personality store initializes correctly
- [ ] Mood auras display and pulse with breathing
- [ ] Mood colors change based on worker state
- [ ] Thought bubbles appear occasionally
- [ ] Thoughts expire after timeout
- [ ] Relationship lines connect interacting workers
- [ ] Idle animations are subtle, not distracting
- [ ] 60fps maintained with 12+ workers
- [ ] No new console errors

---

## The Impact

Visitors see workers that *seem alive*:
- Colored auras reveal inner states without words
- Occasional thoughts give glimpses into worker "minds"
- Relationship lines show social fabric forming
- Subtle animations suggest awareness

And when you explain it: "Each worker is an agent with its own state model. Mood, energy, relationships, thoughts - all tracked and visualized. Agents modeling agents."

The factory isn't just efficient. It's *inhabited*.
