# Safety System

MillOS implements a complete safety simulation demonstrating realistic industrial collision avoidance between workers and forklifts.

## Table of Contents

1. [Overview](#overview)
2. [Position Registry](#position-registry)
3. [Worker Safety Behaviors](#worker-safety-behaviors)
4. [Forklift Safety Features](#forklift-safety-features)
5. [Speed Zones](#speed-zones)
6. [Safety Metrics](#safety-metrics)
7. [Visual Indicators](#visual-indicators)

---

## Overview

The safety system simulates real-world industrial safety protocols:

- **Collision Detection** - Real-time proximity monitoring
- **Automatic Stopping** - Forklifts stop for workers
- **Worker Evasion** - Workers step aside for approaching vehicles
- **Visual Communication** - Waving gestures between workers and operators
- **Audio Alerts** - Horns and backup beepers
- **Metrics Tracking** - Safety incident logging

---

## Position Registry

The `PositionRegistry` class (`src/utils/positionRegistry.ts`) is the core collision detection system.

### Entity Registration

Every frame, entities register their positions:

```typescript
// Worker registration
positionRegistry.register(data.id, pos.x, pos.z, 'worker');

// Forklift registration with direction
positionRegistry.register(
  data.id,
  pos.x,
  pos.z,
  'forklift',
  dirNormalized.x,
  dirNormalized.z
);
```

### Interface

```typescript
interface EntityPosition {
  id: string;
  x: number;
  z: number;
  type: 'worker' | 'forklift';
  dirX?: number;  // Direction for forklifts
  dirZ?: number;
}
```

### Query Methods

```typescript
// Get workers within radius
getWorkersNearby(x: number, z: number, radius: number): EntityPosition[]

// Get forklifts within radius (excluding self)
getForkliftsNearby(x: number, z: number, radius: number, excludeId: string): EntityPosition[]

// Check if path ahead is clear
isPathClear(
  x: number, z: number,
  dirX: number, dirZ: number,
  checkDistance: number,
  safetyRadius: number,
  forkliftId?: string
): boolean

// Get nearest forklift to a position
getNearestForklift(x: number, z: number, maxDistance: number): EntityPosition | null

// Check if forklift is heading toward a point
isForkliftApproaching(workerX: number, workerZ: number, forklift: EntityPosition): boolean
```

### Path Clearance Check

```typescript
isPathClear(x, z, dirX, dirZ, checkDistance, safetyRadius, forkliftId) {
  // Check points along the path ahead
  for (let d = 1; d <= checkDistance; d += 0.5) {
    const checkX = x + dirX * d;
    const checkZ = z + dirZ * d;

    // Check for workers
    const workersNearby = this.getWorkersNearby(checkX, checkZ, safetyRadius);
    if (workersNearby.length > 0) return false;

    // Check for other forklifts
    if (forkliftId) {
      const forkliftsNearby = this.getForkliftsNearby(checkX, checkZ, safetyRadius, forkliftId);
      if (forkliftsNearby.length > 0) return false;
    }
  }
  return true;
}
```

---

## Worker Safety Behaviors

### Forklift Detection

Workers continuously scan for approaching forklifts:

```typescript
const FORKLIFT_DETECTION_RANGE = 8;
const nearestForklift = positionRegistry.getNearestForklift(
  ref.current.position.x,
  ref.current.position.z,
  FORKLIFT_DETECTION_RANGE
);
```

### Head Tracking

Workers turn their heads to look at nearby forklifts:

```typescript
if (nearestForklift) {
  const dx = nearestForklift.x - ref.current.position.x;
  const dz = nearestForklift.z - ref.current.position.z;
  const angleToForklift = Math.atan2(dx, dz);
  const bodyAngle = directionRef.current > 0 ? 0 : Math.PI;
  let relativeAngle = angleToForklift - bodyAngle;
  // Clamp to realistic head rotation range
  relativeAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, relativeAngle));
  setHeadRotation(relativeAngle);
}
```

### Evasion Maneuver

When a forklift approaches, workers step aside:

```typescript
if (nearestForklift && positionRegistry.isForkliftApproaching(...)) {
  if (!isEvadingRef.current) {
    // Determine which side to evade (away from forklift path)
    const crossProduct = forklift.dirX * toWorkerZ - forklift.dirZ * toWorkerX;
    evadeDirectionRef.current = crossProduct > 0 ? 1 : -1;
    isEvadingRef.current = true;
  }

  // Move sideways to evade
  const targetX = baseXRef.current + (evadeDirectionRef.current * EVADE_DISTANCE);
  const diffX = targetX - ref.current.position.x;
  if (Math.abs(diffX) > 0.1) {
    ref.current.position.x += Math.sign(diffX) * EVADE_SPEED * delta;
  }
}
```

### Evasion Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `FORKLIFT_DETECTION_RANGE` | 8 | Detection distance |
| `EVADE_DISTANCE` | 3 | How far to step aside |
| `EVADE_SPEED` | 4 | Sideways movement speed |

### Acknowledgment Wave

After evasion, workers wave to acknowledge the forklift:

```typescript
useEffect(() => {
  if (!isEvadingRef.current && wasEvadingRef.current) {
    // Alternate between wave and thumbs-up gestures
    gestureCountRef.current += 1;
    const useThumbsUp = gestureCountRef.current % 2 === 0;

    if (useThumbsUp) {
      setIsThumbsUp(true);
      setTimeout(() => setIsThumbsUp(false), 1800);
    } else {
      setIsWaving(true);
      setTimeout(() => setIsWaving(false), 1500);
    }
  }
  wasEvadingRef.current = isEvadingRef.current;
});
```

### Friendly Wave at Passing Forklifts

Workers also wave when forklifts pass nearby, even without requiring evasion:

```typescript
const WAVE_TRIGGER_DISTANCE = 6; // Distance at which we consider a forklift "passing"

// Track when forklift is nearby
if (nearestForklift && distToForklift < WAVE_TRIGGER_DISTANCE) {
  forkliftNearbyRef.current = true;
}

// When forklift passes and leaves range, trigger friendly wave
if (!nearestForklift && forkliftNearbyRef.current && waveCooldownRef.current <= 0) {
  if (!wasEvadingRef.current) {  // Only if didn't already wave from evading
    setIsWaving(true);
    setTimeout(() => setIsWaving(false), 1200);
    waveCooldownRef.current = 15; // 15 second cooldown between waves
  }
  forkliftNearbyRef.current = false;
}
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| `WAVE_TRIGGER_DISTANCE` | 6 | Distance to detect passing forklift |
| `waveCooldownRef` | 15s | Cooldown between friendly waves |

---

## Forklift Safety Features

### Collision Avoidance

Forklifts check multiple safety conditions before moving:

```typescript
// Check path is clear of workers and forklifts
const pathClear = positionRegistry.isPathClear(
  pos.x, pos.z,
  dirNormalized.x, dirNormalized.z,
  CHECK_DISTANCE,
  SAFETY_RADIUS,
  data.id
);

// Check immediate vicinity for workers
const workersNearby = positionRegistry.getWorkersNearby(pos.x, pos.z, SAFETY_RADIUS);

// Check for other forklifts
const forkliftsNearby = positionRegistry.getForkliftsNearby(
  pos.x, pos.z,
  FORKLIFT_SAFETY_RADIUS,
  data.id
);

// Only move if all checks pass
const isSafeToMove = pathClear &&
                     workersNearby.length === 0 &&
                     forkliftsNearby.length === 0;
```

### Safety Distances (Configurable)

From Zustand store `safetyConfig`:

| Config | Default | Description |
|--------|---------|-------------|
| `workerDetectionRadius` | 2.5 | Distance to detect workers |
| `forkliftSafetyRadius` | 4 | Distance between forklifts |
| `pathCheckDistance` | 5 | Look-ahead distance |
| `speedZoneSlowdown` | 0.4 | Speed multiplier in slow zones |

### Horn Warning

When stopping for safety, forklifts sound their horn:

```typescript
useEffect(() => {
  if (isStopped && !wasStoppedRef.current) {
    audioManager.playHorn(data.id);
    recordSafetyStop();
  }
  wasStoppedRef.current = isStopped;
}, [isStopped]);
```

### Intersection Horn

Forklifts honk their horn when approaching waypoints (intersections/turns) as a safety protocol:

```typescript
// Horn honk when approaching intersection
const HORN_DISTANCE = 5; // Distance to start honking before waypoint
if (distance < HORN_DISTANCE && distance > 1 && pathIndexRef.current !== lastHornWaypointRef.current) {
  audioManager.playHorn(data.id);
  lastHornWaypointRef.current = pathIndexRef.current;
}
```

Workers and other vehicles receive advance warning at busy intersections.

### Yielding to Other Forklifts

When two forklifts approach each other and become stuck, the anti-deadlock system activates:

```typescript
// Forklift-to-forklift deadlock resolution: higher ID yields
if (forkliftsNearby.length > 0 && isStuck) {
  const otherForklift = forkliftsNearby[0];
  const shouldYield = data.id > otherForklift.id; // Higher ID yields (reverses)

  if (shouldYield) {
    // Back up slightly to let other forklift pass
    const backupDir = dirNormalized.clone().multiplyScalar(-1);
    pos.add(backupDir.multiplyScalar(data.speed * 0.3 * delta));
    setIsYielding(true);
    setIsReversing(true);
    audioManager.playBackupBeep(data.id);
  }
}
```

| Threshold | Value | Description |
|-----------|-------|-------------|
| `STUCK_THRESHOLD` | 3s | Time before considered stuck |
| `SKIP_THRESHOLD` | 8s | Time before skipping waypoint |

### Operator Wave

Forklift operators wave when stopped for workers:

```typescript
useEffect(() => {
  if (isStopped && !wasStoppedRef.current) {
    setTimeout(() => setIsOperatorWaving(true), 300);
  }
  if (!isStopped && wasStoppedRef.current) {
    setTimeout(() => setIsOperatorWaving(false), 1000);
  }
}, [isStopped]);
```

### Backup Beeper

When reversing, forklifts activate backup alarms:

```typescript
// Detect reverse direction
const dotProduct = dirNormalized.dot(prevDirectionRef.current);
const reversing = dotProduct < -0.5;

if (reversing && !isStopped) {
  audioManager.playBackupBeep(data.id);
}
```

---

## Speed Zones

Designated areas where forklifts must reduce speed.

### Zone Definitions

```typescript
const SPEED_ZONES = [
  { x: 0, z: 0, radius: 6, name: 'Central Intersection' },
  { x: 0, z: 15, radius: 5, name: 'North Loading' },
  { x: 0, z: -15, radius: 5, name: 'South Loading' },
  { x: -20, z: -6, radius: 4, name: 'Milling Area West' },
  { x: 20, z: -6, radius: 4, name: 'Milling Area East' },
  { x: 0, z: 20, radius: 5, name: 'Packing Zone' },
];
```

### Zone Detection

```typescript
const isInSpeedZone = (x: number, z: number): boolean => {
  for (const zone of SPEED_ZONES) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    if (Math.sqrt(dx * dx + dz * dz) < zone.radius) {
      return true;
    }
  }
  return false;
};
```

### Visual Markers

Speed zones are visualized with:
- Circular floor markings
- "SLOW" text labels
- Amber color (#fbbf24)

---

## Safety Metrics

### Tracked Metrics

```typescript
safetyMetrics: {
  nearMisses: number;       // Total near-miss events
  safetyStops: number;      // Forklift safety stops
  workerEvasions: number;   // Worker evasion maneuvers
  lastIncidentTime: number | null;  // Last event timestamp
}
```

### Recording Events

```typescript
// When forklift stops for worker
recordSafetyStop: () => set((state) => ({
  safetyMetrics: {
    ...state.safetyMetrics,
    safetyStops: state.safetyMetrics.safetyStops + 1,
    nearMisses: state.safetyMetrics.nearMisses + 1,
    lastIncidentTime: Date.now()
  }
}))

// When worker evades forklift
recordWorkerEvasion: () => set((state) => ({
  safetyMetrics: {
    ...state.safetyMetrics,
    workerEvasions: state.safetyMetrics.workerEvasions + 1
  }
}))
```

### Time Since Incident

```typescript
const getTimeSinceIncident = () => {
  if (!safetyMetrics.lastIncidentTime) return 'No incidents';
  const elapsed = Date.now() - safetyMetrics.lastIncidentTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};
```

---

## Visual Indicators

### Forklift Warning Light

The rooftop light changes based on movement state:

```typescript
const WarningLight: React.FC<{ isStopped: boolean; isYielding: boolean }> = ({ isStopped, isYielding }) => {
  const [flash, setFlash] = useState(false);

  useFrame((state) => {
    // Flash pattern varies by state:
    // - Yielding: very fast amber alternating flash (strobe effect)
    // - Stopped: fast red flash
    // - Moving: slow amber pulse
    const flashSpeed = isYielding ? 25 : isStopped ? 15 : 5;
    setFlash(Math.sin(state.clock.elapsedTime * flashSpeed) > 0);
  });

  // Color priority: yielding (amber strobe) > stopped (red) > moving (amber)
  const color = isYielding ? '#fbbf24' : isStopped ? '#ef4444' : '#f59e0b';

  return (
    <group position={[0, 2.3, -0.3]}>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={flash ? (isYielding ? 5 : 3) : 0.5}
        />
      </mesh>
      {/* Additional side indicator lights when yielding */}
      {isYielding && (
        <>
          <mesh position={[-0.5, -0.1, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={flash ? 4 : 1} />
          </mesh>
          <mesh position={[0.5, -0.1, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={!flash ? 4 : 1} />
          </mesh>
        </>
      )}
    </group>
  );
};
```

| State | Color | Flash Speed | Additional Indicators |
|-------|-------|-------------|----------------------|
| Moving | Amber (#f59e0b) | 5 Hz | None |
| Stopped | Red (#ef4444) | 15 Hz | Point light |
| Yielding | Bright Amber (#fbbf24) | 25 Hz | Alternating side lights |

### Worker Status Indicator

Floating status orb above each worker:

| Status | Color |
|--------|-------|
| `working` | #22c55e (green) |
| `responding` | #f59e0b (amber) |
| `break` | #6b7280 (gray) |
| `idle` | #3b82f6 (blue) |

### Path Visualization

Forklift routes shown as dashed lines:

```typescript
<Line
  points={points}
  color={color}
  lineWidth={2}
  dashed
  dashSize={0.5}
  dashScale={2}
  gapSize={0.3}
/>
```

### Safety Alert Toasts

Near-miss events generate visual alerts:

```typescript
const NEAR_MISS_MESSAGES = [
  'Forklift stopped for pedestrian - safety protocol activated',
  'Worker detected in forklift path - collision averted',
  'Emergency stop triggered - all clear',
  'Proximity alert - forklift yielded to personnel',
  'Safety system engaged - near-miss avoided',
];
```

Alert styling:
- Background: `bg-emerald-950/90`
- Border: `border-emerald-500`
- Icon: Shield
- Color: `text-emerald-400`
