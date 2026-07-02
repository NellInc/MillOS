/**
 * Worker Mood Overlay
 *
 * Renders speech bubbles, mood indicators, and visual effects for worker moods.
 * Theme Hospital inspired - workers grumble charmingly but never storm out.
 */

import React, { useRef, useMemo, createContext, useContext, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useSafetyReportStore } from '../stores/safetyReportStore';
import { useEmergentCooperationStore } from '../stores/emergentCooperationStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useProductionStore } from '../stores/productionStore';
import { useFlourishingStore } from '../stores/flourishingStore';
import type { MoodState } from '../types';
import { Heart, Frown, Smile, Moon, Utensils } from 'lucide-react';

// ============================================================
// Worker Mood Animation Manager - Centralized useFrame for mood overlays
// ============================================================

interface SpeechBubbleEntry {
  type: 'speechBubble';
  groupRef: React.RefObject<THREE.Group | null>;
  phase: number;
  baseY: number;
}

interface MoodIndicatorEntry {
  type: 'moodIndicator';
  groupRef: React.RefObject<THREE.Group | null>;
  materialRef: React.RefObject<THREE.MeshBasicMaterial | null>;
  pulseRef: React.RefObject<number>;
  moodState: MoodState;
}

interface TiredEffectsEntry {
  type: 'tiredEffects';
  zzzRefs: React.RefObject<THREE.Group[]>;
  phases: number[];
  basePosition: [number, number, number];
}

type WorkerMoodEntry = SpeechBubbleEntry | MoodIndicatorEntry | TiredEffectsEntry;

interface WorkerMoodAnimationContextValue {
  register: (id: string, entry: WorkerMoodEntry) => void;
  unregister: (id: string) => void;
}

const WorkerMoodAnimationContext = createContext<WorkerMoodAnimationContextValue | null>(null);

// Pure animation functions
function animateSpeechBubble(entry: SpeechBubbleEntry, elapsedTime: number) {
  if (!entry.groupRef.current) return;
  const bob = Math.sin(elapsedTime * 2 + entry.phase) * 0.05;
  entry.groupRef.current.position.y = entry.baseY + bob;
}

function animateMoodIndicator(entry: MoodIndicatorEntry, elapsedTime: number) {
  if (entry.groupRef.current) {
    const shouldPulse =
      entry.moodState === 'tired' ||
      entry.moodState === 'frustrated' ||
      entry.moodState === 'hangry';
    if (shouldPulse) {
      entry.pulseRef.current = Math.sin(elapsedTime * 3) * 0.15 + 1;
      entry.groupRef.current.scale.setScalar(entry.pulseRef.current);
    } else {
      entry.groupRef.current.scale.setScalar(1);
    }
  }
  if (entry.materialRef.current) {
    const alpha = entry.moodState === 'content' ? 0.6 : 0.9;
    entry.materialRef.current.opacity = alpha;
  }
}

function animateTiredEffects(entry: TiredEffectsEntry, elapsedTime: number) {
  entry.zzzRefs.current.forEach((ref, i) => {
    if (ref) {
      const phase = (elapsedTime * 0.5 + entry.phases[i]) % 1;
      ref.position.y = entry.basePosition[1] + 2 + phase * 0.5;
      ref.position.x = entry.basePosition[0] + 0.2 + Math.sin(phase * Math.PI * 2) * 0.1;
      const opacity = phase < 0.3 ? phase / 0.3 : phase > 0.7 ? (1 - phase) / 0.3 : 1;
      const scale = 0.05 + phase * 0.05;
      ref.scale.setScalar(scale);
      const material = (ref.children[0] as THREE.Mesh)?.material as THREE.MeshBasicMaterial;
      if (material) material.opacity = opacity * 0.7;
    }
  });
}

export const WorkerMoodAnimationManager: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const entriesRef = useRef<Map<string, WorkerMoodEntry>>(new Map());
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  const register = useCallback((id: string, entry: WorkerMoodEntry) => {
    entriesRef.current.set(id, entry);
  }, []);

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  useFrame((state) => {
    if (!isTabVisible) return;
    if (quality === 'low') return; // Skip all mood animations on LOW quality

    const elapsedTime = state.clock.elapsedTime;

    entriesRef.current.forEach((entry) => {
      switch (entry.type) {
        case 'speechBubble':
          animateSpeechBubble(entry, elapsedTime);
          break;
        case 'moodIndicator':
          animateMoodIndicator(entry, elapsedTime);
          break;
        case 'tiredEffects':
          animateTiredEffects(entry, elapsedTime);
          break;
      }
    });
  });

  const contextValue = React.useMemo(() => ({ register, unregister }), [register, unregister]);

  return (
    <WorkerMoodAnimationContext.Provider value={contextValue}>
      {children}
    </WorkerMoodAnimationContext.Provider>
  );
};

