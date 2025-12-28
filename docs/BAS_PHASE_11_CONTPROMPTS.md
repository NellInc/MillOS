# BAS Phase 11 Continuation Prompts

**Use these prompts to continue BAS implementation in fresh Claude Code contexts.**

---

## 1. VotingPanel - Democratic Voting UI

```
Continue BAS implementation - VotingPanel for Democratic Voting

## Context
The votingStore exists at `src/stores/votingStore.ts` but has no UI component. Workers need a way to:
- View active votes (axis changes, policy decisions, investment proposals)
- Cast their votes
- See vote results and history
- Understand AI analysis of options

## Files to Read First
1. `src/stores/votingStore.ts` - Existing voting logic, types, and state
2. `src/stores/basStore.ts` - BAS axes that can be voted on
3. `src/components/ui-new/widgets/OwnershipPanel.tsx` - Reference for panel styling
4. `src/components/ui-new/widgets/ConceptTooltip.tsx` - For educational tooltips

## Create
`src/components/ui-new/widgets/VotingPanel.tsx`

## Requirements

### Vote Display
- Active votes with countdown timer
- Vote type indicator (axis_change, policy, investment, emergency)
- Current tally visualization (for/against/abstain)
- Quorum progress bar
- AI analysis section (neutral presentation of options)

### Vote Actions
- Cast vote buttons (Approve/Reject/Abstain)
- Change vote option (before deadline)
- Discussion thread (simplified - just show recent comments)

### Results Section
- Completed votes with outcomes
- Historical vote record
- Vote participation metrics

### Styling
- Match existing panel styling (slate-800/50 backgrounds, cyan accents)
- Compact design (this goes in the sidebar)
- Collapsible sections for votes
- Use Lucide icons (Vote, CheckCircle, XCircle, Clock, Users, MessageSquare)

### Integration
- Import into ContextSidebar.tsx
- Add to management mode section (between OwnershipPanel and FederationPanel)
- Connect vote outcomes to basStore axis updates

## Key Types from votingStore
```typescript
interface Vote {
  id: string;
  type: 'axis_change' | 'policy' | 'investment' | 'emergency';
  title: string;
  description: string;
  proposedBy: string;
  createdAt: number;
  deadline: number;
  status: 'active' | 'passed' | 'rejected' | 'expired';
  votes: Record<string, 'approve' | 'reject' | 'abstain'>;
  quorumRequired: number;
  approvalThreshold: number;
  aiAnalysis?: string;
}
```

## After each file, run `npm run build` to verify no errors.
```

---

## 2. Worker 3D Integration - Lightweight Visual Indicators

```
Continue BAS implementation - Lightweight Worker BAS Indicators

## Context
Workers in the 3D scene should visually reflect BAS state, but MUST be extremely lightweight to avoid performance impact.

## CRITICAL PERFORMANCE CONSTRAINTS
- NO new meshes per worker (reuse existing geometry)
- NO additional lights or shadows
- NO particle effects
- NO shader modifications
- ONLY use: color tinting, scale adjustments, or sprite overlays
- Maximum 1 draw call per indicator type (use instancing)
- Must work on low graphics preset

## Files to Read First
1. `src/components/WorkerSystem.tsx` - Current worker rendering
2. `src/stores/basStore.ts` - BAS state to reflect
3. `src/stores/flourishingStore.ts` - Worker flourishing data
4. `src/stores/graphicsStore.ts` - Graphics presets (respect quality levels)

## Approach: Color Tinting Only

### Option A: Outline Color (Preferred)
Modify existing worker mesh material to show:
- Green tint: High flourishing (F > 0.7)
- Yellow tint: Medium flourishing (0.4 < F < 0.7)
- Red tint: Low flourishing/struggling (F < 0.4)
- Blue pulse: Currently in flow state

Implementation: Adjust emissive color on existing material, NOT new meshes.

### Option B: Simple Overhead Sprite (If Option A insufficient)
Single shared sprite atlas with status icons:
- Use THREE.Points or instanced sprites
- One draw call for ALL worker indicators
- Only visible on medium+ quality

## Implementation Steps

1. Add flourishing color calculation to WorkerSystem.tsx:
```typescript
function getFlourishingColor(workerId: string): THREE.Color {
  const flourishing = useFlourishingStore.getState().getWorkerFlourishing(workerId);
  const score = flourishing?.overallScore ?? 0.5;
  if (score > 0.7) return new THREE.Color(0.2, 0.8, 0.2); // Green
  if (score > 0.4) return new THREE.Color(0.8, 0.8, 0.2); // Yellow
  return new THREE.Color(0.8, 0.2, 0.2); // Red
}
```

2. Apply to worker mesh emissive property (NOT a new material)

3. Gate behind graphics quality check:
```typescript
const { enableWorkerIndicators } = useGraphicsStore();
// Only show on medium+ quality
```

4. Update at most once per second (throttle updates)

## DO NOT
- Add new mesh geometry
- Create per-worker materials (use shared material with uniform)
- Add post-processing effects
- Use environment probes or reflections
- Create shadow-casting elements

## After each change, run `npm run build` and test performance on low quality preset.
```

