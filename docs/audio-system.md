# Audio System

MillOS features a detailed audio system using the Web Audio API to create an immersive factory soundscape.

## Table of Contents

1. [Overview](#overview)
2. [Audio Manager](#audio-manager)
3. [Sound Categories](#sound-categories)
4. [Noise Generation](#noise-generation)
5. [Sound Triggers](#sound-triggers)
6. [Volume Control](#volume-control)

---

## Overview

The audio system is implemented as a singleton `AudioManager` class in `src/utils/audioManager.ts`. It uses procedurally generated sounds via the Web Audio API rather than pre-recorded audio files.

### Key Features

- **Procedural Audio** - All sounds generated in real-time
- **Spatial Awareness** - Volume attenuation based on camera distance
- **Layered Soundscape** - Multiple ambient and reactive sound layers
- **Web Audio API** - Full browser audio synthesis
- **Mute/Volume Control** - Global audio controls

---

## Audio Manager

### Initialization

```typescript
import { audioManager } from '../utils/audioManager';

// Resume audio context (required after user interaction)
await audioManager.resume();

// Start ambient factory sounds
audioManager.startAmbientSounds();
```

### Singleton Pattern

```typescript
class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  // ...
}

export const audioManager = new AudioManager();
```

### Context Management

The Web Audio API requires user interaction before audio can play:

```typescript
async resume() {
  const ctx = this.getContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}
```

---

## Sound Categories

### 1. Ambient Factory Sounds

Continuous background soundscape:

| Sound | Type | Frequency | Volume | Description |
|-------|------|-----------|--------|-------------|
| Machinery Hum | Brown noise | 120Hz lowpass | 0.08 | Deep industrial drone |
| Conveyor Noise | Pink noise | 300Hz bandpass | 0.03 | Rhythmic belt sound |
| Ventilation | White noise | 500Hz highpass | 0.015 | HVAC air flow |
| Grain Flow | White noise | 2500Hz bandpass | 0.012 | Trickling grain |

```typescript
audioManager.startAmbientSounds();
audioManager.stopAmbientSounds();
```

### 2. Machine Sounds

Per-machine operational sounds:

#### Roller Mill Sound
```typescript
audioManager.playMillSound(machineId: string, rpm: number);
audioManager.stopMillSound(machineId: string);
```

- Pink noise with RPM-based filter frequency
- LFO modulation for grinding rhythm
- Volume: 0.04

#### Plansifter Sound
```typescript
audioManager.playSifterSound(machineId: string, rpm: number);
```

- White noise with 800Hz bandpass
- Double-rate LFO for shaking rhythm
- Volume: 0.025

#### Packer Sound
```typescript
audioManager.playPackerSound(machineId: string);
```

- White noise with 2000Hz highpass
- Square wave LFO for pneumatic pulses
- Volume: 0.01

### 3. Forklift Sounds

#### Horn
```typescript
audioManager.playHorn(forkliftId: string);
```

- Multi-oscillator chord (A3, C#4, E4)
- Sawtooth waves with lowpass filter
- Pink noise for air release
- Rate limited: 800ms cooldown

#### Backup Beeper
```typescript
audioManager.playBackupBeep(forkliftId: string);
```

- Two-tone square wave (1200Hz, 1000Hz)
- Pulsing envelope pattern
- Rate limited: 600ms cooldown

#### Engine
```typescript
audioManager.startForkliftEngine(forkliftId: string);
audioManager.updateForkliftEngine(forkliftId: string, isMoving: boolean, isStopped: boolean);
audioManager.stopForkliftEngine(forkliftId: string);
```

- Brown noise with 100Hz lowpass
- Variable LFO speed based on movement

### 4. Truck Sounds

```typescript
audioManager.startTruckEngine(truckId: string, isMoving?: boolean);
audioManager.updateTruckEngine(truckId: string, isMoving: boolean);
audioManager.stopTruckEngine(truckId: string);
audioManager.playAirBrake();
```

### 5. Worker Sounds

#### Footsteps
```typescript
audioManager.playFootstep(workerId: string);
```

- Brown noise with random pitch variation
- Quick attack, fast decay
- Rate limited: 280ms cooldown

### 6. UI Sounds

```typescript
audioManager.playClick();        // UI button clicks
audioManager.playHover();        // Element hover (subtle)
audioManager.playPanelOpen();    // Panel opening
audioManager.playPanelClose();   // Panel closing
audioManager.playAlert();        // Warning/critical alerts
audioManager.playClunk();        // Mechanical state changes
```

### 7. Radio Chatter

Periodic radio communication sounds:

```typescript
audioManager.startRadioChatter();
audioManager.stopRadioChatter();
```

- Random intervals: 8-25 seconds
- Types: static, beeps, squelch

### 8. Outdoor Ambient

External environmental sounds:

```typescript
audioManager.startOutdoorAmbient();
audioManager.stopOutdoorAmbient();
```

| Sound | Type | Frequency | Description |
|-------|------|-----------|-------------|
| Birds | White noise | 3500Hz bandpass | Chirping modulation |
| Wind | Pink noise | 400Hz lowpass | Gusting LFO |
| Traffic | Brown noise | 80Hz lowpass | Distant rumble |

---

## Noise Generation

The audio system generates three types of noise:

### White Noise
Random values between -1 and 1:
```typescript
data[i] = Math.random() * 2 - 1;
```

### Pink Noise
Filtered white noise with equal power per octave:
```typescript
b0 = 0.99886 * b0 + white * 0.0555179;
b1 = 0.99332 * b1 + white * 0.0750759;
// ... more coefficients
data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
```

### Brown Noise
Integration of white noise (more bass):
```typescript
data[i] = (b0 = (b0 + (0.02 * white)) / 1.02) * 3.5;
```

---

## Sound Triggers

### Machine Status Changes

```typescript
// In Machines.tsx
useEffect(() => {
  if (status !== 'running') {
    audioManager.stopMachineSound(data.id);
    return;
  }

  switch (type) {
    case MachineType.ROLLER_MILL:
      audioManager.playMillSound(data.id, data.metrics.rpm);
      break;
    case MachineType.PLANSIFTER:
      audioManager.playSifterSound(data.id, data.metrics.rpm);
      break;
    case MachineType.PACKER:
      audioManager.playPackerSound(data.id);
      break;
  }

  return () => {
    audioManager.stopMachineSound(data.id);
  };
}, [data.id, type, status, data.metrics.rpm]);
```

### Safety Events

```typescript
// In ForkliftSystem.tsx
useEffect(() => {
  if (isStopped && !wasStoppedRef.current) {
    audioManager.playHorn(data.id);
    recordSafetyStop();
  }
  wasStoppedRef.current = isStopped;
}, [isStopped]);
```

### Worker Movement

```typescript
// In WorkerSystem.tsx
useFrame((state, delta) => {
  if (!isIdle) {
    const currentStep = Math.floor(walkCycle / Math.PI);
    if (currentStep !== lastStepRef.current) {
      lastStepRef.current = currentStep;
      audioManager.playFootstep(data.id);
    }
  }
});
```

### UI Interactions

```typescript
// In components with click handlers
onClick={(e) => {
  e.stopPropagation();
  audioManager.playClick();
  onSelect();
}}
```

---

## Volume Control

### Properties

```typescript
// Get/set muted state
audioManager.muted = true;
const isMuted = audioManager.muted;

// Get/set volume (0-1)
audioManager.volume = 0.5;
const level = audioManager.volume;
```

### Subscription Pattern

UI components can subscribe to audio state changes:

```typescript
function useAudioState() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return audioManager.subscribe(() => forceUpdate({}));
  }, []);

  return {
    muted: audioManager.muted,
    volume: audioManager.volume,
    setMuted: (v: boolean) => { audioManager.muted = v; },
    setVolume: (v: number) => { audioManager.volume = v; }
  };
}
```

### Master Gain Control

Volume changes smoothly via `setTargetAtTime`:

```typescript
private updateMasterVolume(): void {
  if (this.masterGain) {
    const targetVolume = this._muted ? 0 : this._volume;
    this.masterGain.gain.setTargetAtTime(
      targetVolume,
      this.audioContext?.currentTime || 0,
      0.1  // Smooth transition
    );
  }
}
```

---

## Spatial Audio

### Camera Position Tracking

```typescript
audioManager.updateCameraPosition(x, y, z);
audioManager.registerSoundPosition(id, x, y, z);
```

### Distance Attenuation

```typescript
private calculateSpatialVolume(
  sourceId: string,
  baseVolume: number,
  maxDistance: number = 50
): number {
  const sourcePos = this.soundPositions.get(sourceId);
  if (!sourcePos) return baseVolume;

  const distance = Math.sqrt(
    (sourcePos.x - this.cameraPosition.x) ** 2 +
    (sourcePos.y - this.cameraPosition.y) ** 2 +
    (sourcePos.z - this.cameraPosition.z) ** 2
  );

  // Squared falloff for natural attenuation
  const attenuation = Math.max(0, 1 - (distance / maxDistance));
  return baseVolume * attenuation * attenuation;
}
```

---

## Cleanup

Stop all sounds when unmounting:

```typescript
// In App.tsx
useEffect(() => {
  return () => {
    audioManager.stopAll();
  };
}, []);
```

The `stopAll()` method terminates:
- Ambient sounds
- Outdoor ambient
- Radio chatter
- All machine sounds
- All forklift engines
- All truck engines
