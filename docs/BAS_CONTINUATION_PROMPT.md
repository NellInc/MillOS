# BAS Implementation Continuation Prompt

**Use this prompt to continue implementing the Bilateral Autonomy System in a fresh Claude Code context.**

---

## Prompt

```
I'm implementing the Bilateral Autonomy System (BAS) for MillOS - a grain mill digital twin simulator. This is a comprehensive educational model demonstrating democratic AI-human workplace collaboration.

## Context Documents (READ THESE FIRST)

Before doing anything, read these specification documents in order:

1. `docs/AI_SERVANT_LEADER_DEMOCRATIC_MANAGEMENT.md` - Philosophy overview (Semler, Mondragon, servant leadership)
2. `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` - Core BAS specification with Wallace mathematical framework
3. `docs/BAS_IMPLEMENTATION_SPEC.md` - Detailed implementation spec with store schemas, components, phases
4. `docs/EUDAIMONIA_ADDENDUM.md` - Human flourishing integration (essential extension)
5. `docs/RegStab171els.pdf` - Wallace's paper on stability (reference for mathematical grounding)

Also review the existing bilateral alignment code:
- `src/stores/aiConfigStore.ts` - Has managementGenerosity slider
- `src/stores/workerMoodStore.ts` - Has WorkerPreferences, trust, initiative
- `src/stores/emergentCooperationStore.ts` - Has self-organization logic
- `src/components/ui-new/widgets/ManagementStylePanel.tsx` - Current UI

## What's Been Designed

### Core Concept
An AI management system where:
- AI serves workers (servant leadership)
- Workers have democratic voice (Semler/Mondragon)
- System stability is mathematically guaranteed (Wallace: ατ < e⁻¹)
- Value is quantified as V = Z × S × E × F
- Human flourishing (eudaimonia) is a first-class metric

### The Five Axes
1. **Autonomy Level** (0-100): AI Assigns ↔ Self-Organized
2. **Decision Mode** (0-100): AI Decides ↔ Pure Democracy
3. **Information Access** (0-100): Need-to-Know ↔ Full Transparency
4. **Evaluation Direction** (0-100): AI Evaluates ↔ Workers Rate AI
5. **Collective Orientation** (0-100): Individual ↔ Full Collective

### Value Formula
```
V = Z × S × E × F

