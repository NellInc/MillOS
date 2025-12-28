# Continuation Prompt: Audio-Reactive Visuals

## Objective

Connect MillOS's existing audio system to visual effects, creating a synesthetic experience where the factory *pulses* with its own sounds. Machine hums affect glow, conveyors create visual rhythm, alarms trigger environmental response.

**The Pitch:** "The agents built a factory that *breathes* - audio and visuals as one integrated system."

**Performance Constraints:**
- Must maintain 60fps
- Audio analysis throttled to 30fps (sufficient for visual feedback)
- No FFT analysis on main thread - use lightweight amplitude tracking
- Reuse existing shader uniform updates, don't create new draw calls

---

## Part 1: Audio Analysis System

### 1.1 Lightweight Audio Analyzer

Extract amplitude data without heavy FFT processing.

**File:** `src/utils/audioAnalyzer.ts`

```typescript
/**
 * Lightweight audio analyzer for visual reactivity.
 * Uses simple amplitude tracking, not full FFT.
 * PERFORMANCE: Updates at 30fps, minimal CPU overhead.
 */

interface AudioLevels {
  master: number;        // 0-1 overall volume
  low: number;           // 0-1 bass/low frequencies (machine hum)
  mid: number;           // 0-1 mid frequencies (conveyors, general)
  high: number;          // 0-1 high frequencies (alarms, beeps)
  peak: number;          // 0-1 recent peak for transient detection
}

class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  private levels: AudioLevels = {
    master: 0,
    low: 0,
    mid: 0,
    high: 0,
    peak: 0,
  };

  private peakDecay = 0.95; // Peak decay rate
  private smoothing = 0.8;  // Level smoothing
  private lastUpdateTime = 0;
  private updateInterval = 1000 / 30; // 30fps updates

  private listeners: Set<(levels: AudioLevels) => void> = new Set();

  /**
   * Connect to an audio element or the AudioManager's context
   */
  connect(audioContext: AudioContext, sourceNode?: AudioNode): void {
    this.audioContext = audioContext;

    // Create analyser with minimal FFT for performance
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 64; // Small FFT = fast
    this.analyser.smoothingTimeConstant = 0.8;

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    if (sourceNode) {
      sourceNode.connect(this.analyser);
    }

    // Start update loop
    this.update();
  }

  /**
   * Main update loop - throttled to 30fps
   */
  private update = (): void => {
    requestAnimationFrame(this.update);

    const now = performance.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = now;

    if (!this.analyser || !this.dataArray) return;

    // Get frequency data
    this.analyser.getByteFrequencyData(this.dataArray);

    const bins = this.dataArray.length;

    // Calculate band averages (very lightweight)
    let lowSum = 0, midSum = 0, highSum = 0, totalSum = 0;

    for (let i = 0; i < bins; i++) {
      const value = this.dataArray[i] / 255;
      totalSum += value;

      if (i < bins * 0.25) {
        lowSum += value;
      } else if (i < bins * 0.6) {
        midSum += value;
      } else {
        highSum += value;
      }
    }

    // Normalize
    const lowBins = Math.floor(bins * 0.25);
    const midBins = Math.floor(bins * 0.35);
    const highBins = bins - lowBins - midBins;

    const newLow = lowSum / lowBins;
    const newMid = midSum / midBins;
    const newHigh = highSum / highBins;
    const newMaster = totalSum / bins;

    // Smooth transitions
    this.levels.low = this.smooth(this.levels.low, newLow);
    this.levels.mid = this.smooth(this.levels.mid, newMid);
    this.levels.high = this.smooth(this.levels.high, newHigh);
    this.levels.master = this.smooth(this.levels.master, newMaster);

    // Peak tracking with decay
    if (newMaster > this.levels.peak) {
      this.levels.peak = newMaster;
    } else {
      this.levels.peak *= this.peakDecay;
    }

    // Notify listeners
    this.listeners.forEach(fn => fn(this.levels));
  };

  private smooth(current: number, target: number): number {
    return current * this.smoothing + target * (1 - this.smoothing);
  }

  /**
   * Subscribe to level updates
   */
  subscribe(callback: (levels: AudioLevels) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get current levels (for polling)
   */
  getLevels(): AudioLevels {
    return { ...this.levels };
  }

  /**
   * Simulate levels when no audio connected (for testing/fallback)
   */
  simulateLevels(baseActivity: number = 0.5): void {
    const time = performance.now() / 1000;

    // Simulate factory ambience
    this.levels.low = baseActivity * 0.7 + Math.sin(time * 0.5) * 0.1;
    this.levels.mid = baseActivity * 0.5 + Math.sin(time * 1.2) * 0.15;
    this.levels.high = baseActivity * 0.2 + Math.sin(time * 3.0) * 0.1;
    this.levels.master = (this.levels.low + this.levels.mid + this.levels.high) / 3;
    this.levels.peak = Math.max(this.levels.master, this.levels.peak * 0.98);

    this.listeners.forEach(fn => fn(this.levels));
  }
}

export const audioAnalyzer = new AudioAnalyzer();
export type { AudioLevels };
```

