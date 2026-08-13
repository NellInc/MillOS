---
title: MillOS exhaustive improvement programme
date: 2026-08-12
candidate: 1a6f4d45cf1a6b2f9cae0fe4a09dd4de273fa334
status: implemented-machine-verified-with-runtime-capacity-gate
---

# MillOS Exhaustive Improvement Programme

## Goal

Comprehensively audit the MillOS repository and current runtime-facing product across architecture, correctness, security, performance, accessibility, UX, visual quality, testing, tooling, documentation, and maintainability. Produce an evidence-backed improvement backlog, implement every safe and coherent local improvement, and keep machine evidence separate from human, rights, industrial, publication, and external-system decisions.

## Definition of done

1. The source candidate is isolated from unrelated work and its original baseline is recorded.
2. Every material improvement has a priority, evidence, an action, acceptance criteria, and a status.
3. Safe local P0, P1, and P2 corrections are implemented in one coherent candidate.
4. Typecheck, lint, formatting, unit tests, coverage, build, bundle, asset, depth, shader, credit, dependency, cycle, SCADA, infrastructure, accessibility, interaction, and performance gates are run against that exact candidate.
5. Native runtime artifacts are visually inspected, but machine screenshots do not claim human visual approval.
6. Unresolved work is classified precisely. No source or static check is promoted to runtime, safety, rights, human, or publication acceptance.

## Scope and evidence model

This programme covers the active React and Three.js product, its static release archives, the SCADA proxy, Docker and Kubernetes descriptions, CI and deployment workflows, assets, music and model attribution, testing, documentation, and repository hygiene.

Evidence classes remain separate:

| Evidence                        | What it can establish                                                          | What it cannot establish                                      |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Static source and configuration | Reachability, typing, schema, policy, dependency, and configuration properties | Browser behavior, frame rate, plant safety, licence authority |
| Unit and integration tests      | Deterministic behavior under the exercised conditions                          | Full browser, device, protocol, and plant behavior            |
| Browser and native capture      | Behavior on the tested machine and exact candidate                             | Human taste, all devices, safety certification                |
| Asset and credit manifests      | Internal consistency and traceable attribution                                 | Independent title clearance or upstream file identity         |
| Human review                    | Aesthetic and product acceptance for the shown candidate                       | Machine correctness outside the reviewed artifact             |
| Site and plant acceptance       | Authorization for an actual environment                                        | General certification elsewhere                               |

## Baseline

The baseline candidate was `1a6f4d45cf1a6b2f9cae0fe4a09dd4de273fa334`. Work now resides in the persistent isolated worktree `/Users/nellwatson/Documents/GitHub/MillOS-codex-exhaustive-improvements` on `codex/exhaustive-improvements`. The original temporary worktree was removed by the host between continuation turns, so its exact successful patch and shell-mutation history was reconstructed from the append-only session record into this persistent worktree and revalidated. The main checkout's unrelated untracked contprompt and songbook remained untouched.

Baseline evidence:

- Typecheck, lint, source formatting, asset validation, depth validation, shader validation, Impeccable design lint, build, bundle budget, and all 99 Vitest files passed.
- The Vitest baseline contained 1,638 passing tests and took 1,173 seconds on a saturated host.
- Initial JavaScript measured 0.59 MiB gzip. The built current release measured 100.64 MiB.
- Root and proxy dependency audits each reported three high-severity findings before compatible updates.
- Madge reported nine circular dependency chains.
- Knip found 89 unreachable active source files, 596 unused exports, 247 unused types, 53 duplicate exports, three unlisted dependencies or binaries, and a Vite asset false positive.
- The repository contained 1,824 tracked files and roughly 990 MiB. `dist-archives` duplicated public release payloads and consumed roughly 398 MiB.
- The SCADA proxy's lint command did not lint its source, it had no maintained test suite, and production writes inherited a single credential.
- Coverage included only `src/scada`, had no threshold, and therefore did not measure the repository named by the command.
- The About dialog contained incorrect forklift, character, and industrial model credits, plus incomplete soundtrack credits.
- Current and legacy soundtrack selection was duplicated across source and build scripts.