// Hook for components to access the context
function useWorkerMoodAnimation() {
  return useContext(WorkerMoodAnimationContext);
}

// Mood indicator colors
const MOOD_COLORS: Record<MoodState, string> = {
  content: '#22c55e', // Green
  tired: '#6b7280', // Gray
  frustrated: '#f97316', // Orange
  hangry: '#ef4444', // Red
  elated: '#eab308', // Yellow/Gold
};

// Mood indicator icons (Lucide icon names for reference)
const MOOD_ICONS: Record<MoodState, React.ReactNode> = {
  content: <Smile className="w-3 h-3" />,
  tired: <Moon className="w-3 h-3" />,
  frustrated: <Frown className="w-3 h-3" />,
  hangry: <Utensils className="w-3 h-3" />,
  elated: <Heart className="w-3 h-3" />,
};

interface SpeechBubbleProps {
  text: string;
  position: [number, number, number];
  moodState: MoodState;
}

// Speech bubble component - cartoon style
const SpeechBubble: React.FC<SpeechBubbleProps> = React.memo(({ text, position, moodState }) => {
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(Math.random() * Math.PI * 2);
  const idRef = useRef(`speechBubble-${Math.random().toString(36).slice(2, 9)}`);
  const context = useWorkerMoodAnimation();
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  const baseY = position[1] + 2.2;

  // Register with manager if available
  useEffect(() => {
    if (context) {
      context.register(idRef.current, {
        type: 'speechBubble',
        groupRef,
        phase: phaseRef.current,
        baseY,
      });
      return () => context.unregister(idRef.current);
    }
  }, [context, baseY]);

  // Fallback useFrame when not in manager context
  useFrame((state) => {
    if (context) return; // Manager handles animation
    if (!isTabVisible) return;
    if (quality === 'low') return;
    animateSpeechBubble(
      { type: 'speechBubble', groupRef, phase: phaseRef.current, baseY },
      state.clock.elapsedTime
    );
  });

  const bubbleColor = MOOD_COLORS[moodState];

  return (
    <group ref={groupRef} position={[position[0], position[1] + 2.2, position[2]]}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Html
          center
          distanceFactor={8}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: 'white',
              border: `2px solid ${bubbleColor}`,
              borderRadius: '12px',
              padding: '6px 10px',
              fontSize: '11px',
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 500,
              color: '#1f2937',
              maxWidth: '140px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              position: 'relative',
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
            {/* Speech bubble tail */}
            <div
              style={{
                position: 'absolute',
                bottom: '-8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: `8px solid ${bubbleColor}`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid white',
              }}
            />
          </div>
        </Html>
      </Billboard>
    </group>
  );
});
SpeechBubble.displayName = 'SpeechBubble';

interface MoodIndicatorProps {
  moodState: MoodState;
  energy: number;
  position: [number, number, number];
}

