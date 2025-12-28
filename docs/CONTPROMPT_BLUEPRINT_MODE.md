# Continuation Prompt: Blueprint Mode Toggle

## Objective

Implement a "Blueprint Mode" that reveals the underlying structure, data flows, and AI decision paths. When someone says "it looks simple," toggle this view to show the depth. It's the architectural x-ray of the digital twin.

**The Pitch:** "You're seeing the operations view. Let me show you what's underneath."

**Performance Constraints:**
- Must maintain 60fps
- No additional geometry - reuse existing with different materials
- Shader-based effects, not new meshes
- Lazy initialization - don't create blueprint resources until mode activated

---

## Part 1: Mode Toggle System

### 1.1 View Mode Store

**File:** `src/stores/viewModeStore.ts`

```typescript
import { create } from 'zustand';

export type ViewMode = 'operations' | 'blueprint';

interface ViewModeState {
  mode: ViewMode;
  transitionProgress: number; // 0-1 for smooth transitions
  isTransitioning: boolean;

  setMode: (mode: ViewMode) => void;
  toggleMode: () => void;
}

export const useViewModeStore = create<ViewModeState>((set, get) => ({
  mode: 'operations',
  transitionProgress: 0,
  isTransitioning: false,

  setMode: (mode) => {
    const current = get().mode;
    if (current === mode) return;

    set({ isTransitioning: true });

    // Animate transition over 500ms
    const startTime = performance.now();
    const duration = 500;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      set({ transitionProgress: mode === 'blueprint' ? eased : 1 - eased });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        set({ mode, isTransitioning: false });
      }
    };

    requestAnimationFrame(animate);
  },

  toggleMode: () => {
    const current = get().mode;
    get().setMode(current === 'operations' ? 'blueprint' : 'operations');
  },
}));
```

### 1.2 Keyboard Shortcut

**File:** Add to `src/hooks/useKeyboardShortcuts.ts`

```typescript
import { useViewModeStore } from '../stores/viewModeStore';

// Inside the keyboard handler
case 'KeyB':
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    useViewModeStore.getState().toggleMode();
  }
  break;
```

### 1.3 UI Toggle Button

**File:** Add to UI overlay

```tsx
import { useViewModeStore } from '../stores/viewModeStore';
import { Layers, Box } from 'lucide-react';

const ViewModeToggle: React.FC = () => {
  const { mode, toggleMode, isTransitioning } = useViewModeStore();

  return (
    <button
      onClick={toggleMode}
      disabled={isTransitioning}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg
        transition-all duration-300
        ${mode === 'blueprint'
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
          : 'bg-slate-700/50 border-slate-600 text-slate-300'}
        border hover:border-cyan-400
      `}
    >
      {mode === 'blueprint' ? <Layers className="w-4 h-4" /> : <Box className="w-4 h-4" />}
      <span className="text-sm font-mono">
        {mode === 'blueprint' ? 'BLUEPRINT' : 'OPERATIONS'}
      </span>
      <kbd className="text-xs opacity-50 ml-2">Ctrl+B</kbd>
    </button>
  );
};
```

---

## Part 2: Blueprint Material System

### 2.1 Wireframe Overlay Shader

Renders geometry as wireframe with edge glow. Uses screen-space derivatives - no geometry change.

**File:** `src/shaders/blueprintMaterial.ts`

```typescript
import * as THREE from 'three';

