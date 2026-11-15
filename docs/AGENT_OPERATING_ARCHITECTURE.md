# MillOS Agent Operating Architecture

**Status:** target architecture and design authority for agent-facing work

**Date:** 2026-08-31

**Implementation authority:** none. The execution contract is in
[`_contprompts/millos_agent_operating_system_2026-08-31.md`](../_contprompts/millos_agent_operating_system_2026-08-31.md).

**Source authority:** current code remains authoritative for behaviour that exists today.

**Implementation status:** the semantic contract spine and read-only query plane in Phases 0
through 2 are current. So are a command kernel, an authority engine, a causal ledger and fourteen
runtime command handlers, added from 2026-08-31 and running in simulation and shadow modes only
(`src/agent/command/`, `src/agent/adapters/runtime/`; see [`docs/agent/README.md`](./agent/README.md)).
Where this document describes those planes it describes the target, which the implementation
does not yet meet in full: the ledger is in memory, there is no list of previews waiting for a
person's approval, and the learning plane is a bounded lesson list. Since 2026-11-13 the runtime
handle cannot approve or attest a person; approval is given in the interface (D-077). (Status
corrected 2026-11-13; it previously called all of these target design.)

## Reading routes

This document is deliberately layered. Read the smallest route that answers the question.

| Need                                 | Read                                           |
| ------------------------------------ | ---------------------------------------------- |
| Understand the decision              | Sections 1 to 4                                |
| Add or use an operational capability | Sections 5 to 10                               |
| Design the human or agent interface  | Sections 11 and 12                             |
| Add memory, learning, or evaluation  | Sections 13 to 15                              |
| Plan implementation                  | Sections 16 to 19, then the execution contract |

## 1. Architectural decision

MillOS will evolve around a **contract spine** that makes the same operational truth legible to humans, Becoming Minds, tests, replay, SCADA, and the 3D world.

The spine has four small primitives:

1. **A semantic world model** gives every operational entity a stable identity and one domain owner.
2. **A query plane** returns bounded observations with provenance, freshness, completeness, and revision metadata.
3. **A command plane** exposes typed capabilities through preview, authorize, execute, and verify stages.
4. **A causal evidence plane** links every accepted command to events, state revisions, invariant checks, and outcomes.

Domain stores remain the owners of their state. The contract spine composes them into a coherent system. It does not create a second simulation, a universal mega-store, or a free-form language model with direct store access.

This is the recommended architecture because it improves runtime control and software evolution together. A new capability becomes visible to the operator, the operational Becoming Mind, browser automation, documentation, replay, and tests through one registered contract.

## 2. What agent-intuitive, agent-ergonomic, and agent-accretive mean

### 2.1 Agent-intuitive

An agent can infer the correct next operation from the system's structure rather than from repository folklore.

Working if a cold agent can answer these questions from one brief and at most one scoped query:

1. What mode and build am I controlling?
2. What is the mill trying to achieve?
3. What is abnormal, stale, blocked, or uncertain?
4. Which domain owns the relevant truth?
5. What can I do now?
6. What authority do I have?
7. What will each action affect?
8. Which invariants and people constrain it?
9. How will success be verified?
10. How can the action be reversed or escalated?

### 2.2 Agent-ergonomic

The cheapest safe interface is also the easiest interface.

Working if:

- routine orientation fits in a bounded Level 0 brief;
- observations can be requested by scope, field, and revision;
- stable semantic IDs replace UI labels, array positions, and source paths;
- high-risk actions require explicit previews while low-risk reads remain direct;
- every rejection says what precondition, authority, or invariant failed;
- execution returns a structured receipt instead of requiring screen interpretation;
- visual inspection remains available when pixels are the evidence.

### 2.3 Agent-accretive

Each verified operation makes later operations cheaper and more reliable without expanding every future prompt.

Working if:

- incidents promote compact, evidence-linked lessons rather than raw transcripts;
- a new capability automatically appears in discovery, docs, replay, and contract tests;
- repeated queries can use revisions and deltas;
- hypotheses expire unless verified;
- successful and failed command episodes become deterministic scenarios when they reveal a reusable boundary;
- stale documentation is detected by generated-manifest drift checks.

