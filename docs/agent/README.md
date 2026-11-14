# MillOS Agent Contract Spine

**Status:** current implementation evidence for Phases 0 through 2, plus the command kernel,
authority engine, causal ledger, and runtime command handlers added on 2026-08-31 (the Phase 3
slice and parts of Phases 4 and 6). Their Phase 2 tests and generated manifest were reconciled on
2026-09-02.

**Behavioural authority:** scoped simulation command execution. Fourteen implemented capabilities
run behind draft, preview, grant check, receipt, causal event, and verifier in the installed
runtime (`window.__MILLOS_AGENT__`, version 2). External writes remain denied, and the standalone
read service still reports itself as observation only because it installs no kernel.

## Read in this order

1. [`PHASE_0_EVIDENCE.md`](./PHASE_0_EVIDENCE.md) records the protected baseline,
   mutation inventory, authority map, substrate decisions, and surviving evidence gaps.
2. [`../AGENT_OPERATING_ARCHITECTURE.md`](../AGENT_OPERATING_ARCHITECTURE.md) defines
   the target system.
3. [`../../_contprompts/millos_agent_operating_system_2026-08-31.md`](../../_contprompts/millos_agent_operating_system_2026-08-31.md)
   controls phased execution.
4. [`../../build/generated/agent/capabilities.md`](../../build/generated/agent/capabilities.md)
   is generated discovery output from the executable registry.

## Executable sources

| Concern                   | Authority                                           |
| ------------------------- | --------------------------------------------------- |
| Registry contract types   | `src/agent/contracts/systemManifest.ts`             |
| Query contract types      | `src/agent/contracts/queryContracts.ts`             |
| Runtime validation        | `src/agent/contracts/registryValidation.js`         |
| Semantic identities       | `src/agent/ontology/semanticUri.js`                 |
| Registry source           | `src/agent/registry/systemRegistrySource.js`        |
| Pure query service        | `src/agent/query/queryService.js`                   |
| Operational projections   | `src/agent/adapters/runtime/runtimeProjection.ts`   |
| Browser installer         | `src/agent/adapters/runtime/installAgentRuntime.ts` |
| Engineering brief         | `scripts/agent-brief.mjs`                           |
| Query measurement         | `scripts/measure-agent-query-plane.mjs`             |
| Generator and drift gate  | `scripts/generate-agent-manifest.mjs`               |
| Direct mutation inventory | `scripts/lib/agent-mutation-inventory.mjs`          |

## Commands

```bash
npm run agent:typecheck
npm run agent:manifest
npm run agent:manifest:check
npm run agent:brief
npm run --silent agent:brief -- --format=json
npm run agent:measure-query
npx vitest run src/agent/__tests__ scripts/lib/agent-*.test.mjs
```

`agent:manifest` writes deterministic artifacts under `build/generated/agent/`.
`agent:manifest:check` performs no writes and fails when any artifact differs from its
executable inputs.

## Live read surface

`RuntimeController` installs a non-writable `window.__MILLOS_AGENT__` beside the unchanged
`window.__MILLOS_RUNTIME__` diagnostics object.

```javascript
const brief = window.__MILLOS_AGENT__.brief();

const campaign = window.__MILLOS_AGENT__.query({
  view: 'domain',
  domainId: 'campaign',
  fields: ['activeOrderId', 'constraints', 'execution'],
});

const nextPage = window.__MILLOS_AGENT__.query({
  view: 'domain',
  domainId: 'production',
  collection: 'machines',
  cursor: '0',
  limit: 10,
});

const delta = window.__MILLOS_AGENT__.query({
  view: 'domain',
  domainId: 'production',
  sinceRevision: campaign.domainRevisions.production,
});
```

Every result carries mode, build, seed, simulation time, wall time, freshness, completeness,
domain revisions, warnings, and scoped links. Responses are immutable serialized values. Level 0
is capped at 4,096 bytes. Level 1 is capped at 12,288 bytes, with field selection and cursor
pagination for depth.

`trace()` on the standalone read service is deliberately partial. It returns bounded diagnostic
records with a warning that correlation and causation events live in the causal ledger. The
installed runtime composes that ledger, so its `trace()` reports `completeness: 'complete'` and
filters the warning out. A diagnostic chronology from the read service alone must not be
presented as a complete causal chain.

## Current authority boundary

The manifest describes owners, identities, invariants, query budgets, and fourteen implemented
simulation-scoped capabilities. The installed browser runtime executes them through
`draft → preview → (approve) → commit`, each step checked against actor grants, observed
revision, idempotency key, and invariants, and each commit produces a receipt and causal events.
It does not contact an external endpoint or write to live SCADA; `scada.write-setpoint` runs in
simulation and shadow modes only. SCADA connection state is marked uncertain when the
compatibility live flag is set because the projection does not directly observe adapter health.

### After a stop or a drill, only a person restarts the line

Clearing a facility stop, or the end of a drill started with `simulation.start-fire-drill`,
releases the interlock and the forklifts but leaves every unit idle (D-096). The line stays
idle until a person presses RESTART LINE in the Safety panel. No agent capability restarts it,
on purpose: restart after a stop is a human action.

The simulation projection shows the state as `restartPending: true` with a
`restartPendingReason`, and the brief lists it as the blocking exception
`simulation-restart-pending`. While it holds, `workplace.activate-plan` is refused at preview
(`PRE.WORKPLACE.LINE_RESTARTED`), and a restart queued by `maintenance.request-restart`
verifies but waits for RESTART LINE before the unit runs.

**Working if:** a cold engineering agent can find the current owner, contract, evidence, and
next implementation gate from this page, while a runtime agent can obtain the current goal,
exceptions, authority, freshness, and scoped next queries from one bounded call.