## Completed improvements

### P0 correctness and protocol contracts

| Improvement                                    | Evidence and defect                                                                         | Action                                                                                       | Acceptance                                                                  | Status   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| Separate VCP mastery from meaning              | `M` encoded both meaning and mastery, so one dimension could not round-trip                 | Assigned `Y` to mastery, retained legacy `M` decoding as meaning                             | Current wellbeing and reasoning payloads round-trip; legacy payloads decode | Complete |
| Preserve old VCP readers                       | A symbol correction could silently reinterpret persisted payloads                           | Kept `M` as the legacy meaning symbol and added compatibility tests                          | Legacy fixture semantics unchanged                                          | Complete |
| Serialize Modbus slave selection and I/O       | Shared `setID` could race concurrent polls and writes across slaves                         | Serialized slave selection with each asynchronous operation                                  | Concurrency test proves no cross-slave operation                            | Complete |
| Make Modbus byte and word transforms symmetric | Read and write transforms were incomplete and ambiguous                                     | Added explicit byte and word swap configuration on both paths                                | Codec round-trips cover every supported ordering                            | Complete |
| Use configured OPC UA data types               | Integer-looking JavaScript values could turn a declared float tag into an integer Variant   | Constructed Variants from the tag declaration                                                | Adapter test writes configured FLOAT32 as Float                             | Complete |
| Reject unsafe SCADA writes                     | Read-only tags, type coercion, nonfinite values, and range violations could cross the proxy | Central validation enforces access, type, length, integer, intrinsic, and engineering bounds | Focused validation and server tests reject every unsafe case                | Complete |
| Validate tag definitions at startup            | Duplicate IDs, unsafe paths, invalid bounds, and invalid Modbus addresses were accepted     | Added bounded schema parsing and fail-fast production loading                                | Registry tests cover valid and invalid definitions                          | Complete |

### P0 security and industrial boundary

| Improvement                          | Evidence and defect                                                                         | Action                                                                                                  | Acceptance                                                  | Status                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- |
| Fail closed in production            | Production could start without a read credential                                            | Production now requires `SCADA_API_KEY`                                                                 | Missing key exits before listening                          | Complete                         |
| Separate read and write authority    | One bearer key could implicitly grant writes                                                | Writes default off and require a distinct write key in production                                       | REST and WebSocket capability tests prove separation        | Complete                         |
| Make browser origins exact           | Origin parsing tolerated overly broad configuration                                         | Parse and deduplicate exact HTTP origins, reject paths and wildcards                                    | Origin tests and production server tests pass               | Complete                         |
| Retain machine-client access safely  | Requiring an Origin on every REST call would break legitimate authenticated machine clients | Allow absent REST Origin only with authentication, require exact Origin for browser WebSockets          | Production integration test exercises both clients          | Complete                         |
| Bound requests and connections       | HTTP, WebSocket payload, message, and client capacity were not independently bounded        | Added general and write limits, 32 KiB caps, connection cap, heartbeat cleanup                          | Server tests and configuration validation pass              | Complete                         |
| Harden WebSocket credentials         | Query credentials leak into logs and history                                                | Added base64url subprotocol credentials, retaining query format as a declared compatibility path        | Parser and production connection tests pass                 | Complete, legacy removal pending |
| Make readiness meaningful            | Health did not distinguish disconnected configured adapters                                 | `/ready` returns failure when a configured adapter is disconnected                                      | Probe behavior covered by server test                       | Complete                         |
| Fail closed on OPC UA transport      | Security mode, policy, certificates, and credentials were weakly structured                 | Production requires encrypted enums and paired identity material                                        | Adapter build and configuration documentation pass          | Complete                         |
| Remove false Kubernetes scale claims | Multiple replicas would duplicate ownership of industrial connections                       | Fixed deployment to one replica and removed HPA until leader election exists                            | Kustomize output contains one replica and no HPA            | Complete                         |
| Correct Kubernetes trust boundary    | Ingress and egress selectors contained stale or overly broad assumptions                    | Corrected ingress namespace selection and reduced base egress to DNS; site plant CIDRs move to overlays | Kustomize and NetworkPolicy inspection pass                 | Complete                         |
| Align Kubernetes secret contract     | `API_KEY` and `SCADA_API_KEY` naming diverged                                               | Standardized the manifest on `SCADA_API_KEY`; deployment verifies nonempty and distinct write data      | Rendered env and deployment workflow use the same keys      | Complete                         |
| Pin GitHub Actions                   | Moving or floating action references create supply-chain drift                              | Pinned every action to an immutable commit, including a current Trivy release                           | Actionlint passes and no `uses` line contains a mutable tag | Complete                         |
| Remove vulnerable dependencies       | Both package trees reported high-severity audit findings                                    | Applied compatible updates and exact lockfiles                                                          | Both `npm audit` runs report zero vulnerabilities           | Complete                         |
| Publish a security policy            | The project had no top-level reporting or industrial safety boundary                        | Added `SECURITY.md` with private reporting, supported surfaces, and plant gates                         | Policy is linked from README                                | Complete                         |