export const createBlueprintMaterial = (
  originalMaterial: THREE.Material,
  blueprintColor: string = '#00d4ff'
) => {
  const isTransparent = (originalMaterial as THREE.MeshStandardMaterial).transparent;

  return new THREE.ShaderMaterial({
    uniforms: {
      blueprintColor: { value: new THREE.Color(blueprintColor) },
      backgroundColor: { value: new THREE.Color('#0a0f1a') },
      wireframeWidth: { value: 1.5 },
      glowIntensity: { value: 0.6 },
      time: { value: 0 },
      opacity: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vBarycentric;

      // Barycentric coordinates for wireframe
      attribute vec3 barycentric;

      void main() {
        vPosition = position;
        vNormal = normalMatrix * normal;
        vBarycentric = barycentric;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 blueprintColor;
      uniform vec3 backgroundColor;
      uniform float wireframeWidth;
      uniform float glowIntensity;
      uniform float time;
      uniform float opacity;

      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vBarycentric;

      // Edge detection using screen-space derivatives
      float edgeFactor() {
        vec3 d = fwidth(vBarycentric);
        vec3 a3 = smoothstep(vec3(0.0), d * wireframeWidth, vBarycentric);
        return min(min(a3.x, a3.y), a3.z);
      }

      void main() {
        float edge = 1.0 - edgeFactor();

        // Animated scan line
        float scan = sin(vPosition.y * 2.0 + time * 3.0) * 0.5 + 0.5;
        scan = pow(scan, 8.0) * 0.3;

        // Fresnel rim
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);

        // Combine effects
        float intensity = edge + fresnel * 0.4 + scan;
        intensity = clamp(intensity, 0.0, 1.0);

        vec3 color = mix(backgroundColor, blueprintColor, intensity);

        // Add glow
        color += blueprintColor * edge * glowIntensity;

        gl_FragColor = vec4(color, opacity * (0.3 + intensity * 0.7));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
};
```

### 2.2 Barycentric Coordinate Generator

For proper wireframe rendering, we need barycentric coordinates.

**File:** `src/utils/barycentricHelper.ts`

```typescript
import * as THREE from 'three';

/**
 * Adds barycentric coordinates to a geometry for wireframe rendering.
 * PERFORMANCE: Only call once per geometry, cache result.
 */
export const addBarycentricCoordinates = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  // Check if already added
  if (geometry.getAttribute('barycentric')) {
    return geometry;
  }

  const position = geometry.getAttribute('position');
  const count = position.count;

  // For indexed geometry, we need to unindex first
  if (geometry.index) {
    geometry = geometry.toNonIndexed();
  }

  const barycentric = new Float32Array(count * 3);

  // Assign barycentric coords per triangle
  for (let i = 0; i < count; i += 3) {
    // Vertex 0: (1, 0, 0)
    barycentric[i * 3] = 1;
    barycentric[i * 3 + 1] = 0;
    barycentric[i * 3 + 2] = 0;

    // Vertex 1: (0, 1, 0)
    barycentric[(i + 1) * 3] = 0;
    barycentric[(i + 1) * 3 + 1] = 1;
    barycentric[(i + 1) * 3 + 2] = 0;

    // Vertex 2: (0, 0, 1)
    barycentric[(i + 2) * 3] = 0;
    barycentric[(i + 2) * 3 + 1] = 0;
    barycentric[(i + 2) * 3 + 2] = 1;
  }

  geometry.setAttribute('barycentric', new THREE.BufferAttribute(barycentric, 3));

  return geometry;
};

// Cache for processed geometries
const geometryCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

export const getBarycentricGeometry = (original: THREE.BufferGeometry): THREE.BufferGeometry => {
  if (geometryCache.has(original)) {
    return geometryCache.get(original)!;
  }

  const processed = addBarycentricCoordinates(original.clone());
  geometryCache.set(original, processed);
  return processed;
};
```

### 2.3 Simplified Blueprint Material (No Barycentric)

If barycentric approach is too complex, use a simpler edge-detection approach:

**File:** `src/shaders/blueprintSimple.ts`

```typescript
import * as THREE from 'three';

/**
 * Simpler blueprint material using screen-space edge detection.
 * No geometry modification required.
 */
export const createSimpleBlueprintMaterial = (color: string = '#00d4ff') => {
  return new THREE.ShaderMaterial({
    uniforms: {
      blueprintColor: { value: new THREE.Color(color) },
      time: { value: 0 },
      edgeThreshold: { value: 0.3 },
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
      uniform vec3 blueprintColor;
      uniform float time;
      uniform float edgeThreshold;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main() {
        // Edge detection via normal discontinuity
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Fresnel for edges
        float fresnel = 1.0 - abs(dot(viewDir, normal));
        fresnel = pow(fresnel, 1.5);

        // Grid pattern
        vec3 gridPos = vWorldPosition * 0.5;
        vec3 grid = abs(fract(gridPos - 0.5) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, 0.05, min(min(grid.x, grid.y), grid.z));

        // Scan line
        float scan = sin(vWorldPosition.y * 2.0 + time * 2.0) * 0.5 + 0.5;
        scan = pow(scan, 10.0) * 0.5;

        // Combine
        float intensity = fresnel * 0.8 + gridLine * 0.3 + scan;

        vec3 color = blueprintColor * intensity;
        float alpha = 0.1 + intensity * 0.8;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
};
```

---

## Part 3: Data Flow Visualization

### 3.1 Connection Lines Between Machines

Show material/data flow as animated dashed lines.

**File:** `src/components/blueprint/DataFlowNetwork.tsx`

```tsx
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useViewModeStore } from '../../stores/viewModeStore';
import { useProductionStore } from '../../stores/productionStore';

interface FlowConnection {
  from: [number, number, number];
  to: [number, number, number];
  active: boolean;
  flowRate: number; // 0-1
}

// Define the factory flow topology
const FLOW_CONNECTIONS: FlowConnection[] = [
  // Silos to Mills
  { from: [-18, 5, -22], to: [-15, 3, -6], active: true, flowRate: 0.8 },
  { from: [-9, 5, -22], to: [-7.5, 3, -6], active: true, flowRate: 0.9 },
  { from: [0, 5, -22], to: [0, 3, -6], active: true, flowRate: 0.7 },
  { from: [9, 5, -22], to: [7.5, 3, -6], active: true, flowRate: 0.85 },
  { from: [18, 5, -22], to: [15, 3, -6], active: true, flowRate: 0.75 },

  // Mills to Sifters
  { from: [-11, 3, -6], to: [-8, 9, 6], active: true, flowRate: 0.8 },
  { from: [0, 3, -6], to: [0, 9, 6], active: true, flowRate: 0.9 },
  { from: [11, 3, -6], to: [8, 9, 6], active: true, flowRate: 0.85 },

  // Sifters to Packers
  { from: [-8, 9, 6], to: [-8, 2, 20], active: true, flowRate: 0.7 },
  { from: [0, 9, 6], to: [0, 2, 20], active: true, flowRate: 0.8 },
  { from: [8, 9, 6], to: [8, 2, 20], active: true, flowRate: 0.75 },
];

export const DataFlowNetwork: React.FC = () => {
  const { mode, transitionProgress } = useViewModeStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Only render in blueprint mode
  if (mode === 'operations' && transitionProgress === 0) return null;

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color('#00d4ff') },
      time: { value: 0 },
      opacity: { value: 0 },
    },
    vertexShader: `
      attribute float lineDistance;
      varying float vLineDistance;

      void main() {
        vLineDistance = lineDistance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float opacity;

      varying float vLineDistance;

      void main() {
        // Animated dash pattern
        float dash = fract(vLineDistance * 0.5 - time);
        dash = step(0.5, dash);

        // Flow direction particles
        float particle = fract(vLineDistance * 2.0 - time * 3.0);
        particle = smoothstep(0.0, 0.1, particle) * smoothstep(0.2, 0.1, particle);

        float alpha = (dash * 0.5 + particle) * opacity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  // Create line geometries
  const linesGeometry = useMemo(() => {
    const positions: number[] = [];
    const distances: number[] = [];

    FLOW_CONNECTIONS.forEach(conn => {
      const start = new THREE.Vector3(...conn.from);
      const end = new THREE.Vector3(...conn.to);
      const length = start.distanceTo(end);

      // Create curved path (bezier-ish)
      const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
      mid.y += 3; // Arc upward

      const segments = 20;
      let accumulatedDist = 0;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Quadratic bezier
        const p = new THREE.Vector3();
        p.x = (1-t)*(1-t)*start.x + 2*(1-t)*t*mid.x + t*t*end.x;
        p.y = (1-t)*(1-t)*start.y + 2*(1-t)*t*mid.y + t*t*end.y;
        p.z = (1-t)*(1-t)*start.z + 2*(1-t)*t*mid.z + t*t*end.z;

        positions.push(p.x, p.y, p.z);
        distances.push(accumulatedDist);

        if (i > 0) {
          const prev = new THREE.Vector3(
            positions[(i-1)*3],
            positions[(i-1)*3+1],
            positions[(i-1)*3+2]
          );
          accumulatedDist += p.distanceTo(prev);
        }
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute(distances, 1));

    return geometry;
  }, []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.opacity.value = transitionProgress;
    }
  });

  return (
    <line geometry={linesGeometry}>
      <primitive object={material} ref={materialRef} attach="material" />
    </line>
  );
};
```

### 3.2 Node Labels at Connection Points

**File:** `src/components/blueprint/BlueprintLabels.tsx`

```tsx
import React from 'react';
import { Text } from '@react-three/drei';
import { useViewModeStore } from '../../stores/viewModeStore';
import { useProductionStore } from '../../stores/productionStore';

interface BlueprintLabel {
  position: [number, number, number];
  text: string;
  data?: string;
}

const LABELS: BlueprintLabel[] = [
  { position: [0, 12, -22], text: 'STORAGE', data: 'ZONE-1' },
  { position: [0, 8, -6], text: 'MILLING', data: 'ZONE-2' },
  { position: [0, 14, 6], text: 'SIFTING', data: 'ZONE-3' },
  { position: [0, 6, 20], text: 'PACKING', data: 'ZONE-4' },
];

export const BlueprintLabels: React.FC = () => {
  const { transitionProgress } = useViewModeStore();

  if (transitionProgress === 0) return null;

  return (
    <group>
      {LABELS.map((label, i) => (
        <group key={i} position={label.position}>
          <Text
            fontSize={1.5}
            color="#00d4ff"
            anchorX="center"
            anchorY="middle"
            fillOpacity={transitionProgress}
            outlineWidth={0.05}
            outlineColor="#001a33"
          >
            {label.text}
          </Text>
          {label.data && (
            <Text
              position={[0, -1.2, 0]}
              fontSize={0.8}
              color="#4a9eff"
              anchorX="center"
              anchorY="middle"
              fillOpacity={transitionProgress * 0.7}
            >
              [{label.data}]
            </Text>
          )}
        </group>
      ))}
    </group>
  );
};
```

---

## Part 4: AI Decision Overlay

### 4.1 Decision Path Visualization

Show AI decision trees as visual connections.

**File:** `src/components/blueprint/DecisionPaths.tsx`

```tsx
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useViewModeStore } from '../../stores/viewModeStore';
import { useProductionStore } from '../../stores/productionStore';

export const DecisionPaths: React.FC = () => {
  const { transitionProgress } = useViewModeStore();
  const machines = useProductionStore((s) => s.machines);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  if (transitionProgress === 0) return null;

  // Find machines with active decisions/issues
  const activeDecisions = useMemo(() => {
    return machines
      .filter(m => m.status === 'warning' || m.status === 'critical')
      .map(m => ({
        position: m.position,
        status: m.status,
      }));
  }, [machines]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      opacity: { value: 0 },
      warningColor: { value: new THREE.Color('#f59e0b') },
      criticalColor: { value: new THREE.Color('#ef4444') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float opacity;
      uniform vec3 warningColor;

      varying vec2 vUv;

      void main() {
        // Pulsing ring
        float dist = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.8, 0.85, dist) * (1.0 - smoothstep(0.95, 1.0, dist));

        // Expanding pulse
        float pulse = fract(time * 0.5);
        float expandRing = smoothstep(pulse - 0.1, pulse, dist) *
                          (1.0 - smoothstep(pulse, pulse + 0.1, dist));
        expandRing *= (1.0 - pulse); // Fade as it expands

        float alpha = (ring + expandRing * 0.5) * opacity;
        gl_FragColor = vec4(warningColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.opacity.value = transitionProgress;
    }
  });

  return (
    <group>
      {activeDecisions.map((decision, i) => (
        <mesh
          key={i}
          position={[decision.position[0], 0.1, decision.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[8, 8]} />
          <primitive object={material.clone()} ref={i === 0 ? materialRef : undefined} attach="material" />
        </mesh>
      ))}
    </group>
  );
};
```

---

## Part 5: Scene Integration

### 5.1 Blueprint Mode Wrapper

**File:** `src/components/blueprint/BlueprintModeLayer.tsx`

```tsx
import React from 'react';
import { useViewModeStore } from '../../stores/viewModeStore';
import { DataFlowNetwork } from './DataFlowNetwork';
import { BlueprintLabels } from './BlueprintLabels';
import { DecisionPaths } from './DecisionPaths';

export const BlueprintModeLayer: React.FC = () => {
  const { mode, transitionProgress } = useViewModeStore();

  // Early exit if fully in operations mode
  if (mode === 'operations' && transitionProgress === 0) {
    return null;
  }

  return (
    <group name="blueprint-layer">
      <DataFlowNetwork />
      <BlueprintLabels />
      <DecisionPaths />
    </group>
  );
};
```

### 5.2 Material Swap System

For existing meshes, swap materials based on mode.

**File:** `src/hooks/useBlueprintMaterial.ts`

```typescript
import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewModeStore } from '../stores/viewModeStore';
import { createSimpleBlueprintMaterial } from '../shaders/blueprintSimple';

/**
 * Hook to swap between normal and blueprint materials.
 * PERFORMANCE: Materials are created once and cached.
 */
export const useBlueprintMaterial = (
  normalMaterial: THREE.Material,
  blueprintColor: string = '#00d4ff'
) => {
  const { transitionProgress } = useViewModeStore();
  const blueprintMat = useRef<THREE.ShaderMaterial | null>(null);

  // Create blueprint material once
  useEffect(() => {
    if (!blueprintMat.current) {
      blueprintMat.current = createSimpleBlueprintMaterial(blueprintColor);
    }
    return () => {
      blueprintMat.current?.dispose();
    };
  }, [blueprintColor]);

  // Update blueprint material opacity
  useEffect(() => {
    if (blueprintMat.current) {
      blueprintMat.current.uniforms.opacity = { value: transitionProgress };
    }
  }, [transitionProgress]);

  // Return appropriate material based on transition
  const material = useMemo(() => {
    if (transitionProgress === 0) return normalMaterial;
    if (transitionProgress === 1) return blueprintMat.current || normalMaterial;

    // During transition, could blend or just switch at 0.5
    return transitionProgress > 0.5
      ? (blueprintMat.current || normalMaterial)
      : normalMaterial;
  }, [transitionProgress, normalMaterial]);

  return material;
};
```

---

## Part 6: Post-Processing Adjustments

### 6.1 Blueprint Mode Post-Processing

**File:** Update `src/components/PostProcessing.tsx`

```tsx
import { useViewModeStore } from '../stores/viewModeStore';

export const PostProcessing: React.FC = () => {
  const graphics = useGraphicsStore((state) => state.graphics);
  const { transitionProgress } = useViewModeStore();

  // Adjust bloom for blueprint mode (more glow on lines)
  const bloomIntensity = 0.6 + transitionProgress * 0.4;
  const bloomThreshold = 0.7 - transitionProgress * 0.3;

  // ... rest of component

  {graphics.enableBloom && (
    <Bloom
      intensity={bloomIntensity}
      luminanceThreshold={bloomThreshold}
      luminanceSmoothing={0.9}
      mipmapBlur
    />
  )}
};
```

---

## Part 7: Performance Optimizations

### 7.1 Lazy Initialization

Only create blueprint resources when mode is first activated:

```typescript
// In BlueprintModeLayer
const [initialized, setInitialized] = useState(false);
const { mode } = useViewModeStore();

useEffect(() => {
  if (mode === 'blueprint' && !initialized) {
    setInitialized(true);
  }
}, [mode, initialized]);

if (!initialized) return null;
```

### 7.2 Throttled Updates

Blueprint animations don't need 60fps:

```typescript
useFrame((state) => {
  // Only update every 2nd frame
  if (Math.floor(state.clock.elapsedTime * 30) % 2 !== 0) return;

  // Update materials...
});
```

### 7.3 LOD for Blueprint Elements

Hide distant blueprint details:

```typescript
const cameraDistance = useThree((state) =>
  state.camera.position.length()
);

// Hide detailed elements when zoomed out
if (cameraDistance > 100) return <SimplifiedBlueprint />;
```

---

## Validation Checklist

- [ ] `npm run build` passes
- [ ] Ctrl+B toggles between modes smoothly
- [ ] Transition animation is 500ms, no jank
- [ ] Data flow lines show factory topology
- [ ] Zone labels appear in blueprint mode
- [ ] Active decisions show pulsing indicators
- [ ] Bloom intensifies appropriately in blueprint mode
- [ ] 60fps maintained in both modes
- [ ] No performance drop during transition
- [ ] Materials properly disposed on unmount

---

## The Impact

When demonstrating:

1. Show normal operations view - "Here's the digital twin running"
2. Press Ctrl+B - dramatic transition to blueprint
3. "And here's what's underneath - the data flows, the decision paths, the architecture"
4. Point out: "Every line, every connection - agents built this visualization layer too"

The toggle becomes a reveal moment. Simple geometry → sophisticated system visualization.
