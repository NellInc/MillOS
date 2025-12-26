# GPU Resource Management System

A complete solution for preventing WebGL context loss, managing GPU memory, and ensuring smooth 3D performance in React Three Fiber applications.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Core Components](#core-components)
  - [GPUResourceManager](#gpuresourcemanager)
  - [Texture Compression](#texture-compression)
  - [Geometry Merging](#geometry-merging)
  - [LOD Integration](#lod-integration)
  - [Resource Persistence](#resource-persistence)
  - [Texture Worker](#texture-worker)
- [React Hooks](#react-hooks)
- [Memory Budget System](#memory-budget-system)
- [Context Loss Recovery](#context-loss-recovery)
- [Debug Tools](#debug-tools)
- [Migration Guide](#migration-guide)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Problem

WebGL applications can suffer from:
- **Context loss**: GPU runs out of resources, crashes, or resets
- **Memory leaks**: Geometries/textures not properly disposed
- **Performance degradation**: Too many draw calls, unoptimized resources
- **Poor recovery**: App crashes or requires full reload after issues

### Solution

This system delivers:
- Centralized GPU resource lifecycle management
- Memory budget monitoring with automatic pruning
- Context loss detection and graceful recovery
- Texture compression (75% size reduction)
- Geometry merging (reduce draw calls)
- Web Worker offloading for texture processing
- localStorage persistence for fast recovery

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         App.tsx (Entry Point)                       │
│                                                                     │
│  Canvas onCreated:                                                  │
│    → initKTX2Loader(gl)         // Enable texture compression       │
│    → gpuResourceManager.setBudget()  // Configure memory limits     │
│    → initializeGPUTracking()    // Register shared resources        │
│                                                                     │
│  Canvas onUnmount:                                                  │
│    → cleanupGPUTracking()       // Release cached resources         │
│    → gpuResourceManager.disposeAll()  // Final cleanup              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│   KTX2 Loader   │  │ GPUResourceMgr   │  │  GPU Tracked       │
│                 │  │                  │  │  Resources         │
│ • Basis decoder │  │ • Resource map   │  │                    │
│ • Auto-fallback │  │ • Memory budget  │  │ • Shared materials │
│ • Compression   │  │ • Context events │  │ • Cached geometries│
└─────────────────┘  │ • Auto-prune     │  │ • Recreators       │
                     └────────┬─────────┘  └────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Geometry    │    │ LOD Integration │    │    Resource      │
│  Merger      │    │                 │    │   Persistence    │
│              │    │ • Distance LOD  │    │                  │
│ • Grid merge │    │ • Quality LOD   │    │ • localStorage   │
│ • Line merge │    │ • Memory-aware  │    │ • Fast recovery  │
│ • Batch ops  │    │ • Culling       │    │ • Settings sync  │
└──────────────┘    └─────────────────┘    └──────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │    Texture Worker     │
                  │    (Web Worker)       │
                  │                       │
                  │ • Image decoding      │
                  │ • Resize/scale        │
                  │ • Atlas packing       │
                  │ • Mipmap preparation  │
                  └───────────────────────┘
```

### File Structure

```
src/
├── utils/
│   ├── GPUResourceManager.ts    # Core resource tracking
│   ├── textureCompression.ts    # KTX2/Basis Universal
│   ├── geometryMerger.ts        # Static geometry merging
│   ├── lodIntegration.ts        # LOD with GPU tracking
│   ├── resourcePersistence.ts   # localStorage state
│   ├── gpuManagement.ts         # Unified exports
│   └── gpuTrackedResources.ts   # Integration wrapper
├── hooks/
│   ├── useGPUResource.ts        # React hooks
│   └── useTextureWorker.ts      # Worker interface
├── workers/
│   └── textureWorker.ts         # Offloaded processing
├── components/
│   └── GPUMemoryMonitor.tsx     # Debug overlay
└── scripts/
    ├── setup-basis-transcoder.sh
    └── convert-textures.mjs
```

---

## Quick Start

### 1. Initial Setup (One-Time)

```bash
# Download Basis Universal transcoder files
npm run setup:basis

# Convert existing textures to KTX2 (optional but recommended)
npm run convert-textures:dry   # Preview what will be converted
npm run convert-textures       # Actually convert
```

### 2. App Integration (Already Done in App.tsx)

```typescript
// In Canvas onCreated callback
onCreated={({ gl }) => {
  // Initialize compression
  initKTX2Loader(gl);

  // Configure memory budget
  const settings = getGPUSettings();
  gpuResourceManager.setBudget({ total: settings.memoryBudget });

  // Register shared resources
  initializeGPUTracking();
}}
```

### 3. Use in Components

```typescript
import { useGPUGeometry, useGPUMaterial } from '@/src/hooks/useGPUResource';

function MyMesh() {
  // Auto-disposed on unmount, auto-recreated on context restore
  const geometry = useGPUGeometry(
    () => new THREE.BoxGeometry(1, 1, 1),
    [] // dependencies
  );

  return <mesh geometry={geometry} />;
}
```

---

## Core Components

### GPUResourceManager

The central singleton that tracks all GPU resources.

```typescript
import { gpuResourceManager } from '@/src/utils/GPUResourceManager';

// Register a resource
const id = gpuResourceManager.register(
  'geometry',           // type: 'geometry' | 'texture' | 'material' | 'renderTarget'
  myGeometry,           // the Three.js object
  'my-component',       // owner identifier
  {
    priority: 'normal', // 'critical' | 'normal' | 'low'
    recreator: () => new THREE.BoxGeometry(1, 1, 1), // for context recovery
  }
);

// Mark as recently used (prevents auto-disposal)
gpuResourceManager.touch(id);

// Dispose a single resource
gpuResourceManager.dispose(id);

// Dispose all resources from a component
gpuResourceManager.disposeByOwner('my-component');

// Get memory usage stats
const usage = gpuResourceManager.getMemoryUsage();
console.log(`${usage.total.budgetPercent}% of budget used`);

// Set custom budget
gpuResourceManager.setBudget({
  total: 256 * 1024 * 1024, // 256MB
  textures: 150 * 1024 * 1024,
});

// Subscribe to events
gpuResourceManager.onContextLost(() => {
  console.log('Context lost!');
});

gpuResourceManager.onMemoryWarning((usage) => {
  console.log(`Warning: ${usage.total.budgetPercent}% memory used`);
});
```

### Texture Compression

Load KTX2/Basis Universal compressed textures (75% smaller than JPG/PNG).

```typescript
import {
  initKTX2Loader,
  loadCompressedTexture,
  loadCompressedTextureBatch,
  isCompressionAvailable,
} from '@/src/utils/textureCompression';

// Initialize (done in App.tsx)
initKTX2Loader(renderer);

// Load single texture (auto-fallback to JPG if KTX2 fails)
const texture = await loadCompressedTexture(
  '/textures/wood.ktx2',
  '/textures/wood.jpg',  // fallback (optional)
  'my-component'         // owner for tracking
);

// Batch load multiple textures
const textures = await loadCompressedTextureBatch([
  { ktx2: '/textures/metal.ktx2' },
  { ktx2: '/textures/concrete.ktx2', fallback: '/textures/concrete.png' },
]);

// Check if compression is available
if (isCompressionAvailable()) {
  // Use .ktx2 files
} else {
  // Fall back to standard formats
}
```

### Geometry Merging

Merge multiple static geometries into single draw calls.

```typescript
import {
  mergeGeometries,
  mergeGrid,
  mergeLine,
  mergeCircular,
  mergeFromMeshes,
} from '@/src/utils/geometryMerger';

// Merge arbitrary geometries with transforms
const merged = mergeGeometries([
  { geometry: boxGeo, matrix: new THREE.Matrix4().makeTranslation(0, 0, 0) },
  { geometry: boxGeo, matrix: new THREE.Matrix4().makeTranslation(5, 0, 0) },
  { geometry: boxGeo, matrix: new THREE.Matrix4().makeTranslation(10, 0, 0) },
]);
// Result: 1 draw call instead of 3

// Merge a grid of identical geometries (floors, tiles)
const floorTiles = mergeGrid(
  tileGeometry,
  { x: 10, z: 10 },    // grid size
  { x: 2, z: 2 },      // spacing
  { owner: 'floor' }
);

// Merge geometries in a line (rails, pipes)
const rails = mergeLine(
  railGeometry,
  20,                  // count
  1.5,                 // spacing
  'z',                 // direction
  { owner: 'rails' }
);

// Merge in a circle (wheels, fans)
const spokes = mergeCircular(
  spokeGeometry,
  12,                  // count
  2,                   // radius
  { rotateToCenter: true }
);

// Merge from existing mesh instances
const existingMeshes = [mesh1, mesh2, mesh3];
const merged = mergeFromMeshes(existingMeshes);
```

### LOD Integration

Distance-based Level of Detail with GPU tracking.

```typescript
import {
  lodManager,
  createCylinderLODs,
  createMaterialLODs,
  getLODDistances,
} from '@/src/utils/lodIntegration';

// Create LOD geometry variants
const cylinderLODs = createCylinderLODs(1, 1, 2);
// Returns Map: high -> 32 segments, medium -> 16, low -> 8

// Create LOD material variants
const materialLODs = createMaterialLODs('#3b82f6');
// Returns Map: high -> MeshStandardMaterial, low -> MeshBasicMaterial

// Register an object for LOD management
lodManager.register(
  'my-machine',
  new THREE.Vector3(10, 0, 20),
  cylinderLODs,
  materialLODs,
  (level) => console.log(`LOD changed to ${level}`)
);

// Update camera position (call in useFrame)
lodManager.updateCamera(camera.position);

// Get current LOD level
const level = lodManager.getLOD('my-machine'); // 'high' | 'medium' | 'low' | 'culled'

// Get LOD distances for current quality
const distances = getLODDistances();
// { near: 50, mid: 100, far: 150 } (varies by quality setting)
```

### Resource Persistence

Store resource metadata in localStorage for fast recovery.

```typescript
import {
  persistTexture,
  persistGeometry,
  getRecoverableResources,
  getGPUSettings,
  saveGPUSettings,
} from '@/src/utils/resourcePersistence';

// Persist texture metadata
persistTexture('wood-tex', '/textures/wood.ktx2', 'scene', {
  priority: 'normal',
  isCompressed: true,
});

// Persist geometry creation params
persistGeometry('floor-geo', 'PlaneGeometry', 'scene', {
  width: 100,
  height: 100,
  segments: 10,
});

// Get resources that need recovery after context loss
const toRecover = getRecoverableResources();
for (const resource of toRecover) {
  if (resource.type === 'texture') {
    await loadCompressedTexture(resource.params.path);
  }
}

// Save/load GPU settings
saveGPUSettings({
  memoryBudget: 256 * 1024 * 1024,
  compressionEnabled: true,
});

const settings = getGPUSettings();
```

### Texture Worker

Offload texture processing to a Web Worker.

```typescript
import { useTextureWorker } from '@/src/hooks/useTextureWorker';

function MyComponent() {
  const { decodeTexture, calculateAtlasPacking, isProcessing } = useTextureWorker();

  // Decode and resize texture off main thread
  const loadLargeTexture = async () => {
    const result = await decodeTexture('/textures/large.jpg', 1024);
    // result: { imageData, width, height, originalWidth, originalHeight }

    // Use imageData to create Three.js texture on main thread
    const texture = new THREE.DataTexture(
      new Uint8Array(result.imageData.data),
      result.width,
      result.height
    );
  };

  // Calculate atlas packing layout
  const packTextures = async () => {
    const layout = await calculateAtlasPacking([
      { id: 'tex1', width: 256, height: 256 },
      { id: 'tex2', width: 128, height: 128 },
      { id: 'tex3', width: 512, height: 256 },
    ], 2048, 2); // maxSize, padding

    // layout: { width, height, placements: [{ id, x, y, width, height }] }
  };

  return (
    <button onClick={loadLargeTexture} disabled={isProcessing}>
      {isProcessing ? 'Loading...' : 'Load Texture'}
    </button>
  );
}
```

---

## React Hooks

### useGPUGeometry

```typescript
import { useGPUGeometry } from '@/src/hooks/useGPUResource';

function Machine({ size }) {
  // Geometry is auto-disposed on unmount
  // Geometry is recreated if size changes
  // Geometry is recreated after context loss (if recreator provided)
  const geometry = useGPUGeometry(
    () => new THREE.CylinderGeometry(size, size, size * 2, 32),
    [size],      // dependencies
    'critical'   // priority: 'critical' | 'normal' | 'low'
  );

  return <mesh geometry={geometry} />;
}
```

### useGPUMaterial

```typescript
import { useGPUMaterial } from '@/src/hooks/useGPUResource';

function ColoredBox({ color }) {
  const material = useGPUMaterial(
    () => new THREE.MeshStandardMaterial({ color }),
    [color]
  );

  return (
    <mesh>
      <boxGeometry />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
```

### useGPURenderTarget

```typescript
import { useGPURenderTarget } from '@/src/hooks/useGPUResource';

function PostProcessing() {
  const renderTarget = useGPURenderTarget(
    window.innerWidth,
    window.innerHeight,
    { minFilter: THREE.LinearFilter }
  );

  // Use in custom post-processing...
}
```

### useGPUTexture

```typescript
import { useGPUTexture } from '@/src/hooks/useGPUResource';

function TexturedMesh() {
  // Wraps @react-three/drei's useTexture with GPU tracking
  const texture = useGPUTexture('/textures/wood.jpg');

  return (
    <mesh>
      <boxGeometry />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}
```

---

## Memory Budget System

### Default Budgets

| Resource Type | Default Budget | Purpose |
|--------------|----------------|---------|
| Geometries | 64 MB | Vertex buffers, index buffers |
| Textures | 300 MB | Largest category, image data |
| Materials | 8 MB | Material metadata, uniforms |
| Render Targets | 64 MB | FBOs, post-processing buffers |
| **Total** | **512 MB** | Combined limit |

### Behavior Thresholds

| Usage | Action |
|-------|--------|
| < 80% | Normal operation |
| 80% | Warning logged, callbacks fired |
| 90% | Auto-prune unused resources (30s+ idle) |
| 100% | Manual disposal required |

### Custom Budget Configuration

```typescript
// Set via GPUResourceManager
gpuResourceManager.setBudget({
  total: 256 * 1024 * 1024,      // 256MB total
  textures: 150 * 1024 * 1024,   // 150MB for textures
  geometries: 50 * 1024 * 1024,  // 50MB for geometries
});

// Or save to localStorage for persistence
saveGPUSettings({
  memoryBudget: 256 * 1024 * 1024,
});
```

---

## Context Loss Recovery

### What Causes Context Loss

1. GPU runs out of memory
2. GPU driver crash/reset
3. User switches GPUs (laptops)
4. Too many WebGL contexts
5. Browser tab backgrounded for long period
6. System sleep/wake

### Recovery Flow

```
Context Lost Event
       │
       ▼
┌──────────────────────┐
│ gpuResourceManager   │
│ .handleContextLost() │
│                      │
│ • Notify callbacks   │
│ • Log resource state │
│ • Mark context lost  │
└──────────┬───────────┘
           │
           ▼
    (Browser restores
     WebGL context)
           │
           ▼
┌──────────────────────────┐
│ gpuResourceManager       │
│ .handleContextRestored() │
│                          │
│ • Call all recreators    │
│ • Notify callbacks       │
│ • Clear context lost     │
│ • Reload if 0 recovered  │
└──────────────────────────┘
```

### Implementing Recovery

```typescript
// Register resources with recreators
gpuResourceManager.register('geometry', myGeometry, 'scene', {
  recreator: () => {
    // This is called automatically on context restore
    return new THREE.BoxGeometry(1, 1, 1);
  },
});

// Subscribe to context events for custom handling
gpuResourceManager.onContextLost(() => {
  // Pause animations, show loading indicator
  setIsRecovering(true);
});

gpuResourceManager.onContextRestored(() => {
  // Resume animations, hide loading indicator
  setIsRecovering(false);
});
```

---

## Debug Tools

### GPU Memory Monitor

Visual overlay showing real-time GPU resource usage.

```typescript
// Enabled automatically in development
// Enable in production with URL parameter: ?gpudebug

// Or render manually
import { GPUMemoryMonitor } from '@/src/components/GPUMemoryMonitor';

<GPUMemoryMonitor
  enabled={true}
  position="bottom-left"  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  refreshIntervalMs={1000}
/>
```

### Console Debugging

```typescript
// Log current resource state
gpuResourceManager.debugLog();

// Output:
// [GPUResourceManager] Resource Status
//   Geometries: 45 (12.3 MB, 19.2%)
//   Textures: 23 (156.7 MB, 52.2%)
//   Materials: 67 (0.1 MB, 0.8%)
//   RenderTargets: 2 (8.4 MB, 13.1%)
//   TOTAL: 137 resources (177.5 MB, 34.7% of budget)

// Get usage programmatically
const usage = gpuResourceManager.getMemoryUsage();
console.log(usage);
```

---

## Migration Guide

### Before (Memory Leak Risk)

```typescript
function MyMachine() {
  // Created every render, never disposed
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 2), []);

  return <mesh geometry={geometry} />;
}
```

### After (Auto-Managed)

```typescript
import { useGPUGeometry } from '@/src/hooks/useGPUResource';

function MyMachine() {
  // Auto-disposed on unmount, tracked for memory budget
  const geometry = useGPUGeometry(
    () => new THREE.CylinderGeometry(1, 1, 2),
    []
  );

  return <mesh geometry={geometry} />;
}
```

### Migrating Shared Resources

For module-level shared resources (already exists in MillOS):

```typescript
// Already handled by gpuTrackedResources.ts
// Shared materials from sharedMaterials.ts are registered as 'critical'
// Cached geometries from MachineLOD.ts are registered with recreators
```

---

## Best Practices

### 1. Use Appropriate Priority

```typescript
// Critical: Shared resources used across many components
useGPUGeometry(factory, deps, 'critical');

// Normal: Component-specific resources
useGPUGeometry(factory, deps, 'normal');

// Low: Temporary or easily recreated resources
useGPUGeometry(factory, deps, 'low');
```

### 2. Merge Static Geometries

```typescript
// Bad: 100 draw calls
{tiles.map(tile => <mesh geometry={tileGeo} position={tile.pos} />)}

// Good: 1 draw call
const mergedTiles = mergeGrid(tileGeo, { x: 10, z: 10 }, spacing);
<mesh geometry={mergedTiles} />
```

### 3. Use Compressed Textures

```bash
# Convert textures to KTX2
npm run convert-textures

# Results: ~75% file size reduction
# wood.jpg: 2.1MB -> wood.ktx2: 0.5MB
```

### 4. Implement LOD for Complex Objects

```typescript
// Use lower-poly geometries at distance
const geometry = useMemo(() => {
  const segments = quality === 'ultra' ? 32 : quality === 'high' ? 24 : 16;
  return new THREE.CylinderGeometry(1, 1, 2, segments);
}, [quality]);
```

### 5. Offload Heavy Processing

```typescript
// Bad: Block main thread
const imageData = heavyImageProcessing(largeImage);

// Good: Use worker
const { decodeTexture } = useTextureWorker();
const imageData = await decodeTexture(url);
```

---

## Troubleshooting

### "Context lost - too many GPU resources"

**Cause**: Exceeded GPU memory limits

**Solutions**:
1. Lower texture resolutions
2. Enable texture compression (KTX2)
3. Reduce geometry complexity
4. Implement LOD system
5. Merge static geometries

### Memory keeps growing

**Cause**: Resources not being disposed

**Solutions**:
1. Use `useGPUResource` hooks instead of raw `useMemo`
2. Check for components that don't unmount cleanly
3. Enable auto-prune: resources unused for 30s+ will be disposed at 90% memory

### Textures not loading

**Cause**: KTX2 transcoder not initialized

**Solutions**:
1. Run `npm run setup:basis`
2. Verify files exist in `public/libs/basis/`
3. Check browser console for transcoder errors

### Context loss not recovering

**Cause**: No recreators registered

**Solutions**:
1. Register resources with recreator functions
2. Use `useGPUResource` hooks (they auto-register recreators)
3. Check console for recovery errors

---

## API Reference

### GPUResourceManager

| Method | Description |
|--------|-------------|
| `register(type, resource, owner, options)` | Track a resource |
| `dispose(id)` | Dispose single resource |
| `disposeByOwner(owner)` | Dispose all from owner |
| `disposeByType(type)` | Dispose all of type |
| `disposeAll()` | Dispose everything |
| `touch(id)` | Mark as recently used |
| `pruneUnused(maxAgeMs)` | Remove old resources |
| `getMemoryUsage()` | Get usage statistics |
| `setBudget(budget)` | Configure limits |
| `onContextLost(cb)` | Subscribe to event |
| `onContextRestored(cb)` | Subscribe to event |
| `onMemoryWarning(cb)` | Subscribe to event |
| `handleContextLost()` | Call on context loss |
| `handleContextRestored()` | Call on restore |
| `isContextAvailable()` | Check context state |
| `debugLog()` | Log to console |

### Hooks

| Hook | Description |
|------|-------------|
| `useGPUGeometry(factory, deps, priority)` | Auto-managed geometry |
| `useGPUMaterial(factory, deps, priority)` | Auto-managed material |
| `useGPURenderTarget(w, h, options, priority)` | Auto-managed FBO |
| `useGPUTexture(path, priority)` | Tracked drei texture |
| `useGPUResource(type, factory, deps, options)` | Generic resource |
| `useRegisterGPUResource(type, resource, owner)` | Register existing |
| `useGPUResourceCleanup(owner)` | Cleanup by owner |
| `useTextureWorker()` | Worker interface |

---

## Version History

- **v1.0.0** (2024-12) - Initial implementation
  - GPUResourceManager core
  - Texture compression (KTX2)
  - Geometry merging utilities
  - LOD integration
  - Resource persistence
  - Web Worker processing
  - React hooks
  - Memory monitor component