### P1 architecture and maintainability

| Improvement                           | Evidence and defect                                                                                           | Action                                                                                                   | Acceptance                                                                    | Status   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Eliminate all dependency cycles       | Madge reported nine cycles across dock, VCP, and stores                                                       | Extracted dock types, used direct imports, extracted welfare feedback, and moved subscription ownership  | Madge reports zero cycles                                                     | Complete |
| Remove unreachable active source      | Knip found 89 files with no entry-path reachability                                                           | Deleted the proven dead source and its stale barrels, including disabled model paths and shader families | Production and test typecheck pass; dead-code gate reports zero scoped issues | Complete |
| Remove stale embedded archives        | `src/0.10 Archive` duplicated obsolete source inside the active compiler tree                                 | Deleted the 55-file archive                                                                              | Active source inventory no longer includes archived source                    | Complete |
| Remove duplicate release artifacts    | `dist-archives` repeated `public` release payloads byte-for-byte                                              | Verified payload identity, removed the tracked duplicate, and ignored regeneration output                | Build uses canonical `public` archives; repository footprint falls materially | Complete |
| Preserve README imagery               | README referenced the removed archive screenshot                                                              | Copied its identical bytes to `docs/assets/MillOSInterior.png` and updated the link                      | README image resolves from a maintained path                                  | Complete |
| Remove dead graphics settings         | Four persisted toggles had no runtime effect                                                                  | Removed fields, UI references, presets, and migrated version 5 data                                      | Graphics store tests cover migration and current schema                       | Complete |
| Remove fictional model loader surface | Missing character and machine paths, dead preload helpers, and false source recommendations remained exported | Reduced the loader to delivered models and removed dead model components and barrels                     | Model tests and reachability check pass                                       | Complete |
| Add a maintained dead-code gate       | Generic Knip output was noisy and not enforceable                                                             | Added a scoped Knip config, pinned Knip, and created `check:dead-code`                                   | Gate reports zero files, dependency, binary, unresolved, or cycle issues      | Complete |
| Keep shader registry truthful         | Deleting dead shader sources left stale contracts and allow-list mutes                                        | Removed stale contracts and all dead exceptions; corrected terrain key version                           | Validator covers 19 live families, 16 keys, 13 sites, zero allow-list entries | Complete |

### P1 testing and tooling

