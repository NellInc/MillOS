# Stability, Material Flow, and Emergent Cooperation

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

Three stores form MillOS's underlying physics layer beneath the game simulation: `stabilityStore.ts` models system stability using Wallace's friction-delay inequality; `materialFlowStore.ts` models machine-level buffers and conveyor segments connecting the four production zones; `emergentCooperationStore.ts` implements the "control doesn't scale, trust does" principle by letting high-initiative, high-trust workers self-organize without management direction.

---

## Wallace Stability Model (`stabilityStore.ts`)

### Core inequality

The stability criterion is ατ < e⁻¹ ≈ 0.368, where α (friction) is resistance to change and τ (delay) is feedback loop latency (`stabilityStore.ts:7-10`). The `STABILITY_THRESHOLD` constant holds this value; `WARNING_THRESHOLD` is a lower alert level. The product α×τ is `stabilityProduct`.

### Phase states

Four phases: `stable` → `approaching` → `critical` → `unstable`. Phase transitions occur at `stabilityProduct >= STABILITY_THRESHOLD * 0.95` for critical and `>= STABILITY_THRESHOLD` for unstable (`stabilityStore.ts:191-196`).

### Cross-store friction modifiers

Friction is not a flat value. Three sources combine multiplicatively:

1. **Named friction sources** — named components (`bureaucracy`, `approval-chains`, `communication-overhead`, `legacy-processes`) each contribute a value 0–1 (`stabilityStore.ts:131-137`).
2. **Engagement multiplier** — `getEngagementMultiplier()` reads `useEngagementStore.getState().getFactoryEngagement().engagementAdjustedAlpha`. High engagement reduces effective friction, creating a positive feedback loop (`stabilityStore.ts:155-159`).
3. **Ownership multiplier** — `getOwnershipFrictionMultiplier()` maps worker ownership percentage to a friction reduction: 0% ownership = 1.0×, 100% ownership = 0.75× (`stabilityStore.ts:47-69`). Uses lazy `require()` to avoid circular deps.

Effective friction = `baseFriction × engagementMultiplier × ownershipMultiplier` (`stabilityStore.ts:182`).

### Stability coefficient S in the value formula

`calculateStabilityCoefficient(friction, delay)` returns `max(0, 1 - (α×τ / e⁻¹))`. This is the S in V = Z×S×E×F (`stabilityStore.ts:487-490`). At the instability threshold, S = 0; at zero product, S = 1.

### Tick-based noise

`tickStability(deltaMinutes)` applies Gaussian-style random walk to each named source, scaled by `wallace.noise * 0.01 * deltaMinutes` (`stabilityStore.ts:432-450`). This simulates the organic drift of real organizational friction.

---

## Material Flow Layer (`materialFlowStore.ts`)

### What it models

Each machine in the four production zones holds `MachineBuffer` state: input and output buffers (in kg), processing rate (kg/s at production speed 1.0), and conversion ratios mapping input types to output type/ratio pairs (`materialFlowStore.ts:40-53`).

Six material types: `wheat_grain`, `corn_grain`, `flour`, `bran`, `middlings`, `semolina` (`materialFlowStore.ts:23-29`).

### Conveyor segments

`ConveyorSegment` connects two machines, tracking: capacity, current load, flow rate, transit time (seconds), and `inTransit` array with per-batch arrival timestamps (`materialFlowStore.ts:62-76`). Conveyors model physical delay between zones, not instantaneous transfer.

### Network topology

`NetworkTopology` holds the complete graph: segment list, downstream map (machine → downstream machines), upstream map (machine → upstream machines) (`materialFlowStore.ts:81-88`). This enables backpressure propagation — if a Plansifter's input buffer is full, the upstream Roller Mill slows.

### Zone mapping

Zone 1 (z = −22): 5 Silos (Alpha–Epsilon). Zone 2 (z = −6): 6 Roller Mills (RM-101–RM-106). Zone 3 (z = +6, elevated y = 9): 3 Plansifters (A–C). Zone 4 (z = +20): 3 Packers (Lines 1–3). (`materialFlowStore.ts:8-14`, matching `scene-zones.md`).

---

## Emergent Cooperation (`emergentCooperationStore.ts`)

### Design principle

The store's header states the design rationale explicitly: "When workers have high initiative and management trust, they don't wait for orders — they self-organize. High-trust workforces solve problems faster because AI doesn't need to micromanage every decision. The key insight: Control doesn't scale. Trust does." (`emergentCooperationStore.ts:1-11`).

### Eight self-assignable task types

`SelfAssignableTaskType` enumerates: `help_colleague`, `preventive_check`, `cleanup`, `cover_break`, `quality_double_check`, `tool_fetch`, `documentation`, `training_peer`. Each has a phrase pool for in-game dialogue (`emergentCooperationStore.ts:22-102`).

### Initiative + trust gate

`attemptEmergentAction()` reads `initiative` and `managementTrust` from `workerMoodStore`. Both must clear thresholds (`initiativeThreshold = 60`, `trustThreshold = 50`) before any attempt is made. Above both thresholds, success chance scales linearly with both values (`emergentCooperationStore.ts:162-186`).

### Value categories

Emergent actions produce one of four value types: `efficiency`, `safety`, `quality`, or `morale`. `preventive_check` and `quality_double_check` → safety; `help_colleague` and `cover_break` → morale (`emergentCooperationStore.ts:203-209`).

### Cooperation score

`getCooperationScore()` returns score 0–100 aggregating: self-organizing worker count, total emergent actions completed, average initiative, and average management trust across all workers.

---

## Store Integration

`stabilityStore` reads from `engagementStore` and `ownershipStore`. `materialFlowStore` feeds production rates to `productionStore`. `emergentCooperationStore` reads from `workerMoodStore`. All three stores expose `tick*` methods called from the central tick system (`src/systems/CentralTickSystem.ts`).

---

## Provenance

- Sources: `src/stores/stabilityStore.ts` (full, 525 lines); `src/stores/materialFlowStore.ts` (lines 1–100); `src/stores/emergentCooperationStore.ts` (lines 1–210)
- Last verified: 2026-05-23

## See Also

- [[millos:systems/bas-value-formula]] — V = Z×S×E×F formula; S is the stability coefficient
- [[millos:systems/worker-agent-system]] — workerMoodStore providing initiative/trust values
- [[millos:systems/game-simulation]] — CentralTickSystem that drives all tick methods
- [[millos:flows/production-pipeline]] — zone layout matching materialFlowStore zone coordinates
