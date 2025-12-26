# Architecture Overview

MillOS is a real-time 3D digital twin simulator for a grain mill factory. The sections below describe the system architecture, design patterns, and key technical decisions.

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Application Architecture](#application-architecture)
3. [Rendering Pipeline](#rendering-pipeline)
4. [State Management](#state-management)
5. [Factory Layout](#factory-layout)
6. [Design Patterns](#design-patterns)

---

## Technology Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI framework |
| TypeScript | 5.8.2 | Type safety |
| Vite | 6.2.0 | Build tool and dev server |

### 3D Rendering
| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | 0.181.2 | WebGL 3D rendering |
| React Three Fiber | 9.4.0 | React renderer for Three.js |
| @react-three/drei | 10.7.7 | R3F helper components |
| @react-three/postprocessing | 3.0.4 | Visual effects |

### State & Animation
| Technology | Version | Purpose |
|------------|---------|---------|
| Zustand | 5.0.0 | Global state management |
| Framer Motion | 11.15.0 | UI animations |

### UI & Styling
| Technology | Version | Purpose |
|------------|---------|---------|
| Tailwind CSS | 3.4.17 | Utility-first CSS |
| Lucide React | 0.555.0 | Icon library |
| Recharts | 2.15.0 | Data visualization charts |

---

## Application Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        App.tsx (Root)                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  UI Layer    │  │ Alert System │  │  AI Command Center    │  │
│  │  (DOM)       │  │  (DOM)       │  │  (DOM Slide-out)      │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      R3F Canvas                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    MillScene                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │ │
│  │  │ Machines │ │ Workers  │ │Forklifts │ │ Conveyors    │   │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │ │
│  │  │ Spouting │ │  Dust    │ │ TruckBay │ │ Holographics │   │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │              Factory Environment                      │   │ │
│  │  │  (Lighting, Walls, Ceiling, Skylights)               │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Zustand Store                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Workers  │ │ Machines │ │  Alerts  │ │  Safety Metrics  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     Utility Services                             │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐  │
│  │    Audio Manager     │  │      Position Registry          │  │
│  │  (Web Audio API)     │  │   (Collision Detection)         │  │
│  └──────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Layers

1. **DOM Layer** - Traditional React components for UI overlays, panels, alerts
2. **Canvas Layer** - React Three Fiber components for 3D rendering
3. **State Layer** - Zustand store for global application state
4. **Service Layer** - Singleton utilities for audio and position tracking

---

## Rendering Pipeline

### React Three Fiber Setup

```tsx
<Canvas
  shadows
  camera={{ position: [40, 25, 40], fov: 45, near: 0.1, far: 500 }}
  gl={{ antialias: true, alpha: false }}
  dpr={[1, 2]}
>
  <color attach="background" args={['#0a0f1a']} />
  <fog attach="fog" args={['#0a0f1a', 150, 500]} />

  <Suspense fallback={null}>
    <OrbitControls ... />
    <MillScene ... />
    <PostProcessing />
    <Preload all />
  </Suspense>
</Canvas>
```

### Camera Configuration

| Property | Value | Description |
|----------|-------|-------------|
| Position | [40, 25, 40] | Isometric-style view |
| FOV | 45 | Moderate field of view |
| Near Plane | 0.1 | Close clipping |
| Far Plane | 500 | Extended draw distance |
| Auto Rotate | 0.3 speed | When no selection active |

### Lighting System

The factory uses a multi-layer lighting approach:

1. **Ambient Light** - Base illumination (intensity: 0.15, color: #b4c6e7)
2. **Directional Key Light** - Primary shadows (intensity: 1.5)
3. **Directional Fill Light** - Shadow softening (intensity: 0.4)
4. **Point Lights (5x)** - Industrial overhead fixtures
5. **Accent Lights (3x)** - Colored dramatic lighting
6. **Spot Light** - Machine highlighting

---

## State Management

### Zustand Store Structure

```typescript
interface MillStore {
  // Time System (24-hour cycle)
  gameTime: number;              // 0-24 hour representation
  setGameTime: (time: number) => void;
  tickGameTime: () => void;

  // Production Control
  productionSpeed: number;       // 0-2 multiplier

  // Entity State
  workers: WorkerData[];
  machines: MachineData[];

  // Selection State
  selectedWorker: WorkerData | null;
  selectedMachine: MachineData | null;

  // Alert System
  alerts: AlertData[];

  // AI Integration
  aiDecisions: AIDecision[];

  // Production Metrics
  metrics: {
    throughput: number;
    efficiency: number;
    uptime: number;
    quality: number;
  };

  // Safety System
  safetyMetrics: {
    nearMisses: number;
    safetyStops: number;
    workerEvasions: number;
    lastIncidentTime: number | null;
  };

  safetyConfig: {
    workerDetectionRadius: number;
    forkliftSafetyRadius: number;
    pathCheckDistance: number;
    speedZoneSlowdown: number;
  };

  // UI State
  showZones: boolean;
  showAIPanel: boolean;
}
```

### State Flow

```
User Interaction
      │
      ▼
┌─────────────┐    ┌─────────────┐
│  UI Overlay │◄──►│ Zustand     │
│  (controls) │    │ Store       │
└─────────────┘    └──────┬──────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      ┌─────────┐  ┌─────────┐  ┌─────────┐
      │ Workers │  │Machines │  │ Safety  │
      │ System  │  │ Meshes  │  │ Display │
      └─────────┘  └─────────┘  └─────────┘
```

---

## Factory Layout

### Zone Organization

The factory floor is divided into 4 production zones along the Z-axis:

| Zone | Z Position | Equipment | Count |
|------|------------|-----------|-------|
| Zone 1 | z = -22 | Silos (Alpha-Epsilon) | 5 |
| Zone 2 | z = -6 | Roller Mills (RM-101 to RM-106) | 6 |
| Zone 3 | z = 6, y = 9 | Plansifters (A, B, C) - Elevated | 3 |
| Zone 4 | z = 20 | Packers (Lines 1-3) | 3 |

### Coordinate System

```
        +Y (Up)
         │
         │    +Z (North/Front)
         │   /
         │  /
         │ /
         │/
─────────┼───────── +X (East)
        /│
       / │
      /  │
     /   │
    /    │
```

### Floor Dimensions

- **Floor Size:** 80 units
- **Wall Height:** 35 units
- **Ceiling Height:** 32 units
- **Factory Bounds:** X: -55 to +55, Z: -40 to +40

---

## Design Patterns

### 1. Component Composition

The 3D scene uses hierarchical composition:

```tsx
<MillScene>
  <FactoryEnvironment />        // Static environment
  <Machines machines={...} />    // Equipment meshes
  <WorkerSystem />               // Animated workers
  <ForkliftSystem />             // Vehicles + safety
  <ConveyorSystem />             // Product flow
  <DustParticles />              // Atmosphere
  <HolographicDisplays />        // 3D UI elements
</MillScene>
```

### 2. Singleton Services

Utilities are implemented as singleton instances:

```typescript
// audioManager.ts
class AudioManager { ... }
export const audioManager = new AudioManager();

// positionRegistry.ts
class PositionRegistry { ... }
export const positionRegistry = new PositionRegistry();
```

### 3. Frame-Based Animation

Using R3F's `useFrame` hook for per-frame updates:

```typescript
useFrame((state, delta) => {
  // Animation logic
  mesh.current.position.x += speed * delta;

  // Collision detection
  positionRegistry.register(id, x, z, 'worker');
});
```

### 4. Memoized Data

Heavy data structures are memoized with `useMemo`:

```typescript
const machines = useMemo(() => {
  const _machines: MachineData[] = [];
  // Generate machine configurations
  return _machines;
}, []); // Empty deps = generated once
```

### 5. Event-Driven Audio

Audio is triggered by state changes and user interactions:

```typescript
useEffect(() => {
  if (status === 'running') {
    audioManager.playMillSound(machineId, rpm);
  }
  return () => audioManager.stopMachineSound(machineId);
}, [status]);
```

---

## Performance Considerations

### Optimization Techniques

1. **Instanced Meshes** - Multiple similar objects share geometry
2. **Level of Detail** - Simplified geometry for distant objects
3. **Frustum Culling** - Automatic via Three.js
4. **Texture Atlasing** - Reduced draw calls
5. **DPR Limiting** - Device pixel ratio capped at 2
6. **Suspense Loading** - Progressive asset loading

### Target Performance

- **60 FPS** on modern desktop browsers
- **30 FPS** minimum on mobile devices
- **< 3 second** initial load time