| Improvement                            | Evidence and defect                                                                    | Action                                                                                    | Acceptance                                                                       | Status                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Typecheck maintained tests and configs | The prior typecheck excluded tests, E2E, and several configurations                    | Added `tsconfig.tests.json` and made `typecheck` run both projects                        | All maintained TypeScript passes                                                 | Complete                                                                                  |
| Lint the maintained repository         | SCADA lint ignored its code and root lint omitted E2E and scripts                      | Added flat proxy ESLint and expanded root lint targets                                    | Both lint commands pass                                                          | Complete                                                                                  |
| Format the maintained repository       | Root formatting only covered `src`                                                     | Expanded formatting to E2E, scripts, root configs, and workflows; added proxy format gate | Both formatting checks pass                                                      | Complete                                                                                  |
| Make coverage honest                   | Coverage silently measured only one subsystem and had no threshold                     | Expanded coverage to production `src` and added an initial 10 percent global floor        | Full coverage run must pass the declared floor                                   | Complete: 1,646 tests; statements 25.54%, branches 19.75%, functions 24.01%, lines 25.85% |
| Add SCADA tests                        | Proxy had no maintained behavioral test suite                                          | Added security, validation, server, codec, concurrency, and OPC UA type tests             | 12 proxy tests pass                                                              | Complete                                                                                  |
| Harden CI parity                       | Build CI omitted asset, depth, shader, bundle, formatting, credit, and dead-code gates | Added each deterministic repository gate to CI and deployment validation                  | Workflow syntax passes Actionlint                                                | Complete                                                                                  |
| Verify attribution as code             | Credits could drift independently from files and runtime                               | Added `validate:credits` and wired it to CI                                               | All 26 MP3 files, 10 playlist tracks, one fanfare, ISRCs, and text credits agree | Complete                                                                                  |

### P1 rights and attribution hygiene

| Improvement                            | Evidence and defect                                                              | Action                                                                                  | Acceptance                                                                              | Status   |
| -------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Correct model credits                  | About claimed a different forklift and character sources than the asset manifest | Render credits directly from the delivery manifest                                      | Dialog shows Mantas Stankaitis, Kenney, and both Quaternius packs with correct licences | Complete |
| Record every soundtrack file           | Only a generic composer credit existed while 26 MP3s ship                        | Added canonical title, file, artist, ISRC, role, catalog, and CC BY 4.0 data            | Every public MP3 appears exactly once                                                   | Complete |
| Remove soundtrack duplication in code  | Audio manager, Vite, and bundle validation repeated an 11-file list              | Derived all three from `music-credits.json`                                             | Runtime and build agree by construction                                                 | Complete |
| Deliver usable attribution             | Legacy releases received MP3 backports without a title-level notice              | Added `MUSIC_CREDITS.txt` and copy it with both archives                                | Current and archived publication staging includes the credit file                       | Complete |
| State attribution uncertainty honestly | Repository MP3s were not compared to current upstream downloads                  | Credit notice says no intentional modification and records the unverified byte identity | No independent clearance claim is made                                                  | Complete |

### P1 UX, accessibility, and visual integrity

| Improvement                             | Evidence and defect                                                      | Action                                                                                                  | Acceptance                                | Status                              |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| Make long About content usable          | Correct credits exceed the former narrow, non-scrolling modal            | Added responsive width, bounded height, and scrolling                                                   | Desktop and mobile dialog remain operable | Complete, runtime evidence pending  |
| Test credits in the product             | Static attribution data does not prove the operator can reach or read it | Extended Playwright to open About, inspect title-level music and model credits, run axe, and capture it | Browser test and screenshot pass          | Implemented, final evidence pending |
| Preserve reduced motion and target size | UI refinements can regress established access behavior                   | Existing master E2E checks reduced motion, focus, inertness, WCAG, and 44 px mobile targets             | Master E2E passes on exact candidate      | Final evidence pending              |
| Run deterministic design lint           | Generic UI changes often introduce avoidable design slop                 | Require `npx impeccable detect src` after frontend work                                                 | No untriaged finding remains              | Final evidence pending              |

### P2 documentation and operational clarity

| Improvement                    | Evidence and defect                                                        | Action                                                                                                            | Acceptance                                           | Status   |
| ------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| Rewrite proxy documentation    | Previous text overstated production readiness and omitted current controls | Rewrote README, security configuration, and audit around fail-closed behavior and remaining gates                 | Documentation matches source and manifests           | Complete |
| Document exact commands        | Root README only listed four broad scripts                                 | Added typecheck, lint, formatting, coverage, E2E, architecture, asset, credit, depth, shader, and bundle commands | A contributor can reproduce every deterministic gate | Complete |
| Correct Node and Compose usage | README named Node 18 and the obsolete `docker-compose` form                | Requires Node 20 and uses `docker compose`                                                                        | Documentation matches CI and current Compose         | Complete |
| Replace “nothing planned”      | The repository had a large evidence backlog while claiming no planned work | Link this finite programme from the roadmap                                                                       | Open work is visible and classified                  | Complete |