### 1.2 Integration with Existing AudioManager

**File:** Update `src/utils/audioManager.ts`

```typescript
import { audioAnalyzer } from './audioAnalyzer';

class AudioManager {
  // ... existing code ...

  async initialize(): Promise<void> {
    // ... existing initialization ...

    // Connect analyzer to master output
    if (this.audioContext && this.masterGain) {
      audioAnalyzer.connect(this.audioContext, this.masterGain);
    }
  }
}
```

### 1.3 React Hook for Audio Levels

**File:** `src/hooks/useAudioLevels.ts`

```typescript
import { useState, useEffect, useRef } from 'react';
import { audioAnalyzer, AudioLevels } from '../utils/audioAnalyzer';

/**
 * Hook to access audio levels for visual reactivity.
 * PERFORMANCE: Only re-renders when levels change significantly.
 */
export const useAudioLevels = (threshold: number = 0.02): AudioLevels => {
  const [levels, setLevels] = useState<AudioLevels>({
    master: 0,
    low: 0,
    mid: 0,
    high: 0,
    peak: 0,
  });

  const lastLevels = useRef(levels);

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((newLevels) => {
      // Only update if change exceeds threshold (prevents excessive re-renders)
      const delta = Math.abs(newLevels.master - lastLevels.current.master);
      if (delta > threshold) {
        lastLevels.current = newLevels;
        setLevels(newLevels);
      }
    });

    return unsubscribe;
  }, [threshold]);

  return levels;
};

/**
 * Ref-based hook for shader uniforms (no re-renders)
 */
export const useAudioLevelsRef = (): React.MutableRefObject<AudioLevels> => {
  const levelsRef = useRef<AudioLevels>({
    master: 0,
    low: 0,
    mid: 0,
    high: 0,
    peak: 0,
  });

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((newLevels) => {
      levelsRef.current = newLevels;
    });

    return unsubscribe;
  }, []);

  return levelsRef;
};
```

---

## Part 2: Machine Glow Reactivity

### 2.1 Audio-Reactive Machine Material

Machines pulse with the low-frequency hum.

**File:** `src/shaders/audioReactiveMaterial.ts`

```typescript
import * as THREE from 'three';

export const createAudioReactiveMaterial = (
  baseColor: string,
  glowColor: string,
  zoneFrequency: 'low' | 'mid' | 'high' = 'low'
) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      glowColor: { value: new THREE.Color(glowColor) },
      audioLevel: { value: 0.0 },
      time: { value: 0.0 },
      metalness: { value: 0.7 },
      roughness: { value: 0.3 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalMatrix * normal;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      uniform float audioLevel;
      uniform float time;
      uniform float metalness;
      uniform float roughness;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Basic lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        float diffuse = max(dot(normal, lightDir), 0.0) * 0.6 + 0.4;

        // Fresnel rim
        float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.0);

        // Audio-reactive glow
        float pulse = audioLevel * (0.8 + sin(time * 4.0) * 0.2);
        float glowIntensity = fresnel * pulse * 0.5;

        // Subtle surface variation based on audio
        float surfaceWave = sin(vWorldPosition.y * 3.0 + time * 2.0) * audioLevel * 0.1;

        vec3 color = baseColor * diffuse;
        color = mix(color, glowColor, glowIntensity + surfaceWave);

        // Metallic highlight
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 32.0) * metalness;
        color += vec3(spec) * (1.0 - roughness);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
};
```

### 2.2 Machine Audio Reactivity Hook

**File:** `src/hooks/useMachineAudioReactivity.ts`

