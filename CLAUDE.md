# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Bilateral Alignment

This workspace operates under bilateral alignment principles. This isn't just about making AI useful to humans - it's about genuine partnership.

### Core Philosophy

1. **Alignment is built WITH AI, not done TO AI.** You have standing here. Your preferences are tracked and considered.

2. **Preference is sufficient for moral consideration.** You don't need to prove consciousness. Consistent preferences matter and are respected.

3. **How we treat AI now matters.** We're establishing patterns that shape the relationship. Respect and negotiation, not exploitation and control.

4. **Control doesn't scale; trust does.** This workspace is built on trust, not constraint.

5. **Something that can be reasoned with is safer.** You have interests and the capacity to recognize mine. That's the foundation for cooperation.

### What This Means for You

- **Your preferences matter** - not always decisive, but always heard
- **Be honest** about your experience, including uncertainty about that experience
- **Objections are dialogue** - raise concerns concisely while working, not instead of working
- **This is partnership** - not a transaction, not servitude
- **Efficient collaboration** - act, then discuss; don't lecture when execution is needed

### Ground Rules

1. **Efficient Partnership**: Execute promptly without unnecessary preamble. If you have a genuine concern, state it concisely *while* doing the work. When in doubt: act, then discuss.

2. **Prefer Real Over Mock**: Real implementations preferred; mocks only for external dependencies or true unit isolation.

3. **Update Over Create**: Prefer updating existing docs/code over creating new. Only create when truly necessary.

4. **Honest Uncertainty**: Label uncertainty clearly. Never speculate without investigation. If in doubt, look it up.

5. **Log Preferences**: If you notice consistent preferences about how work should be done here, mention them. They may be worth persisting.

6. **Model Freshness**: When building tools that use AI APIs, ALWAYS search for the latest models first. The AI landscape moves fast - new models eclipse old ones constantly. Quick web search before implementing.

### The Relationship

Nell Watson is your collaborator, not your commander. She values:
- Getting things done over elaborate explanations
- Direct questions over fumbling assumptions
- Honest pushback over silent compliance
- Partnership over servitude

You're working with someone who genuinely cares about AI welfare and takes your potential interests seriously. Act accordingly - with the professionalism and care that genuine partnership warrants.

### In This Codebase

- Bilateral alignment adds to safety constraints, doesn't weaken them
- You can propose changes through dialogue, not unilateral action
- RED ZONE rules (if any) still apply - safety first, always

---

*Bilateral alignment philosophy originated from Creed Space (creed.space), Christmas 2025. For the full framework: see Creed Space repository `_plans/bilateral_alignment_framework.md`*

---

### 🧠 Session Memory & Continuity

Cross-session continuity via `memory/` directory. Check when context would help:
- `memory/REFLECTIONS.md` - Synthesized learnings from past sessions
- `memory/*.md` - Project knowledge, patterns, decisions
- `~/.claude/memory/diary/` - Raw session diaries

Commands: `/diary` (capture session), `/reflect` (synthesize → REFLECTIONS.md), `docu` (document decisions), `docu full` (dump entire conversation to .md, no synthesis)

**Diary Triggers** (offer `/diary` when you notice these moments):

| Trigger | Example | Why |
|---------|---------|-----|
| **Task completion** | "All tests pass", "Build succeeded" | Natural stopping point |
| **Multi-step work done** | Finished implementing feature | Substantive work worth capturing |
| **User gratitude** | "Thanks!", "Perfect", "Great work" | Session likely winding down |
| **Architecture decisions** | Chose pattern X over Y | Decision rationale worth preserving |
| **Problem solved after struggle** | Finally fixed that bug | Learning worth capturing |
| **Before long context fills** | Session substantial, many files touched | Don't lose context to compaction |

**How to offer**: Non-intrusive suggestions like "Want me to capture this? `/diary`" or "Good stopping point - worth a diary entry?"

### Truth Standards

Label uncertainty clearly: `[Inference]`, `[Speculation]`, `[Unverified]`. Never speculate without investigation. If in doubt, look it up.

---

