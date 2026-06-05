# MillOS Launch Audit — Owner Decisions Required

_Branch `launch-audit-polish`. This supersedes the earlier version of this file. Everything under
"What was fixed this session" is committed and was reconciled green (typecheck + lint + format +
production build + 1199 tests) at each batch. Everything under "Decisions required" was deliberately
NOT auto-applied: it is outward-facing, hard to reverse, a product/legal/architecture call, or can
only be verified by looking at the running app (this audit harness has **no working WebGL**, so any
3D-render-behavioral change is marked "behavior-unverified")._

_Three audit passes have now run on this branch: the original deep/gap audit (batches A–C), a
structured 12-lane audit (batches D–E), and this session's third pass (a local WebGPU AI feature
found in-tree + committed, then Phase A high-value fixes, a seeded 12-lane completeness sweep
(batch F), and Phase C — the verifiable-safe deferred backlog)._

---

## Round 3 — executed the recommendation brief you approved (committed, gated green)

Build + 1200 tests + boot smoke green. Three commits:
- **Deleted** CelebrationSystem (+ConfettiBurst), CrisisEventSystem (+CrisisEffects), MissionControl
  (`e7f6e43`) — broken/redundant/overlapping per the per-component investigation.
- **Removed the internal Asset Prototype Deck** from the production build + **deleted the orphaned
  truckbay model cluster** (~1500 LOC) (`dda4fbd`).
- **Self-hosted the 3D `<Text>` font** via a `SceneText` wrapper defaulting to a local
  `Inter-Regular.otf` — removes the last unconditional third-party connection (jsDelivr glyph fetch)
  (`ac93a5b`).