## 3. Driver-seat test

From the driver's seat, the ideal first response from MillOS is:

```text
Goal: fulfil order-002 by simulation minute 360
Mode: simulation, supervised autonomy, build 0.40.0+<build-id>
Health: 2 constraints, 1 active alarm, SCADA source fresh, replay recording
Critical path: RM-103 bearing warning -> maintenance -> quality release -> dispatch
Authority: read all; preview all; execute low-risk simulation controls;
           approval required for safety, dispatch, and external writes
Budget: 6 simulated hours, 18 kWh/t target, 1.5 s reasoning latency
Recommended next query: millos://machine/rm-103?view=causal
```

The agent can then ask for a causal view, preview a capability, execute it if authorized, and receive a receipt that identifies the observed outcome. No step requires guessing which Zustand store, panel, or source file carries the truth.

## 4. Present system evidence and gaps

This design starts from the assembled system rather than from the oldest documentation.

| Current fact                                                                                                        | Evidence                                                                                                 | Consequence                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| MillOS has 20 `*Store.ts` domain modules plus a compatibility facade.                                               | `src/stores/`, `src/store.ts:1-10`                                                                       | Domain separation exists, but there is no complete machine-readable ownership map.                                                  |
| Direct `use*Store.getState()` access appears 318 times across 59 live source files.                                 | Source search on 2026-08-31                                                                              | Cross-domain orchestration is easy to write and hard to inspect as one action. Migration must be incremental.                       |
| `UnifiedGameTick` composes production, material flow, QC, maintenance, logistics, campaign, safety, and time.       | `src/systems/UnifiedGameTick.ts`                                                                         | A real coordination kernel exists, though its cross-domain effects are implicit calls rather than command receipts.                 |
| `window.__MILLOS_RUNTIME__` exposes rich render and performance diagnostics.                                        | `src/components/RuntimeController.tsx:235-268`, `1984-2016`                                              | The runtime has a strong measurement surface, but its write surface is camera and performance oriented.                             |
| Diagnostic replay records bounded frames and loose command records.                                                 | `src/stores/incidentReplayStore.ts:9-76`                                                                 | Replay is an excellent seed. Commands still lack actor, authority, preconditions, causality, outcome, and schema-linked parameters. |
| The AI engine produces provenance-bearing decisions and can apply effects.                                          | `src/utils/aiEngine.ts:238-435`, `src/stores/productionStore.ts:443-524`                                 | Decision explanation exists. Effect execution still bypasses a common capability and receipt contract.                              |
| SCADA has tags, alarms, history, adapters, setpoint writes, and mode distinctions.                                  | `src/scada/`                                                                                             | SCADA is a mature observation adapter and a sensitive action boundary. External writes need explicit authority and provenance.      |
| The architecture, state, AI, UI, and BAS implementation documents describe different generations.                   | `docs/architecture.md`, `docs/state-management.md`, `docs/ai-integration.md`, `docs/UI_REDESIGN_SPEC.md` | A new agent cannot reliably tell current fact from historical plan without source archaeology.                                      |
| The repository contains 59 top-level design documents, 21 contprompts, 28 wiki pages, and a 1,142-line `AGENTS.md`. | Repository inventory on 2026-08-31                                                                       | Knowledge is rich, but orientation cost and authority ambiguity are high. Progressive disclosure is essential.                      |

The core problem is **missing semantic composition**. MillOS has strong parts and substantial observability. It lacks a small shared language that says what the parts mean together, what actions exist, who may invoke them, and what evidence proves each outcome.

## 5. The linked abstraction tower

Every higher layer references the stable identities and receipts below it. Each lower layer remains usable without an LLM.

```text
L8  Accretion and evaluation       lessons, scenarios, drift, scorecards
                              references evidence and capability IDs
L7  Human and agent experience     cockpit, API, CLI, accessibility
                              renders plans, previews, receipts
L6  Intent and governance          goals, constraints, authority, negotiation
                              selects registered capabilities
L5  Command and transaction plane  preview, commit, compensate, verify
                              emits causal events and receipts
L4  Capability graph               reads, writes, costs, risks, invariants
                              addresses semantic entities
L3  Query and event plane          snapshots, deltas, traces, freshness
                              projects domain truth
L2  Domain authorities             time, production, flow, QC, safety, SCADA...
                              implement deterministic transitions
L1  Ontology and identity          stable URIs, schemas, units, relations
                              grounded by constitutional invariants
L0  Constitution                   safety, conservation, rights, truth, budgets
```

