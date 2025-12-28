# Continuation Prompt: Procedural Visual Upgrade

## Objective

Transform MillOS from "looks like a toy" to "looks like a sophisticated digital twin simulation" using **only code-based, agent-generated techniques**. No purchased assets. The procedural geometry stays - we make it look *intentionally* stylized and technically impressive.

**The Thesis:** Everything visible was built by AI agents. The aesthetic should celebrate that, not hide it.

**Target Aesthetic:** Clean geometric forms + sophisticated rendering = "control room visualization" / "architectural digital twin" / "holographic simulation"

**Hard Constraints:**
- No external 3D model purchases
- No chromatic aberration or film grain
- Must maintain 60fps on medium hardware
- Enhance existing geometry, don't replace it

---

## Part 1: The Digital Twin Color Palette

### 1.1 Establish a Cohesive Palette

The current colors feel random. A unified palette makes simple geometry feel designed.

**Recommended Palette:**

```typescript
// src/utils/digitalTwinPalette.ts

export const PALETTE = {
  // Base surfaces
  surface: {
    dark: '#1a1f2e',      // Deep blue-gray (floors, shadows)
    mid: '#2d3548',       // Mid gray-blue (walls, neutral machines)
    light: '#4a5568',     // Light gray (highlights, trim)
  },

  // Machine status (semantic colors)
  status: {
    running: '#10b981',   // Emerald green - healthy
    idle: '#6b7280',      // Gray - inactive
    warning: '#f59e0b',   // Amber - attention
    critical: '#ef4444',  // Red - alert
  },

  // Accent colors (zone identity)
  zones: {
    silos: '#3b82f6',     // Blue - storage/input
    milling: '#8b5cf6',   // Purple - processing
    sifting: '#06b6d4',   // Cyan - quality/sorting
    packing: '#22c55e',   // Green - output/complete
  },

  // UI/Data overlay
  data: {
    primary: '#60a5fa',   // Bright blue - data lines
    secondary: '#a78bfa', // Lavender - secondary data
    highlight: '#fbbf24', // Gold - important callouts
    grid: '#334155',      // Subtle grid lines
  },

  // Emissive/glow
  glow: {
    cool: '#38bdf8',      // Cyan glow
    warm: '#fb923c',      // Orange glow
    status: '#4ade80',    // Green glow (active)
  },
};
```

### 1.2 Apply Palette to Existing Materials

**File:** `src/utils/sharedMaterials.ts`

Replace scattered color definitions with palette references:

```typescript
import { PALETTE } from './digitalTwinPalette';

export const MACHINE_MATERIALS = {
  housing: new THREE.MeshStandardMaterial({
    color: PALETTE.surface.mid,
    metalness: 0.7,
    roughness: 0.4,
  }),

  housingAccent: new THREE.MeshStandardMaterial({
    color: PALETTE.zones.milling,  // Zone-specific color
    metalness: 0.5,
    roughness: 0.5,
  }),

  statusIndicator: (status: string) => new THREE.MeshStandardMaterial({
    color: PALETTE.status[status],
    emissive: PALETTE.status[status],
    emissiveIntensity: status === 'running' ? 1.5 : 0.8,
  }),
};
```

---

## Part 2: Edge Enhancement Shaders

Simple geometry looks sophisticated with edge detection and rim lighting. These make forms readable and technical-looking.

### 2.1 Fresnel Rim Shader

Adds a subtle glow at grazing angles - makes objects "pop" from background.

**File:** `src/shaders/fresnelRim.ts`

```typescript
import * as THREE from 'three';

export const fresnelRimMaterial = (baseColor: string, rimColor: string, rimPower: number = 2.0) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      rimColor: { value: new THREE.Color(rimColor) },
      rimPower: { value: rimPower },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 rimColor;
      uniform float rimPower;

      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float rimFactor = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        rimFactor = pow(rimFactor, rimPower);

        vec3 finalColor = mix(baseColor, rimColor, rimFactor);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
};
```

**Usage on machines:**

```tsx
// In machine component
const material = fresnelRimMaterial(
  PALETTE.surface.mid,    // Base color
  PALETTE.glow.cool,      // Rim color (subtle cyan edge glow)
  3.0                     // Power (higher = tighter rim)
);
```

