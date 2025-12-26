# 3D Scene System

Three.js and React Three Fiber implementation for the MillOS 3D factory visualization.

## Table of Contents

1. [React Three Fiber Setup](#react-three-fiber-setup)
2. [Camera and Controls](#camera-and-controls)
3. [Lighting System](#lighting-system)
4. [Scene Hierarchy](#scene-hierarchy)
5. [Animation System](#animation-system)
6. [Materials and Effects](#materials-and-effects)
7. [Performance Optimization](#performance-optimization)

---

## React Three Fiber Setup

### Canvas Configuration

```tsx
<Canvas
  shadows
  camera={{ position: [40, 25, 40], fov: 45, near: 0.1, far: 500 }}
  gl={{ antialias: true, alpha: false }}
  dpr={[1, 2]}
>
  <color attach="background" args={['#0a0f1a']} />
  <fog attach="fog" args={['#0a0f1a', 150, 500]} />
  {/* Scene contents */}
</Canvas>
```

### Canvas Props

| Prop | Value | Description |
|------|-------|-------------|
| `shadows` | true | Enable shadow mapping |
| `gl.antialias` | true | Smooth edges |
| `gl.alpha` | false | Opaque background |
| `dpr` | [1, 2] | Device pixel ratio limits |

### Background and Fog

- Background color: `#0a0f1a` (dark navy)
- Fog: Linear fog from 150 to 500 units

---

## Camera and Controls

### Default Camera

```typescript
camera={{
  position: [40, 25, 40],  // Isometric-ish view
  fov: 45,                  // Moderate field of view
  near: 0.1,                // Close clipping plane
  far: 500                  // Far clipping plane
}}
```

### OrbitControls

```tsx
<OrbitControls
  maxPolarAngle={Math.PI / 2 - 0.05}  // Prevent flipping under floor
  minPolarAngle={0.2}                  // Minimum angle from above
  minDistance={15}                     // Closest zoom
  maxDistance={100}                    // Furthest zoom
  autoRotate={!selectedMachine && !selectedWorker && !showAIPanel}
  autoRotateSpeed={0.3}
  target={[0, 5, 0]}                   // Look at center, elevated
  enableDamping
  dampingFactor={0.05}
/>
```

### Control Behavior

- **Auto-rotate** when no panels are open
- **Damping** for smooth movement
- **Constrained** to prevent disorienting angles

---

## Lighting System

### Light Hierarchy

```
Lighting
├── Ambient Light (base)
├── Directional Key Light (shadows)
├── Directional Fill Light (softening)
├── Point Lights x5 (overhead industrial)
├── Accent Lights x3 (colored drama)
├── Spot Light (machine highlighting)
└── Contact Shadows (grounding)
```

### Ambient Light

```tsx
<ambientLight intensity={0.15} color="#b4c6e7" />
```

Provides base illumination with cool industrial tint.

### Key Light (Main Shadows)

```tsx
<directionalLight
  position={[30, 50, 20]}
  intensity={1.5}
  castShadow
  shadow-mapSize={[4096, 4096]}
  shadow-camera-far={100}
  shadow-camera-left={-50}
  shadow-camera-right={50}
  shadow-camera-top={50}
  shadow-camera-bottom={-50}
  shadow-bias={-0.0001}
  color="#fff5e6"
/>
```

### Industrial Overhead Lights

```tsx
{[-20, -10, 0, 10, 20].map((x, i) => (
  <pointLight
    key={i}
    position={[x, 18, 0]}
    intensity={50}
    distance={30}
    decay={2}
    color="#fef3c7"
  />
))}
```

### Accent Lighting

Colored lights for dramatic effect:

| Position | Color | Intensity |
|----------|-------|-----------|
| [-30, 5, -15] | #3b82f6 (blue) | 30 |
| [30, 5, 15] | #f97316 (orange) | 30 |
| [0, 3, 25] | #22c55e (green) | 20 |

---

## Scene Hierarchy

### Component Organization

```
<MillScene>
├── <FactoryEnvironment>          # Lighting, walls, ceiling
├── <Machines>                    # Industrial equipment
├── <SpoutingSystem>              # Grain pipes
├── <FactoryInfrastructure>       # Floor, zones, markings
├── <ConveyorSystem>              # Belts and products
├── <WorkerSystem>                # Animated workers
├── <ForkliftSystem>              # Vehicles and paths
├── <TruckBay>                    # Loading area
├── <DustParticles>               # Atmosphere
├── <GrainFlow>                   # Particle effects
└── <HolographicDisplays>         # 3D UI elements
</MillScene>
```

### Coordinate System

```
+Y (Up - 0 to 32)
 │
 │    +Z (North - -40 to +40)
 │   /
 │  /
 │ /
 │/
─┼───────────+X (East - -55 to +55)
```

### Zone Layout (Z-axis)

| Zone | Z Position | Y Position | Contents |
|------|------------|------------|----------|
| 1 | -22 | 0 | Silos |
| 2 | -6 | 0 | Roller Mills |
| 3 | +6 | 9 | Plansifters (elevated) |
| 4 | +20 | 0 | Packers |

---

## Animation System

### useFrame Hook

Per-frame animations use R3F's `useFrame`:

```typescript
useFrame((state, delta) => {
  // state.clock.elapsedTime - total elapsed time
  // delta - time since last frame

  // Position animation
  mesh.current.position.x += speed * delta;

  // Rotation animation
  mesh.current.rotation.y += delta * 2;

  // Oscillation
  mesh.current.position.y = Math.sin(state.clock.elapsedTime * 5) * 0.1;
});
```

### Machine Vibrations

#### Plansifter Oscillation
```typescript
if (type === MachineType.PLANSIFTER) {
  const intensity = 0.05;
  const speed = 15;
  groupRef.current.position.x = position[0] + Math.cos(state.clock.elapsedTime * speed) * intensity;
  groupRef.current.position.z = position[2] + Math.sin(state.clock.elapsedTime * speed) * intensity;
}
```

#### Roller Mill Vibration
```typescript
if (type === MachineType.ROLLER_MILL) {
  const intensity = 0.01;
  const speed = 40;
  groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * speed) * intensity;
}
```

### Worker Walk Cycle

```typescript
useFrame((state, delta) => {
  if (!isIdle) {
    setWalkCycle(prev => prev + delta * 5.5);
  }

  // Bob height based on walk cycle
  const bobHeight = Math.abs(Math.sin(walkCycle)) * 0.025;
  ref.current.position.y = bobHeight;
});
```

### Limb Animation

```typescript
// Arm swing
const armSwing = Math.sin(walkCycle) * 0.5;
leftArmRef.current.rotation.x = armSwing;
rightArmRef.current.rotation.x = -armSwing;

// Leg swing
const legSwing = Math.sin(walkCycle) * 0.6;
leftLegRef.current.rotation.x = -legSwing;
rightLegRef.current.rotation.x = legSwing;
```

### Conveyor Belt Texture

```typescript
useFrame((_, delta) => {
  if (beltRef.current) {
    const material = beltRef.current.material as THREE.MeshStandardMaterial;
    if (material.map) {
      material.map.offset.x += delta * productionSpeed * 0.5;
    }
  }
});
```

---

## Materials and Effects

### Standard Materials

```tsx
<meshStandardMaterial
  color="#3b82f6"        // Base color
  metalness={0.5}        // Metal look (0-1)
  roughness={0.3}        // Surface roughness (0-1)
  emissive="#000000"     // Self-illumination color
  emissiveIntensity={0}  // Glow strength
/>
```

### Machine-Specific Materials

| Machine | Color | Metalness | Roughness |
|---------|-------|-----------|-----------|
| Silo | #cbd5e1 | 0.7 | 0.2 |
| Roller Mill | #3b82f6 | 0.5 | 0.3 |
| Plansifter | #f8fafc | 0.2 | 0.1 |
| Packer | #f59e0b | 0.4 | 0.4 |

### Emissive Materials

Status lights and displays use emissive properties:

```tsx
<meshStandardMaterial
  color="#22c55e"
  emissive="#22c55e"
  emissiveIntensity={3}
  toneMapped={false}      // Allows values > 1
/>
```

### Transparent Materials

```tsx
<meshStandardMaterial
  color="#87ceeb"
  transparent
  opacity={0.3}
  emissive="#87ceeb"
  emissiveIntensity={0.2}
/>
```

---

## Performance Optimization

### useMemo for Data

Machine configurations are memoized:

```typescript
const machines = useMemo(() => {
  const _machines: MachineData[] = [];
  // Generate machine data
  return _machines;
}, []); // Empty deps = calculated once
```

### Suspense and Preload

```tsx
<Suspense fallback={null}>
  {/* Scene contents */}
  <Preload all />
</Suspense>
```

### DPR Limiting

Device pixel ratio capped to prevent performance issues on high-DPI displays:

```tsx
dpr={[1, 2]}  // Min 1x, max 2x
```

### Shadow Map Optimization

```tsx
shadow-mapSize={[4096, 4096]}  // High-res shadows
shadow-camera-far={100}         // Limited shadow distance
```

### Object Pooling

Flour bags are created once and recycled:

```typescript
const bags = useMemo(() => {
  const _bags: FlourBag[] = [];
  for (let i = 0; i < 60; i++) {
    _bags.push({ /* bag data */ });
  }
  return _bags;
}, []);
```

### Frustum Culling

Three.js automatically culls objects outside camera view. This is enabled by default.

### Geometry Sharing

Multiple instances can share geometry:

```tsx
{[-40, -20, 0, 20, 40].map((x, i) => (
  <mesh key={i} position={[x, 20, 0]}>
    <boxGeometry args={[0.5, 25, 0.5]} />
    <meshStandardMaterial color="#374151" />
  </mesh>
))}
```

---

## Post-Processing

Visual effects applied after main render pass:

```tsx
import { PostProcessing } from './PostProcessing';

<Suspense fallback={null}>
  {/* Scene */}
  <PostProcessing />
</Suspense>
```

Effects may include:
- Bloom for emissive glow
- Ambient occlusion
- Color correction

---

## HTML Overlays

3D-positioned HTML elements using Drei's `Html`:

```tsx
<Html position={[0, size[1] + 2.5, 0]} center distanceFactor={12}>
  <div className="bg-slate-900/95 ...">
    {/* Tooltip content */}
  </div>
</Html>
```

### Props

| Prop | Description |
|------|-------------|
| `position` | 3D world coordinates |
| `center` | Center the element |
| `distanceFactor` | Scale based on camera distance |
| `occlude` | Hide when behind objects |

---

## Three.js Imports

```typescript
import * as THREE from 'three';

// Common usage
new THREE.Vector3(x, y, z)
new THREE.Color('#ff0000')
THREE.MathUtils.lerp(a, b, t)
THREE.BackSide  // For interior surfaces
```

### Lerp for Smooth Transitions

```typescript
ref.current.rotation.y = THREE.MathUtils.lerp(
  ref.current.rotation.y,
  targetRotation,
  0.1
);
```