## Remaining improvement backlog

These are worth doing, but are either separately bounded future work or require evidence or authority not transferable from this audit.

### P0 external industrial and production gates

| Improvement                                  | Why it remains                                                                                 | Required evidence and acceptance                                                                  | Gate                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Independent plant hazard analysis            | Source hardening cannot establish safe control of physical machinery                           | Qualified site owner approves hazards, interlocks, safe states, and rollback                      | Industrial human authority         |
| Representative OPC UA and Modbus integration | Local mocks cannot reproduce vendor timing, certificates, register behavior, or network faults | Tests against representative equipment, certificate trust, reconnect, timeout, and fault recovery | External hardware and network      |
| Site tag map and engineering ranges          | Repository defaults cannot be authoritative for a real mill                                    | Signed tag inventory, addresses, types, access, units, and limits                                 | Plant owner                        |
| Managed PKI and key rotation                 | No local repository change can install production identities safely                            | Secret manager, certificate lifecycle, revocation, rotation drill, audit                          | External infrastructure            |
| Exact plant egress overlay                   | Base NetworkPolicy cannot guess plant subnets                                                  | Approved CIDRs and ports in an environment overlay, independently reviewed                        | Site network authority             |
| Operational monitoring and incident response | The proxy exposes health but no external ownership                                             | Alerting, retained audit sink, runbook, on-call ownership, recovery exercise                      | Operations authority               |
| Write authorization                          | Write capability changes physical risk                                                         | Separate environment approval, key, least-privilege map, interlock proof, and rollback            | Explicit human authorization       |
| Independent penetration test                 | The unavailable managed deep scanner and local manual review are not an external assessment    | Read-only scan plus human validation against the exact deployment candidate                       | Security reviewer and managed scan |

### P1 runtime, accessibility, and performance evidence

| Improvement                     | Evidence                                                                                                               | Recommended action                                                                                             | Acceptance                                                             | Status                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Full Playwright interaction run | Two serial browser tests cover the canonical UI and axe states                                                         | Run on the exact final build with one owned browser and no foreign server reuse                                | Both tests pass with zero console, page, request, and axe failures     | Complete: 2 passed in 1.1 minutes                                                                                            |
| Native art capture              | Visual correctness cannot be inferred from code                                                                        | Run `capture:art`, inspect its contact sheet and individual frames                                             | Complete capture, no blank or corrupt frame, artifact shown for review | Machine complete: 12 scenes and contact sheet; human approval remains gated                                                  |
| Runtime benchmark               | Static bundle budgets do not establish frame behavior                                                                  | Run `benchmark:runtime` under resource-stable conditions                                                       | Script thresholds pass and report exact candidate                      | External capacity gate: packet captured, but recurring foreign browsers drove load to 452; no performance acceptance claimed |
| Cross-device accessibility      | Chromium desktop and emulated mobile do not cover assistive technology                                                 | VoiceOver keyboard pass on macOS plus a real touch device                                                      | Human completion of named journeys with no blocker                     | Human/device gate                                                                                                            |
| Human visual approval           | Machine inspection cannot decide authored quality                                                                      | Review native contact sheet and key UI captures                                                                | Explicit approval of exact artifacts                                   | Human taste gate                                                                                                             |
| Personnel geometry programme    | Accepted worker presence work exists on a separate branch, while the baseline branch still needs its next native proof | Reconcile the accepted branch deliberately, then run geometry validation, capture, benchmark, and human review | Candidate-bound native and human evidence                              | Separate candidate and human gate                                                                                            |

### P1 rights and publication authority