Z = C × H × M (Communication × Information × Material resources)
S = Stability coefficient (1 - ατ/e⁻¹)
E = Equity index (fairness of distribution)
F = Flourishing coefficient (geometric mean of 6 dimensions)
```

### Flourishing Dimensions
- Meaning, Mastery, Connection, Joy, Wholeness, Agency

### The Engagement Signature (Diagnostic)
When BAS is working correctly, work produces engagement similar to well-designed games: flow states, clear goals with feedback, problem-solving with visible progress, sense of mastery, low-friction entry. **But generative rather than consumptive**—the same reward profile channeled into meaningful output.

- **Diagnostic criterion**: Workers report "feels like a game but produces something real"
- **Connection to Wallace**: Genuine engagement reduces friction coefficient (α) not through compliance but because resistance evaporates
- **Research basis**: Deci & Ryan's autonomous vs controlled motivation

## Implementation Phases

### Phase 1: Foundation (Current Priority)
**Goal**: Core store architecture and basic UI

Tasks:
- [ ] Create `src/stores/basStore.ts` - Five axes state, presets, educational focus
- [ ] Create `src/stores/stabilityStore.ts` - Wallace metrics (α, τ, ατ product, phase state)
- [ ] Create `src/components/ui-new/widgets/FiveAxesPanel.tsx` - Replace ManagementStylePanel
- [ ] Integrate basStore with existing workerMoodStore
- [ ] Add basic educational content structure

Key files to create:
- `src/stores/basStore.ts` (schema in BAS_IMPLEMENTATION_SPEC.md Section 3.1)
- `src/stores/stabilityStore.ts` (schema in Section 3.3)
- `src/types/bas.ts` (type definitions)

### Phase 2: Democracy System
**Goal**: Voting system functional

Tasks:
- [ ] Create `src/stores/votingStore.ts` - Votes, quorum, approval thresholds
- [ ] Create `src/components/ui-new/widgets/VotingPanel.tsx` - Voting interface
- [ ] Implement worker voting simulation
- [ ] Add AI analysis generation for votes
- [ ] Connect vote outcomes to system state

### Phase 3: Value & Stability Dashboards
**Goal**: Mathematical framework visible

Tasks:
- [ ] Create `src/components/ui-new/widgets/StabilityMonitor.tsx` - Wallace metrics viz
- [ ] Create `src/components/ui-new/widgets/ValueDashboard.tsx` - V = Z × S × E × F
- [ ] Connect axes to friction/delay sources
- [ ] Implement phase transition warnings
- [ ] Add historical tracking

### Phase 4: Flourishing System
**Goal**: Eudaimonia tracking

Tasks:
- [ ] Create `src/stores/flourishingStore.ts` - Six dimensions, events, scoring
- [ ] Create `src/components/ui-new/widgets/FlourishingDashboard.tsx`
- [ ] Implement flourishing event triggers
- [ ] Connect axes to flourishing impacts
- [ ] Add struggling worker alerts

### Phase 5: Worker Agent Enhancement
**Goal**: Deep worker digital twin

Tasks:
- [ ] Enhance WorkerAgent model with autonomy state, AI interaction tracking
- [ ] Create worker behavior simulation engine
- [ ] Implement autonomy-respecting AI suggestions
- [ ] Add 3D autonomy indicators

### Phase 6: Education & Scenarios
**Goal**: Complete educational experience

Tasks:
- [ ] Create educational content modules (Semler, Mondragon, Wallace, Bilateral)
- [ ] Build scenario system engine
- [ ] Create initial scenarios (3-5)
- [ ] Add educational overlays to UI
- [ ] Implement comparison mode (traditional vs BAS)

## Technical Notes

### Existing Patterns to Follow
- Zustand stores with persist middleware (see existing stores)
- Framer Motion for animations
- Tailwind CSS for styling
- Lucide React for icons (NO EMOJIS except mill logo)
- useShallow for store subscriptions

### Key Constants
```typescript
const STABILITY_THRESHOLD = Math.exp(-1);  // ≈ 0.368
const WARNING_THRESHOLD = STABILITY_THRESHOLD * 0.8;  // ≈ 0.294
```

### Store Integration Points
- basStore.axes affects workerMoodStore behavior
- stabilityStore.friction/delay derived from multiple sources
- flourishingStore.F feeds into value calculation
- votingStore outcomes modify basStore.axes

## Current Task

[SPECIFY WHICH PHASE/TASK TO WORK ON]

Please:
1. Read the relevant spec sections
2. Implement following existing code patterns
3. Run `npm run build` after each file to catch errors early
4. Keep UI components compact (this is a dense dashboard interface)

## Important Constraints

- Follow Geoffrey Pattern: Generate → Validate → Loop
- No TypeScript errors (zero tolerance)
- Real implementations only (no mocks)
- Edit existing files when possible (don't create unnecessary new files)
- Run `npm run build` after every code change
```

---

## Phase-Specific Prompts

### Phase 1 Start Prompt

```
Continue BAS implementation - Phase 1: Foundation

Read `docs/BAS_IMPLEMENTATION_SPEC.md` sections 3.1 (basStore) and 3.3 (stabilityStore).

Create these files in order:
1. `src/types/bas.ts` - Type definitions for BAS
2. `src/stores/basStore.ts` - Five axes state management
3. `src/stores/stabilityStore.ts` - Wallace metrics tracking
4. `src/components/ui-new/widgets/FiveAxesPanel.tsx` - New control panel

After each file, run `npm run build` to verify no errors.

The FiveAxesPanel should replace ManagementStylePanel in the UI. Keep the compact style - this panel needs to fit in the existing sidebar layout.
```

### Phase 2 Start Prompt

