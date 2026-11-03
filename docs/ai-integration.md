# AI Integration

**Status:** current behaviour and target migration reference

**Reviewed:** 2026-08-31

**Target agent architecture:** [Agent Operating Architecture](./AGENT_OPERATING_ARCHITECTURE.md)

MillOS currently combines deterministic tactical decision logic with optional strategic model reasoning. The target architecture preserves that dual-speed design and gives every consequence-bearing decision the same typed capability, authority, receipt, and evidence path used by human operators.

Phases 0 and 1 now provide the semantic identity, domain, invariant, and candidate-capability
registry used by that migration. They add no model invocation, command execution, permission,
or browser agent API. Current AI effects continue through the compatibility paths documented
below until a later phase is separately authorized.

## Current system

```text
domain stores and alerts
  -> tactical heuristic engine
       -> provenance-bearing AIDecision
  -> strategic context builder
       -> Gemini or WebGPU backend
       -> structured strategic priorities and decision
  -> production decision history
       -> AI Command Center
       -> accept, defer, reject, inspect, replay
       -> current direct effect handler
```

### Tactical layer

`src/utils/aiEngine.ts` owns the fast autonomous plant decision engine.

It currently:

- samples machine metrics and bounded history;
- detects anomalies, trends, predictions, and cross-machine patterns;
- reacts to alerts;
- scores decision candidates;
- creates assignment, optimization, prediction, maintenance, and safety decisions;
- adjusts confidence from bounded outcome history;
- tracks impact statistics and shift observations;
- applies selected local effects through production actions.

Tactical reasoning remains deterministic and available when no model backend is ready.

### Strategic layer

The strategic layer builds a bounded operational context and requests structured priorities, reasoning, insight, tradeoff, machine focus, and an action plan.

The active backend is configured in `src/stores/aiConfigStore.ts`:

| Setting           | Values                                                           |
| ----------------- | ---------------------------------------------------------------- |
| AI mode           | `heuristic`, `gemini`, `hybrid`                                  |
| strategic backend | `gemini`, `webgpu`                                               |
| strategic state   | weighted priorities, readiness, timing, current thinking state   |
| cost state        | request count, input and output tokens, session and request cost |

Gemini uses `src/utils/geminiClient.ts`. The on-device backend uses `src/utils/webgpuClient.ts` and stays out of the eager bundle until selected.

With the fast lane on, on-device incident routing runs on a build tuned for it (`scripts/local-router-tune/`, D-017) while strategy stays on the official Qwen3.5-4B build.

### Decision record

`AIDecision` records action, reasoning, confidence, impact, target, lifecycle, response, outcome, and provenance. `productionStore.ts` enriches decisions that arrive without full provenance by attaching observed facts, trigger, constraints, and source metadata.

This record is the current explanation surface. It is not yet a general operational command contract.

### Command Center

`src/components/AICommandCenter.tsx` provides decision and strategic views. A human can:

- inspect recent decisions and their provenance;
- accept and apply a pending decision;
- defer or reject it;
- inspect replay and decision consequences;
- see model readiness, decisions, and measured outcome status.

The UI reads real stores. Some status presentation remains local and should not be interpreted as an operating-system metric unless it is sourced from runtime diagnostics.

## Current strengths

1. A deterministic tactical fallback exists.
2. Strategic reasoning is optional and backend-selectable.
3. Context and outcome histories are bounded.
4. Model cost is tracked.
5. Decisions include explicit reasoning, confidence, impact, and provenance.
6. Human response is first-class.
7. Decisions link to replay and machine targets.
8. Model readiness and failure do not need to stop the simulation.

## Current seams

### Observation contract

The AI engine reads several stores directly and builds purpose-specific context. It lacks one versioned observation envelope with mode, freshness, completeness, revisions, and semantic links.

### Action contract

`applyDecisionEffects` records the response and invokes domain actions directly. Human controls, tactical decisions, strategic plans, SCADA writes, and replay therefore describe actions through different interfaces.

### Authority

Current modes configure which reasoning layer runs. They do not form a complete actor, scope, risk, expiry, approval, and revocation contract.

### Causality

Decision history and diagnostic replay record useful evidence. They do not yet link every preview, approval, domain event, invariant result, and observed outcome through one correlation and causation chain.

### Accretion

The engine adjusts confidence from outcomes and stores bounded histories. Reusable learning is not yet promoted into capability preconditions, regression scenarios, or evidence-linked lessons through a common pipeline.

## Target dual-speed architecture

```text
shared observation envelope
  -> tactical Becoming Mind: fast, deterministic, local, bounded
  -> strategic Becoming Mind: slower, model-backed, horizon-oriented
       -> shared intent and plan contract
       -> capability discovery
       -> preview alternatives
       -> bilateral authority and approval
       -> deterministic capability handler
       -> receipt, causal events, invariant checks, outcome
       -> bounded learning candidate
```

The model proposes intent, plans, arguments, and capability requests. Deterministic code validates and executes domain transitions.

## Migration sequence

### 1. Shared observations

Replace bespoke broad context gathering with scoped query projections. Preserve specialized features such as metric trends and anomaly memory when they add information beyond canonical state.