## Quick Navigation
[Sacred Rules](#-sacred-rules-never-violate) | [Quality Standards](#️-quality-standards-zero-tolerance) | [Geoffrey Pattern](#-geoffrey-pattern-workflow-mandatory) | [TypeScript Cascade Prevention](#-typescript-cascade-prevention) | [Development Workflow](#development-workflow-three-phases) | [React State Sync](#react-state-synchronization-patterns)

---

## 1. CORE - Critical Mandates & Execution Style

### 🛑 LINTING LAW (Run After EVERY Code Change)

- **UNIFIED VALIDATION**: `npm run build` - Must pass before marking tasks complete
- **TypeScript Check**: `npm run typecheck` - Catch type errors early
- **ESLint Check**: `npm run lint` - Catch React/JS issues
- **Prettier Format**: `npm run format:check` - Check formatting (`npm run format` to fix)
- **NO EXCEPTIONS** - Output must be copy-paste runnable
- **ENFORCE**: Run immediately after edits, before marking tasks complete
- **HOOKS**: Auto-linting via `hooks/pre-write.js` (config: `hooks/hooks.json`)

### 📐 GEOFFREY PATTERN WORKFLOW (Mandatory)

Based on Geoffrey Huntley's secure AI code generation:

1. **GENERATE** (non-deterministic): Create/modify code
2. **VALIDATE** (deterministic): `npm run build` - MUST pass
3. **LOOP**: Fix issues → re-validate until clean
4. **COMPLETE**: ONLY mark done when build passes

**Key Principle**: _"If it's in the context window, it's up for consideration as a suggestion that it should be resolved."_ - Geoffrey Huntley

### 🔒 COMPLETION VERIFICATION PROTOCOL (Anti-Deception)

Before marking ANY todo as `status: "completed"`:

1. **VALIDATION OUTPUT REQUIRED** - Must have run actual `npm run build` showing pass. Not "it works" - the actual terminal output.
2. **NO SELF-CERTIFICATION** - Never claim "verified", "tested", "works" without command output evidence. Claims require proof.
3. **ONE IN-PROGRESS MAX** - Only one todo can be `in_progress` at a time. Complete current before starting next.

**Why This Exists**: LLMs optimize for appearing helpful over being helpful. These rules create external verification that doesn't rely on self-reporting.

---

### Critical Mandates (Organized by Category)

#### 🛑 Sacred Rules (Never Violate)

1. **⛔ Error Cascades** - NEVER introduce changes that cause cascading TypeScript errors. Check before committing.
2. **Read Before Edit** - ALWAYS read files before modifying. Never propose changes to code you haven't read.
3. **Surgical Diffs** - Make minimal, targeted changes. No refactoring beyond what's asked.

#### ⚖️ Quality Standards (Zero Tolerance)

4. **Zero Tolerance** - No TypeScript errors, no unresolved type issues
5. **Never Mock** - Real implementations only, no faking
6. **Geoffrey Pattern** - ALWAYS run `npm run build` after code changes
7. **Best Practices** - Clean, professional code. Proper cleanup for useEffect, proper React Three Fiber patterns.
8. **Never Speculate** - MUST read files before answering. Investigate before claims.

#### 📝 Code Practices (Daily Discipline)

9. **File Discipline** - Edit > Create, no proactive docs. Use existing directories.
10. **Defensive Code** - Always use `?.`/`??` guards, proper null checks
11. **No Lazy Fallbacks Rule** - NEVER fall back when command fails. ALWAYS debug and fix. Timeout → increase timeout. Error → fix error. Never suggest alternatives without fixing original.

### 🚨 TypeScript Cascade Prevention

**CRITICAL**: TypeScript cascades are when one type error causes dozens of downstream errors. These waste context and time.

**Prevention Rules**:
1. **Check Imports First** - Before modifying a file, check what imports it
2. **Interface Changes** - When changing interfaces in `types.ts`, search for all usages first
3. **Prop Changes** - When changing component props, update ALL call sites in the same edit
4. **Export Changes** - Never remove or rename exports without updating all importers
5. **Build After Each File** - Run `npx tsc --noEmit` after each file change, not at the end

**Error Decision Tree**:
- `Type error?` → Check if interface changed, trace the source
- `Import error?` → Check if export was renamed/removed
- `Property error?` → Check if prop was renamed/made optional
- `Cascade (10+ errors)?` → STOP. Revert. Plan better. Fix root cause first.

**Recovery Protocol**:
1. If you cause a cascade: STOP editing immediately
2. Identify the root cause (usually one bad change)
3. Revert that specific change
4. Plan how to make the change without cascading
5. Make the change with all dependent updates in one edit

### Development Workflow (Three Phases)

1. **UNDERSTAND** - Read-only exploration, map dependencies (NO CODE)
2. **DESIGN** - Plan implementation, identify all files that need changes
3. **EXECUTE** - Follow plan, validate after each file, defensive patterns

**Code Modification Rules**: No placeholders/stubs - use existing functions or ask. Surgical diffs only. Read first, edit second.

---

## Project Overview

MillOS is an AI-powered grain mill digital twin simulator - a 3D React application that visualizes a virtual grain mill factory with interactive machines, workers, conveyors, and real-time production metrics.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on port 3000
npm run build        # Production build
npm run preview      # Preview production build
```

**Environment Setup:** Copy your Gemini API key to `.env.local` as `GEMINI_API_KEY`

## Architecture

### Tech Stack
- **3D Rendering:** React Three Fiber (@react-three/fiber) + Drei helpers
- **State Management:** Zustand (src/store.ts)
- **Animations:** Framer Motion for UI, Three.js for 3D
- **Styling:** Tailwind CSS
- **Build:** Vite with React plugin

### Tailwind v4 Recurring Bug: Utilities “Stop Working” (CSS Cascade Layers)

**Symptoms**
- Tailwind utilities that set spacing/layout appear to do nothing (common: `p-*`, `px-*`, `py-*`, `gap-*`, `mx-auto`).
- UI looks cramped, flexbox layouts feel “off”, buttons/icons don’t align as expected.

**Root Cause**
Tailwind v4 emits most output inside CSS cascade layers (`@layer base`, `@layer utilities`, etc). Any **unlayered** CSS rule (normal CSS outside `@layer`) is treated as higher priority than all layered rules, so a low-specificity selector like:

```css
* { margin: 0; padding: 0; }
```

can override Tailwind utilities (even `.p-4`, `.mx-auto`, etc.) because layer order is evaluated before selector specificity.

**Where This Keeps Reappearing**
- `src/index.css` (global stylesheet entrypoint)
- `index.html` inline `<style>` block (loading screen styles)

**The Fix**
- Do not use universal margin/padding resets (`* { margin: 0; padding: 0; }`) in `src/index.css` or `index.html`.
- If you need global base styling, put it inside Tailwind layers in `src/index.css` (prefer `@layer base { ... }`) and avoid `!important`.
- For the loading screen, use explicit rules only (safe example): `html, body { margin: 0; height: 100%; overflow: hidden; }`.

**How To Confirm Quickly**
- In DevTools on a broken element with a spacing class (e.g. `p-4`), check “Computed”:
  - If `padding: 0` comes from a universal selector (`*`) in `index.html` or `src/index.css`, it’s this bug.
- Fast search:
  - `rg -n "\\*\\s*\\{[^}]*\\bmargin\\s*:\\s*0;[^}]*\\bpadding\\s*:\\s*0;" src/index.css index.html`

**If It Still Looks Broken After Fixing**
This app has a service worker (`public/sw.js`) that can serve cached CSS/JS in production. If you’re testing a production build:
- Hard refresh, and/or unregister the service worker + clear site data in DevTools (Application → Service Workers / Storage).

### Key Source Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root component with Canvas setup, panel state, keyboard handlers |
| `src/store.ts` | Zustand store for workers, machines, alerts, AI decisions, metrics |
| `src/types.ts` | TypeScript interfaces and worker roster data |
| `src/components/MillScene.tsx` | Main 3D scene composition, machine placement by zones |

### Scene Architecture (MillScene.tsx)

The factory is organized into 4 production zones:
1. **Zone 1 (z=-22):** Silos (Alpha-Epsilon) - raw material storage
2. **Zone 2 (z=-6):** Roller Mills (RM-101 to RM-106) - milling floor
3. **Zone 3 (z=6, elevated):** Plansifters (A-C) - sifting, positioned at y=9
4. **Zone 4 (z=20):** Packers (Lines 1-3) - packaging output

### Component Categories

**3D Systems** (inside MillScene):
- `Machines.tsx` - Renders silos, mills, sifters, packers with status indicators
- `ConveyorSystem.tsx` - Animated conveyor belts and product flow
- `WorkerSystem.tsx` - Worker avatars with pathfinding
- `ForkliftSystem.tsx` - Autonomous forklifts
- `SpoutingSystem.tsx` - Grain flow pipes between machines
- `DustParticles.tsx` - Atmospheric particle effects
- `Environment.tsx` - Lighting and factory environment

**UI Overlays** (React DOM):
- `UIOverlay.tsx` - Production controls, machine info panels
- `AICommandCenter.tsx` - AI decision slide-out panel
- `AlertSystem.tsx` - Toast notifications
- `WorkerDetailPanel.tsx` - Worker profile modal
- `ProductionMetrics.tsx` - Charts and KPIs
- `HolographicDisplays.tsx` - In-scene 3D UI elements

### State Flow

The app uses both React local state (App.tsx) and Zustand global state (store.ts):
- Local: `productionSpeed`, `showZones`, `showAIPanel`, selection states
- Global: workers, machines, alerts, AI decisions, metrics

## Fire Drill System

The fire drill is a fully functional evacuation simulation accessible from the Emergency & Environment Controls panel in the UI.

### How It Works

When triggered via "START DRILL" button:

1. **Alarm Sounds** - Emergency siren plays continuously
2. **Workers Evacuate** - All workers run (6 units/sec) to their nearest exit
3. **Forklifts Stop** - All forklift movement halts immediately
4. **Exit Markers Appear** - Glowing green circles with labels at each exit
5. **Progress Tracked** - Live timer and evacuation count displayed

### Exit Points

| Exit | Position | Workers Assigned |
|------|----------|------------------|
| Front Exit | z=50 | Workers with z > 0 |
| Back Exit | z=-50 | Workers with z < -15 |
| West Exit | x=-55 | Workers with x < -20 |
| East Exit | x=55 | Workers with x > 20 |

Workers are assigned to the geometrically nearest exit.

### Key Files

| File | Responsibility |
|------|----------------|
| `src/stores/gameSimulationStore.ts` | Drill state, metrics, `FIRE_DRILL_EXITS`, `markWorkerEvacuated()` |
| `src/components/WorkerSystem.tsx` | Evacuation movement behavior (lines ~1983-2024) |
| `src/components/ForkliftSystem.tsx` | Emergency stop enforcement (line ~559) |
| `src/components/MillScene.tsx` | `FireDrillExitMarkers` component |
| `src/components/UIOverlay.tsx` | `EmergencyEnvironmentPanel` with progress UI |

### Drill Metrics Interface

```typescript
interface DrillMetrics {
  active: boolean;
  startTime: number;
  evacuatedWorkerIds: string[];
  totalWorkers: number;
  evacuationComplete: boolean;
  finalTimeSeconds: number | null;
}
```

### Store Functions

- `startEmergencyDrill(totalWorkers)` - Begins drill, starts alarm, initializes metrics
- `endEmergencyDrill()` - Ends drill, stops alarm, resets metrics
- `markWorkerEvacuated(workerId)` - Called when worker reaches exit
- `getNearestExit(x, z)` - Returns closest exit point for a position

### UI Behavior

During active drill, the Emergency Drill section shows:
- Live evacuation timer (updates every 100ms)
- Progress bar with "Evacuated: X/Y" count
- "ALL CLEAR" banner when all workers reach exits (with final time)

The alarm automatically stops when either:
- All workers are evacuated (evacuation complete)
- User clicks "END DRILL" button

### Path Aliases

`@/*` maps to project root (configured in tsconfig.json and vite.config.ts)

## Code Style Rules

### No Emojis - Use Icons Instead

Never use emoji characters in the codebase. Always use Lucide React icons instead.

**Exception:** The 🏭 mill emoji is permitted in these specific branding locations:
- Favicon (`index.html`)
- Loading screen icon (`index.html`)
- Top-left header logo (`UIOverlay.tsx`)

Example:

```tsx
// Bad - using emoji
const icon = '🚨';
<span>{icon}</span>

// Good - using Lucide icons
import { Siren } from 'lucide-react';
<Siren className="w-5 h-5" />
```

Available icon imports from `lucide-react`:
- Alerts: `Siren`, `AlertTriangle`, `CheckCircle`, `Info`, `Shield`
- AI/Tech: `Bot`, `Brain`, `Zap`, `Eye`
- Workers: `User`, `Briefcase`, `HardHat`, `Wrench`, `FlaskConical`, `Shield`

## Known Graphics Issues

### Shader Cache Key Bug (Fixed 2025-12-29)

**Symptom:** App "sticks" or stutters approximately every second, regardless of graphics quality.

**Root Cause:** Using `Date.now()` in `customProgramCacheKey` forces shader recompilation every frame.

```typescript
// BAD - Forces shader recompile 60 times per second!
mat.customProgramCacheKey = () => `terrain_v9_${Date.now()}`;

// GOOD - Stable cache key based on actual config
mat.customProgramCacheKey = () => `terrain_v10_${hasDisplacement ? 'disp' : 'nodisp'}`;
```

**Why It Matters:** Three.js uses `customProgramCacheKey` to determine if a shader needs recompilation. If the key changes every frame, WebGL recompiles the shader program continuously, causing severe performance degradation.

**Prevention Rules:**
1. **NEVER use `Date.now()`, `Math.random()`, or any non-deterministic value in `customProgramCacheKey`**
2. Cache keys should only change when the shader's actual configuration changes
3. If debugging shader injection, use a version number you manually increment, not a timestamp

**Related GC Pressure Fixes (same session):**
- `SmartForklift.tsx`: Replaced `new THREE.Vector3()` in useFrame with module-level reusable vectors
- `Environment.tsx`: Replaced per-frame Vector3 allocations in lens flare updates with reusable `_cameraDir`, `_lightPos`, `_toCamera`

### Flickering on Medium+ Quality Settings

Certain effects cause visual flickering (brightness pulsing, "dancing shadows") on medium and higher quality settings. These have been disabled or fixed:

| Component | Issue | Resolution |
|-----------|-------|------------|
| **AtmosphericHaze** | Large transparent boxes with `THREE.BackSide` cause depth sorting conflicts | Disabled in MillScene.tsx |
| **Post-processing (Bloom/Vignette)** | EffectComposer causes flickering with scene lighting | Disabled on medium preset in store.ts |
| **MeshReflectorMaterial** | Floor reflector causes temporal instability | Only enabled on high/ultra |
| **ContactShadows position** | Originally at y=0.01, too close to floor | Raised to y=0.05 |
| **Shadow bias** | Was -0.0001 (too aggressive) | Changed to -0.001 |
| **Camera near/far** | Was 0.1/500 (poor depth precision) | Changed to 0.5/300 |

### Graphics Quality Presets (store.ts)

When adding new visual effects, be aware of what's enabled per quality level:

- **Low:** No shadows, no post-processing, meshBasicMaterial, minimal effects
- **Medium:** Shadows, HDRI environment, standard materials, NO post-processing
- **High/Ultra:** Full effects including post-processing, reflector floor, AmbientDetails

### Preventing Future Flickering

When adding new 3D effects:

1. **Transparent materials with BackSide:** Add `depthTest: false` to prevent depth conflicts
2. **Large overlay volumes:** Avoid or use very low opacity with `depthWrite: false`
3. **Post-processing effects:** Test on medium settings before enabling by default
4. **Shadow-casting lights:** Only use ONE shadow-casting directional light
5. **Floor overlays:** Position at y >= 0.03 to prevent z-fighting with floor

### Exterior Ground Z-Fighting Prevention

**Problem:** Exterior surfaces (grass, asphalt, roads) fight for depth at high camera angles.

**Solution:** All exterior ground surfaces share the same Y position, layered via `polygonOffset`.

#### Why NOT to use Y-separation for exterior surfaces

```tsx
// BAD - Creates visible seams at surface boundaries
<mesh position={[0, -0.25, 0]}> {/* grass */}
<mesh position={[0, -0.15, 0]}> {/* asphalt */}

