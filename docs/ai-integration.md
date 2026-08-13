# AI Integration

MillOS combines a deterministic heuristic layer with an optional strategic language-model layer. It is a simulator and research interface. AI recommendations do not authorize plant actions.

## Operating modes

| Mode      | Tactical layer | Strategic layer      |
| --------- | -------------- | -------------------- |
| heuristic | Local rules    | Off                  |
| gemini    | Off            | Selected LLM backend |
| hybrid    | Local rules    | Selected LLM backend |

The strategic backend is selected independently:

- **Gemini:** cloud inference through the official @google/genai SDK.
- **WebGPU:** optional local inference through @mlc-ai/web-llm on compatible browsers.

Connecting either strategic backend promotes the normal interactive configuration to hybrid mode. Returning preferences can preserve a chosen mode, while runtime connection and model readiness are session state.

## Gemini model chain

src/utils/geminiClient.ts tries current stable models in this order:

1. gemini-3.6-flash;
2. gemini-3.5-flash;
3. gemini-3.5-flash-lite.

A model-unavailable response advances to the next candidate. Transient failures feed a circuit breaker instead of silently changing models. The client also bounds prompt size, caches exact repeated prompts briefly, masks keys for display, and clears all client state on disconnect.

Model availability and pricing change. Source comments record the date on which the chain and cost table were verified. Refresh both together against Google's official model and pricing documentation.

## Credential handling

Open the in-app Gemini settings and paste a key only when cloud inference is wanted.

The key:

1. stays in live JavaScript memory;
2. is never included in the Zustand persisted state;
3. is cleared on reload, tab close, explicit disconnect, or failed validation;
4. is never read from .env.local or a VITE\_\* build variable;
5. is never embedded in the static bundle.

Persistence version 1 migrates old version 0 data by deleting any stored Gemini key. When an old cloud-backed mode loses its stored key, the migration returns the application to heuristic mode. Ordinary preferences survive.

Browser memory is still part of the page's trust boundary. Third-party code executing in the same origin could read live application state. Use a restricted key, monitor usage, and revoke it if exposure is suspected.

## Data flow

For Gemini, selected simulation context is sent from the browser to Google. Review Google account, API, retention, and regional terms before use with sensitive data. MillOS does not provide a privacy gateway or organizational data-loss-prevention layer.

For WebGPU, inference runs locally after model weights are obtained and cached by the browser. The engine and GPU allocations are recreated for each session. Local operation avoids sending inference prompts to Gemini, though the initial model download still contacts the model host.

## Strategic decision flow

The strategic layer receives a bounded representation of current simulator state, including machine conditions, production context, active priorities, and BAS-derived behavior settings. It requests structured reasoning, parses the response defensively, and exposes recommendations through the AI interface.

The BAS axes influence proactivity, transparency, tone, suggestion frequency, and whether the system defers to worker or democratic decisions. These controls shape presentation and cadence. They do not turn an LLM response into a validated industrial command.

## Cost tracking

The Gemini UI estimates input and output tokens from character counts and applies the active model's verified paid-tier text prices. The display is an estimate, not a billing record. Google's account console remains authoritative.

The current source table deliberately prices an unknown model at the most expensive known fallback, which biases uncertainty toward overestimating cost.

## Failure behavior

The strategic layer fails safely back toward local operation:

- missing or invalid key: Gemini remains disconnected;
- unavailable primary model: advance through the maintained stable chain;
- repeated API failures: open the circuit temporarily;
- oversized context: truncate or reject before an unbounded request;
- reload or tab close: discard the session key;
- unsupported WebGPU: retain heuristic operation and explain the compatibility failure;
- cancelled or failed local model load: release partial runtime state.

Heuristic simulation remains available when no strategic backend is ready.

## Verification

The maintained non-network unit tests mock the official SDK and cover initialization, generation, model fallback, circuit behavior, disconnect, and persisted-secret migration.

    npm run typecheck
    npm run lint
    npm run format:check
    npm test
    npm run build

A mocked test does not prove that a real Google account, quota, model entitlement, browser GPU, or network path works. Those remain environment-specific checks with restricted test data.

## Key files

| File                                   | Responsibility                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| src/stores/aiConfigStore.ts            | modes, backend lifecycle, preference persistence, secret migration, cost estimates |
| src/utils/geminiClient.ts              | official SDK wrapper, model fallback, prompt bounds, cache, circuit breaker        |
| src/utils/webgpuClient.ts              | local model loading, compatibility, inference, cleanup                             |
| src/components/GeminiSettingsModal.tsx | backend selection, session credential entry, connection status                     |
| src/utils/aiEngine.ts                  | strategic prompt construction, response parsing, and decision lifecycle            |

## Non-goals and gates

MillOS does not claim AI safety certification, autonomous plant control, factual correctness of recommendations, privacy approval for sensitive operational data, or a production quota and key-management service. Physical integration requires independent hazard analysis, deterministic interlocks, operator authority, audit, safe-state behavior, and site acceptance.