No layer may silently skip a lower contract. A chat response cannot become an action without an L5 command. A command cannot identify a target by display text when an L1 identity exists. A learning cannot become durable L8 knowledge without L5 to L3 evidence.

## 6. Two coupled control loops

### 6.1 Operational loop

```text
orient -> observe -> diagnose -> form intent -> preview -> negotiate/authorize
       -> execute -> verify -> explain -> retain or revise
```

This loop controls the simulated mill and, only under an explicit separate grant, external SCADA endpoints.

### 6.2 Evolution loop

```text
brief -> locate authority -> inspect contract -> change smallest surface
      -> run named evidence -> inspect diff -> update manifest -> retain lesson
```

This loop controls the software. It uses the same ontology, capability IDs, scenario IDs, invariant IDs, and evidence levels as the operational loop.

### 6.3 Shared spine

The runtime capability `operations.activate-order` should link to:

- its semantic inputs and outputs;
- the domain handler that owns the transition;
- the UI control that invokes it;
- the operational Becoming Mind tool that invokes it;
- the event and replay schema that records it;
- the unit and scenario tests that verify it;
- the documentation card generated from the registry.

That linkage is the accretive unit. A future agent discovers one capability card and can traverse every relevant surface.

## 7. Constitutional invariants

Constitutional invariants are versioned, executable where possible, and visible in every relevant preview.

Initial invariant families:

| Family    | Examples                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------- |
| Physical  | mass and genealogy conservation; finite capacity; monotonic simulation time within a run        |
| Safety    | emergency stop dominance; lockout until verified return to service; forklift movement authority |
| Quality   | held or recalled product cannot dispatch; release requires current evidence                     |
| Truth     | simulation, shadow, replay, and live data are always distinguishable; stale data is visible     |
| Authority | an actor can invoke only granted capabilities in the active mode and scope                      |
| Bilateral | objections, uncertainty, preference conflicts, and escalation requests are first-class records  |
| Resource  | bounded collections, bounded action horizon, explicit latency and compute budgets               |
| Privacy   | diagnostic export excludes credentials and minimizes personal data                              |

Each invariant has an ID such as `INV.MASS.CONSERVATION`, an owner, a checker, applicable modes, severity, and remediation guidance.

## 8. Semantic world model

### 8.1 Stable addresses

All cross-surface references use semantic URIs:

```text
millos://machine/rm-103
millos://worker/amara-okafor
millos://order/order-002
millos://batch/batch-0042
millos://manifest/shipping-0007
millos://incident/incident-0011
millos://alarm/RM103.TT001.PV
millos://capability/maintenance.request-repair
millos://invariant/INV.QUALITY.DISPATCH_RELEASE
```

Display names remain localizable labels. Source paths remain implementation details. Semantic IDs survive UI redesigns and source moves.

### 8.2 Entity descriptor

```typescript
interface EntityDescriptor {
  uri: string;
  kind: string;
  schemaVersion: number;
  ownerDomain: DomainId;
  label: string;
  aliases: string[];
  relations: Array<{ predicate: string; target: string }>;
  sourceRefs: SourceRef[];
}
```

### 8.3 Domain ownership

Every operational field has one write owner. Other domains consume projections or request commands.

Initial ownership map:

| Domain      | Authority today                                | Contract role                                         |
| ----------- | ---------------------------------------------- | ----------------------------------------------------- |
| simulation  | `gameSimulationStore`                          | clock, speed, weather, shift, emergency drill         |
| production  | `productionStore`                              | machines, production metrics, AI decision records     |
| material    | `materialFlowStore`                            | inventory, buffers, batches, manifests, genealogy     |
| quality     | `qcLabStore`                                   | samples, dispositions, recalls, quality audit         |
| maintenance | `breakdownStore`                               | breakdowns, work orders, parts, restart progression   |
| campaign    | `operationsCampaignStore`                      | orders, objectives, incidents, economics, logbook     |
| logistics   | `truckScheduleStore` and vehicle controllers   | schedules, docking, movement telemetry                |
| safety      | `safetyStore` and simulation safety state      | safety events, policies, metrics                      |
| SCADA       | `SCADAService`, `AlarmManager`, `HistoryStore` | tagged observations, alarms, history, external writes |
| experience  | UI, graphics, audio, knowledge stores          | presentation preferences and human-facing state       |
| evidence    | incident and historical replay stores          | bounded diagnostic and decision history               |