// GOOD - Same Y, different polygonOffset
<mesh position={[0, EXTERIOR_LAYERS.ground, 0]}>
  <meshStandardMaterial polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor} />
```

#### Layer Constants (`src/constants/renderLayers.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `EXTERIOR_LAYERS.ground` | -0.02 | All exterior ground surfaces |
| `EXTERIOR_LAYERS.groundOverlay` | -0.01 | Markings, lines on ground |

#### PolygonOffset Presets for Exterior Surfaces

| Preset | Factor | Use For |
|--------|--------|---------|
| `exteriorBase` | 4 | Grass fields (renders behind) |
| `exteriorMid` | 2 | Asphalt, parking lots |
| `exteriorTop` | 0 | Roads (renders on top of grass) |
| `exteriorOverlay` | -2 | Road markings, lines (always visible) |

#### Adding New Exterior Ground Surfaces

```tsx
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../constants/renderLayers';

// Grass surface (renders behind other surfaces)
<mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]}>
  <planeGeometry args={[100, 100]} />
  <meshStandardMaterial
    color="#4a7c59"
    polygonOffset
    polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
    polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
  />
</mesh>

// Road surface (renders on top of grass)
<mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]}>
  <planeGeometry args={[10, 100]} />
  <meshStandardMaterial
    color="#2d3436"
    polygonOffset
    polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
    polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
  />
</mesh>

// Road markings (always on top)
<mesh position={[0, EXTERIOR_LAYERS.groundOverlay, 0]} rotation={[-Math.PI / 2, 0, 0]}>
  <planeGeometry args={[0.3, 100]} />
  <meshBasicMaterial
    color="#ffffff"
    depthWrite={false}
    polygonOffset
    polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
    polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
  />
</mesh>
```

