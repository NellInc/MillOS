# Performance Debug Session - 2025-12-29

## Executive Summary

**Problem:** Massive FPS drops (6-24 FPS, 600ms+ stutters) when camera was outside factory. Inside factory was stable (46-70 FPS).

**Root Cause:** Browser plugin compatibility issue. Performance was fine in incognito mode.

**Outcome:** Created significant architectural improvements during debugging that should be kept regardless of the browser issue.

---

## The Investigation

### Initial Symptoms
- FPS dropped to 6-24 when camera outside factory
- Stuttering every 0.5-1 seconds
- Inside factory: stable 46-70 FPS

### Components Tested & Ruled Out

| Component | Status | Result |
|-----------|--------|--------|
| TerrainGround | Disabled | No improvement |
| SkySystem | Disabled | No improvement |
| TruckBay | Disabled | No improvement |
| FarmArea only | Tested | 42-117 FPS OK |
| VillageArea only | Tested | 24-50 FPS, lurching |
| FactoryExterior only | Tested | 6-90 FPS, bad |

### Root Causes Identified (Before Browser Discovery)

1. **VillageArea geometry overload** - ~400-500 individual meshes/draw calls
2. **tickMetrics with Math.random()** - Created new array every 0.5s, forced re-renders
3. **gameTime subscribers** - Many components subscribed to raw gameTime, re-rendered every tick
4. **Scattered intervals** - Multiple setInterval timers causing CPU spikes

---

## Architectural Improvements Made

### 1. CentralTickSystem (`src/systems/CentralTickSystem.ts`)

**Purpose:** Single source of truth for all game ticks with lazy execution.

**Features:**
- One tick loop instead of scattered `setInterval`s
- Priority-based callbacks (CRITICAL runs immediately, others lazy-queued)
- Lazy execution spreads non-critical work across frames (1-2 per frame)
- Configurable tick interval (default 3.0 seconds)

```typescript
// Register a callback
centralTick.register('my-system', (ctx) => {
  // ctx.deltaSeconds, ctx.gameTime, ctx.gameSpeed, etc.
}, TICK_PRIORITY.NORMAL);

// Priority levels
TICK_PRIORITY.CRITICAL = 0   // Runs immediately
TICK_PRIORITY.HIGH = 10      // Runs immediately
TICK_PRIORITY.NORMAL = 50    // Lazy queued
TICK_PRIORITY.LOW = 100      // Lazy queued
TICK_PRIORITY.BACKGROUND = 200 // Lazy queued
```

### 2. UnifiedGameTick (`src/systems/UnifiedGameTick.ts`)

**Purpose:** Zero-allocation, truth-only game state updates.

**Principles:**
- Store holds TRUTH (wear, temp, efficiency, status)
- Display adds COSMETICS (RPM jitter, load variance)
- Reusable module-level objects (no allocations per tick)
- Only update store when truth actually changes

**Before:** Every tick created new arrays via `.map()`, new objects via spread.
**After:** Reuses `_breakdowns`, `_metricsUpdate`, `_metricTrackingUpdate` arrays/objects.

### 3. DisplaySmoothing (`src/systems/DisplaySmoothing.ts`)

**Purpose:** Visual variance and interpolation at display time, not in store.

**Utilities:**
```typescript
// Add cosmetic variance to display values
getDisplayRpm(machineId, baseRpm, elapsedTime)  // ±2% variance
getDisplayLoad(machineId, baseLoad, elapsedTime) // ±5% variance
getDisplayTemp(machineId, baseTemp, elapsedTime) // ±0.5°C variance

// Smooth interpolation toward truth
getInterpolatedValue(key, targetValue, lerpFactor)
getSmoothedDisplayValue(id, field, targetValue, elapsedTime)

// React hook for machines
const display = useMachineDisplayValues(machine.id, machine.metrics, isRunning);

// Smooth game time for continuous sky/lighting
getSmoothedGameTime(storeGameTime, deltaSeconds, gameSpeed)
```

### 4. VillageAreaOptimized (`src/components/village/`)

**Purpose:** GPU-efficient village rendering with instanced geometry.

**Draw Call Reduction:**
| Element | Before | After |
|---------|--------|-------|
| 8 lamps | ~24 draw calls | 3 draw calls |
| 4 benches | ~16 draw calls | 3 draw calls |
| 7 trees | ~14 draw calls | 2 draw calls |
| 4 market stalls | ~20 draw calls | ~8 draw calls |
| **Total Village** | ~400-500 | ~100-150 |

**Files:**
- `InstancedVillageComponents.tsx` - Instanced lamps, benches, trees, stalls
- `VillageAreaOptimized.tsx` - Simplified buildings using shared materials

### 5. Deterministic Variance

**Purpose:** Replace `Math.random()` with deterministic pseudo-random.

```typescript
// Returns consistent value based on seed + time
deterministicVariance(seed, time, amplitude)

// Generate seed from string ID
idToSeed(machineId)
```

**Why:** `Math.random()` guaranteed different values every tick, forcing new arrays/objects even when nothing meaningful changed.

---

## Files Created