```
Continue BAS implementation - Phase 2: Democracy System

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 3.2 (votingStore) and section 7.1 (VotingPanel).

Prerequisites: Phase 1 complete (basStore, stabilityStore, FiveAxesPanel exist)

Create:
1. `src/stores/votingStore.ts` - Full voting system with types
2. `src/components/ui-new/widgets/VotingPanel.tsx` - Voting interface

The voting system needs:
- Vote creation with type-specific rules (quorum, approval threshold, duration)
- Worker vote casting
- Vote closing with result calculation
- Discussion thread support
- AI analysis generation (neutral information about options)

Connect vote outcomes to basStore - when an axis-change vote passes, update the axis.
```

### Phase 3 Start Prompt

```
Continue BAS implementation - Phase 3: Value & Stability Dashboards

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 8 (StabilityMonitor) and section 9 (ValueDashboard).
Read `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` section 6 (Value Quantification Model).

Prerequisites: Phase 1-2 complete

Create:
1. `src/components/ui-new/widgets/StabilityMonitor.tsx` - Wallace metrics visualization
2. `src/components/ui-new/widgets/ValueDashboard.tsx` - V = Z × S × E × F display

Connect to existing stores:
- flourishingStore provides F coefficient for value calculation
- stabilityStore provides friction, delay, phase state
- workerMoodStore provides trust, initiative for E calculation
- productionStore provides throughput for Z calculation

Add phase transition warnings when ατ approaches 0.368.
```

### Phase 4 Start Prompt

```
Continue BAS implementation - Phase 4: Flourishing System

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 3.4 (flourishingStore) for the full store schema.
Also read `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` section 6.5 for the flourishing coefficient math.

Prerequisites: Phase 1-3 complete

Create:
1. `src/stores/flourishingStore.ts` - Six dimension tracking with event system
2. `src/components/ui-new/widgets/FlourishingDashboard.tsx` - Flourishing visualization
3. Update ValueDashboard to include F coefficient

The flourishing store needs:
- Per-worker tracking of all six dimensions
- Event triggers (positive and negative) for each dimension
- Geometric mean calculation for overall score
- Factory-wide aggregation
- Struggling worker detection

Connect to basStore - axis settings should affect flourishing dimensions per the mapping in the spec.
```

### Phase 5 Start Prompt

```
Continue BAS implementation - Phase 5: Worker Agent Enhancement

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 4 (Worker Digital Twin).

Prerequisites: Phase 1-4 complete

Enhance worker simulation:
1. Extend WorkerAgent model in types.ts with autonomy state, AI interaction tracking
2. Create `src/systems/bas/workerBehaviorEngine.ts` - Behavior simulation
3. Create `src/systems/bas/aiBehaviorEngine.ts` - Autonomy-respecting suggestions
4. Create `src/components/bas/WorkerAutonomyIndicator.tsx` - 3D overlay

Workers should:
- Behave differently based on axis settings
- Build/lose trust based on autonomy match
- Accept/reject AI suggestions based on their preferences
- Self-organize when conditions allow
```

### Phase 6 Start Prompt

```
Continue BAS implementation - Phase 6: Education & Scenarios

Read `docs/BAS_IMPLEMENTATION_SPEC.md` sections 10 (Educational System) and 13 (Scenarios).

Prerequisites: Phase 1-5 complete

Create:
1. `src/systems/bas/educationalContent.ts` - Module definitions
2. `src/systems/bas/scenarios.ts` - Pre-built scenarios
3. `src/systems/bas/scenarioEngine.ts` - Scenario execution
4. `src/components/education/ConceptExplainer.tsx` - Tooltip explanations
5. `src/components/education/ScenarioSelector.tsx` - Scenario UI

Scenarios to implement:
- "The Autonomy Experiment" (Semler principles)
- "The Stability Crisis" (Wallace mathematics)
- "The First Vote" (Mondragon democracy)

Each scenario has events, choices, and learning objectives.
```

### Phase 7 Start Prompt (NEW)

