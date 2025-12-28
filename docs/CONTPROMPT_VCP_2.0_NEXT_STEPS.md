# VCP 2.0 Continuation Prompt

**Date:** 2025-12-26
**Status:** Core implementation complete, integration pending
**Priority:** Wire into AI decision-making and UI

---

## Context

VCP 2.0 (Value Coordination Protocol) has been fully designed and implemented as the "nervous system" for bilateral socio-technical systems. It provides:

1. **Context preservation** across time, decisions, and sessions
2. **State synchronization** between human, AI, and system components
3. **Reasoning scaffolding** at four levels (moral, prosocial, tactical, strategic)
4. **Self-learning** through pattern matching and outcome tracking
5. **Self-healing** through anomaly detection and corrective feedback

### What Exists

```
src/protocols/vcp/
├── index.ts              # Main exports
├── types.ts              # Core type definitions (~600 lines)
├── encoder.ts            # Compact encoding for all 6 layers
├── decoder.ts            # Parse encoded VCP back to data
├── integration.ts        # Bridge to existing stores
├── demo.ts               # Example outputs
├── generators/
│   ├── index.ts
│   ├── reasoning.ts      # Main orchestrator
│   ├── moralFrame.ts     # Ethical reasoning scaffolds
│   ├── prosocialFrame.ts # Trust/cooperation scaffolds
│   ├── tacticalFrame.ts  # Immediate action scaffolds
│   └── strategicFrame.ts # Long-term flourishing scaffolds
├── memory/
│   ├── index.ts
│   ├── patternStore.ts   # Situation pattern matching (Zustand + persist)
│   ├── outcomeTracker.ts # Decision outcome tracking
│   └── hypothesisEngine.ts # Self-learning hypotheses
└── layers/
    ├── index.ts
    └── healing.ts        # Anomaly detection, interventions (Zustand)
```

### Key Functions Available

```typescript
// From src/protocols/vcp/index.ts

// Generate complete VCP message from current state
generateVCPMessage(): VCPMessage

// Get AI decision context with appropriate layers
generateDecisionContext(type: DecisionType): DecisionContext

// Get full natural language guidance
generateFullGuidance(): string

// Get compact guidance for token-limited contexts
generateCompactGuidance(): string

// Update VCP systems (call periodically)
updateVCPFromState(): void

// Track decisions for learning
registerDecision(id, description, expectedEffect, dimension, magnitude): void
recordInterventionOutcome(intervention, outcome, effectMagnitude): void

// Stores
usePatternStore    // Situation patterns
useOutcomeTracker  // Decision outcomes
useHypothesisEngine // Hypotheses
useHealingStore    // Anomalies and interventions
```

---

## Next Steps (Priority Order)

### 1. Wire VCP into AI Decision-Making

**Location:** `src/components/AICommandCenter.tsx` and related AI components

**Task:** When the strategic AI makes decisions, it should receive VCP context:

```typescript
import { generateDecisionContext, generateCompactGuidance } from '@/src/protocols/vcp';

// Before AI decision
const vcpContext = generateDecisionContext('policy-recommendation');

// Include in AI prompt
const prompt = `
${generateCompactGuidance()}

Given this context, recommend...
`;
```

**Why:** This is the whole point - AI reasoning should be scaffolded by VCP.

---

### 2. Add VCP Debug/Status Panel to UI

**Location:** `src/components/ui-new/widgets/` (create `VCPStatusPanel.tsx`)

**Task:** Create a panel showing:
- Current VCP encoded state (compact form)
- Active reasoning focus (moral/prosocial/tactical/strategic)
- Learning status (pattern matches, hypotheses)
- Healing status (anomalies, interventions, system health)
- Expandable reasoning scaffolds

**Mock UI:**
```
┌─────────────────────────────────────────┐
│ VCP 2.0 Status                    [🔄]  │
├─────────────────────────────────────────┤
│ Mode: Democratic | Health: 78 ✓         │
│ Focus: 🌱 Strategic | Trust: ✓ Stable   │
├─────────────────────────────────────────┤
│ [GOV:D][AXIS:A80|D75|I95|E70|C65]       │
│ [WELL:F72↑|W][STAB:✓0.10][ENG:68💧]    │
├─────────────────────────────────────────┤
│ Learning: 72% match → "offer-support"   │
│ Healing: ⚠ wholeness -0.8σ (3h)        │
│          🔧 break-offers @ 45%          │
├─────────────────────────────────────────┤
│ [▼ Expand Reasoning Scaffolds]          │
└─────────────────────────────────────────┘
```

---

### 3. Implement Delta Tracking

**Location:** `src/protocols/vcp/integration.ts` → `assembleDeltaLayer()`

**Task:** Currently returns empty. Need to track actual changes:

```typescript
// Need a store or mechanism to track:
// - State snapshots at intervals
// - Diff between snapshots
// - Trigger attribution (what caused the change)

// Approach options:
// A) Create deltaStore.ts that subscribes to other stores and records changes
// B) Add change tracking to existing stores (emit events)
// C) Periodic snapshot comparison in integration.ts
```

**Why:** Delta layer enables AI to understand *what's changing* not just current state.

---