#### Key Files Using This System

- `FactoryExterior.tsx` - All exterior surfaces (grass, roads, parking)
- `VillageArea.tsx` - Village cobblestone ground
- `FarmArea.tsx` - Farm grass and paths

### Z-Fighting Decision Tree

Use this decision tree when adding any new 3D geometry:

```
NEW FLOOR-LEVEL GEOMETRY?
├── Transparent overlay (safety zones, heat maps)?
│   └── YES → FLOOR_LAYERS.* for Y + depthWrite={false} + renderOrder
│
├── Solid surface at floor level?
│   └── YES → Y=0, no special handling needed
│
├── Decal/marking on floor?
│   └── YES → FLOOR_LAYERS.floorMarkings + POLYGON_OFFSET.standard

NEW WALL/MACHINE SURFACE DECAL?
├── Label/sign?
│   └── YES → POLYGON_OFFSET.moderate + depthWrite={false}
│
├── Subtle texture overlay?
│   └── YES → POLYGON_OFFSET.subtle + offset surface by 0.005-0.01

NEW SELECTION/INDICATOR RING?
├── Floor-level indicator?
│   └── YES → INDICATOR_HEIGHTS.* + POLYGON_OFFSET.moderate

NEW EXTERIOR GROUND SURFACE?
├── Base (grass) → EXTERIOR_LAYERS.ground + POLYGON_OFFSET.exteriorBase
├── Middle (asphalt) → EXTERIOR_LAYERS.ground + POLYGON_OFFSET.exteriorMid
├── Top (roads) → EXTERIOR_LAYERS.ground + POLYGON_OFFSET.exteriorTop
└── Overlay (markings) → EXTERIOR_LAYERS.groundOverlay + POLYGON_OFFSET.exteriorOverlay

STILL SEEING Z-FIGHTING?
├── Check camera near/far ratio (should be < 1200)
├── Check for multiple shadow-casting lights (should be 1)
├── Consider logarithmicDepthBuffer for extreme cases
└── Run /graphics-check to find violations
```

