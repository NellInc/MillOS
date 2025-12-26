# State Management

MillOS uses Zustand for global state management, detailing the store structure, actions, and state flow patterns.

## Table of Contents

1. [Store Overview](#store-overview)
2. [State Slices](#state-slices)
3. [Actions](#actions)
4. [Selectors and Hooks](#selectors-and-hooks)
5. [State Flow Patterns](#state-flow-patterns)

---

## Store Overview

The application state is managed by a single Zustand store defined in `src/store.ts`.

### Store Creation

```typescript
import { create } from 'zustand';

export const useMillStore = create<MillStore>((set) => ({
  // Initial state and actions
}));
```

### Usage Pattern

```typescript
// Reading state
const workers = useMillStore(state => state.workers);

// Reading multiple values
const { workers, machines } = useMillStore(state => ({
  workers: state.workers,
  machines: state.machines
}));

// Calling actions
const updateStatus = useMillStore(state => state.updateMachineStatus);
updateStatus('mill-1.5', 'warning');
```

---

## State Slices

### Game Time

Controls the simulated 24-hour day cycle.

```typescript
interface TimeSlice {
  gameTime: number;              // 0-24 representing hour of day
  setGameTime: (time: number) => void;
  tickGameTime: () => void;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `gameTime` | number | 8 | Current hour (24-hour format) |

#### Time Progression

- Full day cycle completes in ~10 real minutes (600 seconds)
- Each tick (called every frame) advances by 0.004 hours
- Time wraps around at 24 back to 0

```typescript
tickGameTime: () => set((state) => ({
  gameTime: (state.gameTime + 0.004) % 24
}))
```

---

### Production

Production system state.

```typescript
interface ProductionSlice {
  productionSpeed: number;
  setProductionSpeed: (speed: number) => void;
}
```

| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `productionSpeed` | number | 0.8 | 0-2 | Speed multiplier for animations |

---

### Workers

Worker entity management.

```typescript
interface WorkerSlice {
  workers: WorkerData[];
  selectedWorker: WorkerData | null;
  setSelectedWorker: (worker: WorkerData | null) => void;
  updateWorkerTask: (workerId: string, task: string, targetMachine?: string) => void;
}
```

#### WorkerData Interface

```typescript
interface WorkerData {
  id: string;
  name: string;
  role: 'Operator' | 'Engineer' | 'Supervisor' | 'Safety Officer' | 'Quality Control' | 'Maintenance';
  icon: WorkerIconType;
  position: [number, number, number];
  speed: number;
  direction: 1 | -1;
  currentTask: string;
  targetMachine?: string;
  status: 'working' | 'idle' | 'break' | 'responding';
  shiftStart: string;
  experience: number;
  certifications: string[];
  color: string;
}
```

---

### Machines

Machine entity management.

```typescript
interface MachineSlice {
  machines: MachineData[];
  selectedMachine: MachineData | null;
  setSelectedMachine: (machine: MachineData | null) => void;
  updateMachineStatus: (machineId: string, status: MachineStatus) => void;
}
```

#### MachineData Interface

```typescript
interface MachineData {
  id: string;
  name: string;
  type: MachineType;
  position: [number, number, number];
  size: [number, number, number];
  rotation: number;
  status: 'running' | 'idle' | 'warning' | 'critical';
  metrics: {
    rpm: number;
    temperature: number;
    vibration: number;
    load: number;
  };
  lastMaintenance: string;
  nextMaintenance: string;
}
```

#### Machine Types

```typescript
enum MachineType {
  SILO = 'SILO',
  ROLLER_MILL = 'ROLLER_MILL',
  PLANSIFTER = 'PLANSIFTER',
  PACKER = 'PACKER',
  CONTROL_ROOM = 'CONTROL_ROOM'
}
```

---

### Alerts

Factory alert notifications.

```typescript
interface AlertSlice {
  alerts: AlertData[];
  addAlert: (alert: AlertData) => void;
  dismissAlert: (alertId: string) => void;
}
```

#### Alert Management

- Maximum 10 alerts stored
- New alerts prepended to array
- Oldest alerts automatically removed

```typescript
addAlert: (alert) => set((state) => ({
  alerts: [alert, ...state.alerts].slice(0, 10)
}))
```

#### AlertData Interface

```typescript
interface AlertData {
  id: string;
  type: 'warning' | 'critical' | 'info' | 'success';
  title: string;
  message: string;
  machineId?: string;
  timestamp: Date;
  acknowledged: boolean;
}
```

---

### AI Decisions

AI Command Center decision log.

```typescript
interface AISlice {
  aiDecisions: AIDecision[];
  addAIDecision: (decision: AIDecision) => void;
}
```

- Maximum 20 decisions stored
- New decisions prepended to array

#### AIDecision Interface

```typescript
interface AIDecision {
  id: string;
  timestamp: Date;
  type: 'assignment' | 'optimization' | 'prediction' | 'maintenance' | 'safety';
  action: string;
  reasoning: string;
  confidence: number;
  impact: string;
  workerId?: string;
  machineId?: string;
}
```

---

### Production Metrics

Real-time production KPIs.

```typescript
interface MetricsSlice {
  metrics: {
    throughput: number;
    efficiency: number;
    uptime: number;
    quality: number;
  };
  updateMetrics: (metrics: Partial<MetricsSlice['metrics']>) => void;
}
```

| Metric | Default | Unit | Description |
|--------|---------|------|-------------|
| `throughput` | 1240 | t/hr | Tons processed per hour |
| `efficiency` | 98.2 | % | Production efficiency |
| `uptime` | 99.7 | % | Machine availability |
| `quality` | 99.9 | % | Product quality grade |

---

### Safety System

Safety tracking and configuration.

```typescript
interface SafetySlice {
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
  recordSafetyStop: () => void;
  recordWorkerEvasion: () => void;
  setSafetyConfig: (config: Partial<SafetyConfig>) => void;
}
```

#### Safety Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `nearMisses` | number | Total near-miss incidents |
| `safetyStops` | number | Forklift safety stops |
| `workerEvasions` | number | Worker evasion maneuvers |
| `lastIncidentTime` | number \| null | Timestamp of last incident |

#### Safety Configuration

| Config | Default | Description |
|--------|---------|-------------|
| `workerDetectionRadius` | 2.5 | Distance to detect workers |
| `forkliftSafetyRadius` | 4 | Distance between forklifts |
| `pathCheckDistance` | 5 | Look-ahead distance |
| `speedZoneSlowdown` | 0.4 | Speed reduction factor |

---

### Shift Management

Controls factory shift cycling and worker shift changes.

```typescript
interface ShiftSlice {
  currentShift: 'morning' | 'afternoon' | 'night';
  shiftStartTime: number;
  shiftChangeActive: boolean;
  shiftChangePhase: 'idle' | 'leaving' | 'entering';
  setShift: (shift: 'morning' | 'afternoon' | 'night') => void;
  triggerShiftChange: () => void;
  completeShiftChange: () => void;
}
```

#### Shift State

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `currentShift` | string | 'morning' | Current shift (morning/afternoon/night) |
| `shiftStartTime` | number | Date.now() | Timestamp when current shift started |
| `shiftChangeActive` | boolean | false | Whether a shift change is in progress |
| `shiftChangePhase` | string | 'idle' | Current phase of shift change |

#### Shift Actions

```typescript
// Set shift directly
setShift: (shift) => set({ currentShift: shift, shiftStartTime: Date.now() })

// Trigger a shift change (workers leave and re-enter)
triggerShiftChange: () => set({
  shiftChangeActive: true,
  shiftChangePhase: 'leaving'
})

// Complete shift change (cycles to next shift)
completeShiftChange: () => set((state) => {
  const shifts = ['morning', 'afternoon', 'night'];
  const currentIndex = shifts.indexOf(state.currentShift);
  const nextShift = shifts[(currentIndex + 1) % shifts.length];
  return {
    shiftChangeActive: false,
    shiftChangePhase: 'idle',
    currentShift: nextShift,
    shiftStartTime: Date.now()
  };
})
```

#### Shift Change Flow

```
UI triggers shift change
         │
         ▼
┌────────────────────────┐
│ triggerShiftChange()   │
│ phase = 'leaving'      │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ Workers walk to exits  │
│ and "leave" factory    │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ Workers re-enter from  │
│ entry points           │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ completeShiftChange()  │
│ Cycles to next shift   │
│ Workers have full      │
│ energy                 │
└────────────────────────┘
```

---

### UI State

UI visibility toggles.

```typescript
interface UISlice {
  showZones: boolean;
  setShowZones: (show: boolean) => void;
  showAIPanel: boolean;
  setShowAIPanel: (show: boolean) => void;
}
```

---

## Actions

### Setter Actions

Simple state updates:

```typescript
setGameTime: (time) => set({ gameTime: time % 24 })
setProductionSpeed: (speed) => set({ productionSpeed: speed })
setSelectedWorker: (worker) => set({ selectedWorker: worker })
setSelectedMachine: (machine) => set({ selectedMachine: machine })
setShowZones: (show) => set({ showZones: show })
setShowAIPanel: (show) => set({ showAIPanel: show })
```

### Entity Update Actions

Actions that update specific entities:

```typescript
// Update worker task
updateWorkerTask: (workerId, task, targetMachine) => set((state) => ({
  workers: state.workers.map(w =>
    w.id === workerId ? { ...w, currentTask: task, targetMachine } : w
  )
}))

// Update machine status
updateMachineStatus: (machineId, status) => set((state) => ({
  machines: state.machines.map(m =>
    m.id === machineId ? { ...m, status } : m
  )
}))
```

### Safety Recording Actions

Actions for safety event tracking:

```typescript
recordSafetyStop: () => set((state) => ({
  safetyMetrics: {
    ...state.safetyMetrics,
    safetyStops: state.safetyMetrics.safetyStops + 1,
    nearMisses: state.safetyMetrics.nearMisses + 1,
    lastIncidentTime: Date.now()
  }
}))

recordWorkerEvasion: () => set((state) => ({
  safetyMetrics: {
    ...state.safetyMetrics,
    workerEvasions: state.safetyMetrics.workerEvasions + 1
  }
}))
```

---

## Selectors and Hooks

### Basic Selectors

```typescript
// Single value
const gameTime = useMillStore(state => state.gameTime);

// Multiple values (object pattern)
const { workers, machines } = useMillStore(state => ({
  workers: state.workers,
  machines: state.machines
}));
```

### Action Selectors

```typescript
// Single action
const recordSafetyStop = useMillStore(state => state.recordSafetyStop);

// Multiple actions
const { addAlert, dismissAlert } = useMillStore(state => ({
  addAlert: state.addAlert,
  dismissAlert: state.dismissAlert
}));
```

### Derived State

For computed values, use selectors or local computation:

```typescript
// In component
const safetyMetrics = useMillStore(state => state.safetyMetrics);
const timeSinceIncident = safetyMetrics.lastIncidentTime
  ? Date.now() - safetyMetrics.lastIncidentTime
  : null;
```

---

## State Flow Patterns

### User Interaction Flow

```
User clicks machine
        │
        ▼
┌───────────────────┐
│ onClick handler   │
│ calls onSelect    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ setSelectedMachine│
│ in App.tsx        │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ MachineDetailPanel│
│ renders           │
└───────────────────┘
```

### Safety Event Flow

```
Forklift approaches worker
          │
          ▼
┌─────────────────────┐
│ positionRegistry    │
│ detects proximity   │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌──────────┐ ┌──────────────┐
│ Forklift │ │ Worker       │
│ stops    │ │ evades       │
└────┬─────┘ └──────┬───────┘
     │              │
     ▼              ▼
┌──────────────┐ ┌──────────────┐
│recordSafety  │ │recordWorker  │
│Stop()        │ │Evasion()     │
└──────┬───────┘ └──────┬───────┘
       │                │
       └───────┬────────┘
               ▼
┌──────────────────────────┐
│ AlertSystem shows        │
│ "Near-Miss Avoided"      │
└──────────────────────────┘
```

### Time Progression Flow

```
Every animation frame (useFrame)
              │
              ▼
┌─────────────────────────┐
│ GameTimeTicker calls    │
│ tickGameTime()          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ gameTime advances       │
│ by 0.004 hours          │
└────────────┬────────────┘
             │
       ┌─────┴─────┐
       ▼           ▼
┌────────────┐ ┌───────────────┐
│ UIOverlay  │ │ DaylightWindow│
│ clock      │ │ colors update │
│ updates    │ │               │
└────────────┘ └───────────────┘
```

---

## Best Practices

### 1. Minimal Subscriptions

Subscribe only to needed state:

```typescript
// Good - specific subscription
const safetyStops = useMillStore(state => state.safetyMetrics.safetyStops);

// Avoid - subscribing to entire store
const store = useMillStore();
```

### 2. Shallow Comparisons

For object selections, Zustand provides `shallow`:

```typescript
import { shallow } from 'zustand/shallow';

const { workers, machines } = useMillStore(
  state => ({ workers: state.workers, machines: state.machines }),
  shallow
);
```

### 3. Action Stability

Actions are stable references (don't change between renders):

```typescript
// Actions can be safely used in dependency arrays
const updateMetrics = useMillStore(state => state.updateMetrics);

useEffect(() => {
  const interval = setInterval(() => updateMetrics({ throughput: 1300 }), 1000);
  return () => clearInterval(interval);
}, [updateMetrics]); // Safe dependency
```