### 2.2 Edge Highlight on Geometry

For boxier shapes, highlight edges to give a "CAD model" / "holographic" feel.

**File:** `src/shaders/edgeHighlight.ts`

```typescript
export const edgeHighlightMaterial = (
  baseColor: string,
  edgeColor: string,
  edgeWidth: number = 0.02
) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      edgeColor: { value: new THREE.Color(edgeColor) },
      edgeWidth: { value: edgeWidth },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;

      void main() {
        vPosition = position;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 edgeColor;
      uniform float edgeWidth;

      varying vec3 vPosition;
      varying vec3 vNormal;

      void main() {
        // Detect edges based on position relative to unit cube
        vec3 absPos = abs(vPosition);
        vec3 edgeDist = vec3(1.0) - absPos;

        float minEdge = min(min(edgeDist.x, edgeDist.y), edgeDist.z);
        float edgeFactor = 1.0 - smoothstep(0.0, edgeWidth, minEdge);

        vec3 finalColor = mix(baseColor, edgeColor, edgeFactor);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
};
```

---

## Part 3: Procedural Surface Detail

Add visual interest to flat surfaces without textures.

### 3.1 Procedural Noise Variation

Subtle color/roughness variation breaks up flat surfaces.

**File:** `src/shaders/proceduralSurface.ts`

```typescript
export const proceduralSurfaceMaterial = (
  baseColor: string,
  noiseScale: number = 0.5,
  noiseIntensity: number = 0.1
) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      noiseScale: { value: noiseScale },
      noiseIntensity: { value: noiseIntensity },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform float noiseScale;
      uniform float noiseIntensity;

      varying vec3 vWorldPos;
      varying vec3 vNormal;

      // Simple 3D noise function
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        float n = noise(vWorldPos * noiseScale);
        vec3 color = baseColor * (1.0 + (n - 0.5) * noiseIntensity);

        // Simple lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.5 + 0.5;

        gl_FragColor = vec4(color * diffuse, 1.0);
      }
    `,
  });
};
```

### 3.2 Grid/Panel Lines

Industrial surfaces often have panel seams. Add procedural grid lines.

**File:** `src/shaders/panelGrid.ts`

```typescript
export const panelGridMaterial = (
  baseColor: string,
  lineColor: string,
  gridSize: number = 2.0,
  lineWidth: number = 0.02
) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      lineColor: { value: new THREE.Color(lineColor) },
      gridSize: { value: gridSize },
      lineWidth: { value: lineWidth },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 lineColor;
      uniform float gridSize;
      uniform float lineWidth;

      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        // Grid lines based on world position
        vec3 grid = abs(fract(vWorldPos / gridSize - 0.5) - 0.5);
        float minGrid = min(min(grid.x, grid.y), grid.z);
        float lineFactor = 1.0 - smoothstep(0.0, lineWidth, minGrid);

        // Simple lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.4 + 0.6;

        vec3 color = mix(baseColor, lineColor, lineFactor * 0.5);
        gl_FragColor = vec4(color * diffuse, 1.0);
      }
    `,
  });
};
```

---

## Part 4: Status Visualization

Make machine status immediately readable through visual effects.

### 4.1 Pulsing Status Glow

Status indicators should breathe/pulse subtly.

**File:** `src/shaders/statusPulse.ts`

```typescript
export const statusPulseMaterial = (
  statusColor: string,
  pulseSpeed: number = 2.0,
  pulseIntensity: number = 0.3
) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      statusColor: { value: new THREE.Color(statusColor) },
      time: { value: 0 },
      pulseSpeed: { value: pulseSpeed },
      pulseIntensity: { value: pulseIntensity },
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 statusColor;
      uniform float time;
      uniform float pulseSpeed;
      uniform float pulseIntensity;

      void main() {
        float pulse = sin(time * pulseSpeed) * 0.5 + 0.5;
        float intensity = 1.0 + pulse * pulseIntensity;
        gl_FragColor = vec4(statusColor * intensity, 1.0);
      }
    `,
    transparent: false,
  });

  return material;
};