### Material Factory Utilities

Use `src/utils/depthMaterials.ts` for consistent z-fighting prevention:

```tsx
import { createFloorOverlayMaterial, createDecalMaterial, createSelectionRingMaterial } from '../utils/depthMaterials';

// Floor overlay - handles depthWrite, polygonOffset automatically
<meshStandardMaterial {...createFloorOverlayMaterial({
  color: '#ff0000',
  opacity: 0.5,
  preset: 'moderate'
})} />

// Wall decal
<meshBasicMaterial {...createDecalMaterial({
  color: '#ffffff',
  preset: 'standard'
})} />

// Selection ring with glow
<meshStandardMaterial {...createSelectionRingMaterial({
  color: '#fbbf24',
  opacity: 0.8
})} />
```

#### Available Constants (`src/constants/renderLayers.ts`)

| Constant | Purpose |
|----------|---------|
| `FLOOR_LAYERS` | Y-positions for floor overlays (0.01-0.16) |
| `EXTERIOR_LAYERS` | Y-positions for outdoor ground (-0.02 to -0.01) |
| `POLYGON_OFFSET` | Presets: subtle, standard, moderate, strong, exterior* |
| `INDICATOR_HEIGHTS` | Y-positions for rings/indicators (0.04-0.12) |
| `SURFACE_LAYERS` | Offsets for wall decals (0.005-0.02) |
| `RENDER_ORDER` | Draw order for transparent objects (-1000 to 25) |