```
src/systems/
├── CentralTickSystem.ts      # Single tick loop + lazy execution
├── CentralTickProvider.tsx   # React/Three.js integration
├── UnifiedGameTick.ts        # Zero-allocation truth updates
├── DisplaySmoothing.ts       # Display-time variance utilities
└── index.ts                  # Exports

src/components/village/
├── InstancedVillageComponents.tsx  # Instanced geometry
├── VillageAreaOptimized.tsx        # Simplified buildings
└── index.ts                        # Exports
```

---

## Files Modified (Need Restoration)

### MillScene.tsx

**Disabled for testing:**
```tsx
// Line ~857-862 - These are commented out:
{showExterior && <FactoryExterior />}
{showExterior && <FarmArea />}

// Line ~837-845 - TruckBay commented out
<TruckBay productionSpeed={productionSpeed} />

// Line ~848-855 - TerrainGround commented out
<TerrainGround ... />

// Line ~861 - Using VillageAreaOptimized instead of VillageArea
{showExterior && <VillageAreaOptimized />}  // KEEP THIS
```

**To restore:** Uncomment FactoryExterior, FarmArea, TruckBay, TerrainGround.

### Environment.tsx

**Line ~2268:** `tickMetrics(delta)` commented out
**Line ~868:** OrphanedStoresTicker interval changed 2000ms → 4000ms
**Line ~2239:** gameTime interval changed 0.5s → 2.0s (in CoreGameTimeAnimationManager)

**To restore:** Uncomment tickMetrics, optionally restore intervals.

### FPSMonitor.tsx

**Line ~178:** SAMPLE_INTERVAL_DEFAULT changed 0.5s → 2.0s
**Line ~210-213:** Console.log added (commented out)

**To restore:** Optionally restore 0.5s interval.

### SpatialAudioTracker.tsx

**Changed:** Removed gameTime subscription, uses `getState()` in useFrame instead.

**Keep this change** - it's an improvement.

### FactoryWalls.tsx (WallClock)

**Changed:** Removed gameTime subscription, uses useFrame + refs for clock hands.

**Keep this change** - it's an improvement.

### VillageArea.tsx

**Disabled:** All useFrame hooks commented out for testing.

**To restore:** Uncomment useFrame hooks (or just use VillageAreaOptimized instead).

---

## Restoration Checklist

### Must Restore
- [ ] MillScene.tsx: Uncomment `<FactoryExterior />`
- [ ] MillScene.tsx: Uncomment `<FarmArea />`
- [ ] MillScene.tsx: Uncomment `<TruckBay ... />`
- [ ] MillScene.tsx: Uncomment `<TerrainGround ... />`
- [ ] Environment.tsx: Uncomment `tickMetrics(delta)`

### Keep As-Is (Improvements)
- [x] Use `<VillageAreaOptimized />` instead of `<VillageArea />`
- [x] CentralTickSystem + CentralTickProvider
- [x] UnifiedGameTick
- [x] DisplaySmoothing utilities
- [x] SpatialAudioTracker using getState()
- [x] WallClock using useFrame + refs

### Optional (Performance Tuning)
- [ ] CentralTickSystem.ts: tickInterval 3.0s → 2.0s (your preference)
- [ ] Environment.tsx: OrphanedStores 4000ms → 2000ms (your preference)
- [ ] FPSMonitor.tsx: SAMPLE_INTERVAL 2.0s → 0.5s (your preference)

---

## Key Learnings

### GPT 5.2 Analysis (Valuable Insights)

1. **Two independent killers:**
   - Exterior = too many scene nodes/draw calls/materials + React reconciliation
   - Periodic store writes forcing wide re-renders

2. **The "lazy queue" caution:**
   - Only lazy-queue non-critical/background work
   - Simulation-critical state must be atomic
   - "One atomic commit per simulation step"

3. **Store truth, display cosmetics:**
   - Store holds authoritative game state
   - Display adds visual variance/smoothing
   - Interpolate display values locally for continuity

4. **Allocation hotspots:**
   - `.map()` over arrays creates new arrays
   - Object spread `{...obj}` creates new objects
   - `Math.random()` guarantees diffs → forces updates

### Architecture Principle

```
┌─────────────────────────────────────────────────────┐
│                     STORE                           │
│   Holds TRUTH: wear, temp, efficiency, status       │
│   Updates only when truth changes (~rarely)         │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                    DISPLAY                          │
│   Adds COSMETICS: RPM jitter, load variance         │
│   Updates every frame (no store writes)             │
└─────────────────────────────────────────────────────┘
```

---

## Final Resolution

The actual issue was a **browser plugin compatibility problem**. Performance was fine in incognito mode.

However, the architectural improvements made during this session are valuable and should be kept:

1. **Centralized tick system** - Cleaner architecture, lazy execution
2. **Zero-allocation updates** - Better for all browsers/devices
3. **Instanced village** - 60-70% fewer draw calls
4. **Display-time variance** - Proper separation of concerns
5. **Removed gameTime subscriptions** - Fewer unnecessary re-renders

These improvements will benefit performance across all environments, not just the one with the browser issue.

---

## Session Statistics

- **Duration:** ~2 hours
- **Files created:** 8
- **Files modified:** ~12
- **FPS improvement (during debug):** 6-24 → 55-70
- **Draw calls reduced:** ~400 → ~150 (village)
- **Root cause:** Browser plugin (discovered at end)