| Improvement                               | Evidence                                                                                                                               | Recommended action                                                                   | Acceptance                                        | Gate                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------- |
| Independent music provenance confirmation | Official catalog metadata matches all 26 titles and ISRCs, but local files were not hashed against upstream                            | Retain acquisition records or compare lawful upstream originals                      | Per-file source record and modification statement | Rights review          |
| Model provenance packet                   | Manifest records sources and licences, but this audit did not independently retrieve historical source pages or transformation records | Preserve source download, licence snapshot, and authored derivative history          | Rights reviewer accepts each asset packet         | Rights review          |
| Historical release publication decision   | `public/v0.20` deliberately carries roughly 382 MiB including source zips and duplicates                                               | Decide whether archival completeness or a lean immutable release is the product goal | Publication owner signs the archive policy        | Publication authority  |
| Publish this candidate                    | Local validation never authorizes deployment                                                                                           | Review diff, visual evidence, rights notes, and release scope                        | Explicit merge and deployment authority           | Human publication gate |

### P2 maintainability and architecture

| Improvement                           | Evidence                                                                                                                                                   | Recommended action                                                                                        | Acceptance                                                         | Status                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| Split `FactoryExterior.tsx`           | 7,681 lines, mixed terrain, structures, water, props, and effects                                                                                          | Extract cohesive scene modules without changing runtime behavior                                          | File sizes fall, snapshots and runtime evidence remain equal       | Future bounded refactor  |
| Split `TruckBay.tsx`                  | 6,271 lines and overlapping optimized truck-bay implementation                                                                                             | Establish one canonical bay composition, then extract simulation, geometry, and decoration                | One implementation path and unchanged native behavior              | Future bounded refactor  |
| Split `audioManager.ts`               | 6,000 lines combine state, synthesis, music, ambience, PA, TTS, and effects                                                                                | Separate pure mix policy, lifecycle, music, generated effects, and speech behind one facade               | Unit contracts and runtime audio acceptance pass                   | Future bounded refactor  |
| Split `aiEngine.ts`                   | 4,542 lines mix policy, prompts, decision generation, metrics, and side effects                                                                            | Extract deterministic policy and external-model boundary                                                  | Existing decision tests plus new boundary tests pass               | Future bounded refactor  |
| Split `game/shared.tsx`               | 3,602 lines and broad re-export surface                                                                                                                    | Divide domain systems and remove duplicate barrel exports                                                 | No cycles, dead-code gate clean                                    | Future bounded refactor  |
| Reduce public barrel surface          | Knip still identifies 149 unused exports, 72 unused exported types, and 53 duplicate exports when run in export mode                                       | Prune one domain at a time with explicit public API decisions                                             | Export-mode report reaches an agreed budget without breaking tests | Future API governance    |
| Remove stale root performance scripts | Repository search found no maintained caller for the three root Puppeteer scripts or console-paste profiler; they overlapped the candidate-bound benchmark | Deleted the four stale entry points and updated maintained documentation to use npm run benchmark:runtime | One documented automated performance entry path                    | Completed in second pass |
| Add architecture boundaries           | Zero cycles does not stop future layer inversions                                                                                                          | Add dependency-cruiser or equivalent rules only after owners agree on layers                              | CI rejects a proven forbidden edge                                 | Architecture decision    |

### P2 performance and asset delivery

| Improvement                             | Evidence                                                                              | Recommended action                                                            | Acceptance                                                                  | Status                      |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Compress authored personnel GLBs        | Masculine and feminine models total roughly 2.8 MiB and contain compressible geometry | Trial Meshopt or Draco with exact animation and skin validation               | Smaller transfer, unchanged required nodes and animations, human comparison | Asset and visual gate       |
| Review WebGPU optional chunk            | Local neural runtime is roughly 6 MiB and intentionally lazy                          | Measure opt-in load, cache, memory, cancellation, and unsupported-device path | No initial graph inclusion; bounded opt-in latency and memory               | Device/runtime gate         |
| Review Rapier optional chunk            | Physics WASM is roughly 2.2 MiB and lazy                                              | Measure first-use delay and whether canonical journeys need eager warmup      | No initial regression, acceptable first-use latency                         | Runtime gate                |
| Establish asset download budgets        | Current bundle budget allows 170 MiB, dominated by static audio and assets            | Define route-level transfer budgets and cache-hit targets                     | Cold and warm measurements on representative network                        | Product/runtime decision    |
| Pin container images by digest          | Docker base and optional simulator images remain tag-based                            | Establish an update owner and digest refresh automation before pinning        | Immutable digests plus a documented refresh cadence                         | Operations decision         |
| Remove optional simulator `latest` tags | OPC PLC and Modbus simulator tags can drift                                           | Select tested versions or digests                                             | Compose smoke tests against selected images                                 | External image verification |