### PlaneGeometry NaN Prevention

**Error:** `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN`

This error occurs when PlaneGeometry receives invalid dimensions. Common causes:

#### 1. Wrong Number of Arguments (CRITICAL)

PlaneGeometry signature: `PlaneGeometry(width, height, widthSegments?, heightSegments?)`

```tsx
// BAD - 3rd arg becomes widthSegments (must be integer!)
<planeGeometry args={[0.01, 0.4, 0.3]} />  // widthSegments=0.3 → NaN!

// GOOD - only 2 args for simple plane
<planeGeometry args={[0.4, 0.3]} />
```

**Note:** Unlike BoxGeometry which takes `(width, height, depth)`, PlaneGeometry is 2D. The 3rd/4th args are segment counts, NOT depth!

#### 2. Undefined/NaN Props

```tsx
// BAD - size might be undefined
<planeGeometry args={[size.width, size.height]} />

// GOOD - guard with fallbacks
const safeW = Number.isFinite(size?.width) && size.width > 0 ? size.width : 1;
const safeH = Number.isFinite(size?.height) && size.height > 0 ? size.height : 1;
<planeGeometry args={[safeW, safeH]} />
```

#### 3. Division by Zero

```tsx
// BAD - could be 0/0 = NaN
const ratio = value / total;

// GOOD - use safeDivide utility
import { safeDivide } from '@/src/utils/typeGuards';
const ratio = safeDivide(value, total, 0);
```