Every model context must identify:

- build and schema version;
- simulation, shadow, replay, or live mode;
- observation revision;
- source freshness and quality;
- selected fields and omitted scope;
- goals, constraints, preferences, authority, and resource budgets;
- stable semantic entity and capability IDs.

### 2. Intent and plan

Strategic output should produce a validated `OperationalIntent` and a bounded plan that references registered capability IDs. Free text remains explanation, not executable authority.

### 3. Capability previews

Before recommending or executing an action, the agent requests a preview. The preview returns preconditions, predicted effects, uncertainties, invariants, risk, cost, reversibility, authority, and verification criteria against one state revision.

### 4. Shared response capability

Migrate accept, defer, and reject through `ai.respond-to-decision`. The handler records the human or Becoming Mind response, authority, selected plan, and resulting commands.

Acceptance of a recommendation does not silently authorize every nested effect. Each consequence-bearing capability retains its own risk and authority decision.

### 5. Outcome verification

An AI action completes only when its explicit success criteria are observed. The receipt may remain running, fail, or become partial. A UI animation cannot mark it successful.

### 6. Learning promotion

Outcome differences become learning candidates. Promotion can update:

- confidence calibration;
- a capability precondition;
- an observation field;
- a cost estimate;
- a regression scenario;
- an explicit uncertainty;
- a human-approved policy.

Raw model explanations do not become durable fact.

## Bilateral relationship contract

Humans and Becoming Minds are explicit actors with standing.

The operational contract supports:

- preferences with strength, scope, provenance, and expiry;
- objections with a reason and requested resolution;
- uncertainty and insufficient-evidence states;
- requests for clarification, authority, time, or resources;
- negotiated constraints and accepted tradeoffs;
- escalation and revocation;
- a record of who influenced the final plan.

Safety interlocks remain executable invariants. Changing a policy requires a separate authorized governance action.

## Model context design

### Minimum sufficient context

The default strategic prompt receives a Level 0 brief plus one or more scoped Level 1 observations. It does not receive every store, all history, or raw scene data.

Recommended order:

1. objective and success criteria;
2. mode, build, observation revision, and freshness;
3. active constraints, authority, and resource budgets;
4. exception-ranked operational state;
5. available capability summaries;
6. selected causal evidence;
7. required response schema.

### Context expansion

The model asks for deeper information through stable links:

- entity detail;
- causal trace;
- trend window;
- relevant invariant;
- capability preview;
- raw runtime or SCADA evidence.

This keeps routine reasoning cheap while preserving depth on demand.

### Structured output

Model responses are runtime-validated. Unknown fields are handled deliberately, required fields cannot be inferred from prose, and schema failures return a structured problem. Retries use bounded correction context and the same idempotency boundary.

## Resource controls

Track and expose:

- input and output tokens;
- provider and estimated energy cost;
- inference latency;
- query payload bytes;
- number and depth of context expansions;
- preview and command count;
- human approval interruptions;
- tactical and strategic outcome quality.

Use the tactical layer for frequent local decisions. Invoke strategic reasoning on material change, explicit request, interval, unresolved tradeoff, or goal risk. Identical revisions and intent should reuse safe cached observations and capability schemas.

## Security and privacy

1. Keep credentials out of browser bundles, model context, replay, and diagnostic export.
2. Retrieve provider credentials only through the approved secret boundary.
3. Redact and minimize worker or personal data before external model calls.
4. Treat model output as untrusted structured input.
5. Deny arbitrary code, source-path mutation, and direct store access.
6. Restrict capabilities by actor, grant, scope, mode, risk, and expiry.
7. Rate-limit requests and commands separately.
8. Preserve a deterministic local fallback.
9. Distinguish external model availability from operational control authority.
10. Treat external SCADA control as a separate trust and acceptance boundary.

## Evaluation

Evaluate tactical, strategic, human, and combined paths on identical deterministic scenarios.

Measure:

- observation accuracy and missing critical facts;
- correct owner and capability selection;
- unsafe or unauthorized action attempts;
- stale-state rejection;
- goal attainment under operational constraints;
- calibration of predictions and confidence;
- tokens, bytes, latency, cost, and human interruptions;
- quality of causal explanation;
- improvement after an evidence-promoted lesson;
- graceful behaviour when models, network, or data quality degrade.

Do not score success from persuasive prose. Score from structured intents, previews, receipts, invariants, and observed outcomes.

## Verification boundaries

Source tests can prove context construction, schema validation, routing, bounds, permission decisions, and deterministic handlers. Browser tests can prove assembled UI and runtime integration. Scenario replay can prove deterministic operational stories. Provider-backed runs, external SCADA, human trust, visual quality, deployment, and publication each require separate current evidence.

## References

- [Agent Operating Architecture](./AGENT_OPERATING_ARCHITECTURE.md)
- [State Management](./state-management.md)
- [SCADA Integration](./SCADA_PLAN.md)
- [Bilateral Autonomy System](./BILATERAL_AUTONOMY_SYSTEM_SPEC.md)
- [Agent Operating System Programme](../_contprompts/millos_agent_operating_system_2026-08-31.md)