**⚠️ Concurrent-edit collision — left for you (NOT committed by me):** while I worked you were editing
the tree (RM-105/106 → 4 mills, central spine conveyor, dock-opening dims, crane position, worker
spawns, pallet/shower placement). My font codemod's one-line `<Text>` import swap landed on **4 files
you're mid-edit on** — `ConveyorSystem`, `MillScene`, `FactoryExterior`, `TruckBay` — so I did **not**
commit them (I can't cleanly split my swap from your edits without interactive staging). They + your 5
standalone edits (`AmbientDetails`, `SafetyEquipment`, `types.ts`, `InstancedPlansifters`,
`ProductionFlowVisualization`) remain in your working tree. When you commit those 4, my import swaps
ride along and the font self-host reaches 23/23.

**Still yours:** the legal `[CONFIRM]` values (controller identity, liability cap, effective date,
min-age); and removing `cdn.jsdelivr.net` from the CSP once you confirm 3D labels render in a real
browser (kept for now as troika's safe fallback). The CelebrationSystem `achievementsStore` is kept as
a foundation if you ever want a real achievements UI.

---

## Round 2 — actioned from your "fix these" decisions (committed, gated green)

You answered: canonical host = **www**, product name = **BAMS**, governing law = **England & Wales**,
disconnected features = **investigate each**, plus "fix" the dead-code batch / ownership→friction /
scada-proxy. Done:

- **Disconnected features** (16-agent per-component investigation → my own verification):
  - **Deleted 11 orphaned/superseded components** (`1ad81f2`): ComplianceDashboard (superseded by live
    SCADAPanel), SPCCharts, ShiftHandover (≠ live ShiftHandoverSummary), ShiftBriefing,
    PreferenceRequestWidget, AssetShowcase, ManagementStylePanel, MillSceneMinimal, VillageAreaOptimized,
    FarmAreaInstances, SmartForklift. + cleaned the dead uiStore SPC toggle.
  - **Kept** (the L11 "dead" flags were false positives): WorkerMoodOverlay (live at WorkerSystem:1336),
    InstancedVillageComponents (VillageArea uses its InstancedLamps).
  - **Flagged, NOT wired** (see "Still needs you" below): CelebrationSystem, CrisisEventSystem, MissionControl.
- **Dead-code utilities** — deleted 8 orphaned files, ~3000 LOC (`58584f5`): gpuManagement(+geometryMerger,
  lodIntegration, objectPool), pathfinding, truckPath, workerBehaviorEngine, apiSecurity.
- **ownership→friction**: activated the silently-dead integration (static import) + made its tests
  deterministic (`4b06b2a`).
- **Canonical host → www.millos.net** across og:/canonical/twitter/img-src (`e3765ad`).
- **BAMS naming**: all *user-facing* strings already read BAMS (Phase C); the remaining "BAS" are internal
  code identifiers/types (out of scope to rename — high risk, zero user benefit). No change needed.
- **scada-proxy criticals** (`2c7eb4b`): env-var dual-read (`SCADA_API_KEY ?? API_KEY`), constant-time key
  compare ×2, and **`npm audit` → 0 vulnerabilities** (jsrsasign CRITICAL, express-rate-limit/minimatch HIGH).
- **Legal drafts**: filled England & Wales governing law + `nell@ethicsnet.com` contact (`c4c6ec6`).

### Still needs you (deliberately not auto-done — would crash, is redundant, or needs your value)
- **CelebrationSystem (achievements):** complete + valuable, but it renders a fragment mixing an R3F
  `<points>` particle system (ConfettiBurst) **and** DOM `<motion.div>` — mounting it as-is **crashes**
  ("R3F hooks outside Canvas"). Wiring needs a deliberate split (confetti → into the Canvas; milestone
  overlay → into the DOM tree) + a real-browser check. I left its internal interval-bug fix in place so it
  works *once split & wired*.
- **CrisisEventSystem (+CrisisEffects):** complete crisis mechanic, needs Canvas wiring — **wire-in or delete?**
- **MissionControl:** complete sidebar widget but **redundant** with the live OverviewPanel (efficiency/
  priorities/alerts) — likely delete, your call.
- **truckbay model cluster (~1500 LOC):** still imported by the prototype deck (AssetPrototypePage); delete it
  together with the prototype-deck decision (below).
- **gameSimulationStore briefing methods** (`startShiftBriefing`/`completeShiftBriefing` + `'briefing'` phase):
  now dead after deleting ShiftBriefing — safe to trim, but it touches the live shift state-machine, so I left
  it for your eyeball.
- **scada-proxy:** WS auth still accepts the key via URL query (leaks into logs); moving it to a subprotocol/
  short-lived token needs a coordinated SCADAPanel (frontend) change.
- **Legal `[CONFIRM]`:** controller legal identity (you-as-individual vs a company), liability cap, effective
  date, `<Text>` 3D-font self-host (removes the last jsDelivr connection), optional min-age line.

---

## What was fixed this session (committed, gated green)

### `feat(ai)` — local WebGPU AI backend (commit `6454b86`) — **NEEDS YOUR SIGN-OFF**
A complete, working on-device strategic-AI backend (Qwen3-4B via `@mlc-ai/web-llm`) was found
**uncommitted in your working tree** at the start of this session. I validated it green
(typecheck + lint + build + 1199 tests) and committed it as one atomic, isolated unit — I did **not**
author it. It adds an alternative to the Gemini API: no API key, no per-token cost, no data leaves
the device after a one-time weight download.
- **This is a product decision only you can make.** It adds a dependency, ships **GB of model
  weights** to the browser on opt-in, and widens the CSP to `huggingface.co` / `*.hf.co` /
  `raw.githubusercontent.com`. A branch commit is not shipping — review before merge.
- **It does NOT resolve the Gemini model-ID launch-blocker below.** The default backend is still
  `gemini` → the deprecated model string. WebGPU is opt-in only.

### Phase A — high-value verifiable fixes
- **GDPR: self-hosted Inter + JetBrains Mono fonts and the DRACO decoder** (`228b9d8`). Removes the
  only **unconditional** third-party connections on page load: the Google Fonts `<link>` (sent every
  visitor's IP to Google US before any interaction) and the gstatic DRACO decoder (fired on plain
  page load via the default-scene worker/forklift GLBs). Fonts are now vite-bundled from
  `src/assets/fonts/`; the decoder is served from `public/draco/` via `import.meta.env.BASE_URL`.
  CSP tightened: dropped `fonts.googleapis.com`, `fonts.gstatic.com`, `www.gstatic.com`.
  _Verify fonts render in a real browser; fallback to system-ui is graceful if a face is missing._
- **Three dead scene-logic bugs** (`cba614d`):
  - `InstancedPlansifters` — sifter bodies + hanger rods never rendered on **LOW** quality (the
    `useFrame` bailed on a null `flywheelRef`, but the flywheel mesh isn't rendered on LOW). **LIVE
    component** (rendered by `Machines.tsx`); fix is real. Behavior-unverified (no WebGL here).
  - `MoodAura` — auras never registered their material after a null first render (frozen). **LIVE**
    (rendered by `WorkerPersonalityLayer`); fix is real. Behavior-unverified.
  - `CelebrationSystem` — fixed the achievement-tracking `setInterval` (churning deps re-created it
    faster than its 60 s period, so it never fired). **HONEST CORRECTION:** this component is
    **orphaned (zero importers — never mounted)**, so the fix makes the code correct but does **not**
    by itself revive achievements. The real question is product wiring — see "Disconnected features".
- **CI: gate the Pages deploy on typecheck + lint + test** (`51645d3`) — `deploy.yml` ran with no
  validation, so a broken push to `main` published straight to production.
- **Repo-wide prettier format** (`5fab3d8`) — cleared pre-existing format drift across ~16 files
  plus the WebGPU files (committed from WIP without a format pass). `format:check` is now clean.

### Phase B — third-pass completeness sweep (commit `d77a06d`)
A seeded 12-lane sweep (32 agents) found 34 items; **17 verifiable-new fixes** were applied, each
diff-reviewed by me and reconciled green:
- **Multiplayer host-authority (partial):** the host now **drops inbound `MACHINE_LOCK` from guests**
  (only the host legitimately sends them; guests use INTENT — verified zero legit impact, blocks
  lock-spoofing) and validates peer-supplied `selectedMachineId` against the machine registry.
- **`geminiClient`:** guard empty/null model output before caching; tighten token-budget estimate.
- **`StatusRing`:** `useMemo`-with-side-effects → `useEffect` (off the render path; ≤1-frame
  status-color lag, behavior-unverified).
- **`MQTTAdapter`:** bounds-check topic length before slicing untrusted publish frames.
- **`MobilePanel`** multiplayer dock icon; **`VotingPanel`** visible focus ring; **`index.html`**
  CSP-consumer documentation.

### Phase C — verifiable-safe deferred backlog (commit `56ea99a`)
A file-partitioned sweep over the 170-item deferred backlog (79 files, 158 agents). I applied only
the verifiable-safe subset, diff-reviewed each, and reconciled green (typecheck + lint + format +
build + **1203 tests** — +4 from a new alarm-archive test):
- **a11y (L5):** WCAG-AA contrast (`text-slate-500`→`400`) across 7 panels; visible focus rings;
  region/list/heading semantics.
- **UX (L6):** destructive-action confirmations (Zone/Graphics/Incident/Safety panels, Mobile,
  MultiplayerLobby); Escape / outside-tap dismiss; touch-visible delete; negative-radius clamp.
- **perf (L9):** reference-check BAS subscription (drop per-mutation `JSON.stringify`); heat-map
  short-circuit when off; single-copy bounded readings append; allocation-free collision check.
- **error-handling (L4):** MQTT settle-once connect; WebSocket connection-state listener; PeerJS
  explicit reconnect; multiplayer intent-timeout sweep.
- **correctness (L1):** invalid `scale` prop relocation; FocusIndicator mount-toggle
  (behavior-unverified); SCADA alarm-archive dedup (+ test).
- **config (L12):** deploy.yml rsync-excludes nested version dirs; release.yml git-cliff
  `keepachangelog`; prototype-deck CSP parity.
- **REVERTED — `src/stores/stabilityStore.ts`** (`require()`→`import`): the fix is technically
  correct but it **revives the dead worker-ownership→friction integration, changing gameplay
  balance** and breaking 6 tests that assert current behavior. Left as-is; see "Decisions required"
  below — it's an owner call, not blind polish.

### Runtime boot smoke (production preview + agent-browser)
Booted the production build under the real meta-CSP: React mounts, stores initialize, AI engine
starts, procedural textures generate. **Zero CSP violations** — confirms the Google-Fonts + DRACO +
gstatic CSP removals are safe at runtime (any residual request would have logged a `Refused`
violation; there were none, and the Google Fonts `<link>` is gone). WebGL context could not be
created in this harness (SwiftShader `BindToCurrentSequence failed`) — a **harness GPU limitation,
not a regression** (it fails at renderer creation, before any scene component runs; CSP does not
govern WebGL contexts). Consequently the 3D scene and all scene-render fixes remain
**behavior-unverified** — please click through them in a real browser (same caveat the prior passes
carried).

---

## ⛔ Decisions required

### 1. [CRITICAL] Gemini model ID — `src/utils/geminiClient.ts`
`model: 'gemini-3-flash-preview'` is **deprecated (as of 2025-12-17)** with `gemini-3.5-flash` named
as successor; the app uses the legacy `@google/generative-ai` SDK. **The default AI path still uses
this string** (WebGPU is opt-in and does not change the default). Live AI may be silently dead at
launch for users who add a key.
- **Decision:** swap to a verified-served model ID (smoke-test with your key via `listModels`), or
  migrate to `@google/genai`. In the same change, re-check the `GEMINI_FLASH_*_COST` constants and
  fix stale "Gemini 2.0 Flash"/"Flash 3" log strings. (I can't pick a model ID safely — my cutoff
  matches the SDK's, so any guess is itself the launch risk.)

### 2. [HIGH] Multiplayer host-authority — full redesign still needed
Phase B closed the `MACHINE_LOCK` spoof and added machine-id validation, but the core issue remains:
the host derives `playerId` from untrusted peer metadata (`MultiplayerManager.ts:~145`) and
`PLAYER_UPDATE` is accepted with an arbitrary `p.id`. A malicious peer can still impersonate/spoof
other players' position/selection. **Fix is one architectural unit** (a verified `peerId→playerId`
map + host-authoritative acceptance).
- **Decision:** do the host-authority redesign before promoting multiplayer, or ship it as
  "trusted friends / experimental."

### 3. [HIGH] Version switcher `public/v0.20/` + `v0.10/` (~418 MB)
`vite.config.ts` + `deploy.yml` deliberately serve `/v0.10/`, `/v0.20/`, `/v0.30/`, and a
version-switcher dropdown in the live UI points at them. Last deployed Pages artifact ≈ 1.27 GB
(over GitHub's 1 GB soft limit).
- **Decision:** is the switcher a launch feature? **Keep** → slim the snapshots (they don't need
  137 MB of MP3s each — `deploy.yml` copies music into every version). **Drop** → remove the
  dropdown options, the `v0.10`/`v0.20` copy steps, and the dirs.

### 4. [HIGH] Only 4 of 6 roller mills exist — `MillScene.tsx:~435`
`rm-105`/`rm-106` are referenced by 4 systems but never created (docs say RM-101…RM-106). Fixing it
changes layout, pathfinding, and gameplay — a design call.

### 5. [MEDIUM] Canonical host mismatch — `CNAME` = `www.millos.net`, but all `og:`/`canonical`/
`twitter:` URLs use the apex `https://millos.net/`. Pick one canonical host, make them agree, and
configure the apex↔www redirect, or social/SEO signals split.

### 6. [MEDIUM] Root `/` is a contentless meta-refresh redirect (`deploy.yml`) — crawlers/scrapers
hitting the canonical URL get no SEO/OG tags. Inline the full `<head>` into the redirect page, or
set canonical/og:url to `/v0.30/`.

### 7. [MEDIUM] Worker-ownership → friction integration is silently dead (`stabilityStore.ts`)
`getOwnershipFrictionMultiplier()` uses a CommonJS `require('./ownershipStore')` that **fails
silently in the ESM/Vite browser bundle**, so the intended "more worker ownership → less friction"
mechanic never runs (it always returns the 1.0 fallback). The one-line fix (static import) was
prepared and **reverted**, because activating it **changes gameplay balance** and breaks 6
`stabilityStore` tests that encode the current (integration-off) behavior.
- **Decision:** (a) activate it (static import) + rebalance + update the 6 tests, or (b) delete the
  dead `getOwnershipFrictionMultiplier` code if the mechanic is abandoned. Either is correct; both
  are your call, not a blind edit.

### 8. [LOW] Canonical product name — "BAS" vs "BAMS" vs "Bilateral Autonomy"
The bilateral-autonomy subsystem is referred to by all three names across the UI (e.g. a panel
header says "BAMS Timeline" while a sibling comment/README says "BAS"; `educationalContent` says
"BAMS"). Phase C made each panel internally consistent but could not pick the **app-wide canonical
name** — that's a branding call. **Decision:** choose one and I (or a follow-up sweep) will apply it
everywhere.

---

## Disconnected features (product-completeness question)

A cluster of substantial, **feature-shaped components are orphaned (zero importers — never mounted)**.
These are not just dead code; each is a launch question of "is this supposed to work?" The most
salient is the **achievement / celebration system** (`CelebrationSystem`, 528 LOC — I fixed its
internal bug, but it is unwired). Others:
- `ComplianceDashboard` (749 LOC), `CrisisEventSystem` (539 LOC), `SPCCharts` (813 LOC),
  `ShiftHandover` (322), `ShiftBriefing` (222), `PreferenceRequestWidget`, `WorkerMoodOverlay`,
  `MissionControl`, `AssetShowcase`, `ManagementStylePanel`, `MillSceneMinimal` (debug/fallback
  scene), `SmartForklift`.
- Perf-optimization alternates never adopted: `FarmAreaInstances` (815 LOC), `VillageAreaOptimized`
  (608 LOC), `InstancedVillageComponents`.
- **Decision per item:** wire it in (if it's a launch feature) or delete it (if shelved). Store
  actions used elsewhere must stay; only the unmounted components/exports are dead.

---

## Dead code — delete-on-confirm batch (~judgment call, NOT auto-deleted)

Pure dead code with zero importers, several carrying explicit `@ts-ignore "kept for future use"`
markers (which is why I did **not** auto-delete — that would override an explicit in-code intent):
- **`truckbay/` cluster (~1500 LOC):** `TruckModel`, `MergedTruckParts`, `TruckParts`,
  `TruckSmallParts`, `TruckAudio`, `TruckLogos` (+4 `@ts-ignore` components).
- **Orphaned utils:** `gpuManagement.ts` barrel + its exclusive consumers (`geometryMerger.ts`,
  `lodIntegration.ts`, `objectPool.ts`); `pathfinding.ts` (~660 LOC A*); `truckPath.ts`;
  `workerBehaviorEngine.ts`; `apiSecurity.ts` (648 LOC, fully unimported).
- **Unused exports:** `auditStore` (7 helpers), `aiBehaviorEngine` (several), `perfMonitor`,
  `terrain/useTerrainMaterial`, VCP unused decoder/encoder APIs (Rewind bridge — may be roadmap;
  add a round-trip test or remove).
- **`@ts-ignore`/`any`/commented blocks:** `FirstPersonController` (`any` ref),
  `environmentRegistry` (`any`), commented-out JSX in `TruckBay.tsx` / `VillageArea.tsx`.
- **Decision:** confirm none are planned-soon, then delete as one batch (`npm run build` verifies).

---

## Config (L12) — owner / install-risk

- **`@rollup/rollup-darwin-arm64` is a direct dependency** (`package.json`) — a platform-specific
  native binary; as a hard dep it breaks `npm install` on Linux/Windows/CI (hence `npm ci --force`).
  Recommend removing it and dropping `--force`. Left as-is (dep-resolution changes need CI verify).
- **`public/sw.js`** activate handler deletes all `millos-*` caches, evicting other deployed
  versions; **`deploy.yml`** nests version dirs + MP3s inside `/v0.30/`; **`tailwind.config.js`** is
  an orphaned v3-style config (its `pulse-slow`/`spin-slow` animations may be relied on — verify
  before deleting); **`metadata.json`** is stray scaffolding (safe to delete); the **Asset Prototype
  Deck** ships as a production rollup input. _(The safe subset of these is handled in Phase C; the
  install-risk ones are flagged.)_

---

## scada-proxy (SEPARATE backend — NOT in the GitHub Pages launch)
Referenced only by `SCADAPanel.tsx`; deployed via its own Dockerfile/k8s, outside the frontend
gates. Audited, not modified. If you deploy it, these are serious:
- **[CRITICAL] Auth fails OPEN** — every endpoint, incl. `PUT /tags` (write-to-PLC), is
  unauthenticated when `SCADA_API_KEY` is unset.
- **[CRITICAL] Env var mismatch** — code reads `SCADA_API_KEY`; k8s/compose inject `API_KEY`.
- **[CRITICAL/HIGH] Dependency CVEs** — `jsrsasign`, `express-rate-limit 8.2.1`, `express 4.18.2`.
- Timing-unsafe key compare; API key accepted via URL query (leaks into logs); no write-rate-limit.

---

## Legal drafts (`_audit/legal_drafts/` — DRAFTS, nothing published)
Updated this session to reflect the GDPR fix: Google Fonts + the DRACO decoder are **now
self-hosted**, so the only remaining unconditional third-party connections are GitHub Pages (host)
and jsDelivr (troika 3D-text glyph fetch for unstyled `<Text>` — eliminable by giving `<Text>` a
local `font=`). SCADA-mode disclosure added.
- **Open `[OWNER DECISION]`s:** controller legal identity + contact, governing law/jurisdiction,
  liability cap, effective date, optional minimum-age line. (Drafts carry a "consult an attorney"
  disclaimer.)

---

## Remaining flagged (visual / subjective / scene-behavioral)
The deferred items NOT auto-fixed are mostly: subjective design-taste (L8 spacing/color/font-scale),
scene-behavioral perf/render changes needing in-app visual verification (L1/L9 `useFrame`), and UX
"add-a-confirmation" polish. Full per-lane list with concrete proposed patches:
`_audit/_deferred_by_lane.md`. Phase C applied the verifiable-safe subset; the rest remain flagged
because they need your eyes in the running app or your taste call, not a blind edit.

---

_Pre-existing, repo-wide, not launch-blocking: React 19 `MutableRefObject` and
`String.prototype.substr` deprecation hints (suggestion-level; a future codemod, not this pass)._