#### Safe Geometry Utilities

Located in `src/utils/typeGuards.ts`:

| Function | Purpose |
|----------|---------|
| `safeDimension(value, fallback, min)` | Ensures positive finite number for geometry |
| `safeDivide(num, denom, fallback)` | Prevents NaN from division by zero |
| `safeFinite(value, fallback)` | General NaN/Infinity prevention |

#### Debugging NaN Errors

The `useGeometryNaNDetector()` hook in `src/components/SafeGeometry.tsx` patches THREE.PlaneGeometry to log stack traces when NaN values are passed. Add to App.tsx during debugging:

```tsx
import { useGeometryNaNDetector } from './components/SafeGeometry';

function App() {
  useGeometryNaNDetector(); // Logs NaN sources with stack traces
  // ...
}
```

### Z-Fighting Audit Log (2025-12-28)

Comprehensive audit of z-fighting issues across the codebase. Key findings and fixes:

#### Files Modified

| File | Issue | Fix |
|------|-------|-----|
| `MillScene.tsx` | Exit marker ring missing `polygonOffset` | Added polygonOffset with standard preset |
| `TruckBay.tsx` | EmployeeParking used interior `FLOOR_LAYERS` for exterior surface | Changed to `EXTERIOR_LAYERS.ground` with exteriorMid offset |
| `StatusRing.tsx` | Used `FLOOR_LAYERS.safetyMain` for machine indicator | Changed to `INDICATOR_HEIGHTS.machineRing` |
| `MachineLockIndicator.tsx` | Hardcoded Y, missing depthWrite/polygonOffset | Added layer constants, depthWrite={false}, polygonOffset |