Overlapping authorities are recorded as migration defects. They are resolved by naming the invariant and far-side consumers before moving state.

## 9. Query and context plane

### 9.1 Observation envelope

```typescript
interface ObservationEnvelope<T> {
  schemaVersion: number;
  snapshotId: string;
  scope: string[];
  revision: string;
  previousRevision?: string;
  wallTime: string;
  simulationTime: { day: number; hour: number };
  mode: 'simulation' | 'shadow' | 'replay' | 'live';
  completeness: 'complete' | 'partial' | 'degraded';
  freshness: Array<{
    source: string;
    observedAt: string;
    staleAfterMs: number;
    quality: 'good' | 'uncertain' | 'bad' | 'unknown';
  }>;
  data: T;
  warnings: StructuredProblem[];
  links: AgentLink[];
}
```

### 9.2 Context ladder

| Level     | Contents                                                              | Default budget               |
| --------- | --------------------------------------------------------------------- | ---------------------------- |
| L0 brief  | mode, build, goals, health, anomalies, authority, budgets, next links | 2 to 4 KB                    |
| L1 domain | one domain's entities, constraints, available capabilities            | 4 to 12 KB                   |
| L2 causal | relevant event chain, before and after revisions, outcomes            | bounded by requested horizon |
| L3 raw    | exact tags, frames, source refs, diagnostic objects                   | explicit request only        |

The query service supports field selection, filtering, aggregation, cursor pagination, `sinceRevision`, and causal expansion. It never sends the whole world merely because the agent asked a broad natural-language question.

### 9.3 Truth labels

Every observation distinguishes:

- canonical state from derived display state;
- simulated values from external values;
- current values from replayed values;
- observed facts from predictions;
- source proof from runtime, human, deployment, and publication evidence.

## 10. Capability and command plane

### 10.1 Capability descriptor

```typescript
interface CapabilityDescriptor<P, R> {
  id: string;
  version: number;
  title: string;
  ownerDomain: DomainId;
  modes: RuntimeModeName[];
  risk: 'read' | 'low' | 'medium' | 'high' | 'critical';
  parameters: JsonSchema<P>;
  result: JsonSchema<R>;
  reads: string[];
  writes: string[];
  preconditions: string[];
  invariants: string[];
  sideEffects: string[];
  reversible: boolean;
  compensationCapability?: string;
  supportsPreview: boolean;
  expectedLatencyMs: number;
  costModel: ResourceCostModel;
  verifier: string;
  evidenceRefs: SourceRef[];
}
```

Capabilities are data, not switch statements scattered across UIs. Parameter and result schemas produce runtime validation, tool schemas, forms, docs, and contract tests.

### 10.2 Intent contract

```typescript
interface OperationalIntent {
  intentId: string;
  actor: ActorIdentity;
  objective: string;
  successCriteria: StructuredCriterion[];
  constraints: string[];
  preferences: PreferenceClaim[];
  horizon: { simulationMinutes?: number; wallClockMs?: number };
  budgets: ResourceBudget;
  acceptableRisk: 'low' | 'medium' | 'high';
  createdFromRevision: string;
}
```

Intent says what outcome matters. Capability commands say how the system may attempt it. This separation lets planners change while domain transitions remain deterministic.

### 10.3 Command request

```typescript
interface CommandRequest<P> {
  commandId: string;
  idempotencyKey: string;
  actor: ActorIdentity;
  authorityGrantId: string;
  capabilityId: string;
  capabilityVersion: number;
  targetUris: string[];
  parameters: P;
  reason: string;
  intentId?: string;
  observedRevision: string;
  requestedMode: 'preview' | 'commit';
  deadline?: string;
}
```