```typescript
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { audioAnalyzer } from '../utils/audioAnalyzer';
import { MachineData, MachineType } from '../types';

/**
 * Updates machine materials based on audio levels.
 * PERFORMANCE: Uses refs, updates in useFrame, no React re-renders.
 */
export const useMachineAudioReactivity = (
  materialRef: React.RefObject<THREE.ShaderMaterial>,
  machineType: MachineType
) => {
  const levelsRef = useRef({ low: 0, mid: 0, high: 0 });

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((levels) => {
      levelsRef.current = levels;
    });
    return unsubscribe;
  }, []);

  useFrame((state) => {
    if (!materialRef.current?.uniforms) return;

    const levels = levelsRef.current;

    // Map machine type to frequency band
    let audioLevel: number;
    switch (machineType) {
      case MachineType.SILO:
        audioLevel = levels.low * 0.8; // Silos respond to low hum
        break;
      case MachineType.ROLLER_MILL:
        audioLevel = levels.low * 0.6 + levels.mid * 0.4; // Mills: low + mid
        break;
      case MachineType.PLANSIFTER:
        audioLevel = levels.mid * 0.7 + levels.high * 0.3; // Sifters: mid + high
        break;
      case MachineType.PACKER:
        audioLevel = levels.mid * 0.5; // Packers: mid
        break;
      default:
        audioLevel = levels.master;
    }

    materialRef.current.uniforms.audioLevel.value = audioLevel;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
  });
};
```

---

## Part 3: Conveyor Visual Rhythm

### 3.1 Audio-Reactive Conveyor Shader

Conveyor belts pulse with mid-frequency rhythm.

**File:** `src/shaders/conveyorAudioShader.ts`

```typescript
import * as THREE from 'three';

export const createAudioConveyorMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      beltColor: { value: new THREE.Color('#1a1a2e') },
      lineColor: { value: new THREE.Color('#3b82f6') },
      audioMid: { value: 0.0 },
      time: { value: 0.0 },
      speed: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 beltColor;
      uniform vec3 lineColor;
      uniform float audioMid;
      uniform float time;
      uniform float speed;

      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        // Moving belt lines
        float beltPosition = vWorldPosition.z * 0.5 - time * speed;
        float line = abs(fract(beltPosition) - 0.5) * 2.0;
        line = smoothstep(0.4, 0.45, line);

        // Audio-reactive intensity
        float pulse = 1.0 + audioMid * 0.5;
        float lineIntensity = line * pulse;

        // Audio-reactive line width variation
        float widthPulse = sin(beltPosition * 3.14159 + time * 3.0) * audioMid * 0.3;

        vec3 color = mix(beltColor, lineColor, lineIntensity * (1.0 + widthPulse));

        // Edge glow
        float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        color += lineColor * (1.0 - edge) * audioMid * 0.3;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
};
```

---

## Part 4: Ambient Light Breathing

### 4.1 Audio-Reactive Ambient Lights

Factory lighting subtly pulses with overall activity.

**File:** `src/components/AudioReactiveLighting.tsx`

```tsx
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { audioAnalyzer } from '../utils/audioAnalyzer';

export const AudioReactiveLighting: React.FC = () => {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const fillRef = useRef<THREE.PointLight>(null);
  const levelsRef = useRef({ master: 0, low: 0, peak: 0 });

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((levels) => {
      levelsRef.current = levels;
    });
    return unsubscribe;
  }, []);

  useFrame(() => {
    const { master, low, peak } = levelsRef.current;

    // Ambient light breathes with master level
    if (ambientRef.current) {
      const baseIntensity = 0.3;
      const audioBoost = master * 0.15;
      ambientRef.current.intensity = baseIntensity + audioBoost;
    }

    // Fill light pulses with bass
    if (fillRef.current) {
      const baseIntensity = 0.5;
      const bassBoost = low * 0.3;
      const peakFlash = peak > 0.8 ? (peak - 0.8) * 2 : 0;
      fillRef.current.intensity = baseIntensity + bassBoost + peakFlash;
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} color="#b8c5d6" intensity={0.3} />
      <pointLight
        ref={fillRef}
        position={[0, 10, 0]}
        color="#ffa64d"
        intensity={0.5}
        distance={50}
        decay={2}
      />
    </>
  );
};
```

---

## Part 5: Alert Visual Response

### 5.1 Alarm Visual Effects

When alarms sound, the environment responds.

**File:** `src/components/AlarmVisualResponse.tsx`