// Small mood indicator that floats above worker's head
const MoodIndicator: React.FC<MoodIndicatorProps> = React.memo(
  ({ moodState, energy, position }) => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);
    const pulseRef = useRef(0);
    const idRef = useRef(`moodIndicator-${Math.random().toString(36).slice(2, 9)}`);
    const context = useWorkerMoodAnimation();
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const quality = useGraphicsStore((state) => state.graphics.quality);

    // Guard against NaN/invalid energy values - prevents zero-width PlaneGeometry
    const safeEnergy = Number.isFinite(energy) && energy >= 0 ? energy : 50;
    const energyRatio = Math.max(0.01, safeEnergy / 100); // Ensure minimum 1% to avoid zero width

    // Register with manager if available - re-register when moodState changes
    useEffect(() => {
      if (context) {
        context.register(idRef.current, {
          type: 'moodIndicator',
          groupRef,
          materialRef,
          pulseRef,
          moodState,
        });
        return () => context.unregister(idRef.current);
      }
    }, [context, moodState]);

    // Fallback useFrame when not in manager context
    useFrame((state) => {
      if (context) return; // Manager handles animation
      if (!isTabVisible) return;
      if (quality === 'low') return;
      animateMoodIndicator(
        { type: 'moodIndicator', groupRef, materialRef, pulseRef, moodState },
        state.clock.elapsedTime
      );
    });

    const color = MOOD_COLORS[moodState];

    return (
      <group ref={groupRef} position={[position[0], position[1] + 1.8, position[2]]}>
        <Billboard>
          {/* Background circle */}
          <mesh>
            <circleGeometry args={[0.15, 16]} />
            <meshBasicMaterial ref={materialRef} color={color} transparent opacity={0.8} />
          </mesh>
          {/* Inner icon area */}
          <mesh position={[0, 0, 0.01]}>
            <circleGeometry args={[0.1, 16]} />
            <meshBasicMaterial color="white" transparent opacity={0.9} />
          </mesh>
        </Billboard>

        {/* HTML overlay for icon */}
        <Billboard>
          <Html center distanceFactor={10} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                color: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {MOOD_ICONS[moodState]}
            </div>
          </Html>
        </Billboard>

        {/* Energy bar (small) */}
        <group position={[0, -0.25, 0]}>
          <Billboard>
            {/* Background bar */}
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[0.3, 0.04]} />
              <meshBasicMaterial color="#374151" transparent opacity={0.5} />
            </mesh>
            {/* Energy fill */}
            <mesh position={[(energyRatio - 1) * 0.15, 0, 0.01]}>
              <planeGeometry args={[0.3 * energyRatio, 0.03]} />
              <meshBasicMaterial
                color={safeEnergy > 50 ? '#22c55e' : safeEnergy > 25 ? '#eab308' : '#ef4444'}
                transparent
                opacity={0.8}
              />
            </mesh>
          </Billboard>
        </group>
      </group>
    );
  }
);
MoodIndicator.displayName = 'MoodIndicator';

// Tired worker visual effects (ZZZ floating up, yawn animation indicator)
const TiredEffects: React.FC<{ position: [number, number, number] }> = React.memo(
  ({ position }) => {
    const zzzRefs = useRef<THREE.Group[]>([]);
    const phases = useMemo(() => [0, 0.4, 0.8], []);
    const idRef = useRef(`tiredEffects-${Math.random().toString(36).slice(2, 9)}`);
    const context = useWorkerMoodAnimation();
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const quality = useGraphicsStore((state) => state.graphics.quality);

    // Register with manager if available
    useEffect(() => {
      if (context) {
        context.register(idRef.current, {
          type: 'tiredEffects',
          zzzRefs,
          phases,
          basePosition: position,
        });
        return () => context.unregister(idRef.current);
      }
    }, [context, phases, position]);

    // Fallback useFrame when not in manager context
    useFrame((state) => {
      if (context) return; // Manager handles animation
      if (!isTabVisible) return;
      if (quality === 'low') return;
      animateTiredEffects(
        { type: 'tiredEffects', zzzRefs, phases, basePosition: position },
        state.clock.elapsedTime
      );
    });

    return (
      <group>
        {phases.map((_, i) => (
          <group
            key={i}
            ref={(el) => {
              if (el) zzzRefs.current[i] = el;
            }}
            position={[position[0] + 0.2, position[1] + 2, position[2]]}
          >
            <Billboard>
              <Text fontSize={1} color="#6b7280" anchorX="center" anchorY="middle">
                Z
              </Text>
            </Billboard>
          </group>
        ))}
      </group>
    );
  }
);
TiredEffects.displayName = 'TiredEffects';

// Main worker mood overlay component
interface WorkerMoodOverlayProps {
  workerId: string;
  position: [number, number, number];
  showIndicator?: boolean;
}

export const WorkerMoodOverlay: React.FC<WorkerMoodOverlayProps> = React.memo(
  ({ workerId, position, showIndicator = true }) => {
    const mood = useWorkerMoodStore((state) => state.workerMoods[workerId]);

    if (!mood) return null;

    return (
      <group>
        {/* Speech bubble when speaking */}
        {mood.isSpeaking && mood.currentPhrase && (
          <SpeechBubble text={mood.currentPhrase} position={position} moodState={mood.state} />
        )}

        {/* Mood indicator (small icon above head) */}
        {showIndicator && !mood.isSpeaking && (
          <MoodIndicator moodState={mood.state} energy={mood.energy} position={position} />
        )}

        {/* Tired effects (ZZZ) */}
        {mood.state === 'tired' && <TiredEffects position={position} />}
      </group>
    );
  }
);
WorkerMoodOverlay.displayName = 'WorkerMoodOverlay';