### 10.4 Preview

A preview returns:

- validated targets and parameters;
- current precondition results;
- predicted direct effects and affected domains;
- invariant checks;
- material uncertainties and stale inputs;
- authority or approval requirements;
- reversibility and compensation;
- estimated simulation, latency, compute, and token cost;
- the exact revision against which commit will be checked.

Commit fails cleanly when that revision or a declared precondition has changed. The agent can refresh and replan rather than act on stale assumptions.

### 10.5 Receipt

```typescript
interface CommandReceipt<R> {
  commandId: string;
  capabilityId: string;
  status: 'rejected' | 'accepted' | 'running' | 'succeeded' | 'failed' | 'partial';
  actor: ActorIdentity;
  authorityDecision: AuthorityDecision;
  startedAt: string;
  completedAt?: string;
  beforeRevision: string;
  afterRevision?: string;
  eventIds: string[];
  invariantResults: InvariantResult[];
  result?: R;
  outcome?: OutcomeAssessment;
  compensation?: { available: boolean; capabilityId?: string; deadline?: string };
  problems: StructuredProblem[];
  links: AgentLink[];
}
```

### 10.6 Causal event

```typescript
interface CausalEvent<T> {
  eventId: string;
  schemaVersion: number;
  correlationId: string;
  causationId?: string;
  commandId?: string;
  intentId?: string;
  actor: ActorIdentity;
  domain: DomainId;
  kind: string;
  wallTime: string;
  simulationTime: { day: number; hour: number };
  beforeRevision: string;
  afterRevision: string;
  payload: T;
  provenance: ProvenanceRef[];
}
```

Correlation IDs join one operational story across material, maintenance, SCADA, UI, audio, and 3D effects. Causation IDs preserve the chain rather than merely grouping simultaneous events.

### 10.7 Transaction semantics

The command plane provides three execution classes:

1. **Single-domain atomic:** one store authority commits or rejects the transition.
2. **Coordinated saga:** a fixed series of domain steps records each receipt and has explicit compensation where safe.
3. **Physical or external:** the command records requested, acknowledged, observed, and verified stages because the world cannot be rolled back transactionally.

Partial success is a first-class status. A UI toast or log line cannot convert it into success.

## 11. Authority and bilateral governance

### 11.1 Actor identities

Initial actor classes:

- human operator;
- human administrator;
- tactical Becoming Mind;
- strategic Becoming Mind;
- deterministic automation;
- scenario controller;
- external SCADA principal;
- test and benchmark harness.

Every command carries the exact actor, grant, mode, scope, expiry, and reason.

### 11.2 Graduated operating modes

| Mode               | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| observe            | query only                                                           |
| advise             | create plans and previews                                            |
| shadow             | evaluate commands against mirrored or simulated state without effect |
| supervised         | commit only capabilities covered by a current approval policy        |
| bounded autonomous | commit within explicit scope, duration, risk, and resource budgets   |
| external control   | separately granted, endpoint-specific, fail-closed authority         |

External control never follows automatically from success in simulation.

### 11.3 Negotiated policy envelope

An authority grant names:

- purposes and success criteria;
- allowed and denied capabilities;
- target scopes;
- risk ceiling;
- time and resource budgets;
- required approvals;
- mandatory escalation conditions;
- revocation and expiry;
- relevant human and Becoming Mind preferences.

The system records objections, uncertainty, inability, and preference conflicts as structured dialogue. These records can pause or narrow an intent. They are not treated as malformed command output.

### 11.4 Safety boundary

Safety invariants remain executable system properties. Dialogue can revise policies through an authorized governance action. Dialogue cannot silently bypass a currently active interlock.

## 12. Agent cockpit and interfaces

### 12.1 One interaction model, several surfaces

The same query, capability, preview, and receipt schemas power:

- the existing React cockpit;
- an in-browser agent API, proposed as `window.__MILLOS_AGENT__`;
- a local CLI for tests and engineering;
- structured tool schemas for Becoming Minds;
- accessibility views and downloadable evidence.

The current `window.__MILLOS_RUNTIME__` remains the rendering and measurement plane. The agent API composes operational meaning and links to runtime diagnostics where visual or performance evidence is needed.