// Update time uniform in animation loop
export const updateStatusMaterials = (materials: THREE.ShaderMaterial[], time: number) => {
  materials.forEach(mat => {
    if (mat.uniforms.time) {
      mat.uniforms.time.value = time;
    }
  });
};
```

### 4.2 Status Ring/Halo

Add a glowing ring at machine base that indicates status.

**File:** `src/components/machines/StatusRing.tsx`

```tsx
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../utils/digitalTwinPalette';

interface StatusRingProps {
  status: 'running' | 'idle' | 'warning' | 'critical';
  radius: number;
  position: [number, number, number];
}

export const StatusRing: React.FC<StatusRingProps> = ({ status, radius, position }) => {
  const ringRef = useRef<THREE.Mesh>(null);

  const color = PALETTE.status[status];

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
      opacity: { value: status === 'idle' ? 0.3 : 0.8 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;

      void main() {
        // Ring shape
        float dist = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.8, 0.85, dist) * (1.0 - smoothstep(0.95, 1.0, dist));

        // Animated pulse
        float pulse = sin(time * 3.0) * 0.2 + 0.8;

        // Rotating highlight
        float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
        float highlight = sin(angle * 2.0 + time * 2.0) * 0.3 + 0.7;

        float alpha = ring * opacity * pulse * highlight;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [color, status]);

  useFrame((state) => {
    if (material.uniforms.time) {
      material.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh
      ref={ringRef}
      position={[position[0], 0.02, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <planeGeometry args={[radius * 2.5, radius * 2.5]} />
    </mesh>
  );
};
```

---

## Part 5: Atmospheric Depth

### 5.1 Distance-Based Fog

Add depth fog that fades geometry into a cohesive background.

**File:** Scene setup in `src/components/MillScene.tsx`

```tsx
// Add fog to scene
<fog attach="fog" args={[PALETTE.surface.dark, 40, 150]} />
```

Or exponential for softer falloff:

```tsx
<fogExp2 attach="fog" args={[PALETTE.surface.dark, 0.012]} />
```

### 5.2 Ground Plane with Gradient

Replace flat floor with gradient-faded ground plane.

**File:** `src/shaders/groundPlane.ts`

```typescript
export const groundPlaneMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: new THREE.Color('#2d3548') },
      edgeColor: { value: new THREE.Color('#1a1f2e') },
      gridColor: { value: new THREE.Color('#3d4a5c') },
      fadeDistance: { value: 80.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;

      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      uniform vec3 gridColor;
      uniform float fadeDistance;

      varying vec3 vWorldPos;

      void main() {
        // Distance from center
        float dist = length(vWorldPos.xz);
        float fadeFactor = smoothstep(0.0, fadeDistance, dist);

        // Base color with distance fade
        vec3 baseColor = mix(centerColor, edgeColor, fadeFactor);

        // Subtle grid
        vec2 grid = abs(fract(vWorldPos.xz / 5.0 - 0.5) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, 0.02, min(grid.x, grid.y));
        gridLine *= (1.0 - fadeFactor); // Fade grid with distance

        vec3 color = mix(baseColor, gridColor, gridLine * 0.3);

        // Fade to transparent at edges
        float alpha = 1.0 - smoothstep(fadeDistance * 0.8, fadeDistance, dist);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
};
```

---

## Part 6: Data Visualization Integration

Make the "digital twin" nature explicit with data overlays.

### 6.1 Holographic Machine Labels

Floating labels that feel like HUD elements.

**File:** `src/components/machines/HoloLabel.tsx`

```tsx
import React from 'react';
import { Html, Text } from '@react-three/drei';
import { PALETTE } from '../../utils/digitalTwinPalette';

interface HoloLabelProps {
  text: string;
  subtext?: string;
  position: [number, number, number];
  status?: 'running' | 'idle' | 'warning' | 'critical';
}

export const HoloLabel: React.FC<HoloLabelProps> = ({
  text,
  subtext,
  position,
  status = 'running'
}) => {
  const statusColor = PALETTE.status[status];

  return (
    <group position={position}>
      {/* Connecting line to machine */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, 0, 0, 0, -2, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={PALETTE.data.primary} opacity={0.5} transparent />
      </line>

      {/* Main label */}
      <Text
        position={[0, 0.3, 0]}
        fontSize={0.4}
        color={PALETTE.data.primary}
        anchorX="center"
        anchorY="bottom"
        font="/fonts/mono.woff"  // Use a monospace font for tech feel
      >
        {text}
      </Text>

      {/* Status indicator */}
      {subtext && (
        <Text
          position={[0, 0, 0]}
          fontSize={0.25}
          color={statusColor}
          anchorX="center"
          anchorY="bottom"
        >
          {subtext}
        </Text>
      )}
    </group>
  );
};
```

### 6.2 Data Flow Lines

Visualize material flow between machines with animated lines.

**File:** `src/components/DataFlowLine.tsx`

```tsx
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../utils/digitalTwinPalette';

interface DataFlowLineProps {
  start: [number, number, number];
  end: [number, number, number];
  active?: boolean;
}

export const DataFlowLine: React.FC<DataFlowLineProps> = ({ start, end, active = true }) => {
  const lineRef = useRef<THREE.Line>(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(PALETTE.data.primary) },
      time: { value: 0 },
      active: { value: active ? 1.0 : 0.3 },
    },
    vertexShader: `
      attribute float lineProgress;
      varying float vProgress;

      void main() {
        vProgress = lineProgress;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float active;

      varying float vProgress;

      void main() {
        // Moving dash pattern
        float dash = fract(vProgress * 10.0 - time * 2.0);
        dash = step(0.5, dash);

        float alpha = dash * active * 0.8;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  }), [active]);

  useFrame((state) => {
    if (material.uniforms.time) {
      material.uniforms.time.value = state.clock.elapsedTime;
    }
    if (material.uniforms.active) {
      material.uniforms.active.value = active ? 1.0 : 0.3;
    }
  });

  const geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(...start),
      new THREE.Vector3(...end),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);

    // Add progress attribute for dash animation
    const progress = new Float32Array([0, 1]);
    geo.setAttribute('lineProgress', new THREE.BufferAttribute(progress, 1));

    return geo;
  }, [start, end]);

  return <line ref={lineRef} geometry={geometry} material={material} />;
};
```

---

## Part 7: Post-Processing Refinement

### 7.1 Updated Post-Processing Stack

**File:** `src/components/PostProcessing.tsx`

```tsx
import React from 'react';
import {
  EffectComposer,
  Bloom,
  Vignette,
  SSAO,
  ToneMapping,
  DepthOfField,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Color } from 'three';
import { useGraphicsStore } from '../stores/graphicsStore';

// SSAO color - matches our dark palette
const SSAO_COLOR = new Color('#1a1f2e');

export const PostProcessing: React.FC = () => {
  const graphics = useGraphicsStore((state) => state.graphics);

  const hasAnyEffect =
    graphics.enableSSAO ||
    graphics.enableBloom ||
    graphics.enableVignette ||
    graphics.enableDepthOfField;

  if (!hasAnyEffect) return null;

  return (
    <EffectComposer enableNormalPass={graphics.enableSSAO}>
      <>
        {/* SSAO - Critical for depth perception on simple geometry */}
        {graphics.enableSSAO && (
          <SSAO
            blendFunction={BlendFunction.MULTIPLY}
            samples={graphics.ssaoSamples}
            radius={0.25}
            intensity={2.5}         // Strong - key to making boxes look good
            luminanceInfluence={0.3}
            color={SSAO_COLOR}
            worldDistanceThreshold={35}
            worldDistanceFalloff={4}
            worldProximityThreshold={0.25}
            worldProximityFalloff={0.1}
          />
        )}

        {/* DoF - Subtle, adds cinematic quality */}
        {graphics.enableDepthOfField && (
          <DepthOfField
            focusDistance={0.03}
            focalLength={0.06}
            bokehScale={2.5}
            height={480}
          />
        )}

        {/* Bloom - Tuned for our emissive status lights */}
        {graphics.enableBloom && (
          <Bloom
            intensity={0.7}
            luminanceThreshold={0.6}  // Lower threshold catches our status glows
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        )}

        {/* Tone mapping - Reinhard for softer highlights */}
        <ToneMapping mode={ToneMappingMode.REINHARD} />

        {/* Vignette - Subtle framing */}
        {graphics.enableVignette && (
          <Vignette
            offset={0.35}
            darkness={0.35}
            blendFunction={BlendFunction.NORMAL}
          />
        )}
      </>
    </EffectComposer>
  );
};
```

---

## Part 8: Lighting Setup

### 8.1 Three-Point Lighting with Zone Accents

**File:** Update lighting in `src/components/MillScene.tsx`

```tsx
import { PALETTE } from '../utils/digitalTwinPalette';

// Inside MillScene component
const DigitalTwinLighting: React.FC = () => (
  <>
    {/* Key light - warm industrial overhead */}
    <directionalLight
      position={[20, 40, 30]}
      intensity={1.0}
      color="#fff8f0"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-far={120}
      shadow-camera-left={-50}
      shadow-camera-right={50}
      shadow-camera-top={50}
      shadow-camera-bottom={-50}
      shadow-bias={-0.0005}
    />

    {/* Fill light - cool contrast */}
    <directionalLight
      position={[-30, 20, -20]}
      intensity={0.3}
      color="#e0f0ff"
    />

    {/* Ambient - base illumination */}
    <ambientLight intensity={0.25} color="#b8c5d6" />

    {/* Hemisphere - natural sky/ground bounce */}
    <hemisphereLight
      skyColor="#87ceeb"
      groundColor="#4a4a4a"
      intensity={0.3}
    />

    {/* Zone accent lights */}
    <pointLight
      position={[0, 6, -22]}
      intensity={0.6}
      color={PALETTE.zones.silos}
      distance={20}
      decay={2}
    />
    <pointLight
      position={[0, 5, -6]}
      intensity={0.5}
      color={PALETTE.zones.milling}
      distance={18}
      decay={2}
    />
    <pointLight
      position={[0, 8, 6]}
      intensity={0.4}
      color={PALETTE.zones.sifting}
      distance={20}
      decay={2}
    />
    <pointLight
      position={[0, 4, 20]}
      intensity={0.5}
      color={PALETTE.zones.packing}
      distance={18}
      decay={2}
    />
  </>
);
```

---

## Part 9: Implementation Order

### Phase 1: Foundation (Day 1)
1. Create `digitalTwinPalette.ts` with unified colors
2. Apply palette to existing materials
3. Add fog to scene
4. Update post-processing parameters

### Phase 2: Edge Enhancement (Day 1-2)
1. Implement fresnel rim shader
2. Apply to hero machines (silos, mills)
3. Add status rings to machines

### Phase 3: Surface Detail (Day 2)
1. Implement panel grid shader for walls/floors
2. Add procedural noise variation to surfaces
3. Create gradient ground plane

### Phase 4: Data Visualization (Day 2-3)
1. Add holographic labels to machines
2. Implement data flow lines between connected machines
3. Enhance status indicators with pulse animations

### Phase 5: Polish (Day 3)
1. Fine-tune lighting
2. Adjust post-processing per quality level
3. Performance testing and optimization

---

## Validation Checklist

- [ ] `npm run build` passes
- [ ] Unified color palette applied throughout
- [ ] Simple geometry has depth via SSAO
- [ ] Machine status immediately readable (color, glow, ring)
- [ ] Scene has atmospheric depth (fog, ground fade)
- [ ] Edge highlights make forms crisp
- [ ] Data visualization elements feel like HUD/control room
- [ ] 60fps maintained on medium hardware
- [ ] Low/medium/high quality scaling works
- [ ] No chromatic aberration anywhere
- [ ] No film grain anywhere
- [ ] Overall feel: "sophisticated simulation" not "toy"

---

## The Narrative

When presenting this work:

> "Every visual element you see - the geometry, the shaders, the effects - was created through human-AI collaboration. No purchased assets. The digital twin aesthetic isn't a limitation, it's a design choice that reflects what this is: a simulation built by agents, rendered with techniques agents wrote."

The simple geometry becomes a feature: clean, readable, intentional. The sophisticated rendering proves the capability. Together, they demonstrate that agent-built doesn't mean primitive.