### P2 dependencies and platform migrations

Compatible updates and audit fixes are complete. Major versions remain deliberate migrations:

- `@testing-library/jest-dom` 7
- Node type definitions 26
- Three.js and its type definitions 0.185
- Framer Motion 13
- globals 17
- jsdom 30
- Lucide React 1
- TypeScript 7
- Vite 8
- SCADA Express and Express types 5
- SCADA dotenv 17

Each migration needs release notes, typecheck, unit tests, full browser and native runtime evidence, and bundle comparison. Three.js, Framer Motion, Vite, TypeScript, and Express should be isolated because their rendering, compiler, and middleware contracts are material. Puppeteer was removed in the second pass after its only callers proved obsolete.

### P3 product expansion

The following ideas are worthwhile only after the correctness and evidence gates above are sustained. They are deliberately outside this implementation scope:

1. Persisted and queryable SCADA audit events with tamper-evident external retention.
2. Role-based or short-lived SCADA credentials rather than static shared bearer keys.
3. Leader election or explicit protocol ownership partitioning before high availability.
4. Per-client server-side tag subscriptions, completed in the second pass with bounded subscribe and unsubscribe behavior.
5. Prometheus metrics with a real scrape endpoint and alert rules.
6. Formal alarm philosophy and site acceptance against ISA-18.2, instead of “informed” behavior.
7. Offline-first release archive manifests with signed hashes and explicit retention policy.
8. Locale expansion after the English UX stabilizes, including right-to-left and long-string layout tests.
9. Real-user performance telemetry with privacy review and opt-in governance.
10. A maintained browser support matrix and WebGPU fallback acceptance per platform.

## Rejected or deliberately avoided changes

| Proposal                                                    | Decision                        | Reason                                                                                        |
| ----------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Delete `public/v0.20`                                       | Rejected locally                | It is an intentional published archive; only publication authority can change retention       |
| Integrate the separate worker portrait branch automatically | Rejected locally                | It is a separately accepted candidate with visual history and must be reconciled deliberately |
| Enable SCADA writes by default                              | Rejected                        | Violates least privilege and the industrial safety boundary                                   |
| Restore proxy horizontal scaling                            | Rejected until ownership exists | Multiple instances would race the same industrial endpoints                                   |
| Claim production or ISA conformance                         | Rejected                        | Local source evidence cannot establish certification                                          |
| Blanket-upgrade every major dependency                      | Rejected                        | Creates an unreviewable rendering, compiler, and middleware migration                         |
| Delete every unused export automatically                    | Rejected                        | Export reachability is not sufficient proof of a public API decision                          |
| Add generated visual assets                                 | Rejected                        | No new authored visual was needed; canonical art and explicit approval remain protected       |

## Final verification ledger

This table is the first-pass evidence snapshot. The current exact-candidate ledger is `_contprompts/millos_exhaustive_improvements_second_pass_2026-08-12.md`.

Fill this table only with exact-candidate results. A pass in one row does not satisfy another.