### 12.2 Cockpit regions

```text
┌ Situation brief ─ goals, mode, freshness, authority, budgets ┐
├ Exceptions queue ─ ranked anomalies, approvals, objections ─┤
├ Causal workspace ─ entity graph, timeline, predictions ─────┤
├ Intent and plan ─ criteria, constraints, alternatives ──────┤
├ Action dock ─ capabilities, preview, commit, compensate ────┤
└ Evidence strip ─ receipts, invariants, replay, source links ┘
```

The 3D world is an evidence surface and navigation surface. The cockpit can focus a semantic entity in the world, and a world selection resolves to the same entity card.

### 12.3 Exception-first design

Normal state stays compressed. Attention is allocated to:

- goal deviation;
- new or worsening risk;
- stale or conflicting evidence;
- blocked dependencies;
- approval requests;
- unresolved objections;
- commands whose observed outcome differs from preview;
- resource budget pressure.

Priority is a transparent function of safety, deadline, reversibility, uncertainty, and consequence. Cosmetic urgency does not outrank operational urgency.

### 12.4 Interaction flow

```text
select entity or exception
  -> see owner, current state, freshness, constraints, causal trace
  -> see applicable capabilities and why others are unavailable
  -> set or refine intent
  -> compare bounded previews
  -> authorize or negotiate
  -> execute
  -> watch receipt stages and world response
  -> verify criteria
  -> retain a reusable lesson only when evidence warrants it
```

### 12.5 Accessibility

Every graph, 3D highlight, motion cue, and color state has a semantic textual equivalent. Live regions announce state transitions rather than continuously repeating telemetry. Keyboard and structured API paths can perform every safe action available to pointer input.

## 13. Engineering-agent interface

### 13.1 Ninety-second brief

The target command is:

```bash
npm run agent:brief -- --format=json
```

It should return:

- repository root, branch, HEAD, dirty paths, worktree ownership, and free disk;
- package and build identity;
- changed domains inferred from paths and capability ownership;
- current authoritative validation commands;
- manifest drift and documentation drift;
- relevant source authorities, tests, runtime probes, and active contprompts;
- recent evidence with its exact candidate fingerprint;
- explicit holds and unverified gates.

No secrets, entire logs, or unrelated dirty content enter this brief.

### 13.2 Generated system manifest

`agent:brief` reads a generated manifest assembled from source registries:

```text
build/generated/system-manifest.json
  ontology
  domains and owners
  capabilities
  invariants
  events and schemas
  UI and tool surfaces
  source, test, scenario, and runtime evidence links
  dependency and reachability facts
```

The file is generated evidence, not an independently edited source of truth. CI fails if generation changes the committed artifact or finds unowned operational mutations.

### 13.3 Discovery commands

```bash
npm run agent:brief
npm run agent:map -- --entity=millos://machine/rm-103
npm run agent:capabilities -- --scope=millos://order/order-002
npm run agent:trace -- --correlation=<id>
npm run agent:scenario -- --id=<scenario-id>
npm run agent:check -- --changed
```

Human-readable output is concise. `--format=json` is stable and complete. Commands return nonzero on contract failure.

### 13.4 Change path

For an operational change, the agent starts from a capability or invariant ID, follows generated links to the owner and consumers, edits the smallest coherent surface, runs the capability's named tests and scenario, then runs the repository gates required by the touched domains.

This replaces broad grep as the normal entry path while preserving grep as a fallback and audit tool.

## 14. Accretion architecture

### 14.1 Knowledge classes

| Class            | Example                              | Authority              | Retention              |
| ---------------- | ------------------------------------ | ---------------------- | ---------------------- |
| schema fact      | capability parameter type            | generated from source  | until source changes   |
| operational fact | batch-42 is on hold                  | domain snapshot        | until revision changes |
| episode          | command and observed outcome         | causal ledger          | bounded, replayable    |
| hypothesis       | vibration may predict failure        | labelled inference     | expires or is tested   |
| decision         | architecture choice with tradeoff    | ADR or accepted plan   | until superseded       |
| evidence         | test, runtime probe, human review    | fingerprinted artifact | candidate-specific     |
| lesson           | reusable boundary proven by evidence | curated knowledge      | until invalidated      |