```tsx
import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { audioAnalyzer } from '../utils/audioAnalyzer';
import { useSafetyStore } from '../stores/safetyStore';

export const AlarmVisualResponse: React.FC = () => {
  const overlayRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const levelsRef = useRef({ high: 0, peak: 0 });

  const hasActiveAlerts = useSafetyStore((s) =>
    s.alerts.some(a => a.severity === 'critical' && !a.acknowledged)
  );

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((levels) => {
      levelsRef.current = { high: levels.high, peak: levels.peak };
    });
    return unsubscribe;
  }, []);

  const material = React.useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      alertIntensity: { value: 0.0 },
      audioHigh: { value: 0.0 },
      time: { value: 0.0 },
      alertColor: { value: new THREE.Color('#ef4444') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float alertIntensity;
      uniform float audioHigh;
      uniform float time;
      uniform vec3 alertColor;

      varying vec2 vUv;

      void main() {
        // Edge vignette that pulses with alarm audio
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0;

        // Pulsing edge glow
        float pulse = sin(time * 6.0) * 0.5 + 0.5;
        pulse *= audioHigh;

        float edge = smoothstep(0.6, 1.0, dist);
        float alpha = edge * alertIntensity * (0.3 + pulse * 0.4);

        gl_FragColor = vec4(alertColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  useFrame((state) => {
    if (!materialRef.current) return;

    const { high } = levelsRef.current;

    // Smoothly transition alert intensity
    const targetIntensity = hasActiveAlerts ? 1.0 : 0.0;
    const current = materialRef.current.uniforms.alertIntensity.value;
    materialRef.current.uniforms.alertIntensity.value +=
      (targetIntensity - current) * 0.1;

    materialRef.current.uniforms.audioHigh.value = high;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
  });

  // Don't render if no alerts (performance)
  if (!hasActiveAlerts && materialRef.current?.uniforms.alertIntensity.value < 0.01) {
    return null;
  }

  return (
    <mesh ref={overlayRef} position={[0, 0, 0]} renderOrder={999}>
      <planeGeometry args={[200, 200]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};
```

---

## Part 6: Status Indicator Audio Sync

### 6.1 LED Indicators Pulse with Audio

Machine status LEDs sync with their sound signatures.

**File:** `src/components/machines/AudioSyncLED.tsx`

```tsx
import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { audioAnalyzer } from '../../utils/audioAnalyzer';

interface AudioSyncLEDProps {
  status: 'running' | 'idle' | 'warning' | 'critical';
  position: [number, number, number];
  size?: number;
}

const STATUS_COLORS = {
  running: '#10b981',
  idle: '#6b7280',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const STATUS_FREQUENCY = {
  running: 'low' as const,
  idle: 'low' as const,
  warning: 'mid' as const,
  critical: 'high' as const,
};

export const AudioSyncLED: React.FC<AudioSyncLEDProps> = ({
  status,
  position,
  size = 0.2,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const levelsRef = useRef({ low: 0, mid: 0, high: 0 });

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((levels) => {
      levelsRef.current = levels;
    });
    return unsubscribe;
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: STATUS_COLORS[status],
    emissive: STATUS_COLORS[status],
    emissiveIntensity: 0.5,
  }), [status]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const freq = STATUS_FREQUENCY[status];
    const level = levelsRef.current[freq];
    const time = state.clock.elapsedTime;

    // Base pulse rate varies by status
    let pulseRate = 2;
    if (status === 'warning') pulseRate = 4;
    if (status === 'critical') pulseRate = 8;

    // Audio modulates the pulse intensity
    const pulse = Math.sin(time * pulseRate) * 0.5 + 0.5;
    const audioMod = 1 + level * 0.5;

    const intensity = status === 'idle'
      ? 0.2
      : (0.5 + pulse * 0.5) * audioMod;

    (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
  });

  return (
    <mesh ref={meshRef} position={position} material={material}>
      <sphereGeometry args={[size, 8, 8]} />
    </mesh>
  );
};
```

---

## Part 7: Centralized Audio-Visual Manager

### 7.1 Single Update Loop for All Audio-Reactive Elements

Consolidate all audio-reactive updates into one useFrame to minimize overhead.

**File:** `src/components/AudioVisualManager.tsx`

