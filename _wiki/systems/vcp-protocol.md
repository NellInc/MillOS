# VCP 2.0 Protocol Integration

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS implements the Value Context Protocol (VCP) 2.0 as its primary layer for communicating rich context from the factory simulation to AI decision-making. The implementation in `src/protocols/vcp/` encodes six context layers into compact strings, maintains a learning memory of past decisions and outcomes, and integrates with all major Zustand stores via a bridge layer.

## Directory Structure

```
src/protocols/vcp/
├── types.ts         — All VCP 2.0 type definitions
├── encoder.ts       — Layer 1–6 compact string encoders
├── decoder.ts       — Symmetric decoders
├── index.ts         — Public API (generateReasoningScaffolds, encodeVCPMessage)
├── integration.ts   — Bridge to MillOS Zustand stores
├── demo.ts          — Standalone demo
├── generators/      — Per-layer generation logic
├── layers/
│   ├── healing.ts   — Healing signals layer
│   └── index.ts
└── memory/
    ├── patternStore.ts       — Pattern recognition across decisions
    ├── outcomeTracker.ts     — Decision outcome recording
    ├── hypothesisEngine.ts   — Hypothesis formation and testing
    ├── deltaTracker.ts       — State change delta tracking
    └── index.ts
```

(src/protocols/vcp/ directory listing, 2026-05-23)

## Six Protocol Layers

VCP 2.0 encodes context across six layers (types.ts, encoder.ts):

1. **Context Frame** — Temporal and spatial context: shift phase (early/mid/late/handover), focus zone, attention scope, decision chain. Encoded as `[CTX:HH:MM/Sphase/Zzone|scope|←chain→]`. (src/protocols/vcp/encoder.ts:37)
2. **State Snapshot** — Current BAS axes, flourishing scores, stability coefficient, production metrics.
3. **Delta Layer** — Changes since last decision: what shifted, magnitude, direction.
4. **Reasoning Scaffolds** — Structured guidance for AI decision-making, generated from current state.
5. **Learning Memory** — Pattern store, outcome history, active hypotheses.
6. **Healing Signals** — Distress and recovery indicators from the healing layer (src/protocols/vcp/layers/healing.ts).

The encoder for each layer produces a compact human-readable string; the full VCP message is the concatenation of all six encoded layers. (src/protocols/vcp/encoder.ts:1)

## Integration with MillOS Stores

`integration.ts` is the bridge between VCP and the rest of the system. It imports from:
- `useBASStore` — BAS five-axis state
- `useFlourishingStore` — six eudaimonia dimensions
- `useStabilityStore` — Wallace stability coefficient
- `useEngagementStore` — worker engagement
- `useGameSimulationStore` — shift phase/game time
- `useProductionStore` — production pipeline metrics

`assembleContextFrame()` derives shift phase from game time (6am–6pm assumed; early < 25%, mid 25–75%, late 75–95%, handover > 95%). (src/protocols/vcp/integration.ts:48)

`encodeWorkersVCL` and `encodeMachinesVCL` (from `src/utils/vclEncoder.ts`) encode the VCL (Value Context Layer) for workers and machines separately.

## Learning Memory

Four Zustand stores in `memory/` form a persistent learning layer:

- **patternStore** — recognizes recurring decision patterns
- **outcomeTracker** — records actual outcomes of past decisions for calibration
- **hypothesisEngine** — forms and tests hypotheses about causal relationships
- **deltaTracker** — tracks how state changes evolve over time

These stores persist across sessions via Zustand `persist` middleware (consistent with other MillOS stores using `safeJSONStorage`). [UNVERIFIED: persistence configuration not directly read]

## Provenance

- Sources consulted: src/protocols/vcp/encoder.ts (lines 1–60), src/protocols/vcp/integration.ts (lines 1–80), src/protocols/vcp/ directory listing, src/protocols/vcp/memory/ listing
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]] — BAS axes that VCP encodes
- [[millos:domain/flourishing-dimensions]] — flourishing layer encoded in VCP state snapshot
- [[millos:systems/worker-agent-system]] — worker state that feeds VCP context
- [[shared:bilateral-alignment]] — VCP is the communications protocol for bilateral alignment