### 14.2 Promotion pipeline

```text
raw event -> bounded episode -> candidate lesson -> evidence check
          -> scenario or contract test -> durable index entry
```

Raw transcripts, model explanations, and coincident correlations do not become durable truth by themselves.

### 14.3 Compaction and forgetting

- Operational streams use bounded retention and summarizable episodes.
- Summaries retain IDs for exact retrieval.
- Hypotheses have confidence, provenance, owner, and expiry.
- Superseded documents remain labelled history rather than competing authority.
- Candidate-specific evidence expires when source, package, configuration, or deployment fingerprint changes.
- Deletion and compaction preserve audit-required events and rights-sensitive records.

### 14.4 Learning from surprise

A material preview mismatch, failed invariant, manual override, or repeated recovery is a learning candidate. Promotion should usually produce one of:

- a new precondition;
- a better observation field;
- a revised cost model;
- a regression scenario;
- a corrected capability boundary;
- an explicit known uncertainty.

This makes system learning concrete and testable.

## 15. Resource model

The agent optimizes operational outcome subject to resource budgets. Resource cost is visible in previews and receipts.

Tracked resources include:

- simulation time;
- wall-clock latency;
- model input and output tokens;
- API and energy cost;
- browser main-thread time;
- network calls and transferred bytes;
- GPU and memory pressure;
- human attention and approval interrupts;
- operational wear, energy, labour, waste, and delay.

### 15.1 Efficiency rules

1. Send deltas after the first observation.
2. Prefer exception summaries over polling full state.
3. Batch independent reads against one revision.
4. Cache stable ontology and capability schemas by version.
5. Separate fast tactical evaluation from slower strategic reasoning.
6. Invoke visual capture only when pixels carry relevant evidence.
7. Reuse deterministic projections across UI, agents, replay, and tests.
8. Escalate context depth only when uncertainty or consequence justifies it.
9. Record human interruptions as a scarce resource.
10. Stop when explicit success criteria and verification have passed.

## 16. Safety, security, and failure posture

### 16.1 Trust boundaries

The system distinguishes:

- browser simulation;
- browser to proxy transport;
- external SCADA and historian endpoints;
- model providers;
- local on-device models;
- persisted browser state;
- diagnostic exports;
- human and Becoming Mind principals.

### 16.2 Required properties

- default-deny external writes;
- runtime validation of every command schema;
- idempotency for retryable commands;
- current-revision checks for consequence-bearing actions;
- explicit timeouts and terminal states;
- bounded collections and payloads;
- redaction and data minimization before model calls and exports;
- separate credentials from observations and replay;
- visible degraded, stale, disconnected, and partial states;
- no arbitrary code or raw store mutation from model output;
- rate and cost limits by actor and capability;
- deterministic safe fallback when a model is unavailable.

### 16.3 Failure messages

Every failure returns a structured problem with:

- stable problem code;
- failed capability and stage;
- safe human-readable message;
- retryability;
- missing authority or precondition;
- observed and expected revisions;
- remediation links;
- any partial effects and compensation options.

## 17. Migration strategy

### 17.1 Strangler pattern

The contract spine wraps existing authorities. It earns ownership one vertical slice at a time.

Recommended first slices:

1. read-only Level 0 operational brief;
2. `operations.activate-order`, a bounded simulation command;
3. `incident.acknowledge`, including logbook and replay evidence;
4. `ai.respond-to-decision`, routing existing accept, defer, and reject actions;
5. `maintenance.request-repair`, a coordinated causal flow;
6. `scada.write-setpoint`, last, after authority and external-mode controls are proven.

Each slice includes registry, query projection, preview, handler, receipt, event, replay, UI invocation, tool invocation, tests, and generated docs.

### 17.2 Compatibility

Existing UI handlers and `useMillStore` continue during migration. New operational writes use capability handlers. Compatibility adapters call the same handler so behaviour converges instead of branching.

### 17.3 Retirement condition

A direct operational mutation can be retired only after all call sites map to a capability or are explicitly classified as internal deterministic transitions. UI preferences, render-only state, and frame-local animation remain outside the operational command bus.