// Mood system simulation hook - call this in the main scene
// PERFORMANCE: This triggers Zustand store updates every second
// which can cause re-renders on subscribers. Disabled on low quality or via perfDebug.
export const useMoodSimulation = () => {
  const { tickMoodSimulation, triggerRandomPreferenceRequest } = useWorkerMoodStore(
    useShallow((state) => ({
      tickMoodSimulation: state.tickMoodSimulation,
      triggerRandomPreferenceRequest: state.triggerRandomPreferenceRequest,
    }))
  );
  const lastTickRef = useRef(Date.now());
  const preferenceTickRef = useRef(0); // Counter for throttled preference requests
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  // Graphics store for quality and perfDebug checks
  const { graphicsQuality, disableWorkerMoods } = useGraphicsStore(
    useShallow((state) => ({
      graphicsQuality: state.graphics.quality,
      disableWorkerMoods: state.graphics.perfDebug?.disableWorkerMoods,
    }))
  );

  useFrame(() => {
    // PERFORMANCE: Skip mood simulation if disabled via perfDebug
    if (disableWorkerMoods) return;
    // PERFORMANCE: Skip mood simulation on low quality - saves ~5% CPU
    if (graphicsQuality === 'low') return;
    if (!isTabVisible) return;
    const now = Date.now();
    const deltaMs = now - lastTickRef.current;

    // Tick every 1 second of real time (simulating ~1 game minute)
    if (deltaMs >= 1000) {
      // Cap deltaMs to prevent huge time jumps after tab becomes visible
      const cappedDeltaMs = Math.min(deltaMs, 2000);
      const deltaMinutes = cappedDeltaMs / 1000; // 1 real second = 1 game minute

      // Use the store's game time (the single source of truth) instead of
      // recalculating from wall clock. This ensures mood simulation uses
      // the same time as everything else in the game.
      const gameTime = useGameSimulationStore.getState().gameTime;
      tickMoodSimulation(gameTime, deltaMinutes);

      // BILATERAL ALIGNMENT: Trigger random preference requests (throttled)
      // Only every ~15 game minutes to avoid spam
      preferenceTickRef.current += deltaMinutes;
      if (preferenceTickRef.current >= 15) {
        triggerRandomPreferenceRequest();
        preferenceTickRef.current = 0;
      }

      lastTickRef.current = now;
    }
  });
};

/**
 * Bilateral Alignment Simulation Hook
 *
 * PERFORMANCE: Uses separate throttling (every 5 seconds) to avoid
 * overloading the render loop with store updates.
 *
 * Ticks:
 * - Safety report store (report aging, willingness decay)
 * - Emergent cooperation store (action completion, random triggers)
 * - Breakdown store (breakdown simulation)
 * - Flourishing store
 *
 * AUTHORITATIVE DRIVER: this hook is the ONLY driver for
 * tickBreakdownSimulation and tickEmergentCooperation. Do not add these
 * ticks elsewhere (e.g. Environment.tsx OrphanedStoresTicker used to
 * duplicate them at double rate with ~100x-off deltaMinutes units).
 */
export const useBilateralAlignmentSimulation = () => {
  const lastTickRef = useRef(Date.now());
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame(() => {
    // NOTE: runs on all quality levels (throttled to one store tick per 5s,
    // negligible cost) - it is the sole driver for these simulations, so
    // skipping on low quality would freeze breakdowns/cooperation entirely.
    if (!isTabVisible) return;

    const now = Date.now();
    const deltaMs = now - lastTickRef.current;

    // PERFORMANCE: Tick only every 5 seconds to reduce store updates
    if (deltaMs >= 5000) {
      // Cap deltaMs to prevent huge time jumps after the tab becomes visible
      // again (useFrame is gated by isTabVisible, so lastTickRef can lag by the
      // entire hidden duration). Without this, a single post-refocus tick passes
      // a massive deltaMinutes into the simulations, instantly cratering values
      // like reportingWillingness (-0.5 * deltaMinutes, clamped to 0). Mirrors
      // the cap already applied in useMoodSimulation above.
      const cappedDeltaMs = Math.min(deltaMs, 6000);
      const deltaMinutes = cappedDeltaMs / 1000; // Convert to game minutes

      useSafetyReportStore.getState().tickSafetySimulation(deltaMinutes);
      useEmergentCooperationStore.getState().tickEmergentCooperation(deltaMinutes);

      const machines = useProductionStore.getState().machines;
      const gameTime = useGameSimulationStore.getState().gameTime;
      useBreakdownStore.getState().tickBreakdownSimulation(gameTime, machines);

      useFlourishingStore.getState().tickFlourishing(deltaMinutes);

      lastTickRef.current = now;
    }
  });
};

export default WorkerMoodOverlay;
