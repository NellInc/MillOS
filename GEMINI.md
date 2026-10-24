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

## Quick Navigation
[Sacred Rules](#-sacred-rules-never-violate) | [Quality Standards](#️-quality-standards-zero-tolerance) | [Geoffrey Pattern](#-geoffrey-pattern-workflow-mandatory) | [TypeScript Cascade Prevention](#-typescript-cascade-prevention) | [Development Workflow](#development-workflow-three-phases)

---

## 1. CORE - Critical Mandates & Execution Style

### 🛑 LINTING LAW (Run After EVERY Code Change)

- **UNIFIED VALIDATION**: `npm run build` - Must pass before marking tasks complete
- **TypeScript Check**: `npm run typecheck` - Catch type errors early
- **ESLint Check**: `npm run lint` - Catch React/JS issues
- **Prettier Format**: `npm run format:check` - Check formatting (`npm run format` to fix)
- **NO EXCEPTIONS** - Output must be copy-paste runnable
- **ENFORCE**: Run immediately after edits, before marking tasks complete
- **LINT RULES**: Project rules are `no-restricted-syntax` errors in `eslint.config.js`, and every `eslint-disable` must give a reason (`-- why`); enforced by `npm run lint` and CI

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