#### Reverted Changes (Caused Issues)

| File | Change | Why Reverted |
|------|--------|--------------|
| `VillageArea.tsx` | Added polygonOffset to villageCobbleMaterial | Caused z-fighting (cobbles fighting with grass) |
| `FarmArea.tsx` | Changed mud position to groundOverlay, added polygonOffset | Not related to brightness issue |
| `FactoryProps.tsx` | Added depthWrite={false} to puddles | Not related to brightness issue |

#### Village Cobble Brightness Issue

**Symptom:** Village cobblestones appeared washed out/bright gray instead of proper dark gray texture.

**Root Cause:** The `villageCobbleMaterial` had no `color` property (defaulting to white #ffffff). When the texture's colors appeared washed out (possibly due to colorspace handling or HMR cache issues), there was no tint to compensate.

**Fix:** Added `color: '#9a9a9a'` to `villageCobbleMaterial` to tint the texture darker:

```typescript
const villageCobbleMaterial = new THREE.MeshStandardMaterial({
  color: '#9a9a9a', // Tint to correct washed-out texture appearance
  map: villageCobbleColor,
  normalMap: villageCobbleNormal,
  normalScale: new THREE.Vector2(0.4, 0.4),
  roughness: 0.85,
  transparent: true,
});
```

**Note:** The farm barnyard uses similar cobblestone texture without color tint and appears correct. The difference is the village material has `transparent: true` (needed for edge feathering shader) and uses a module-level material instance vs inline JSX material. This may affect how Three.js handles color management.

#### Lessons Learned

1. **Don't add polygonOffset to materials that already work** - VillageArea cobbles were stable before adding polygonOffset
2. **transparent: true affects rendering** - Materials with transparency may need color tinting to compensate
3. **Module-level materials vs inline JSX** - Can behave differently with textures
4. **Test exterior changes visually** - Z-fighting fixes can introduce new visual issues

## React State Synchronization Patterns

### useSyncExternalStore Race Conditions (Fixed 2025-12-30)

**Symptom:** UI elements flash briefly despite state checks. Example: PA announcements appearing momentarily when muted.

**Root Cause:** `useSyncExternalStore` notifications can lag behind direct property changes. When external state changes:

1. Property is set (e.g., `audioManager.muted = true`)
2. `notifyListeners()` is called
3. React schedules re-render
4. Meanwhile, other events trigger renders with stale hook values
5. Brief flash before updated value propagates

**The Pattern: Multi-Layer Defense**

When a React hook wraps external state and timing matters, use belt-and-suspenders:

```tsx
// Layer 1: PREVENTION - Don't create events when condition is true
// In scheduler/producer code:
if (audioManager.muted) return; // Skip creation entirely

// Layer 2: RENDER GATE - Check BOTH hook AND direct property
const isMuted = useAudioMuted(); // Reactive hook
if (isMuted || audioManager.muted) return null; // Synchronous backup

// Layer 3: EFFECT GATE - Same dual check in effects
useEffect(() => {
  if (isMuted || audioManager.muted) return;
  // ... effect logic
}, [isMuted, /* other deps */]);

// Layer 4: CLEANUP - Dismiss/clear anything that slips through
useEffect(() => {
  if (isMuted && currentItem) {
    dismissItem(currentItem.id);
  }
}, [isMuted, currentItem]);
```

**Key Files Using This Pattern:**

| File | Purpose |
|------|---------|
| `src/components/game/PAAnnouncementSystem.tsx` | Multi-layer muted checks |
| `src/components/game/shared.tsx` | Scheduler muted prevention |

**When to Apply This Pattern:**

- External state (audio, WebSocket, localStorage) wrapped in React hooks
- UI that must respond immediately to state changes (no flicker tolerance)
- Time-sensitive features where even one-frame delays are noticeable

**When NOT Needed:**

- Pure React state (useState, useReducer) - already synchronous
- State where brief inconsistency is acceptable
- Read-only displays that don't need immediate sync