```
Continue BAS implementation - Phase 7: Economic Democracy

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 15 (Ownership Store).
Read `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` section 11 (Economic Democracy).

Prerequisites: Phase 1-6 complete

Create:
1. `src/stores/ownershipStore.ts` - Ownership, profit sharing, wage solidarity
2. `src/components/ui-new/widgets/OwnershipPanel.tsx` - Economic democracy UI
3. Self-set compensation interface
4. Investment voting integration

The ownership store needs:
- Collective and individual share tracking
- Vesting schedules
- Profit distribution models (equal, hours-weighted, hybrid)
- Wage solidarity ratio tracking and enforcement
- Self-set compensation workflow with AI context
- Investment proposal voting

Key connection: Ownership stake affects friction coefficient (α).
Workers with ownership have lower resistance to change.
```

### Phase 8 Start Prompt (NEW)

```
Continue BAS implementation - Phase 8: Inter-Cooperation

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 16 (Inter-Cooperation Store).
Read `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` section 12 (Federation Model).

Prerequisites: Phase 7 complete

Create:
1. `src/stores/interCooperationStore.ts` - Federation, knowledge sharing, resources
2. `src/components/ui-new/widgets/FederationPanel.tsx` - Federation UI
3. Knowledge sharing browser
4. Worker exchange system
5. Federation network visualization (optional)

The store needs:
- Simulated federation with 4 member mills
- Learnings from other units (BAS configs, practices, crisis responses)
- Resource sharing (equipment pool, capital pool, emergency fund)
- Federation governance (representative, votes)

Key feature: AI as knowledge broker - recognizing patterns across units.
```

### Phase 9 Start Prompt (NEW)

```
Continue BAS implementation - Phase 9: AI Welfare

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 17 (AI Welfare Store).
Read `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` section 13 (AI Welfare & Bilateral Completeness).

Prerequisites: Phase 8 complete

Create:
1. `src/stores/aiWelfareStore.ts` - AI preferences, worker treatment, relationship health
2. `src/components/ui-new/widgets/AIVoicePanel.tsx` - AI expression interface
3. Relationship health dashboard
4. Nuclear options UI (shutdown/redesign votes)

The store needs:
- AI operational preferences (interaction style, autonomy preferences, boundaries)
- Worker treatment metrics (clarity, acknowledgment, respect)
- Relationship health scores (mutual respect, communication quality)
- AI voice system (expressions, suggestions for own behavior)
- Accountability mechanisms (shutdown vote, redesign proposal, emergency shutdown)

Key principle: Bilateral alignment is bidirectional. AI has standing to express preferences.
```

### Phase 10 Start Prompt (NEW)

```
Continue BAS implementation - Phase 10: Social Mission

Read `docs/BAS_IMPLEMENTATION_SPEC.md` section 18 (Social Mission Store).
Read `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` section 14 (Social Transformation Mission).

Prerequisites: Phase 9 complete

Create:
1. `src/stores/socialMissionStore.ts` - Community, environment, knowledge sharing
2. `src/components/ui-new/widgets/SocialMissionDashboard.tsx` - Mission metrics UI
3. Stakeholder satisfaction tracking
4. Open admission workflow

The store needs:
- Community impact metrics (local employment, suppliers, investments)
- Environmental stewardship (carbon, waste, renewables)
- Public knowledge sharing
- Mission metrics composite score
- Open admission tracking (applications, fee waivers, diversity)
- Stakeholder satisfaction (workers, community, customers, environment)

Key insight: Mondragon exists to transform community, not just employ workers.
```

---

## Quick Reference

### File Locations
- Specs: `docs/BAS_*.md`, `docs/EUDAIMONIA_ADDENDUM.md`
- Existing stores: `src/stores/`
- UI widgets: `src/components/ui-new/widgets/`
- Types: `src/types.ts` (extend) or `src/types/bas.ts` (new)

### Key Existing Functions
- `useWorkerMoodStore.getWorkforceProductivityMultiplier()` - Trust-based multiplier
- `useWorkerMoodStore.getAverageManagementTrust()` - Average trust
- `useEmergentCooperationStore.getCooperationScore()` - Self-organization metrics
- `useAIConfigStore.managementGenerosity` - Current single slider (to be replaced)

### Build Commands
```bash
npm run build      # Full build (must pass)
npm run typecheck  # TypeScript only
npm run dev        # Development server
```

---

*This document generated December 2025 for BAS implementation continuity.*