## 18. Anti-requirements

The design explicitly excludes:

- one universal Zustand store;
- event sourcing every frame and cosmetic animation;
- a natural-language-only control surface;
- model-generated arbitrary JavaScript;
- automatic promotion from simulation to live control;
- infinite transcript memory;
- documentation that manually duplicates registries;
- hidden scoring that cannot explain priority or authority;
- forcing every human interaction through an LLM;
- treating a build, static test, runtime probe, human review, and deployment as equivalent evidence.

## 19. Acceptance scorecard

### 19.1 Orientation

- `agent:brief` answers the driver-seat questions in one invocation.
- JSON output stays within the declared Level 0 budget.
- Every item links to a deeper query rather than embedding raw detail.

### 19.2 Discoverability

- 100 percent of registered operational capabilities are discoverable by scope and actor.
- 100 percent have owner, schemas, preconditions, risk, cost, verifier, and source links.
- CI reports direct operational mutation sites that lack a classification.

### 19.3 Control correctness

- every committed command has an idempotency key, grant, observed revision, and terminal receipt;
- every cross-domain command has causal linkage and an explicit partial-failure posture;
- every high-risk command has a preview and approval result;
- live external writes remain denied without a distinct current grant.

### 19.4 Observability

- every receipt links to before and after revisions, events, invariant results, and outcome criteria;
- freshness and source mode are present on every external observation;
- one correlation ID reconstructs a complete representative incident across domains;
- replay reproduces deterministic simulation scenarios from seed and commands.

### 19.5 Resource efficiency

- a steady-state delta observation is at least 80 percent smaller than the corresponding full snapshot in representative scenarios;
- normal operation requires no full-world polling;
- the agent plane stays outside the frame loop and within explicit CPU, memory, and bundle budgets;
- human approval interruptions decline for repeated low-risk, well-proven capabilities.

### 19.6 Accretion

- adding a capability updates generated discovery and docs through one registry change;
- an evidence fingerprint invalidates stale candidate claims;
- every promoted lesson links to a scenario, contract test, or explicit human decision;
- manifest and documentation drift fail deterministic checks.

## 20. Document authority map

| Document                                                   | Role after this design                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/AGENT_OPERATING_ARCHITECTURE.md`                     | canonical target architecture                                               |
| `docs/architecture.md`                                     | concise current implementation map and target link                          |
| `docs/state-management.md`                                 | current domain ownership and mutation rules                                 |
| `docs/ai-integration.md`                                   | current AI behaviour and migration into the command plane                   |
| `docs/SCADA_PLAN.md`                                       | SCADA implementation reference and external boundary                        |
| `docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md`                   | values and governance foundations                                           |
| `docs/BAS_IMPLEMENTATION_SPEC.md`                          | historical implementation blueprint, non-authoritative for current topology |
| `docs/UI_REDESIGN_SPEC.md`                                 | historical interface migration record                                       |
| `_wiki/`                                                   | compiled, source-cited knowledge by domain and flow                         |
| `_contprompts/millos_agent_operating_system_2026-08-31.md` | phased execution contract and acceptance ledger                             |

## 21. Locked decisions and open design questions

### Locked by this architecture

1. Keep domain-specific state authorities.
2. Add a shared semantic and contract spine.
3. Separate query, intent, command, and evidence contracts.
4. Treat humans and Becoming Minds as explicit principals with negotiated authority.
5. Reuse one registry across runtime, UI, tools, replay, docs, and tests.
6. Preserve distinct simulation, shadow, replay, and live modes.
7. Make resource cost, uncertainty, reversibility, and verification visible.
8. Accrete verified lessons through scenarios and contracts rather than prompt growth.

### Resolve during implementation with evidence

1. Whether the first event ledger remains in memory plus export or moves directly to IndexedDB.
2. Which schema library best fits the existing bundle and TypeScript toolchain.
3. Whether multi-domain compensation needs a generic saga runner after the first three vertical slices.
4. Which Level 0 fields deliver the best decision quality per byte in agent evaluations.
5. Which operational capabilities justify bounded autonomous authority after shadow trials.

These questions do not change the architecture. The execution contract records the conservative default and the evidence required for each decision.