---

## 3. Integration Tests - E2E BAS Flow

```
Continue BAS implementation - Integration Tests for BAS Flow

## Context
Create integration tests that verify the full BAS system works end-to-end, including cross-store connections and UI interactions.

## Files to Read First
1. `src/stores/__tests__/*.test.ts` - Existing test patterns
2. `src/stores/index.ts` - Store exports and connections
3. `vitest.config.ts` - Test configuration

## Create
`src/stores/__tests__/basIntegration.test.ts`

## Test Scenarios

### 1. Cross-Store Data Flow
```typescript
describe('BAS Cross-Store Integration', () => {
  it('ownership changes reduce friction coefficient', async () => {
    // Set high worker ownership
    useOwnershipStore.getState().updateWorkerShare('worker-1', 20);
    // Verify friction multiplier decreased
    const multiplier = getOwnershipFrictionMultiplier();
    expect(multiplier).toBeLessThan(1.0);
  });

  it('AI welfare affects worker satisfaction', async () => {
    // Set poor AI relationship
    useAIWelfareStore.getState().updateRelationshipHealth(30);
    // Verify mood modifier is negative
    const modifier = getAIWelfareTrustModifier();
    expect(modifier).toBeLessThan(0);
  });

  it('social mission contributes to value calculation', async () => {
    // Set high community impact
    useSocialMissionStore.getState().updateCommunityImpact(0.9);
    // Verify E coefficient increased
    // (Test through ValueDashboard calculation)
  });
});
```

### 2. Voting to Axis Change Flow
```typescript
describe('Democratic Voting Flow', () => {
  it('passed vote updates BAS axes', async () => {
    const { createVote, castVote, closeVote } = useVotingStore.getState();

    // Create axis change vote
    const voteId = createVote({
      type: 'axis_change',
      title: 'Increase Autonomy',
      axisKey: 'autonomyLevel',
      proposedValue: 80,
    });

    // Simulate majority approval
    castVote(voteId, 'worker-1', 'approve');
    castVote(voteId, 'worker-2', 'approve');
    castVote(voteId, 'worker-3', 'approve');

    // Close vote
    closeVote(voteId);

    // Verify axis updated
    const { axes } = useBASStore.getState();
    expect(axes.autonomyLevel).toBe(80);
  });
});
```

### 3. Scenario Execution
```typescript
describe('Scenario System', () => {
  it('scenario events trigger expected state changes', async () => {
    const { startScenario, tick } = useScenarioStore.getState();

    startScenario('first-investment-vote');

    // Advance time to first event
    tick(20);

    // Verify vote was created
    const { activeVotes } = useVotingStore.getState();
    expect(activeVotes.length).toBeGreaterThan(0);
  });
});
```

### 4. Stability Threshold Behavior
```typescript
describe('Stability System', () => {
  it('warns when approaching threshold', async () => {
    const { updateFriction, updateDelay } = useStabilityStore.getState();

    // Push toward instability
    updateFriction('test', 0.5);
    updateDelay('test', 0.6);

    const { phase } = useStabilityStore.getState();
    expect(phase.warnings).toContain(expect.stringContaining('threshold'));
  });
});
```

### 5. Flourishing Cascade
```typescript
describe('Flourishing System', () => {
  it('BAS axis changes affect flourishing dimensions', async () => {
    const { setAxis } = useBASStore.getState();
    const { getWorkerFlourishing } = useFlourishingStore.getState();

    const before = getWorkerFlourishing('worker-1')?.dimensions.agency;

    // Increase autonomy
    setAxis('autonomyLevel', 90);

    // Trigger recalculation
    useFlourishingStore.getState().recalculateFlourishing();

    const after = getWorkerFlourishing('worker-1')?.dimensions.agency;
    expect(after).toBeGreaterThan(before);
  });
});
```

## Run with: `npm test -- src/stores/__tests__/basIntegration.test.ts`
```

---

## 4. Lazy Loading - Performance Optimization

```
Continue BAS implementation - Lazy Load Heavy BAS Panels

## Context
The BAS section has 12 panels loaded synchronously, increasing initial bundle size. Heavy panels should be lazy loaded.

## Files to Read First
1. `src/components/ui-new/sidebar/ContextSidebar.tsx` - Current panel imports
2. `src/components/AICommandCenter.tsx` - Example of lazy loading pattern
3. `vite.config.ts` - Bundle configuration

## Current State
All BAS panels are statically imported:
```typescript
import { FiveAxesPanel } from '../widgets/FiveAxesPanel';
import { StabilityMonitor } from '../widgets/StabilityMonitor';
// ... 10 more static imports
```

## Target State
Heavy panels lazy loaded, light panels remain static:

### Keep Static (< 5KB, frequently used)
- FiveAxesPanel - Core control, always visible
- ValueDashboard - Key metric display

### Lazy Load (> 10KB or rarely expanded)
- StabilityMonitor
- BASTimeline
- ScenarioPlayground
- FlourishingDashboard
- OwnershipPanel
- FederationPanel
- AIWelfarePanel
- SocialMissionPanel
- BASEducation
- EngagementSignaturePanel

## Implementation

### Step 1: Create lazy imports
```typescript
// Lazy load heavy panels
const StabilityMonitor = lazy(() =>
  import('../widgets/StabilityMonitor').then(m => ({ default: m.StabilityMonitor }))
);
const BASTimeline = lazy(() =>
  import('../widgets/BASTimeline').then(m => ({ default: m.BASTimeline }))
);
// ... etc
```

### Step 2: Wrap in Suspense with compact fallback
```typescript
const PanelLoader = () => (
  <div className="h-20 bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center">
    <Activity className="w-4 h-4 text-cyan-500/50" />
  </div>
);

// In render:
<Suspense fallback={<PanelLoader />}>
  <StabilityMonitor />
</Suspense>
```

### Step 3: Group panels for chunk optimization
Add to vite.config.ts if needed:
```typescript
manualChunks: {
  'bas-core': ['./src/stores/basStore', './src/stores/stabilityStore'],
  'bas-panels': [
    './src/components/ui-new/widgets/StabilityMonitor',
    './src/components/ui-new/widgets/BASTimeline',
    // etc
  ],
}
```

### Step 4: Verify bundle split
Run `npm run build` and check output:
- Main bundle should decrease
- New `bas-panels-*.js` chunk should appear
- Total size should be similar or slightly larger (overhead)

## Success Criteria
- Initial bundle reduced by at least 50KB
- BAS panels load within 200ms of panel open
- No visible loading jank on fast connections
- Graceful loading states on slow connections

## After each change, run `npm run build` and compare bundle sizes.
```

---

## 5. README Update Check

```
Continue BAS implementation - README Documentation Review

## Context
The BAS implementation is feature-complete. Check if README.md needs updating to reflect:
- New features and capabilities
- Updated architecture
- New commands or workflows
- Changed file structure

## Files to Read
1. `README.md` - Current documentation
2. `docs/BAS_IMPLEMENTATION_SPEC.md` - What was planned
3. `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md` - Core spec
4. `src/stores/index.ts` - Current store exports
5. `src/components/ui-new/sidebar/ContextSidebar.tsx` - Current UI structure

## Check These Sections

### 1. Features List
Does README mention:
- [ ] Bilateral Autonomy System
- [ ] Five Axes of Democratic AI
- [ ] Wallace Stability metrics
- [ ] Worker flourishing tracking
- [ ] Democratic voting system
- [ ] Economic democracy (ownership, wage solidarity)
- [ ] Federation/inter-cooperation
- [ ] AI welfare tracking
- [ ] Social mission metrics
- [ ] Educational scenarios

### 2. Architecture Section
Is there documentation of:
- [ ] BAS stores (basStore, stabilityStore, flourishingStore, etc.)
- [ ] Cross-store connections
- [ ] Value formula (V = Z x S x E x F)
- [ ] Stability threshold (ατ < 0.368)

### 3. UI Documentation
Does it describe:
- [ ] BAS panel in dock (Heart icon)
- [ ] Management mode with 12 widgets
- [ ] Scenario system
- [ ] Educational tooltips

### 4. Getting Started
Are these documented:
- [ ] How to access BAS panel
- [ ] How to run scenarios
- [ ] How to interpret stability metrics

## Output
Provide a summary of what needs updating:
1. Missing sections to add
2. Outdated sections to update
3. Suggested new content (brief)

Do NOT make changes without user approval - just report findings.
```

---

## Quick Reference

| Prompt | Focus | Estimated Effort |
|--------|-------|------------------|
| 1. VotingPanel | New UI component | Medium |
| 2. Worker 3D | Performance-critical | Small |
| 3. Integration Tests | Testing | Medium |
| 4. Lazy Loading | Performance | Small |
| 5. README Check | Documentation | Small |

---

*Generated December 2025 for BAS Phase 11*
