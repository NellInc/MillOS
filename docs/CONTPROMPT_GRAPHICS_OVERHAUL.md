# Continuation Prompt: MillOS Graphics Overhaul

## Objective

Transform MillOS from "toy-like" to "Bruno Simon quality" visuals while maintaining excellent performance. Focus on maximum visual impact with minimal performance cost.

**Style Reference:** [Bruno Simon's portfolio](https://bruno-simon.com/) - warm, stylized, polished low-poly with excellent lighting.

**Hard Constraints:**
- NO chromatic aberration
- NO film grain
- Must maintain 60fps on medium hardware
- Changes must work across all quality presets (scale appropriately)

---

## Phase 1: Post-Processing Tuning

### 1.1 Enable Effects on Medium+ Quality

**File:** `src/stores/graphicsStore.ts`

Update the `medium` preset to enable key post-processing:

```typescript
medium: {
  // ... existing settings ...

  // ENABLE these (currently false):
  enableSSAO: true,           // Adds depth and contact shadows
  enableBloom: true,          // Emissive glow on lights/indicators
  enableVignette: true,       // Cinematic framing
  enableDepthOfField: false,  // Keep off for medium (performance)

  // KEEP these false:
  enableChromaticAberration: false,  // User requested NO
  enableFilmGrain: false,            // User requested NO
}
```

Update the `high` preset:

```typescript
high: {
  // ... existing settings ...
  enableSSAO: true,
  enableBloom: true,
  enableVignette: true,
  enableDepthOfField: true,   // Enable on high
  enableChromaticAberration: false,  // NO
  enableFilmGrain: false,            // NO
}
```

Update the `ultra` preset similarly (DoF enabled, no CA/grain).

### 1.2 Tune Post-Processing Parameters

**File:** `src/components/PostProcessing.tsx`

Current bloom is too subtle. Adjust for more visible glow on emissive elements:

```tsx
{graphics.enableBloom && (
  <Bloom
    intensity={0.6}           // Was 0.4 - increase for more glow
    luminanceThreshold={0.7}  // Was 0.85 - lower to catch more lights
    luminanceSmoothing={0.9}  // Was 0.8
    mipmapBlur
  />
)}
```

Add subtle, tasteful DoF (not aggressive):

```tsx
{graphics.enableDepthOfField && (
  <DepthOfField
    focusDistance={0.02}     // Was 0.15 - focus closer for factory interior
    focalLength={0.05}       // Was 0.02 - wider focal length
    bokehScale={2}           // Was 1 - slightly more visible bokeh
    height={480}
  />
)}
```

Warmer vignette:

```tsx
{graphics.enableVignette && (
  <Vignette
    offset={0.4}            // Was 0.3 - push edges in slightly more
    darkness={0.4}          // Was 0.5 - softer, less aggressive
    blendFunction={BlendFunction.NORMAL}
  />
)}
```

### 1.3 SSAO Refinement

Make SSAO more visible for better depth perception:

```tsx
{graphics.enableSSAO && (
  <SSAO
    blendFunction={BlendFunction.MULTIPLY}
    samples={graphics.ssaoSamples}
    radius={0.2}              // Was 0.15 - slightly larger radius
    intensity={2.0}           // Was 1.5 - more visible
    luminanceInfluence={0.4}  // Was 0.5 - less brightness dependency
    color={SSAO_COLOR}
    worldDistanceThreshold={40}  // Was 50 - tighter falloff
    worldDistanceFalloff={5}     // Was 8 - sharper falloff
    worldProximityThreshold={0.3}  // Was 0.5
    worldProximityFalloff={0.15}   // Was 0.2
  />
)}
```

---

## Phase 2: Lighting Overhaul

### 2.1 Warmer, More Atmospheric Lighting

**File:** `src/components/MillScene.tsx` (or wherever main lights are defined)

The factory should feel warm, industrial, lived-in. Current lighting is likely too neutral.

**Key Lighting Setup:**

```tsx
// Main directional light (sun/skylights) - warm industrial
<directionalLight
  position={[30, 50, 20]}
  intensity={1.2}
  color="#fff5e6"           // Warm white, not pure white
  castShadow
  shadow-mapSize={[2048, 2048]}
  shadow-camera-far={150}
  shadow-camera-left={-60}
  shadow-camera-right={60}
  shadow-camera-top={60}
  shadow-camera-bottom={-60}
  shadow-bias={-0.001}
/>

// Ambient fill - slightly blue for contrast with warm key
<ambientLight intensity={0.3} color="#e6f0ff" />

// Hemisphere light for natural sky/ground bounce
<hemisphereLight
  skyColor="#87ceeb"        // Sky blue
  groundColor="#8b7355"     // Warm earth tone
  intensity={0.4}
/>
```

### 2.2 Accent/Fill Lights

Add colored accent lights to break up the monotony and create visual interest:

```tsx
// Zone accent lights (place near key machines)

// Silo zone - cool blue industrial
<pointLight position={[0, 8, -22]} intensity={0.5} color="#4a9eff" distance={25} decay={2} />

// Mill zone - warm orange work lights
<pointLight position={[-10, 6, -6]} intensity={0.4} color="#ffa64d" distance={20} decay={2} />
<pointLight position={[10, 6, -6]} intensity={0.4} color="#ffa64d" distance={20} decay={2} />

// Packer zone - clean white
<pointLight position={[0, 5, 20]} intensity={0.5} color="#ffffff" distance={25} decay={2} />
```

### 2.3 Emissive Materials for Status Indicators

Ensure machine status lights are properly emissive so bloom catches them:

```typescript
// In machine materials - make LEDs/indicators bloom-visible
const statusMaterial = new THREE.MeshStandardMaterial({
  color: statusColor,
  emissive: statusColor,
  emissiveIntensity: 2.0,  // High enough to trigger bloom threshold
});
```

---

## Phase 3: Atmospheric Effects

### 3.1 Subtle Fog

**File:** `src/components/MillScene.tsx` or scene setup

Add distance fog for depth and atmosphere:

```tsx
// Inside Canvas or scene setup
<fog attach="fog" args={['#1a1a2e', 60, 200]} />
```

Or use exponential fog for softer falloff:

```tsx
<fogExp2 attach="fog" args={['#1a1a2e', 0.008]} />
```

**Important:** Fog color should match the general ambient/sky tone and shift with time of day if you have a day/night cycle.

### 3.2 Enable Existing Atmospheric Systems

In `graphicsStore.ts`, ensure these are enabled on medium+:

```typescript
medium: {
  enableDustParticles: true,      // Already true
  enableAtmosphericHaze: false,   // KEEP false - causes flickering per CLAUDE.md
  enableVolumetricFog: false,     // KEEP false for medium (performance)
  enableLightShafts: false,       // Enable on high+ only
}

high: {
  enableDustParticles: true,
  enableLightShafts: true,        // God rays through windows
  enableVolumetricFog: true,      // Full atmospheric
}
```

---

## Phase 4: Material Quality Improvements

### 4.1 Better Base Materials

**File:** `src/utils/sharedMaterials.ts` (or wherever MACHINE_MATERIALS is defined)

Improve the procedural materials even before GLB replacement:

```typescript
export const MACHINE_MATERIALS = {
  // Metal housing - more realistic metalness/roughness
  metalHousing: new THREE.MeshStandardMaterial({
    color: '#4a5568',
    metalness: 0.8,
    roughness: 0.35,
    envMapIntensity: 1.0,  // Ensure HDRI reflections show
  }),

  // Painted metal - factory equipment often has colored paint
  paintedMetal: new THREE.MeshStandardMaterial({
    color: '#2563eb',      // Brand blue
    metalness: 0.3,
    roughness: 0.6,
    envMapIntensity: 0.5,
  }),

  // Concrete floor
  concrete: new THREE.MeshStandardMaterial({
    color: '#6b7280',
    metalness: 0.0,
    roughness: 0.9,
  }),

  // Worn/industrial surfaces
  wornMetal: new THREE.MeshStandardMaterial({
    color: '#78716c',
    metalness: 0.6,
    roughness: 0.7,
  }),
};
```

### 4.2 Environment Map (HDRI)

Ensure HDRI environment is loaded and applied to metallic materials:

**File:** `src/components/MillScene.tsx`

```tsx
import { Environment } from '@react-three/drei';

// Inside scene
<Environment
  files="/hdri/warehouse.hdr"  // Already exists in public/hdri/
  background={false}            // Don't replace sky
  environmentIntensity={0.8}    // Subtle reflections
/>
```

---

## Phase 5: Shadow Quality

### 5.1 Improve Shadow Settings

**File:** `src/stores/graphicsStore.ts`

```typescript
medium: {
  shadowMapSize: 2048,        // Was 1024 on medium
  enableContactShadows: true,
  enableHighResShadows: false,
}

high: {
  shadowMapSize: 4096,
  enableContactShadows: true,
  enableHighResShadows: true,
}
```

### 5.2 Contact Shadows Tuning

**File:** `src/components/Environment.tsx` (or wherever ContactShadows is used)

```tsx
<ContactShadows
  position={[0, 0.05, 0]}  // Slightly above floor to prevent z-fighting
  opacity={0.5}            // Subtle, not harsh
  scale={100}
  blur={2}
  far={20}
  resolution={512}         // 256 on low, 512 on medium+
  color="#1a1a2e"          // Dark blue-gray, not pure black
/>
```

---

## Phase 6: Performance Safeguards

### 6.1 Effect Scaling by Quality

Ensure expensive effects scale properly:

| Effect | Low | Medium | High | Ultra |
|--------|-----|--------|------|-------|
| SSAO | Off | 16 samples | 24 samples | 32 samples |
| Shadows | 1024 | 2048 | 4096 | 4096 |
| Bloom | Off | On | On | On |
| DoF | Off | Off | On | On |
| Fog | Simple | Simple | Exp2 | Volumetric |
| Dust Particles | Off | 50 | 200 | 500 |

### 6.2 FPS Monitoring

The existing `FPSTracker` should warn if performance drops. Consider auto-downgrading effects if FPS drops below threshold:

```typescript
// In a performance watchdog hook
if (currentFPS < 30 && graphics.quality !== 'low') {
  console.warn('[Performance] FPS dropped below 30, consider reducing quality');
  // Could auto-disable most expensive effects
}
```

---

## Validation Checklist

After implementing changes:

- [ ] `npm run build` passes
- [ ] Low quality: 60fps, no post-processing artifacts
- [ ] Medium quality: 60fps, SSAO + Bloom + Vignette visible
- [ ] High quality: 60fps, DoF adds subtle cinematic feel
- [ ] No flickering on any quality level
- [ ] Machine status lights glow properly (bloom catches emissives)
- [ ] Scene feels warm and atmospheric, not clinical
- [ ] Fog adds depth without obscuring gameplay
- [ ] No chromatic aberration visible anywhere
- [ ] No film grain visible anywhere

---

## Files to Modify

1. `src/stores/graphicsStore.ts` - Quality presets
2. `src/components/PostProcessing.tsx` - Effect parameters
3. `src/components/MillScene.tsx` - Lighting, fog
4. `src/components/Environment.tsx` - Contact shadows
5. `src/utils/sharedMaterials.ts` - Material definitions

---

## Reference: Bruno Simon Style Characteristics

- Soft, warm lighting with subtle color variation
- Clean but not sterile - slight imperfection
- Emissive accents that glow pleasantly
- Depth through fog and DoF, not harsh shadows
- Cohesive color palette (warm neutrals + accent colors)
- Materials that feel tactile (proper roughness)

The goal is **cozy industrial** - a factory that feels like a place you'd want to spend time in, not a cold CAD render.