| Gate                             | Result         | Evidence                                                                                                                                                          |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root dependency audit            | Pass           | Zero vulnerabilities                                                                                                                                              |
| Proxy dependency audit           | Pass           | Zero vulnerabilities                                                                                                                                              |
| Root typecheck                   | Pass           | Production plus tests and configurations                                                                                                                          |
| Root lint                        | Pass           | Source, E2E, scripts, and configurations                                                                                                                          |
| Root format                      | Pass           | Expanded maintained-surface check                                                                                                                                 |
| Dead code and cycles             | Pass           | Scoped Knip clean; Madge zero cycles                                                                                                                              |
| Unit tests                       | Pass           | 101 files and 1,646 tests                                                                                                                                         |
| Coverage                         | Pass           | Statements 25.54%, branches 19.75%, functions 24.01%, lines 25.85%; every measure exceeds the 10% floor                                                           |
| Build and bundle                 | Pass           | Vite 7.3.6 built 3,664 modules in 14.73 seconds; initial JavaScript 0.60 MiB gzip; current build 100.71 MiB                                                       |
| Assets                           | Pass           | 4 of 4 models                                                                                                                                                     |
| Credits                          | Pass           | 26 files, 10 playlist, one fanfare                                                                                                                                |
| Depth                            | Pass           | 29 files, 12 relationships                                                                                                                                        |
| Shaders                          | Pass           | 19 families, 16 keys, 13 sites, zero exceptions                                                                                                                   |
| SCADA build, lint, format, tests | Pass           | 12 tests                                                                                                                                                          |
| Docker Compose and Kustomize     | Pass           | Final Compose config and Kubernetes overlay render cleanly                                                                                                        |
| GitHub Actions syntax            | Pass           | Actionlint clean; 30 external action references use immutable 40-character commit SHAs                                                                            |
| Playwright and axe               | Pass           | Two serial browser tests passed in 1.1 minutes                                                                                                                    |
| Impeccable design lint           | Pass           | `npx impeccable detect src` exited zero with no findings                                                                                                          |
| Native art capture               | Machine pass   | Twelve nonblank scenes, paired motion frames, and a contact sheet inspected; human taste remains separate                                                         |
| Runtime benchmark                | Capacity-gated | Exact-candidate packet preserved, but several foreign automation browsers began during measurement and host load reached 452; no product pass or failure inferred |
| Human visual approval            | Gated          | Explicit review of exact artifacts                                                                                                                                |
| Rights clearance                 | Gated          | Independent provenance review                                                                                                                                     |
| Industrial acceptance            | Gated          | Site-specific qualified acceptance                                                                                                                                |
| Publication                      | Gated          | Explicit merge and deployment authority                                                                                                                           |

## Deviations

| Date       | Discovery                                                                                                                                                                                                                     | Conservative choice                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-12 | Managed deep security discovery could not start because the parent lacked a managed filesystem permission profile                                                                                                             | Recorded the exact tool limitation, did not retry an identical blocker, and continued a manual static security review without claiming managed deep-scan coverage                                                               |
| 2026-08-12 | Removing dead source invalidated validators that still named the deleted paths                                                                                                                                                | Repaired the validators and registries so they describe only the active product; did not restore dead code to manufacture a green result                                                                                        |
| 2026-08-12 | The host carried other long-running TypeScript processes                                                                                                                                                                      | Did not kill processes without ownership; used serialized and resource-stable validation                                                                                                                                        |
| 2026-08-12 | Music metadata could be matched to the official catalog, but local files were not independently compared to upstream downloads                                                                                                | Added complete credits and explicit uncertainty rather than claiming rights clearance                                                                                                                                           |
| 2026-08-12 | The host removed the uncommitted `/private/tmp` worktree between continuation turns                                                                                                                                           | Recovered the exact patch and shell-mutation history from the append-only session record into a persistent sibling worktree, revalidated it from scratch, and kept the main checkout untouched                                  |
| 2026-08-12 | The first headless art run lost its topology-stability window while a foreign browser started; the headed 12-scene run completed, but its conjoined performance pass overlapped further foreign browsers and load reached 452 | Preserved both packets, inspected the complete contact sheet, compared its graph topology with the last uncontended receipt, and left native performance acceptance open rather than turning contaminated timing into a verdict |

## Working-if signal

This programme is working if a future contributor can select any row, find the concrete defect and acceptance criterion, reproduce the named machine gate, and tell immediately whether the remaining decision belongs to code, runtime, a human reviewer, a rights reviewer, a plant owner, or a publication owner.