### 4. Wire Operational VCL from Existing Encoder

**Location:** `src/protocols/vcp/integration.ts` → `assembleStateSnapshot()`

**Task:** Currently `workersVCL` and `machinesVCL` are empty strings. Wire to existing:

```typescript
import { encodeWorkersVCL, encodeMachinesVCL } from '@/src/utils/vclEncoder';

// In assembleStateSnapshot():
operational: {
  workersVCL: encodeWorkersVCL(workers, shiftProgress),
  machinesVCL: encodeMachinesVCL(machines),
  // ...
}
```

**Why:** Reuse existing operational encoding.

---

### 5. Add Periodic Update Loop

**Location:** `src/App.tsx` or a dedicated hook

**Task:** Call `updateVCPFromState()` periodically to keep VCP systems current:

```typescript
import { updateVCPFromState } from '@/src/protocols/vcp';

// In App or a hook
useEffect(() => {
  const interval = setInterval(() => {
    updateVCPFromState();
  }, 30000); // Every 30 seconds

  return () => clearInterval(interval);
}, []);
```

**Why:** Pattern matching, healing detection, outcome checking need periodic updates.

---

### 6. Add Unit Tests

**Location:** `src/protocols/vcp/__tests__/`

**Task:** Test critical paths:
- `generators/*.test.ts` - Scaffold generation from various states
- `memory/*.test.ts` - Pattern matching, outcome tracking
- `encoder.test.ts` - Encoding/decoding roundtrip
- `layers/healing.test.ts` - Anomaly detection thresholds

---

### 7. Migrate/Integrate Old VCP

**Location:** `src/utils/vclEncoder.ts`

**Task:** The old VCP encoder still exists. Decide:
- **Option A:** Import and use in VCP 2.0 (for operational layer)
- **Option B:** Migrate functionality into VCP 2.0 and deprecate
- **Option C:** Keep both (old for operational, new for governance/reasoning)

**Recommendation:** Option A initially, Option B eventually.

---

## Architecture Notes

### Six Protocol Layers

| Layer | Purpose | When Included |
|-------|---------|---------------|
| **Context** | Where are we in the story? | Always |
| **State** | Current governance, wellbeing, stability | Always |
| **Delta** | What's changing and why | Interventions, policy |
| **Reasoning** | Scaffolds for moral/prosocial/tactical/strategic | Decision-making |
| **Learning** | Past patterns, outcomes, hypotheses | Policy, complex decisions |
| **Healing** | Anomalies, interventions, recovery | Interventions, emergencies |

### Decision Type → Layer Mapping

```typescript
const DECISION_LAYER_MAP = {
  'task-assignment': ['context', 'state'],
  'suggestion-framing': ['context', 'state', 'reasoning'],
  'worker-intervention': ['context', 'state', 'delta', 'reasoning', 'healing'],
  'policy-recommendation': ['context', 'state', 'delta', 'reasoning', 'learning', 'healing'],
  'emergency-response': ['context', 'state', 'healing'],
  'routine-update': ['context', 'state', 'delta'],
};
```

### Reasoning Scaffold Focus Selection

The system automatically selects primary reasoning focus:
- **Moral** - When workers struggling, wellbeing at risk
- **Prosocial** - When trust declining, relationship issues
- **Tactical** - Emergency, stability critical, immediate action needed
- **Strategic** - Stable conditions, improving trends, room to expand

---

## Example VCP Output

**Compact (for storage/transmission):**
```
[CTX:14:32/SM/zone-2|T|approved-autonomy→break-offered][GOV:D][AXIS:A80|D75|I95|E70|C65][WELL:F72↑|W][STAB:✓0.10][ENG:68💧][Δ:↑aut+10|↓who-5][R:🌱A|✓|+|↗][L:≈72%→offer-support][H:⚠whol-0.8σ|🔧@45%|HP:78✓]
```

**Expanded (for AI reasoning):**
```markdown
## Strategic Reasoning Frame

**Long-Term Flourishing:**
Flourishing is strong and improving - conditions support long-term growth.

**Stability Implications:**
Strong stability margin (73%) - safe to experiment with changes.

**Learning Opportunity:**
Similar situation (72% match) - past success with: offer-support-not-direct

**Recommended Posture:** EXPAND

**Key Question:**
How can we leverage current strength to advance toward greater autonomy?
```

---

## Files Referenced

- Design session dump: `docs/VCP_2.0_DESIGN_SESSION_2025-12-26.md`
- Demo with examples: `src/protocols/vcp/demo.ts`
- Integration bridge: `src/protocols/vcp/integration.ts`
- Old VCP encoder: `src/utils/vclEncoder.ts`

---

## Philosophy Reminder

VCP 2.0 embodies bilateral alignment:
- **Scaffolds, not scripts** - Guide thinking, don't dictate conclusions
- **Both parties matter** - Moral frame includes bilateral check
- **Learning is mutual** - System learns from outcomes, humans learn from patterns
- **Healing is proactive** - Detect issues before crisis

The protocol should make AI reasoning more transparent and aligned, not more opaque.

---

*Ready to continue implementation. Start with #1 (wire into AI decision-making) for immediate value.*