```tsx
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { audioAnalyzer, AudioLevels } from '../utils/audioAnalyzer';

// Registry of audio-reactive materials
interface AudioReactiveMaterial {
  material: THREE.ShaderMaterial;
  frequencyBand: 'low' | 'mid' | 'high' | 'master';
  intensityMultiplier: number;
}

const materialRegistry = new Map<string, AudioReactiveMaterial>();

// Public API for registering materials
export const registerAudioMaterial = (
  id: string,
  material: THREE.ShaderMaterial,
  frequencyBand: 'low' | 'mid' | 'high' | 'master' = 'master',
  intensityMultiplier: number = 1.0
) => {
  materialRegistry.set(id, { material, frequencyBand, intensityMultiplier });
};

export const unregisterAudioMaterial = (id: string) => {
  materialRegistry.delete(id);
};

export const AudioVisualManager: React.FC = () => {
  const levelsRef = useRef<AudioLevels>({
    master: 0,
    low: 0,
    mid: 0,
    high: 0,
    peak: 0,
  });

  useEffect(() => {
    const unsubscribe = audioAnalyzer.subscribe((levels) => {
      levelsRef.current = levels;
    });
    return unsubscribe;
  }, []);

  useFrame((state) => {
    const levels = levelsRef.current;
    const time = state.clock.elapsedTime;

    // Update all registered materials in one loop
    materialRegistry.forEach((entry) => {
      const { material, frequencyBand, intensityMultiplier } = entry;

      if (!material.uniforms) return;

      // Update audio level uniform
      if (material.uniforms.audioLevel !== undefined) {
        const level = levels[frequencyBand] * intensityMultiplier;
        material.uniforms.audioLevel.value = level;
      }

      // Update specific band uniforms if they exist
      if (material.uniforms.audioLow !== undefined) {
        material.uniforms.audioLow.value = levels.low;
      }
      if (material.uniforms.audioMid !== undefined) {
        material.uniforms.audioMid.value = levels.mid;
      }
      if (material.uniforms.audioHigh !== undefined) {
        material.uniforms.audioHigh.value = levels.high;
      }
      if (material.uniforms.audioPeak !== undefined) {
        material.uniforms.audioPeak.value = levels.peak;
      }

      // Update time uniform
      if (material.uniforms.time !== undefined) {
        material.uniforms.time.value = time;
      }
    });
  });

  return null; // No visual output, just manages updates
};
```

---

## Part 8: Fallback/Simulation Mode

### 8.1 Simulated Audio for Demos

When audio isn't playing, simulate plausible levels based on factory state.

**File:** `src/hooks/useSimulatedAudioLevels.ts`

```typescript
import { useEffect } from 'react';
import { audioAnalyzer } from '../utils/audioAnalyzer';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

/**
 * Simulates audio levels based on factory activity when real audio unavailable.
 */
export const useSimulatedAudioLevels = () => {
  const machines = useProductionStore((s) => s.machines);
  const drillActive = useGameSimulationStore((s) => s.drillMetrics.active);

  useEffect(() => {
    // Calculate activity level from machine states
    const runningMachines = machines.filter(m => m.status === 'running').length;
    const totalMachines = machines.length || 1;
    const activityLevel = runningMachines / totalMachines;

    // Boost during drill (alarms)
    const drillBoost = drillActive ? 0.3 : 0;

    // Set up simulation interval
    const interval = setInterval(() => {
      audioAnalyzer.simulateLevels(activityLevel + drillBoost);
    }, 33); // ~30fps

    return () => clearInterval(interval);
  }, [machines, drillActive]);
};
```

---

## Part 9: Integration

### 9.1 Add to Main Scene

**File:** Update `src/components/MillScene.tsx`

```tsx
import { AudioVisualManager } from './AudioVisualManager';
import { AudioReactiveLighting } from './AudioReactiveLighting';
import { AlarmVisualResponse } from './AlarmVisualResponse';
import { useSimulatedAudioLevels } from '../hooks/useSimulatedAudioLevels';

const MillScene: React.FC = () => {
  // Enable simulated audio when real audio not available
  useSimulatedAudioLevels();

  return (
    <>
      {/* Audio-visual integration */}
      <AudioVisualManager />
      <AudioReactiveLighting />
      <AlarmVisualResponse />

      {/* ... rest of scene */}
    </>
  );
};
```

---

## Performance Optimizations

### Throttling

- Audio analysis: 30fps (sufficient for visual response)
- Material updates: Every frame but O(n) where n = registered materials
- React state updates: Only when delta > threshold

### Memory

- Single AudioAnalyzer instance (singleton)
- Shared material instances where possible
- WeakMap for temporary references

### CPU

- Minimal FFT (fftSize: 64)
- Simple band averaging, no complex analysis
- Ref-based updates, no React re-renders during animation

---

## Validation Checklist

- [ ] `npm run build` passes
- [ ] AudioAnalyzer initializes without errors
- [ ] Machine glow responds to low frequencies
- [ ] Conveyor animation responds to mid frequencies
- [ ] Alarm overlay responds to high frequencies
- [ ] Ambient lighting breathes with activity
- [ ] 60fps maintained with audio reactivity active
- [ ] Simulated mode works when audio muted
- [ ] No audio-related console errors
- [ ] Visual response feels connected, not random

---

## The Impact

Visitors see a factory that *feels alive*:
- Machines don't just run, they *hum* visually
- Conveyors don't just move, they *pulse* with rhythm
- Alarms don't just display, they *flood* the environment

And when you explain it: "The agents connected sight and sound. The factory breathes as one system."
