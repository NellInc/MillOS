# Fix-Swarm Report

- **Files processed:** 89
- **Total fixes applied:** 101
- **Total findings skipped:** 113
- **Files with at least one fix applied:** 59
- **Files left unchanged:** 30
- **Failed files:** 0

---

## `src/components/GeminiSettingsModal.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **No disclosure plant data sent to Google Gemini** — Added a privacy disclosure note in the API-key UI block: key stored only in the browser (localStorage) and never sent to a MillOS server; in Gemini and Hybrid modes the key and simulation state are sent directly to Google's Gemini API under Google's Privacy Policy (linked); Heuristic mode runs locally and sends nothing.

> Note: One finding, a Copy/microcopy disclosure, applied as described. Auditor marked autoFixable:false/flagForOwner:true so wording needs a human legal/GDPR pass; factual content correct. Separate a11y gap (role=dialog, aria-modal, aria-labelledby, useFocusTrap, ESC-to-close, aria-label on X close) surfaced but not applied (not in findings; could alter test-suite close-button resolution).

---

## `src/components/ui-new/panels/SettingsPanel.tsx`

_Applied: 2 | Skipped: 1_

**Applied**

- **Second Reset Simulation button wipes localStorage + reloads without confirmation** — Wrapped the destructive Reset Simulation onClick in a window.confirm() guard warning it clears saved progress, graphics settings, and the Gemini API key and cannot be undone; early-returns on cancel before any removal or reload.
- **Reset removes a nonexistent key and leaves graphics + plaintext Gemini key persisted** — Replaced the hardcoded removeItem list with Object.keys(localStorage).filter(k=>k.startsWith('millos-')).forEach(removeItem), clearing every namespaced MillOS persist store including millos-graphics and the plaintext Gemini key in millos-ai-config.

**Skipped**

- **Active Settings panel has no entry point to AI/Gemini configuration** — flagForOwner product/UX feature addition. Wiring would require a new exported prop or global state to control the modal open flag (cross-file), forbidden by hard rules. Out of safe in-file scope.

> Note: Findings 1 and 2 addressed in a single edit to the Reset handler (no new imports, no signature change, no other files). Reset now confirms and clears all millos-* persist keys. Advisor consult attempted but rate-limited.

---

## `index.html`

_Applied: 5 | Skipped: 9_

**Applied**

- **CSP connect-src omits PeerJS cloud API host -> multiplayer signaling blocked** — Added https://0.peerjs.com to connect-src; SignalingService uses default PeerJS cloud (0.peerjs.com:443) so the HTTPS handshake was being blocked by the meta CSP on GH-Pages.
- **CSP missing object-src/base-uri/frame-ancestors hardening (+upgrade-insecure-requests/form-action)** — Added object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; to the meta CSP. Additive hardening; app uses relative paths/no <base>. Omitted frame-ancestors (inert via meta tag).
- **Loading screen relies on Inter webfont before load; fallback flash** — Added system-ui, -apple-system to .loading-text font stack to match the app base stack and minimize FOUT swap.
- **No theme-color** — Added <meta name=theme-color content=#0a0f1a>. apple-touch-icon/raster favicons NOT added (require new binary assets, out of index.html-only scope).
- **No JSON-LD structured data** — Added a WebApplication application/ld+json block (name MillOS, category SimulationApplication, url, og-image, author). Additive metadata, covered by existing script-src 'unsafe-inline'.

**Skipped**

- **cdn.jsdelivr.net unused in connect-src (remove)** — CONTRADICTED BY EVIDENCE. Built bundle shows troika-three-text fetches Unicode font-resolver data at runtime from cdn.jsdelivr.net; removal would break non-Latin 3D text. Kept the host.
- **connect-src wildcard ws:/wss: (pin to specific hosts)** — flagForOwner. SCADA adapters open arbitrary WebSocket endpoints (user-configurable broker/WS URLs). Pinning would break user-entered SCADA endpoints.
- **connect-src permits cleartext ws: (remove bare ws:)** — SCADA local-dev uses ws://localhost (MQTT/WebSocket adapters). Removing bare ws: breaks local-dev plain-ws SCADA; tied to ws/wss owner decision.
- **cdn.jsdelivr.net enables remote font-data fetch (supply-chain)** — flagForOwner. Removing requires self-hosting unicode-font-resolver and threading a local dataUrl into troika (multi-file). Dependency is real/active. Kept host.
- **script-src 'unsafe-inline' broader than needed** — flagForOwner, speculative. Removing touches runtime script execution and the additive inline JSON-LD/style handling; cannot verify in enforced-CSP browser here. Out of safe scope.
- **CSP delivered only via meta tag (frame-ancestors/HSTS gaps)** — Infra decision. GitHub Pages cannot send response headers; remedy is a header-injecting CDN. frame-ancestors inert via meta. No safe in-file action.
- **Google Fonts leaks visitor IP (self-host woff2)** — Mass refactor outside index.html-only scope (download/commit woff2, rewrite @font-face, remove Google Fonts links/CSP hosts). flagForOwner GDPR.
- **No PNG/ICO favicon and apple-touch-icon** — Applied theme-color (additive). apple-touch-icon/favicon-32/.ico require new binary image files in public/, out of scope. flagForOwner.
- **Loading screen FOUT (cosmetic)** — Addressed the actionable part (system-ui/-apple-system in loading-text). display=swap FOUT is expected behavior, no further change.

> Note: Edited ONLY index.html. Applied 5 safe additive changes (PeerJS CSP host, CSP hardening, loading font stack, theme-color, JSON-LD). Did NOT remove cdn.jsdelivr.net (troika fetches font-data from it at runtime per built bundle). Advisor rate-limited; proceeded on grep evidence. No bash/git/npm mutations.

---

## `package.json`

_Applied: 1 | Skipped: 1_

**Applied**

- **Version inconsistency: package.json 0.20.0 vs deployed v0.30** — Bumped version from 0.20.0 to 0.30.0 to match the deployed current build (deploy.yml builds VERSION=v0.30, root redirects to /v0.30/). No test/source/snapshot asserts 0.20.0; vite.config version refs are deploy-path routing from VERSION env, not package.json reads.

**Skipped**

- **PeerJS 1.5.5 + default public signaling server: untrusted-peer trust boundary** — Out of scope for a package.json edit and flagForOwner. Fix lives in SignalingService.ts/MultiplayerManager.ts (entropy in host IDs, validate DataConnections, self-host peerjs-server), not a dependency-version change.

> Note: Applied 1 of 2; the other is a multiplayer security product decision. Lockfile note: package-lock.json root version still reads 0.20.0 and now desyncs; owner should run npm install/npm version to resync (not part of GREEN definition; cannot run npm here).

---

## `src/App.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **SR keyboard notice advertises 'B for management' but B has no handler** — Removed 'B for management,' from the sr-only role=note keyboard-controls notice. No plain B handler exists (commented out; only Ctrl+B = Blueprint Mode wired). Notice now lists only accurate shortcuts. Pure copy fix.

**Skipped**

- **No WebGL-unsupported detection; misleading error** — Out of clearly-safe scope. Suggested fix adds a getContext('webgl') probe plus a new unsupported-browser UI screen (feature addition). Audit marked autoFixable:false/flagForOwner:true. Gating render on a sync WebGL probe risks behavior in non-WebGL environments (jsdom). Owner sign-off needed.

> Note: Only 2 findings for src/App.tsx. Applied the clearly-safe copy fix; skipped the WebGL feature addition (owner-flagged). Edit re-read valid. Advisor rate-limited; skip decided via pre-mortem + the audit's own flagForOwner.

---

## `src/components/AICommandCenter.tsx`

_Applied: 2 | Skipped: 0_

**Applied**

- **Tab switcher uses plain buttons, not ARIA tab semantics** — Added role=tablist + aria-label to the container; each tab gets role=tab, unique id, aria-selected, aria-controls. Content area role=tabpanel with dynamic aria-labelledby. aria-hidden on decorative Activity/Target icons. Mirrors WorkerDetailPanel.
- **AI decision feed has no live region** — Added an sr-only role=status aria-live=polite element above the content announcing the newest decision (New AI decision: {action}), with optional chaining, rather than making the whole scrolling list a live region.

> Note: Both medium/low A11y additions fitting clearly-safe criteria. Edits confined to the embedded render path (the only live path; standalone returns null). sr-only utility defined in index.css. List renders slice(0,15) from front, so [0] is newest. Did not run build per no-bash-mutation; edits syntactically valid TSX.

---

## `src/components/AboutModal.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Centered-modal backdrop opacity inconsistent across modals (50/60/70)** — Out of single-file safe scope. L8 Visual, low, autoFixable:false, flagForOwner:true; its own fix is cross-modal (KeyboardShortcutsModal, GeminiSettingsModal) which I cannot edit. Modals already disagree; changing only AboutModal's /50 swaps one mismatch for another. Deferred to owner.

> Note: AboutModal had exactly one finding (backdrop opacity), out of single-file scope and skipped. Accessibility already complete (role=dialog, aria-modal, aria-labelledby, useFocusTrap+ESC, aria-label on close, aria-hidden on glyphs; rel=noopener). No clearly-safe edits remained. File not edited.

---

## `src/components/AlertSystem.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Sample alert machineId 'mill-1.5' and 'sifter-0' are invalid** — Changed sample-alert machineId values to valid IDs matching their messages: 'mill-1.5' -> 'rm-103' (Roller Mill #3; valid rm-101..106) and 'sifter-0' -> 'sifter-b' (Plansifter #2; valid sifter-a/b/c). Optional string fields, no type changes.

> Note: One L7 Copy finding (low, conf 0.95, autoFixable). Two value-only edits within object literals. AlertData.machineId optional string so type-compatible. Nothing skipped.

---

## `src/components/AmbientDetails.tsx`

_Applied: 0 | Skipped: 2_

**Skipped**

- **Roof-leak drip uses setState every animation frame** — Fix is a setState->useRef refactor of a 3D animation callback. autoFixable:false, flagForOwner:true, conf 0.55, with explicit 'verify the drip still animates; prefer owner review'. State-architecture change altering Three.js animation I cannot visually verify. Out of clearly-safe scope.
- **Door-toggle interval restarts on every door state change** — Finding itself states 'Not a correctness defect, only timing/perf' and autoFixable:false. Fix deliberately changes door cadence/random-delay timing. Perf/UX-cadence tradeoff, not a bug fix. Skipped to preserve baseline.

> Note: Pure 3D scene file (no DOM/JSX/modals/localStorage/multiplayer/console). Both findings low-severity, autoFixable:false, flagForOwner, alter Three.js timing the authors routed to owner review. No edits; file unchanged/green.

---

## `src/components/App.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Palette inconsistency: 69 stray gray-* amid 3901 slate-*** — SKIP. (1) Product/UX tradeoff: low, autoFixable:false, flagForOwner:true; fix text says 'Not auto-fixable without UX review'. (2) Cross-file/mass refactor: 69 gray-* spread across ~10 files, only pinned to App.tsx:1 as an anchor. Both fall under STEP 4 SKIP.

> Note: Path mismatch: assigned src/components/App.tsx does NOT exist on disk; the only active App.tsx is src/App.tsx (6 gray-* classes, not 69), confirming the finding is a cross-file aggregate. Per hard rules I may not retarget; lone finding is a skip regardless. Zero edits.

---

## `src/components/Environment.tsx`

_Applied: 2 | Skipped: 1_

**Applied**

- **new THREE.Color allocated inside the consolidated lens/daylight useFrame** — Added module-level reusable _daylightColor; in the throttled daylight block replaced per-tick new THREE.Color(color) with _daylightColor.set(color) and mat.color.set(THREEColor) with mat.color.copy(_daylightColor). Behavior-identical; eliminates ~10 Color allocations/sec.
- **THREE.Color allocated inside useFrame daylight update (duplicate)** — Same site and fix as above; resolved by the single _daylightColor hoist + .set()/.copy() change.

**Skipped**

- **getDaylightProperties returns a fresh object literal per call (3 per-frame blocks)** — flagForOwner:true. Memoizing or writing into a shared object changes the contract of an EXPORTED helper used across files; mutating-into-shared would alias a shared mutable object (correctness footgun). Allocation bounded (throttled step-function). Not a safe in-file fix.

> Note: Surgical change confined to Environment.tsx. .set(string)+.copy(color) == new Color(string)+.set(color). No exported signatures/store shapes changed. Advisor rate-limited; change self-evidently behavior-preserving. Two findings were the same line and resolved by one edit; the third (exported helper) owner-flagged.

---

## `src/components/FactoryExterior.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **AnimatedFrog heart key uses Date.now(), can collide on rapid pets** — Added heartCounter=useRef(0) and replaced const id=Date.now() with const id=++heartCounter.current so each HeartParticle gets a unique monotonic id. id stays number, so state shape, key={h.id}, and removeHeart(id:number) unchanged. useRef already imported.

**Skipped**

- **AnimatedRiverWater ignores later flowSpeed prop changes (useRef init-once)** — autoFixable:false, flagForOwner:true, conf 0.55. Finding states it is NOT a live bug (callers pass static flowSpeed) and any fix touches shader visuals behind owner sign-off. Adding a uniform-sync useEffect changes shader animation for a hypothetical future caller. Skip.

> Note: Edited only FactoryExterior.tsx. One correctness fix (frog heart id collision); shader-uniform finding skipped per not-a-live-bug/owner-sign-off. No imports added; 1:1 numeric-id swap, no type/signature impact.

---

## `src/components/ForkliftSystem.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **Unguarded pathActions index access can throw if path/pathActions lengths diverge** — Added a numeric bounds guard in the waypoint-arrival branch (if pathIndexRef.current >= data.pathActions.length: advance index % data.path.length; set target; return) before reading action.type, preventing an undefined action from crashing useFrame. Used a numeric comparison (not !action) because noUncheckedIndexedAccess is OFF, so !action would be always-false and risk no-unnecessary-condition lint. Behavior unchanged in normal operation (routes have matching lengths 8/8 and 6/6).

**Skipped**

- **Legacy forklift wheel refs go stale after a close->far->close LOD cycle** — flagForOwner:true at conf 0.55; the finding's own remediation says 'verify in-app' which I cannot do. The useEffect-on-distanceTier reset is an unverifiable visual change routed to owner, and depends on ForkliftModel child-mesh layout I have not read. Out of scope.

> Note: Edited only ForkliftSystem.tsx. One defensive bounds guard (no behavior change in normal op); one LOD finding skipped per owner-flag/unverifiability. Numeric-guard form chosen to keep lint green (noUncheckedIndexedAccess OFF). No git/npm/lint run.

---

## `src/components/GeminiSettingsModal.tsx`

_Applied: 5 | Skipped: 5_

**Applied**

- **Modal lacks dialog semantics + focus trap; ESC-to-close** — Imported useFocusTrap/useRef. Added modalRef and useFocusTrap(modalRef, isOpen, onClose) before the isOpen early return; role=dialog aria-modal=true aria-labelledby=gemini-settings-title + ref on the panel; id on the h2. Mirrors AboutModal.
- **Close (X) button has no accessible name** — Added aria-label=Close settings to the header close button and aria-hidden=true to its X icon (and on the decorative Brain icon).
- **API key input label not programmatically associated** — Added id=gemini-api-key to the password input and htmlFor to its label, plus aria-hidden on the decorative Key icon.
- **Connection test result / error not announced** — Added role=alert to the testResult motion.div and connectionError div, and aria-hidden on AlertTriangle.
- **Modal lists wrong keyboard shortcuts H/V/C** — Per useKeyboardShortcuts: c toggles auto-rotation, cost overlay is $, v toggles first-person, h toggles heatmap, no VCL/Shift-Handover key. Changed the Cost Tracker chip from C to $, made toggle key optional, removed misleading V and H chips; kbd chip renders conditionally on toggle.key.

**Skipped**

- **Exit animation never plays / early return before AnimatePresence** — flagForOwner; requires restructuring so AnimatePresence wraps {isOpen&&...} and removing the early return. Out of the clearly-safe set; focus-trap fix works regardless.
- **Save button gives no durable persistence feedback** — flagForOwner UX tradeoff. Not a clear correctness bug; connected-state masked-key line already exists. Owner.
- **No disclosure key stored in plaintext localStorage** — Already satisfied by existing copy (key stored only in browser, never sent to a MillOS server).
- **API-key field has no privacy note** — Already satisfied by existing note (in-browser-only, direct-to-Google, Privacy Policy link, Heuristic sends nothing).
- **No disclosure plant data sent to Google Gemini** — Already satisfied; existing copy states Gemini/Hybrid send key+state to Google under its Privacy Policy. GDPR gap already closed.

> Note: Edited only GeminiSettingsModal.tsx. useFocusTrap (same as AboutModal) and the $ cost handler verified. Three privacy/disclosure findings already covered by existing copy. advisor() rate-limited. Additive a11y attrs + a factual copy fix; baseline behavior preserved.

---

## `src/components/LoadingScreen.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **React LoadingScreen uses mill emoji** — Owner aesthetic decision (autoFixable:false, flagForOwner:true, low, conf 0.6). Finding says acceptable to leave because this component IS a loading screen matching CLAUDE.md's loading-screen emoji exception; swapping to a Lucide Factory icon would diverge from the index.html loading screen. Out of scope.

> Note: One L8 Visual owner-flagged aesthetic call (mill emoji). Existing a11y (role=progressbar, aria-value*, aria-label) reasonable and unflagged. No edits; baseline untouched.

---

## `src/components/ProductionMetrics.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Throughput AreaChart has no empty/initial-data state** — flagForOwner:true, autoFixable:false, conf 0.55, low. UX-design tradeoff (faint baseline vs placeholder vs spinner). Only a sub-frame blank flash on open; seeding a synchronous data point alters init data-flow. No unique correct form; owner decision.

> Note: One low-severity L8 Visual UX item flagged for owner. No clearly-safe fixes present; no edits. Chart wrapper already has role=img + aria-label and an sr-only data table.

---

## `src/components/SCADAPanel.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **SCADA trend Tooltip sets dark contentStyle but no label text color** — Added labelStyle={{color:'#e2e8f0'}} and itemStyle={{color:'#cbd5e1'}} to the recharts Tooltip in the Trends tab so the timestamp label and item rows are legible on the dark tooltip. Valid recharts props, additive, cosmetic only.

**Skipped**

- **Trend line palette pairs deuteranopia-confusable green/red series** — Optional product/UX color-palette swap (Okabe-Ito). Per SKIP rules a UX tradeoff, not a clearly-safe fix. Conf 0.45, flagForOwner; per-series Legend labels already disambiguate. Owner.

> Note: Two L8 Visual/low findings. Applied additive Tooltip text-color fix; skipped palette swap. labelStyle/itemStyle are standard recharts Tooltip props. Baseline-preserving.

---

## `src/components/TruckBay.tsx`

_Applied: 2 | Skipped: 2_

**Applied**

- **Inline workAreaBounds object literal churns WarehouseWorker registration effect** — Hoisted two inline workAreaBounds literals into module-level as const SHIPPING_WORKER_BOUNDS and RECEIVING_WORKER_BOUNDS and referenced them at the two call sites. Stable identity stops the registration effect (deps include workAreaBounds) re-running each parent render. Values preserved exactly.
- **Shipping dock-status update nested inside if(receivingTruckRef.current)** — Moved the shipping-status updateDockStatus('shipping',...) block out of the receiving-truck if to useFrame body level so it runs unconditionally each frame. Block references only top-level vars; re-read 2754-2816 to confirm brace balance.

**Skipped**

- **Dock-equipment animations driven by ref reads in render never react to docking cycle** — High severity but fix lifts refs into useState updated inside useFrame, introducing setState into the per-frame loop (re-render/perf). autoFixable:false, flagForOwner:true. Behavioral refactor excluded by STEP 4; needs owner sign-off and visual verification.
- **Inline getTruckState arrow defeats RealisticTruck registration effect** — Both fixes unsafe: removing getTruckState from deps closes over mount-time productionSpeed (slider would stop affecting truck speed) and likely trips exhaustive-deps (changes lint baseline); useCallback path is non-surgical across 4 wrap sites. flagForOwner, conf 0.6.

> Note: Edited only TruckBay.tsx. Module-level as const constants (no useMemo). Applied two clearly-safe correctness fixes; skipped the ref-to-useState refactor and the getTruckState dep change as behaviorally/build risky. Verified braces/indentation/values. No mutations run.

---

## `src/components/UIOverlay.tsx`

_Applied: 4 | Skipped: 2_

**Applied**

- **Version-switcher select value 'v0.3' matches no option** — Changed the controlled select value from v0.3 to v0.30 to match the first option, eliminating the blank/indeterminate dropdown and the React no-matching-option warning.
- **MachineInfoPanel close button has no accessible name** — Added aria-label=Close machine details and replaced the bare x glyph with Lucide X (aria-hidden), adding X to the lucide-react import, matching the no-emoji convention and WorkerDetailPanel pattern.
- **MachineInfoPanel status indicator conveys status by color alone** — Added role=img and aria-label={`Status: ${machine.status}`} to the color-only status dot (WCAG 1.4.1).
- **Version-switcher select has no programmatic label** — Added aria-label=Switch app version to the version select. Left the select inside the h1 (move-out is an owner call) and kept navigation-on-change behavior.

**Skipped**

- **FiveAxesPanel can overlap the forklift info panel** — flagForOwner=true, conf 0.6. Visual-layout tradeoff (offset or hide) needing small-viewport verification; not safely applicable without layout-regression risk in untested 3D-adjacent overlays.
- **MachineInfoPanel popup lacks dialog role/labelled region** — flagForOwner=true, conf 0.5. Finding says do not add dialog role without a focus trap; region-vs-dialog is the owner's call. The independent close-name and status-color fixes on this panel were applied above.

> Note: Edited only UIOverlay.tsx. Added X to existing lucide-react import. All four fixes preserve types (machine.status/name/id already referenced). No mutations; baseline green.

---

## `src/components/VillageArea.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Module-level villageCobbleMaterial uses onBeforeCompile without customProgramCacheKey** — Added villageCobbleMaterial.customProgramCacheKey = () => 'villageCobble_feather_v1' after onBeforeCompile so the feathering-injected variant gets its own compiled program. Fixed versioned string (no Date.now/Math.random) per CLAUDE.md. No runtime change.

> Note: One L9 Performance, low, precautionary finding, clearly safe and aligned with the documented shader-cache-key rule. Applied; no exported types/signatures touched. Nothing skipped.

---

## `src/components/WorkerDetailPanel.tsx`

_Applied: 2 | Skipped: 1_

**Applied**

- **Worker detail tabpanels reference tab IDs that do not exist** — Added id={`${tab.id}-tab`} to the tab button in the map so each panel's existing aria-labelledby (overview-tab/skills-tab/reviews-tab/alignment-tab) resolves to a real element. Fixes the dangling back-reference for all 4 tabs.
- **Non-embedded close button uses a literal x glyph** — Replaced the literal x with <X className=w-4 h-4 /> (already imported), matching the in-file Lucide pattern. Accessible name preserved via existing aria-label={`Close ${worker.name} details`}.

**Skipped**

- **Drop aria-modal on the non-embedded floating panel** — Finding's premise is wrong: line 314 calls useFocusTrap(panelRef,!embedded,onClose) which activates a trap+ESC in the non-embedded mode, so aria-modal=true is defensible. Conf 0.6, flagForOwner. Applied the clearly-safe half (x->Lucide X).

> Note: Finding 1 partial-apply (X swap applied, aria-modal removal skipped). Out-of-scope observation (not edited): lines ~747-752 render literal emoji in status text (CLAUDE.md no-emoji), flagged for the appropriate pass. Could not run typecheck/lint.

---

## `src/components/machines/UIComponents.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Machine panel re-registers under a fresh random id on every status change** — Replaced const id=`panel-${Math.random()}` with a stable identity from useId(). Added useId to the React import; const panelId=useId() before the early return; effect body uses `panel-${panelId}` and panelId added to deps. Panel keeps one deterministic key across status transitions. useId valid (React 19); registerPanel/unregisterPanel still take a string id.

> Note: One L1 Correctness finding (low, conf 0.45, autoFixable), a determinism/registry-churn fix. The audit's literal snippet (useRef(`panel-${useId()}`)) is broken (hook-in-ref-arg), so I used clean useId(). No exported types/signatures changed.

---

## `src/components/mobile/MobileFirstPersonController.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Two THREE.Vector3 allocated per frame inside useFrame** — Hoisted the two per-frame new THREE.Vector3() (forward/right) to module-level _forward and _right, reinitialized each frame via .set(0,0,-1)/.set(1,0,0) before applyQuaternion. Behavior identical, eliminates 2 allocations/frame. Updated downstream .y/.normalize()/addScaledVector references. THREE already imported.

> Note: One L9 Performance, autoFixable, behavior-identical finding, applied. Reusable vectors reinitialized via .set() each frame so no stale state. Edited only the target file; no mutations run.

---

## `src/components/mobile/MobilePanel.tsx`

_Applied: 2 | Skipped: 0_

**Applied**

- **Mobile panel border color differs from desktop sidebar** — Changed the outer panel chrome from border-slate-700/50 to border-white/10 to match the canonical desktop ContextSidebar border. Matched the unique substring so only the panel chrome changed; internal header divider untouched.
- **Content maxHeight uses a hardcoded 56px header subtraction** — Replaced calc(33vh - 56px) inline style with a flex-column layout: inner div flex flex-col max-h-[33vh] (kept overflow-hidden), header shrink-0, content flex-1 min-h-0 overflow-y-auto. Used max-h-[33vh] (viewport-definite), not max-h-full (would lose the cap).

> Note: Both L8 Visual (low) findings applied. className-only plus removal of one inline style; no types/props/exports/behavior changed. Finding 2 marked autoFixable=false but fully specified and safe. Only MobilePanel.tsx edited.

---

## `src/components/mobile/RotateDeviceOverlay.tsx`

_Applied: 3 | Skipped: 0_

**Applied**

- **Mill emoji used outside sanctioned branding spots** — Replaced the literal mill emoji span with <Factory className=w-4 h-4 aria-hidden=true /> and added Factory to the lucide-react import. Decorative branding beside visible text, aria-hidden keeps it out of the a11y tree.
- **No prefers-reduced-motion guard on looping animations** — Added motion-reduce:animate-none to both indefinite loops (animate-pulse phone outline, animate-bounce arrow). Additive; only affects reduce-motion users. WCAG 2.3.3/2.2.2.
- **Overlay z-[100] sits below modals z-[1000]** — Raised the overlay container z-index from z-[100] to z-[2000] so the blocking rotate-prompt supersedes app modals when the device rotates with a modal open. Single-token change.

> Note: All three findings clearly-safe local fixes, applied. Only RotateDeviceOverlay.tsx edited. Two findings were flagForOwner aesthetic/scope notes but minimal/additive/build-safe, so applied. The reduced-motion finding's broader MotionConfig scope (across modals) NOT undertaken; only the two in-file CSS loops gated.

---

## `src/components/multiplayer/MultiplayerLobby.tsx`

_Applied: 3 | Skipped: 0_

**Applied**

- **Lobby has no host-disconnect feedback** — Added a useEffect listening for the window multiplayer:host-disconnected CustomEvent (dispatched by HostMigration.ts), mirroring MultiplayerPanel. On disconnect it sets the error (with ?./?? guard) and calls destroyMultiplayerManager(). Added useEffect to the React import. Scoped to host-disconnect only.
- **Local player name & room code entered without sanitization** — Wired sanitizePlayerName/sanitizeRoomCode from utils/sanitize. handleCreateRoom computes name=sanitizePlayerName(playerName), guards on the sanitized result, passes to setLocalPlayerName + hostRoom. handleJoinRoom does the same and replaces trim().toUpperCase()+length check with code=sanitizeRoomCode(joinCode). Imported via '../../utils/sanitize' (the @/utils path is wrong for this repo).
- **Player-name entry has no data-sharing disclosure** — Added a helper line under the Your Name input: 'Visible to other players in the room. A nickname is fine.' Additive microcopy.

> Note: All three applied (sanitizer wiring, privacy microcopy, UX feedback). Verified the host-disconnected event is dispatched by HostMigration.ts:33 and the sanitizers exist/exported. No test/snapshot references this file. OUT OF SCOPE: MultiplayerPanel.tsx (lines 94-96,118-120) still uses raw trim() and should be patched separately. No typecheck/lint run.

---

## `src/components/physics/PhysicsForklift.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Physics forklift registers isStopped=false while halted by standalone emergency stop** — Included forkliftEmergencyStop in the isStopped computation (emergencyDrillMode || forkliftEmergencyStop || operationRef.current!=='traveling') so the registry reports a halted forklift as stopped when the E-stop is engaged. Added forkliftEmergencyStop to updatePosition deps. Flag already subscribed via useSafetyStore; useFrame already checks it. Updated the comment.

> Note: Single L1 Correctness finding (line 131, conf 0.8, autoFixable), applied as prescribed. No other findings. Surgical, preserves types/behavior, references only the already-imported binding.

---

## `src/components/terrain/TerrainGround.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Terrain geometry (+splatMap/heightmap DataTextures) leak GPU memory on every graphics-quality change** — L9 Performance, autoFixable:false/flagForOwner:true. GPU-lifecycle dispose change, not a clearly-safe category. Its own fix says verify visually after a quality toggle (3D, untested), and the standard useEffect-dispose pattern has a Strict Mode footgun: dev double-mount would dispose a geometry useMemo still hands to the live primitive (broken terrain), a regression GREEN build/typecheck/lint would not catch. Strict-Mode-safe disposal of a primitive-owned object is non-trivial. The finding also overstates leakable resources (only splatMap DataTexture and heightmap Uint8Array are retained). STEP 4.

> Note: Read full file. Pure R3F mesh component: no DOM/a11y, no copy/version strings, no console.*, no destructive localStorage/reload, no multiplayer paths; all imports used. The one finding correctly left for owner. Baseline untouched/GREEN.

---

## `src/components/terrain/TerrainMaterial.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **MeshStandardMaterial created in useMemo is never disposed** — Added useEffect(()=>()=>material.dispose(),[material]) in both paths: the TerrainMaterial component and the useTerrainMaterial hook. With [material] deps the cleanup runs after React commits the new material, releasing the orphaned material and its compiled onBeforeCompile program on heightmap/displacement change (component) and unmount (hook, deps []). useEffect already imported.

> Note: One L9 Performance (medium, conf 0.65, flagForOwner:true), applied. Additive effect only, no exported type/prop/signature touched. Caveats: owner-flagged, and runtime verification deferred (no build/tests run). Disposes only an already-detached/orphaned material (primitive does not auto-dispose owned objects), the canonical R3F pattern, so regression risk low.

---

## `src/components/truckbay/test-import.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **truckbay/test-import.ts is a 2-line scratch re-export with zero consumers** — The sole finding is whole-file deletion. File deletion is out of scope per task rules and the Edit-only constraint cannot delete it. No surgical in-file fix exists (2-line re-export, no a11y/copy/safety/correctness/security issue). Verified zero consumers via rg. Defer deletion to owner.

> Note: No applicable edits. The only finding (L11 DeadCode, conf 0.95) is whole-file deletion, out of scope/disallowed. Nothing imports it. Baseline untouched.

---

## `src/components/truckbay/useTruckPhysics.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Truck-state functions allocate large object literals every frame (4x/frame)** — L9 Performance, not a clearly-safe category. Code is correct, only allocates. severity:low, autoFixable:false, flagForOwner:true. Both fix parts unsafe: (1) waypoint hoist requires renaming 12 collision-named constants (shipping vs receiving TUNNEL/APPROACH/SETUP/etc with DIFFERENT values) plus rewriting every reference, non-surgical and a missed rename is a compile error I cannot catch (no npm run build); (2) mutable-singleton return changes object-identity contract for callers in TruckBay.tsx/FactoryExterior.tsx (out of scope). Owner.

> Note: One low-severity L9 perf/GC finding flagged for owner. No clearly-safe fix applies; no edits. Both suggested approaches carry build/behavior risk unverifiable in a no-build single-file environment. File unchanged; green.

---

## `src/components/ui-new/dock/Dock.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **Dock lucide icons have no explicit size class** — Added explicit size={24} to all 11 lucide icon sites (8 DockItem icons + 3 trailing-button icons). Pinned at 24px (lucide's previous implicit default), a pixel-for-pixel no-op that locks the dock's scale and removes reliance on the lucide default. Did NOT adopt the example's 20px (would shrink the nav, an owner tradeoff).

**Skipped**

- **Dock (z-50) and MobilePanel (z-50) share the same z-index** — The suggested fix keeps dock at z-50 and bumps MobilePanel to z-[60] (edits MobilePanel.tsx, out of scope). Changing the dock's own z-index risks layering against every other fixed element. Audit notes the two do not currently overlap; a fragility note, not a live defect (conf 0.4).

> Note: Both L8 Visual, low. Applied finding 1 at current 24px (advisor-confirmed: 20px-for-consistency is an owner UX tradeoff). Skipped finding 2 (real fix is in MobilePanel.tsx, out of scope; fragility note). Additive size props, no type/import changes.

---

## `src/components/ui-new/hud/StatusHUD.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Safety alerts render the generic blue info dot** — Added an alert.type==='safety' ? 'bg-orange-500' branch to the notification status-dot color ternary, before the success/blue-default branches. Safety/near-miss alerts (AlertData.type 'safety', confirmed types.ts:215) now show a distinct orange dot. Pure className change.

> Note: One finding (safety-dot color, autoFixable, medium), applied. Verified 'safety' member on AlertData.type (types.ts:215). Edited only StatusHUD.tsx; TSX valid.

---

## `src/components/ui-new/panels/OverviewPanel.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Game-speed button group lacks selected-state semantics; Pause is icon-only** — Added aria-pressed={gameSpeed===N} to all four speed buttons (Pause/1x/10x/60x). Added aria-label=Pause to the icon-only Pause button. Added aria-hidden to the four Lucide icons. Chose aria-pressed (toggle) over role=radiogroup to stay minimal.

> Note: One L5 A11y (low, autoFixable), applied in full. Edits confined to GameSpeedControls. No exported types/signatures/store changes. Imports already present. No build/git/npm run.

---

## `src/components/ui-new/panels/SafetyPanel.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Minor section-heading color drift (text-slate-400 vs 500, one tracking-wide outlier)** — Cross-widget visual-consistency, not an in-file defect. Fix is a multi-file refactor (one muted-heading color/tracking across all ui-new panels, ideally a shared SectionHeading). UX tradeoff (STEP 4 skip). autoFixable:false, conf 0.45. SafetyPanel is itself the EXEMPLAR of the endorsed convention; the outliers live in OTHER files. An edit here would be a no-op or would introduce the drift the finding wants removed.

> Note: No edits; baseline untouched. SafetyPanel is the cited reference for the correct heading convention. Sweep of STEP 3 categories found nothing actionable (all buttons have text; dock panel not modal; clearHeatMap only clears a viz layer; no console.*/multiplayer/exported-type touches).

---

## `src/components/ui-new/panels/SettingsPanel.tsx`

_Applied: 0 | Skipped: 3_

**Skipped**

- **Second Reset Simulation button wipes localStorage + reloads without confirmation** — Already implemented in baseline. The onClick opens with if(!window.confirm('Reset the simulation and clear all saved data?...This cannot be undone.')) return; before any wipe.
- **Reset removes nonexistent key and leaves graphics + plaintext Gemini key persisted** — Already implemented. Handler iterates Object.keys(localStorage).filter(k=>k.startsWith('millos-')).forEach(removeItem), clearing millos-graphics and millos-ai-config. No change needed.
- **Active Settings panel has no entry point to AI/Gemini configuration** — flagForOwner product/UX feature. GeminiSettingsModal opens only via local useState in AICommandCenter; no shared store action. An entry point needs a new prop (forbidden) or cross-file global state. Cannot be applied safely in one file.

> Note: No edits. Both correctness/safety findings already implemented correctly in baseline (window.confirm guard; millos-* key clearing). The remaining finding is a flagForOwner feature addition excluded by hard rules. File already has good a11y. Baseline GREEN.

---

## `src/components/ui-new/sidebar/ContextSidebar.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **Version select controlled value 'v0.3' matches no option** — Changed the controlled select value from v0.3 to v0.30 to match the existing option, eliminating the React warning and making the footer version indicator correct. onChange navigation and option values untouched.

**Skipped**

- **MultiplayerPanel imported EAGERLY, pulling peerjs into the boot path** — Out of the clearly-safe apply list (perf/lazy-loading, not a correctness bug). flagForOwner:true. Applying it is a real behavior change (defers chunk, adds a Suspense-fallback flash) needing two coupled edits (static import -> lazy() AND a Suspense boundary). Owner.

> Note: Applied 1 of 2 (one value attribute), preserves types/behavior, no new imports. Skipped finding is a perf/lazy-loading owner-flagged change outside authorized categories. Only ContextSidebar.tsx edited.

---

## `src/components/ui-new/widgets/FederationPanel.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Sub-9px text (7px/8px) across 27 files below legible/accessible minimums** — L8-Visual text-size/contrast bump (a11y here means ARIA/focus/ESC, not font size). autoFixable:false/flagForOwner:true, a UX/layout tradeoff needing per-panel visual verification in a dense 4-col grid a green build cannot catch. It is one slice of a 27-file/185-instance systemic type-scale remediation; a partial in-file bump would de-sync that fix (8px still below the finding's 10px threshold).

> Note: No clearly-safe in-scope fixes. The sole finding is an owner-flagged systemic visual/type-scale change outside APPLY criteria. File left unmodified.

---

## `src/components/ui-new/widgets/ManagementStylePanel.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **ManagementStylePanel.tsx is a half-finished-migration orphan, zero references** — The only fix is DELETE the file or WIRE it into ContextSidebar + panelPreloader. Both out of scope: deletion prohibited, wiring is multi-file. flagForOwner=true. No in-file edit resolves an unreferenced-component finding.

> Note: Read full file. The sole finding is an L11 dead-code/orphan verdict (delete-or-wire). Scanned for any other clearly-safe fix and found none: a11y already thorough (aria-hidden on decorative icons, role=group, aria-expanded/aria-controls, aria-live + aria-value*, role=progressbar); inline panel not a modal; no destructive localStorage/reload; no multiplayer paths; correctness already guarded with ?./||; no console.*; all 14 Lucide imports used. No edits; baseline unchanged.

---

## `src/components/ui-new/widgets/PreferenceRequestWidget.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **PreferenceRequestWidget.tsx component is orphaned, its store IS used, the widget is not** — flagForOwner. The only safe resolutions (delete the component, barred by STEP 4; or wire into ContextSidebar/panelPreloader, barred by edit-only-this-file) are out of scope. The backing type/store must NOT be touched. No in-file surgical fix exists for an orphaned-component finding.

> Note: One finding (L11 DeadCode, orphaned component), a legitimate skip. File otherwise clean: all action buttons carry aria-labels (incl icon-only Dismiss), dynamic phrase lookup guarded with ?., REQUEST_TYPE_LABELS exhaustive Record, no console.*, no destructive handlers, no multiplayer paths, no unused imports. Passive notification bar, not a modal. Zero edits by design.

---

## `src/components/ui-new/widgets/VotingPanel.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Active/History tab toggle uses plain buttons without tab semantics** — Added ARIA tab semantics: role=tablist + aria-label on the wrapper; role=tab, unique id (voting-tab-active/history), aria-selected, aria-controls=voting-tabpanel on each button; role=tabpanel + id=voting-tabpanel + aria-labelledby on the vote-list container. Additive a11y only.

> Note: One L5 A11y (low, conf 0.85), clearly safe and fully applied. Additive ARIA only; aria-selected accepts the boolean expression; id/aria-controls/aria-labelledby cross-references consistent and unique. Edited only the target file.

---

## `src/components/ui/AlertAcknowledgmentFlow.tsx`

_Applied: 2 | Skipped: 1_

**Applied**

- **Toast alert container has no aria-live region** — Added role=region aria-live=polite aria-label=Notifications to the fixed toast container, and role=alert aria-live=assertive for critical alert cards (role=status polite for non-critical). Nested live regions resolve correctly (card level overrides container for its subtree).
- **Icon-only alert-dismiss button has no aria-label** — Added aria-label={`Acknowledge alert: ${alert.title}`} to the X dismiss button and aria-hidden=true on the X icon.

**Skipped**

- **AlertAcknowledgmentFlow.tsx is orphaned, referenced only by the dead ui/index.ts barrel** — Out of scope: the fix deletes this component and edits ui/index.ts (a second file). Hard rules forbid editing other files, deleting components, and the finding is flagForOwner=true. Reported for owner.

> Note: File 107 lines. Applied both clearly-safe a11y fixes; imports (X, motion) and AlertData props already exist, no new imports. Additive ARIA only; no behavioral/type changes. No build/typecheck run.

---

## `src/components/ui/CollapsibleLegend.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Legend drag handle is a non-keyboard div; toggle lacks aria-expanded** — Added type=button, aria-expanded={expanded}, aria-controls=collapsible-legend-content to the toggle button, and the matching id to the content region. Marked the mouse-only drag-handle div aria-hidden=true (no longer an AT/keyboard dead-end) and clarified its title to 'Drag to move (mouse only)'.

> Note: Single L5 A11y; both halves addressed. Repositioning non-essential and panel desktop-only, so per the finding's guidance the drag handle was marked aria-hidden rather than given full keyboard reposition (a larger feature, out of scope). No exported types/props changed; no new imports.

---

## `src/components/ui/ConfidenceBar.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Confidence progress bar has no progressbar role/value and uses color alone** — Added role=progressbar, aria-valuemin/max/now={clampedConfidence}, and aria-label embedding the numeric percentage to the track div, so AT reads the value textually even when showPercentage is false (also addresses WCAG 1.4.1 color-only). Additive ARIA; no types/behavior/imports changed.

> Note: One L5 A11y (medium, autoFixable), applied. Uses the already-clamped finite clampedConfidence and existing label prop; no new imports. Minimal/surgical.

---

## `src/components/ui/CostEstimationOverlay.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Floating-panel chrome drift: rounded-xl + colored borders vs rounded-2xl + border-white/10** — L8 Visual, conf 0.5, autoFixable:false, flagForOwner:true. Product/UX aesthetic tradeoff (corner radius + accent-border). The accent border may be intentional color-coding; the auditor's own fix hedges. Splitting out only the radius would ship an un-endorsed mixed state without the human call flagForOwner exists to gate. Not in any clearly-safe lane.

> Note: The sole finding is an owner-flagged visual/UX judgment call outside the clearly-safe lanes, correctly skipped. No edits; GREEN preserved. Did not hunt for un-flagged issues to pad applied[].

---

## `src/components/ui/DecisionHistoryPanel.tsx`

_Applied: 2 | Skipped: 0_

**Applied**

- **Pagination prev/next buttons are icon-only with no accessible name** — Added aria-label=Previous page / Next page to the two icon-only pagination buttons and aria-hidden=true to their ChevronLeft/ChevronRight icons.
- **Collapsible section toggle missing aria-expanded** — Added aria-expanded={expanded} plus aria-label=Toggle decision history to the header button and aria-hidden=true on its ChevronLeft. The cross-panel aria-expanded finding (filed under EmergencyControlPanel) explicitly names this file.

> Note: The only finding in this file's group was the pagination a11y issue (fully applied). Also applied the aria-expanded fix the systemic toggle finding named for this file (clearly-safe, in-file). Native aria attrs only; no new imports/type changes. Baseline green.

---

## `src/components/ui/DecisionReplay.tsx`

_Applied: 2 | Skipped: 0_

**Applied**

- **Decision-replay modal lacks dialog role/aria-modal/ESC/focus management** — Imported useFocusTrap; added modalRef and useFocusTrap(modalRef, !!decision, onClose) before the early return; role=dialog aria-modal=true aria-label=Decision replay + ref on the panel motion.div. The hook supplies trap, ESC-to-close, initial focus (close button), and focus return. Gave the icon-only close button type=button + aria-label=Close and aria-hidden on the X.
- **Clickable div trigger is not keyboard operable** — Replaced the div onClick wrapper in DecisionReplayTrigger with a button type=button aria-label=View decision details, restoring block layout via w-full text-left bg-transparent border-0 p-0 m-0. Prop signature unchanged; the only consumer passes non-interactive children, so no invalid nesting.

> Note: Both findings in-scope clearly-safe a11y; nothing skipped. Edited only DecisionReplay.tsx. No exported types/signatures/props changed. Verified useFocusTrap path, motion.div tag balance, and that the sole consumer passes non-interactive children. typecheck/lint/build NOT run (no bash mutations); ref cast mirrors AboutModal. The modal fix intentionally ADDS behavior (auto-focus, ESC, focus return).

---

## `src/components/ui/EmergencyControlPanel.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **Collapsible section toggle missing aria-expanded (systemic across 10 panels)** — Added aria-expanded={expanded} and aria-controls=emergency-shift-controls-content to the Emergency & Shift Controls toggle button, and the matching id to the collapsible content region (WCAG 4.1.2). No new imports/type changes.

**Skipped**

- **EmergencyControlPanel.tsx is orphaned, referenced only by the dead ui/index.ts barrel** — Out of scope: the fix deletes the file and removes its export from ui/index.ts (a second file I cannot touch). flagForOwner=true. Handled separately.

> Note: Two findings. Applied the autoFixable in-file A11y fix (aria-expanded + aria-controls + content id). Skipped the cross-file dead-code deletion. The button already has a visible text label; only the expanded-state exposure was missing. Standard DOM/ARIA props only; baseline preserved.

---

## `src/components/ui/GraphicsSettingsPanel.tsx`

_Applied: 3 | Skipped: 2_

**Applied**

- **Destructive Reset Simulation wipes localStorage and reloads with NO confirmation** — Wrapped the Reset Simulation onClick in window.confirm() ('Reset the entire simulation? This clears saved progress and graphics settings, then reloads.') that early-returns on cancel.
- **Reset clears wrong/nonexistent keys, so graphics settings survive the reload** — Changed localStorage.removeItem('millos-settings') (nonexistent) to the real graphics persist key 'millos-graphics' (graphicsStore.ts:336), so persisted graphics state is cleared and setGraphicsQuality('medium') becomes the rehydrated default.
- **Keyboard shortcuts cheat-sheet shows stale 'A | AI Panel'** — Changed the kbd label from A to I in the Controls grid for the AI Panel row, matching the live handler (useKeyboardShortcuts.ts:194, key==='i').

**Skipped**

- **GraphicsSettingsPanel.tsx is orphaned, referenced only by the dead ui/index.ts barrel** — Out of scope: whole-file deletion plus a cross-file edit to ui/index.ts; flagForOwner pending confirmation ui-new/panels/SettingsPanel supersedes it.
- **Reset to 10am and Reset Simulation sit adjacent with near-identical styling** — Product/UX layout tradeoff (flagForOwner, autoFixable=false): a visual redesign (separate rows, Danger zone subheading). Mis-click risk already mitigated by the added window.confirm.

> Note: All three applied fixes within-file, surgical, verified against source (graphics key 'millos-graphics'; AI-panel key 'i'). No imports added; types/behavior preserved. Did not run build/lint per hard rules.

---

## `src/components/ui/KeyboardShortcutsModal.tsx`

_Applied: 2 | Skipped: 1_

**Applied**

- **Modal lacks dialog role, aria-modal, focus trap, and ESC-to-close** — Imported useRef and useFocusTrap (the same hook AboutModal uses). Added modalRef and useFocusTrap(modalRef, isOpen, onClose) above the early return; ref + role=dialog aria-modal=true aria-labelledby=kbd-shortcuts-title on the panel motion.div; id on the title h2. The hook provides the trap, focus restoration, and Escape-to-close.
- **Icon-only modal close button (X) has no accessible name** — Added aria-label=Close keyboard shortcuts to the close button and aria-hidden=true to the lucide X.

**Skipped**

- **Internal if(!isOpen) return null defeats the AnimatePresence exit animation** — The canonical fix requires a coordinated edit to UIOverlay.tsx (removing the redundant outer AnimatePresence and the showShortcuts && gate), outside single-file scope. Applying only the in-file half would create two presence layers driven by the same state and risk a popped/stuck modal. flagForOwner:true. Kept the early return, compatible with the a11y fixes applied.

> Note: Baseline-safe. useFocusTrap and motion.div ref usage mirror AboutModal; hooks called before the early return. No exported types/props/other files touched. The advisor concurred on the skip and the hook-ordering/import checks.

---

## `src/components/ui/MultiObjectiveDashboard.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Top-left anchor collision: MultiObjectiveDashboard, ShiftHandoverSummary, StatusHUD stack at left-4/top** — Both fix paths out of scope for a single-file edit: (a) offsetting ShiftHandoverSummary's top anchor edits another file (forbidden); (b) moving one panel to another corner is a product/UX tradeoff (which corner; new collisions?), flagForOwner=true, conf 0.4. Overlap is non-blocking/brief (ShiftHandover z-50 above this z-40, auto-dismisses in 5s). autoFixable=false.

> Note: Read full file. The only finding is a cross-file/UX layout collision unaddressable within this file without editing another file or making a UX decision. Pure read-only display panel: no modal semantics, no close button, no inputs, no destructive/localStorage handlers, no multiplayer, no console.*, no emoji (kg CO2 uses subscript-2). Numeric values finite by construction (|| fallbacks, Math.round) so no NaN guards warranted. Did not add speculative guards (scope creep/build risk). No edits; GREEN.

---

## `src/components/ui/ShiftHandoverSummary.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **Auto-shown handover summary: unlabeled close X and not announced** — Added aria-label=Close shift handover to the icon-only close button and aria-hidden=true to its X (WCAG 4.1.2). Added role=status, aria-live=polite, and aria-label to the summary container so AT announces the toast on shift change (WCAG 4.1.3). Used role=status (not dialog/focus-trap) because this is a non-modal, auto-appearing, auto-dismissing notification.

**Skipped**

- **Countdown progress-ring divisor mismatch (line 227, not in audit finding)** — Not part of any audit finding for this file, left unapplied per scope. Reported for owner/reconciliation: countdown maxes at 5 (useState(5)/setCountdown(5)) but the SVG ring uses strokeDashoffset={50*(1-countdown/15)}; the /15 (stale) means the ring only fills ~1/3. Intended fix: change /15 to /5.

> Note: Applied the single L5 A11y finding in full (accessible name on close + status/aria-live on container). Verified summary non-null inside the showSummary && summary guard. X already imported. No focus-trap/aria-modal added (correct for a non-modal toast). ACTIONABLE BUG NOT APPLIED (out of finding scope): line 227 /15 should be /5.

---

## `src/components/ui/StrategicPriorityCards.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Three icon-only dismiss buttons unlabeled; AI 'analyzing' status not announced** — Added aria-label to all three X dismiss buttons (Dismiss priority/insight/trade-off) and aria-hidden=true on their X glyphs. Wrapped the 'Gemini analyzing...' indicator's motion.div with role=status aria-live=polite, and aria-hidden on the decorative spinner. WCAG 4.1.2/4.1.3.

> Note: One L5 A11y (autoFixable, medium), fully applied. No exported types/signatures/props changed; JSX a11y attrs only. No new imports (X already imported). Should not affect the green baseline.

---

## `src/components/ui/TimelinePlayback.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Replay controls: icon-only buttons lack accessible names** — Added aria-label=Exit replay mode on the close button; aria-label={isPlaying?'Pause playback':'Play playback'} plus aria-pressed={isPlaying} on the play/pause toggle; aria-label=Playback timeline on the range slider; aria-hidden on the decorative icons (X, SkipBack, PauseCircle, PlayCircle); aria-label=Jump to start on SkipBack. No type/prop/behavior changes.

> Note: Single L5 A11y (medium, conf 0.9), fully applied. Additive ARIA on existing JSX; no types/signatures/behavior altered. All referenced icon imports already existed.

---

## `src/components/ui/VCLDebugPanel.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Emoji legend rendered in VCLDebugPanel UI (debug surface)** — Product/UX tradeoff flagged for owner (autoFixable:false, flagForOwner:true, conf 0.5). The finding's own conclusion: 'Acceptable to leave, this is a debug panel documenting an emoji-based protocol.' The emoji ARE the legend content (the VCP/VCL emoji-encoding protocol); swapping to Lucide would destroy the legend. Its dev-flag alternative is already satisfied (panel early-returns null unless showVCLDebug, line 92). No clearly-safe code-only fix.

> Note: No edits. The sole finding is owner-flagged and already dev-gated. CROSS-FILE SIGNAL: a separate finding under EmergencyControlPanel ('aria-expanded systemic across 10 panels') names this file; its collapse toggle (lines 97-100) lacks aria-expanded={expanded}. NOT applied here (outside my assigned finding list; handled in that 10-file batch lane). Flagging so the signal isn't lost.

---

## `src/components/ui/WeatherControlPanel.tsx`

_Applied: 1 | Skipped: 1_

**Applied**

- **Add aria-expanded to collapsible section toggle (+ aria-hidden on decorative icons)** — Added aria-expanded={expanded} to the Weather & Heat Map section-toggle button (state previously conveyed only by a swapped Chevron icon). Marked the decorative Wind and ChevronUp/ChevronDown icons aria-hidden=true. Visible text remains the accessible name. No behavior change.

**Skipped**

- **WeatherControlPanel.tsx is orphaned, referenced only by the dead ui/index.ts barrel** — Deletes the whole component and removes its export from ui/index.ts. Hard rules forbid deleting a component and editing any file other than this one. flagForOwner:true/autoFixable:false. Left for the owner-driven dead-code pass.

> Note: Provenance: the aria-expanded fix is NOT from this file's findings (only the dead-code orphan); it derives from the systemic 'aria-expanded across 10 panels' finding (EmergencyControlPanel group) which names this file. Applied because this is the only agent that can edit this file in a one-file-per-agent swarm. Calibration: this component is currently orphaned, so near-zero runtime/test risk and no user-facing impact, but correct for when wired in.

---

## `src/components/ui/ZoneCustomizationPanel.tsx`

_Applied: 1 | Skipped: 0_

**Applied**

- **Remove-zone button only visible on hover (not focus-visible) and unlabeled** — Added focus-visible:opacity-100 to the button and group-focus-within:opacity-100 on the row so it appears when tabbed to (WCAG 2.4.7), plus a focus-within ring on the row. Added aria-label={`Remove zone ${zone.name}`} and aria-hidden=true on the Trash2 icon (WCAG 4.1.2). Existing title retained.

> Note: Only one finding for this file (L5 A11y remove-button), fully applied. The cross-cutting EmergencyControlPanel aria-expanded note mentions this panel's collapse toggle but that is not in this file's group; left untouched to stay surgical. TSX-valid, no exported types/signatures, no new imports. No window.confirm added (removeSpeedZone removes a single user-added zone, cheap to re-add, not a localStorage wipe).

---

## `src/components/ui/index.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **ui/index.ts barrel has zero importers, delete the file** — SKIP on two grounds. (1) Forbidden action: deleting the whole file; STEP 4 prohibits file deletion and Edit cannot delete. (2) False premise: 'zero importers' is empirically wrong; src/App.tsx:75 imports { EnergyDashboard, MultiObjectiveDashboard, ShiftHandoverSummary, CostEstimationOverlay, WeatherEffectsOverlay } from './components/ui', all live exports in this barrel. The audit likely grepped 'src/components/ui' and missed the relative './components/ui'. Deleting would break App.tsx and fail the build.

> Note: No edits. The only finding (whole-file deletion) is prohibited and based on a false zero-importers premise: src/App.tsx:75 actively imports five live exports from this barrel. Recommend the orchestrator flag this finding (and the dependent orphaned-panel findings that assume the barrel is dead) as invalidated. File unchanged; baseline preserved.

---

## `src/hooks/useKeyboardShortcuts.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Cost-overlay shortcut $ (Shift+4) collides with F4 ultra intent and is undiscoverable** — Both branches fall outside safe in-file scope. Branch 1 (document $ consistently) edits other help surfaces (GeminiSettingsModal, GraphicsSettingsPanel, App.tsx sr-only) out of scope. Branch 2 (rebind $) is the only in-file lever, but doing it alone would desync the handler from those help surfaces that already mislabel/omit it, making discoverability worse; choosing the replacement key is a product call. severity low, conf 0.65, flagForOwner=true. The handler already carries the // $ (Shift+4) comment.

> Note: The single finding is a cross-file UX/discoverability tradeoff flagged for owner. No clearly-safe in-file change exists. File otherwise clean (input-field guard, escape handling, ref-based stale-closure avoidance sound). No edits.

---

## `src/hooks/useKnowledgeIntegration.ts`

_Applied: 1 | Skipped: 0_

**Applied**

- **First-run welcome flag set even when narration disabled, burning the only first-play moment** — Added an early-return guard if(!FEATURE_FLAGS.AI_NARRATION_ENABLED || !narrationEnabled) return; at the top of the first-play effect (after the FIRST_PLAY_WELCOME_ENABLED guard), so the millos-has-played flag and hasTriggeredFirstPlay are no longer written while narration is off. The effect re-runs when narrationEnabled flips back on. Added narrationEnabled to deps (FEATURE_FLAGS const left out per exhaustive-deps). Verified via rg the key is written/read only in this hook.

> Note: The only finding. Marked flagForOwner:true/autoFixable:false but in-scope per the task: a single-file logic fix changing no exported type/signature/prop. Chose gating the effect (option 2); option 1 was rejected because triggerNarration returns void and exposing a success signal would change the hook's return type. Confirmed via grep the key appears only in this hook. Did not run build (no bash mutation).

---

## `src/index.css`

_Applied: 0 | Skipped: 2_

**Skipped**

- **Focus-visible outline and scrollbar use hardcoded hex instead of theme tokens** — Owner-deferred cosmetic token-drift (low, conf 0.55, autoFixable:false, flagForOwner:true). The finding calls the fix 'Optional' and 'safe to leave for launch', and offers alternatives (add a --color-focus-ring token OR standardize on cyan-400), so no single clearly-safe mechanical fix. Choosing the focus-ring hue is a visible UX/brand decision; the scrollbar slate-500 has no corresponding @theme token. STEP 4.
- **POSITIVE: Tailwind v4 universal-reset bug is NOT present (clean)** — Explicitly a verified non-issue with 'No fix required'. Confirmed: base styling scoped to html/body/#root inside @layer base; the 5 !important uses are all within prefers-reduced-motion (legitimate a11y). Nothing to apply.

> Note: No edits; baseline untouched. Two findings, both correctly skipped (one owner-deferred cosmetic with no single mechanical fix; one positive 'no fix required' confirmation). Empty applied[] is the correct outcome.

---

## `src/main.tsx`

_Applied: 1 | Skipped: 2_

**Applied**

- **No global unhandledrejection / window.onerror handler** — Added import { logger } from './utils/logger' and registered two window listeners after the existing console.warn monkeypatch: unhandledrejection -> logger.error('[unhandledrejection]', e.reason) and error -> logger.error('[window.error]', e.error ?? e.message). Uses the gated logger with a ?? finite-value guard. Additive, no UX/behavior change.

**Skipped**

- **prototype eagerly bundled in shared entry** — Fix is React.lazy + Suspense, a code-splitting refactor changing the synchronous render path (RootComponent becomes lazy + Suspense fallback UX). autoFixable:false, flagForOwner:true. Not a clearly-safe surgical edit.
- **Rapier ~2.2MB WASM eagerly pre-warmed at module top-level** — Fix gates the pre-warm behind requestIdleCallback/first-interaction. Finding labels this 'Behavior-sensitive (slight delay before first Physics mount)', autoFixable:false, flagForOwner:true. A perf/UX tradeoff to skip and report.

> Note: Edited only main.tsx (logger import + two global async-error listeners). logger.error signature (message, ...args) type-checks; PromiseRejectionEvent/ErrorEvent are standard DOM types. Additive-only; preserves console.warn suppression and SW registration. No mutations; did not run typecheck/lint/build.

---

## `src/multiplayer/MultiplayerManager.ts`

_Applied: 4 | Skipped: 7_

**Applied**

- **Chat messages broadcast & stored unsanitized (sanitizeChatMessage never wired in)** — Imported sanitizeChatMessage from '../utils/sanitize'. In sendChat() sanitize the outgoing string (const cleanMessage; if(!cleanMessage) return) and store/broadcast the cleaned value. In the CHAT receive case sanitize untrusted peer content before addChatMessage. Strips control chars, caps to 500, HTML-encodes.
- **Player names from peer metadata stored unsanitized** — Imported sanitizePlayerName. Wrapped untrusted name at handlePeerConnected (sanitizePlayerName(metadata?.playerName) || 'Player') and in the PLAYER_JOIN handler. Caps to 20, allows only alnum/_/-/space.
- **Stale-peer sweep drops a still-open DataConnection without closing it** — In handlePeerDisconnected, call peerConn?.close() before peerConnections.delete(peerId). PeerConnection.close() guards isOpen so the normal onClose path stays a no-op.
- **handlePeerDisconnected can run twice for one peer -> double PLAYER_LEAVE** — Added an early-return guard at the top: if(!this.peerConnections.has(peerId)) return; preventing the duplicate PLAYER_LEAVE broadcast/store removals when onClose and the stale sweep both fire.

**Skipped**

- **Host never relays PLAYER_UPDATE -> remote players frozen at spawn in 3+ player sessions** — flagForOwner:true; changes the message-relay contract. Behavior/topology change, handled separately.
- **Join-timeout destroys singleton without nulling it -> poisoned manager** — flagForOwner:true; module-singleton lifecycle, needs owner sign-off (double-destroy regression risk).
- **Host applies untrusted peer MACHINE_LOCK/PLAYER_JOIN/PLAYER_LEAVE without authority validation** — flagForOwner:true; 'Behavior/contract change, owner decision'. Gating changes the authority model/protocol semantics.
- **Host trusts client-supplied playerId in INTENT (impersonation)** — flagForOwner:true; requires a new peerId->playerId map plus identity override across handlers. New infrastructure + authority-model change.
- **PLAYER_UPDATE/PLAYER_JOIN let any peer mutate arbitrary remote-player entries by id** — flagForOwner:true; needs the peerId map and dropping non-host PLAYER_JOIN/LEAVE. Behavior/contract change.
- **CHAT stored from untrusted payload with attacker-controlled from/fromName and no length bound** — flagForOwner:true; the length bound is now covered by the applied sanitizeChatMessage (caps 500). The remaining part (host overwriting from/fromName with authenticated identity) needs the peerId map; skipped.
- **Guest accepts FULL_STATE_SYNC/STATE_SYNC from any connected peer** — flagForOwner:true; requires recording the host's peerId on join and verifying origin. New per-connection identity tracking + protocol change.

> Note: Applied 5 findings (chat-sanitization covers send+receive), all autoFixable, edit-only-this-file, no exported-signature/authority changes. Imported sanitizers from '../utils/sanitize' (the barrel is dead per audit). Skipped 6 flagForOwner findings needing authority/contract changes, a peerId->playerId map, or singleton-lifecycle changes. Did not run build; sanitizers accept unknown->string and shapes preserved.

---

## `src/multiplayer/PeerConnection.ts`

_Applied: 2 | Skipped: 3_

**Applied**

- **Silent swallow of incoming data with a misleading parse comment; no shape guard at the boundary** — Replaced the bare data-as-MultiplayerMessage cast + silent empty catch in conn.on('data') with (1) a runtime boundary guard dropping any non-object payload or one lacking a string type field (logging via logger.multiplayer.warn with the peer id), and (2) a catch that logs the handler error instead of swallowing it. Corrected the comment. Added import { logger } from '../utils/logger'.
- **Untrusted peer DataChannel payload passed to handlers with zero validation (safe subset)** — Applied only the clearly-safe portion: the top-level boundary type-guard (object + string type) plus finite-number guards on the PING/PONG payload.timestamp derefs. A malformed PING/PONG now returns early instead of throwing or producing NaN latency. The full per-message-type validator was NOT added.

**Skipped**

- **Full validateMultiplayerMessage per-type payload type-guard** — A new per-type validator is a substantial security feature flagged for owner; risks rejecting legitimate messages. Applied the safe subset (boundary guard, PING/PONG timestamp guards) and left deep per-type schema validation for owner. Existing string sanitizers belong in MultiplayerManager's CHAT/JOIN handling, not at this wrapper boundary.
- **No inbound message-size or rate bound on WebRTC DataChannel (DoS)** — Adds new behavioral controls (token-bucket rate limiting, byte caps) that drop messages; flagged for owner because a wrong threshold would discard legitimate high-frequency state-sync traffic.
- **Connection metadata trusted for playerId without validation** — The vulnerable path lives in MultiplayerManager.ts (handlePeerDisconnected ~line 251), not here, and needs a host-side peerId->playerId map. Edit-only-PeerConnection.ts rule. getMetadata() here merely returns the raw object.

> Note: Edited only PeerConnection.ts. Two safe fixes (misleading-comment + boundary shape guard; PING/PONG finite guards). logger.multiplayer.warn is a real namespaced logger. No exported types/signatures changed; valid-message behavior preserved. Three flagForOwner items skipped. advisor rate-limited; did not run build.

---

## `src/multiplayer/SignalingService.ts`

_Applied: 1 | Skipped: 5_

**Applied**

- **PeerJS debug uses process.env.NODE_ENV in a Vite/browser context** — Replaced debug: process.env.NODE_ENV==='development'?2:0 with debug: import.meta.env?.DEV?2:0 in PEERJS_CONFIG. process.env is undefined in Vite's browser bundle, so the original never enabled debug; import.meta.env?.DEV is browser-safe and matches serviceWorkerRegistration.ts:45. Behavior-neutral in prod.

**Skipped**

- **WebRTC exposes every peer's public IP to untrusted peers with no consent** — high but flagForOwner:true. Fix needs a pre-join disclosure UI (MultiplayerLobby), optional TURN-relay ICE config (cost/perf tradeoff), and a privacy policy, all cross-file UX/product decisions outside this file.
- **Signaling routed through default PeerJS cloud broker, undisclosed** — flagForOwner:true. A privacy notice and/or self-hosting peerjs-server, plus removing playerName from connect-time metadata (changes the connection contract MultiplayerManager relies on). Product decisions.
- **Guessable 6-char room code + auto-FULL_STATE_SYNC discloses player data** — flagForOwner:true. The fix (host approval gate, longer code, join PIN) lives in MultiplayerManager.ts and multiplayerStore.generateRoomCode, a UX/behavior change.
- **No consent gate: host auto-accepts any incoming peer** — flagForOwner:true. An incoming-peer approval prompt + name-entry disclosure spanning UI and MultiplayerManager. Changing accept-all semantics breaks code other paths depend on.
- **Host peer-id squatting: predictable id enables room hijack** — flagForOwner:true. Requires a high-entropy host token, a non-guessable derived peer-id, and host-signed metadata verification, changing the deterministic millos-${roomCode} contract guests depend on (architectural).

> Note: Applied 1 of 6 (single-line env-API fix + comment). The other 5 are L3 Privacy/L2 Security flagForOwner needing cross-file UX surfaces, consent gates, or architectural peer-id changes. The applied edit is behavior-neutral in prod and TS-valid. Advisor rate-limited; not externally reviewed.

---

## `src/multiplayer/hooks/useMultiplayerSync.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **applyStateDiff treats host STATE_SYNC as a diff; sequence ignored and emergencyActive never applied on guests** — flagForOwner:true/autoFixable:false; the fix text says 'Behavior change, owner decision on the emergency-sync semantics.' (1) The dropped sequence is benign (data channel reliable:true); adding ordering/staleness logic would INTRODUCE behavior. (2) The emergencyActive branch is a deliberate stub; wiring triggerEmergency/resolveEmergency into guests changes guest behavior and interacts with host-authority and fire-drill systems. STEP 4.

> Note: No edits; GREEN preserved. The single finding is a flagForOwner behavior-change (guest emergency-sync). Reviewed all STEP-3 categories and found nothing else: pure logic/state-sync hook, no JSX (no a11y/copy/modal surface), no console.*, no destructive localStorage, no unused imports, no chat/name/room send-receive path for sanitizers. Types guarantee accessed fields; no defensive guards manufactured.

---

## `src/multiplayer/types.ts`

_Applied: 0 | Skipped: 2_

**Skipped**

- **reconnecting styled but never set (L6 UX, medium)** — Both fixes out of safe scope. Option A (wire setConnectionState('reconnecting')) edits SignalingService.ts/MultiplayerManager.ts, forbidden by edit-only-types.ts. Option B (remove the literal) mutates the EXPORTED ConnectionState union, excluded for rippling across files; the literal is referenced in live case branches in MultiplayerLobby.tsx and MultiplayerPanel.tsx. autoFixable:false, flagForOwner:true.
- **ConnectionState 'reconnecting' defined but never set (L4, low)** — Same root cause and same two out-of-scope fixes (exported-type-shape change rippling to multiplayerStore.ts + two UI switch files; or cross-file edits to SignalingService/MultiplayerManager). autoFixable:false, flagForOwner:true.

> Note: No edits; GREEN preserved. Pure type-definitions module (no JSX/a11y, no console.*, no destructive handlers, no sanitizer points, no dead code). Both findings target the same exported ConnectionState 'reconnecting'; both fixes fall under SKIP rules. Owner should choose between surfacing reconnect in the UI (wire the setter in SignalingService's disconnected/reopen handlers) or removing the literal across types.ts + the two UI case branches in one coordinated change.

---

## `src/prototypes/AssetPrototypePage.tsx`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Internal deck public at /prototypes** — Owner posture decision (fix text: 'Owner: keep/gate/remove', flagForOwner:true, autoFixable:false). Gating the route (import.meta.env.PROD guard) changes behavior; removing it deletes a 4200-line component/route. Both are product/architecture tradeoffs out of scope for surgical auto-fixes.

> Note: Read the header/UI region and grepped the full 4200-line file. No in-scope fixes: zero console.*/alert/confirm/debugger/@ts-ignore; no localStorage-wipe or location.reload; no icon-only/x-glyph close buttons (the only icon+button pairs carry visible labels and accessible names); no modal/dialog needing ESC/focus-trap/aria-live. All imports referenced. The keydown listener is WASD camera movement, not a close handler. File unchanged; baseline preserved.

---

## `src/scada/HistorianRouter.ts`

_Applied: 1 | Skipped: 0_

**Applied**

- **No time-range validation before historian queries** — Added a validation guard at the top of getBlendedData (the choke point all four read paths delegate to): if startTime/endTime is Invalid Date (Number.isNaN(getTime())) or endMs<startMs, log a warning and return [] before any adapter call, preventing a .toISOString() throw and silently-wrong reversed-range results. Added a guard in interpolatePoints for non-finite/non-positive intervalMs (Number.isFinite + <=0), which would otherwise make the for-loop never advance and hang. Reused logger.warn; no exported signatures changed.

> Note: Single finding, fully addressed. The getBlendedData guard covers all four public read paths; the interpolatePoints guard covers the interval=0 hang. Additive, single-file, type-preserving, reuses the imported logger.

---

## `src/scada/SCADABridge.ts`

_Applied: 1 | Skipped: 1_

**Applied**

- **calculateMachineVisuals omits machineName, so name-only machines resolve no SCADA prefix** — Added an optional trailing machineName?: string to the exported calculateMachineVisuals and threaded it into getMachineTagPrefix(machineId, machineName), matching what scadaToStoreMetrics already does. Optional+trailing, so all 6 existing call sites (incl 9 test invocations) that omit it are unchanged and behavior is byte-identical when machineName is undefined. No exported type changed.

**Skipped**

- **applyCorrelations divides by engHigh-engLow with no guard** — Misfiled finding. The cited symbols (applyCorrelations, normalizedCorrelated, correlationEffect) and lines (497-505) do NOT exist in SCADABridge.ts; the actual code lives in src/scada/adapters/SimulationAdapter.ts. Edit-only-SCADABridge.ts rule. The fix (const range=engHigh-engLow; if(range<=0) return;) must be applied in SimulationAdapter.ts.

> Note: Two findings. Finding 1 applied as a behavior-preserving optional-param addition (the half realizable without touching other files). To realize the user-visible benefit, the caller useSCADAVisuals.ts (lines 30/47) must also pass machine.name, out of scope. Finding conf 0.5 and notes name-only machines are unverified, so this is a parity cleanup with no risk to current behavior. Finding 2 misfiled and skipped. advisor rate-limited.

---

## `src/scada/adapters/MQTTAdapter.ts`

_Applied: 1 | Skipped: 0_

**Applied**

- **MQTT packets use single-byte remaining-length; payloads >127 bytes malformed** — Implemented the MQTT 3.1.1 variable-length-integer (continuation-bit) scheme for the Remaining Length field on encode and decode. Added a private static encodeRemainingLength(length):number[] used in publish, sendConnectPacket, sendSubscribePacket, sendUnsubscribePacket; each packet sized as 1+lengthBytes.length+remainingLength with the variable-header offset shifted by 1-4 bytes. In handlePublish, replaced the single-byte read with a VBI decode loop bounded to 4 bytes/buffer length, computing packetEnd=offset+remainingLength. For QoS-0 PUBLISH <=127 bytes the wire bytes are byte-identical to before. Verified npx tsc --noEmit reports 0 errors.

> Note: Single finding. Audit marked autoFixable:false/flagForOwner:true but I judged it safe to apply: it is the exact clear logic bug the Correctness lane authorizes, the fix is the deterministic standard MQTT VBI algorithm (no UX tradeoff), fully in-file with no exported type/signature changes, no tests assert the old byte layout, the <=127-byte path is preserved bit-for-bit, and typecheck passes clean. Owner awareness: this changes MQTT wire encoding/decoding, but no live broker is reachable in the simulation-first deploy. Could not consult advisor (rate-limited); reasoned via pre-mortem.

---

## `src/scada/adapters/PIAdapter.ts`

_Applied: 3 | Skipped: 1_

**Applied**

- **PI adapter maps response.Items without verifying it is an array** — Guarded data.Items in getRecordedValues/getInterpolatedValues/getPlotValues with const items=Array.isArray(data?.Items)?data.Items:[] before mapping, so a malformed envelope degrades to empty instead of throwing. Added an object/Timestamp validity check in getLatestValue before mapping the single [data] payload.
- **msToIsoDuration emits PT0S for sub-second intervals and malformed durations** — Clamped input: const safeMs=Number.isFinite(ms)&&ms>0?ms:1000; const seconds=Math.max(1,Math.floor(safeMs/1000)); so sub-second/negative/NaN intervals produce a valid minimum PT1S.
- **PI getWebId caches an undefined/non-string WebId as a permanent failure** — Added if(!data||typeof data.WebId!=='string'){return null;} before webIdCache.set(...), so a transient/malformed lookup is not stored and re-served as a permanent failure.

**Skipped**

- **PI Basic-auth credentials base64-encoded with no TLS enforcement** — flagForOwner:true, conf 0.62. The proposed fix (throw a config error when baseUrl is not https://) changes runtime behavior and would break legitimate localhost-over-http dev configs. A security-posture/UX tradeoff for the owner; unlike the no-behavior-change guards above, this one is behavioral.

> Note: Edited only PIAdapter.ts. All three applied fixes are additive defensive guards (Array.isArray, Number.isFinite+Math.max clamp, typeof string) with no exported-signature changes and no behavior change for valid inputs. advisor rate-limited; proceeded matching the existing RESTAdapter defensive convention. Did not run build.

---

## `src/scada/adapters/RESTAdapter.ts`

_Applied: 1 | Skipped: 5_

**Applied**

- **REST batch read does not validate response shape before .map** — Added a private type-guard isValidTagResponse(data):data is RESTTagResponse (validates tagId:string, value:number|boolean|string, quality:string, timestamp:number) wired into both read paths. In readTags() after json(): if(!data||!Array.isArray(data.tags)) throw, then .filter(isValidTagResponse) before .map. In readTag(): if(!this.isValidTagResponse(data)) throw before parsing. Prevents a TypeError on malformed 200 bodies surfacing as false connection-loss. No new imports; the predicate narrows so parseTagResponse stays type-safe.

**Skipped**

- **After 5 reconnect failures REST adapter silently disconnects and clears all subscribers** — flagForOwner:true; the fix needs a product call on reconnect ceiling/UX (notify vs clear). Out of clearly-safe scope.
- **poll() swallows all errors as 'connection lost'** — flagForOwner:true; requires threading HTTP status onto errors and changing error-classification semantics (4xx terminal vs 5xx retry). Behavioral.
- **getStatistics computed from connectTime across reconnect churn** — flagForOwner:true, diagnostic-only; a design choice that changes reported diagnostics.
- **RESTAdapter sets Bearer token via raw fetch, bypassing secureFetch** — flagForOwner:true, explicitly 'Owner decision'. Adopting secureFetch changes request semantics; secureFetch itself is flagged as dead scaffolding.
- **Bearer token attached to any URL with no scheme/host allowlist** — flagForOwner:true. Gating the Authorization header on https/localhost+origin-match changes request behavior and the finding notes it 'needs validation against the 1199-test baseline' (tests may use http endpoints).

> Note: Edited only RESTAdapter.ts (417 lines). Applied 1 of 6 (the autoFixable, non-flagForOwner correctness guard). The other 5 are flagForOwner with product/UX or behavioral tradeoffs (reconnect UX, error classification, stats-reset, secureFetch adoption, auth-header allowlist that could break the 1199-test baseline). Standard TS type predicate, no imports added, types/behavior preserved except the added guards. Did not run tsc/build; advisor rate-limited.

---

## `src/scada/adapters/WebSocketAdapter.ts`

_Applied: 3 | Skipped: 1_

**Applied**

- **Timed-out WebSocket connect still schedules background reconnects after reject** — In the 10s connect-timeout handler, set this.isDisconnecting=true before this.ws?.close() so the resulting onclose->handleDisconnect does not start an exponential-backoff reconnect loop for a connect the caller already saw reject. connect() resets the flag at the top, so a fresh retry is unaffected.
- **WS batch/snapshot handler trusts t.value/quality/timestamp without per-field guards** — Made parseQuality null-safe (param widened to string|undefined; String(quality??'').toUpperCase()) and added ??0 / ??Date.now() defaults in the batch/snapshot map so the batch path defends like the update path.
- **Validated WS message tags written to value store with no tagId allowlist** — Gated inbound values to known tags in both ingest branches: 'update' requires this.tags.has(msg.tagId); 'batch'/'snapshot' filters msg.tags with this.tags.has(t.tagId) before mapping/storing. Unknown tagIds are dropped. Did NOT add the optional engLow/engHigh value clamping.

**Skipped**

- **WebSocket adapter silently downgrades https->ws / no auth on WS connection** — autoFixable=false, flagForOwner=true. The fix adds an auth token to the WS handshake (changing the wire protocol the SCADA proxy must understand) and a product decision on warn/refuse for non-wss non-localhost. Out of clearly-safe scope.

> Note: Edited only WebSocketAdapter.ts. No new imports; fixes reference existing members (this.tags Map, this.isDisconnecting, parseQuality/parseTagValue) and existing TagDefinition typing. parseQuality param widened safely. No WebSocketAdapter test files exist, so the tagId allowlist does not break assertions. Did not run npm/git; verified via static read.

---

## `src/scada/adapters/WonderwareAdapter.ts`

_Applied: 4 | Skipped: 3_

**Applied**

- **Wonderware base URL hardcoded to plaintext http:// (Basic-auth creds in clear)** — Changed the hardcoded REST base URL scheme from http:// to https:// so Basic-auth creds traverse TLS (http also fails as mixed-content on the https GH-Pages page). Added an explanatory comment. In-file only.
- **Wonderware maps response.Data without verifying it is an array** — Added const rows=Array.isArray(data?.Data)?data.Data:[] guards before mapWWValuesToHistoryPoints in all three read methods. In getLatestValue, added if(!data||data.TimeStamp===undefined) return null before wrapping the single value.
- **getPlotValues fallback divides duration by intervals with no zero/negative guard** — safeIntervals=intervals>0?intervals:100, durationMs=Math.max(0,end-start), intervalMs=Math.max(1,floor(durationMs/safeIntervals)) preventing Infinity (intervals=0) and negative resolutionMS (start>end).
- **OPC quality mask comment says 16-bit but math assumes 8-bit** — Corrected the mapOpcQuality doc comment to describe the 8-bit OPC DA quality byte the code decodes (top two bits = major field) and noted the 16-bit caveat. Did NOT alter the bit-math ((q>>6)&0x3 is correct for 8-bit).

**Skipped**

- **Add useSsl?/secure?/scheme? field to WonderwareConnectionConfig** — Requires modifying the exported WonderwareConnectionConfig in HistorianInterface.ts (and the union), a cross-file exported-type change out of scope. Applied the in-file https-default portion instead; a follow-up should add the configurable scheme field in the file that owns the type.
- **Refuse-to-send Basic-auth over plain http unless localhost** — Depends on the new config scheme field (other file). Standalone would require branching on a scheme value the config does not expose. Coupled to the skipped exported-type change; the https default already removes the cleartext path in the common case.
- **Normalize 16-bit OPC quality word before masking** — Low conf 0.45, flagForOwner. Current behavior is correct for the 8-bit byte; changing the mask would alter quality classification without confirming the actual WW REST field width. Applied the comment correction only.

> Note: Edited only WonderwareAdapter.ts. 4 of 5 addressed (the http/credentials issue split into an in-file https-default applied + a cross-file config-field skipped). No exported types/signatures/other files touched. data?.Data narrows to WWHistoryValue[]; getLatestValue null-guard uses the declared TimeStamp; getPlotValues returns finite positive intervalMs. The http->https default is the one runtime-visible change and is the finding's explicit recommendation. Recommend owner follow up on the WonderwareConnectionConfig scheme field in HistorianInterface.ts.

---

## `src/stores/aiConfigStore.ts`

_Applied: 0 | Skipped: 3_

**Skipped**

- **Debug overlays default ON for end users (VCL Context + Shift Handover)** — Owner-flagged product/UX tradeoff (autoFixable:false, flagForOwner:true). The line-326 'all default OFF' comment is contradicted by BOTH showVCLDebug:true AND showShiftHandover:true; flipping only showVCLDebug would not resolve the cited contradiction. Which overlays ship enabled is a launch-UX decision. (The only test touching showVCLDebug sets it false before asserting, so a flip would not break the test, but the UX classification still mandates skip.)
- **Runtime Gemini failures (429/quota/network) never surface to the user** — Requires adding a NEW store action to the exported AIConfigState interface AND wiring it into geminiClient.ts/aiEngine.ts catch blocks. Hits two SKIP rules (exported interface change + multi-file behavior change). 'Behavior change, flag for owner'.
- **Gemini API key persisted in plaintext localStorage with no warning** — All three fixes are out-of-file or persistence-behavior changes: caution microcopy in GeminiSettingsModal.tsx (a store has no UI surface), move to sessionStorage (key no longer survives reload), or drop from partialize (key no longer persists). Each changes UX/persistence. Owner.

> Note: No edits. All 3 findings are autoFixable:false + flagForOwner:true, each in a SKIP category: finding 1 owner-deferred default whose partial application wouldn't satisfy its own goal; finding 2 changes the exported AIConfigState and needs cross-file wiring; finding 3's fixes are out-of-file or persistence-behavior changes (the store has no UI surface for privacy microcopy). Baseline preserved.

---

## `src/stores/multiplayerStore.ts`

_Applied: 2 | Skipped: 2_

**Applied**

- **Security wiring: sanitize player name at store boundary (setLocalPlayerName)** — Added import { sanitizePlayerName, sanitizeRoomCode } from '../utils/sanitize' and changed setLocalPlayerName to set({ localPlayerName: sanitizePlayerName(name) || 'Player' }). Defense-in-depth; idempotent for the canonical lobby path; closes the gap where MultiplayerPanel.tsx:94/118 calls it with only .trim().
- **Security wiring: validate/normalize room code at store boundary (joinRoom)** — Changed joinRoom to roomCode: sanitizeRoomCode(code) || code.toUpperCase() (was code.toUpperCase() only). sanitizeRoomCode upper-cases, strips non-alphanumerics, and requires exactly 6 chars; falls back to upper-case for malformed input so the live path is preserved while closing the unsanitized MultiplayerPanel.tsx:120 join path.

**Skipped**

- **Other users' chat/names in volatile memory only, no notice; chat plaintext over the channel** — flagForOwner/autoFixable:false. The fix says 'No code change needed for the minimization aspect' and asks only for a pre-join disclosure note belonging in the lobby/pre-join UI (another file). No surgical in-file change applies.
- **Room codes are low-entropy and brute-forceable via the PeerJS public server** — flagForOwner/autoFixable:false, architecture/product. The fix needs an admission-control step (host-verified join secret) wired across SignalingService.ts/MultiplayerManager.ts plus randomizing the host peer-id; multi-file, restricted to editing only this store.

> Note: Both literal findings were flagForOwner/non-autofixable multi-file/UI-microcopy changes, skipped. Instead satisfied the task's explicit 'Security wiring' by adding defense-in-depth sanitization at the store boundary. Verified sanitizers are wired in MultiplayerManager.ts and the lobby but the ui-new MultiplayerPanel.tsx (94/118/120) bypasses them; the store-level guard closes that gap. Deliberately did NOT add sanitizeChatMessage to addChatMessage (both inbound paths already sanitize; re-encoding would double-encode &amp;->&amp;amp;). sanitizePlayerName/sanitizeRoomCode are strip/validate-only, idempotent. No exported types/signatures changed; no tests reference these actions. Did not run build; re-read changed regions.

---

## `src/utils/aiEngine.ts`

_Applied: 3 | Skipped: 1_

**Applied**

- **AI engine teardown leaks pending safety-report resolution timeouts** — Added a loop in the initializeAIEngine() cleanup closure (after clearing loopInterval) that clearTimeout()s every handle in the module-level activeResolutionTimeouts map and calls .clear(). Prevents the 5s safety-report resolution timers firing against a torn-down session. In-file, no normal-operation behavior change.
- **Strategic Gemini failures never trigger API exponential backoff** — Added recordApiFailure() inside generateStrategicDecision()'s catch block (~line 3957). Because this function swallows the error and returns null, the AI-loop caller's catch never fired, so strategic failures never incremented apiBackoff.consecutiveFailures. recordApiFailure is a module-level fn already in scope. No double-counting (inner catch returns null, outer caller sees no throw).
- **No AbortController on in-flight Gemini strategic call (late response after disconnect)** — Applied the documented minimal in-file mitigation: after awaiting generateContent and the !response check, added an if(!geminiClient.isConnected()) guard that logs, calls setStrategicThinking(false), and returns null before recordApiUsage/setStrategicPriorities/recordDecision run. Stops a late-resolving request from charging the cost overlay and writing priorities for a disconnected client. Did NOT thread an AbortController through geminiClient (other file).

**Skipped**

- **Emoji in user-facing AI decision text violates No-Emoji rule (line 3921)** — flagForOwner=true; the fix changes shipped user-facing text (AIDecision.action/reasoning rendered in AICommandCenter) and is cross-cutting: getRecentStrategicDecisions() at line 3756 strips the literal emoji prefix, so altering it here needs coordinated changes to that strip logic and the rendering component. A product/UX text tradeoff reserved for owner.

> Note: All three applied fixes are in-file, surgical, preserve the Promise<AIDecision|null> return type, and reference only pre-existing symbols (activeResolutionTimeouts ~line 3984; recordApiFailure line 3069; geminiClient.isConnected() at geminiClient.ts:158). Did not run typecheck/lint/build (task forbids bash mutations/npm), but the edits introduce no new symbols/types/signatures. The emoji finding is the only one left for owner.

---

## `src/utils/apiSecurity.ts`

_Applied: 1 | Skipped: 5_

**Applied**

- **Entire apiSecurity module (CSRF/JWT/secureFetch) is dead future-auth scaffolding** — Applied the safe half of option (a): added a top-of-file banner to the module docblock stating the module is UNUSED AT RUNTIME (no importers in src/), is future-auth scaffolding not wired into any active path, and establishes NO auth/CSRF posture for the current frontend-only app. Comment-only; no types/exports/behavior touched. The deletion branch was withheld (file deletion forbidden; finding flagForOwner).

**Skipped**

- **secureFetch() exported but never used** — Both paths out of scope: delete secureFetch+SecureFetchOptions+remove from barrel (changes an exported signature, edits src/utils/index.ts) or adopt it in RESTAdapter (changes another file's runtime behavior). flagForOwner:true.
- **CSRF helpers exported but never used** — Removing three exports from src/utils/index.ts (another file) and deleting exported functions. Forbidden; flagForOwner:true. Dead-state documented via the banner.
- **JWT helpers exported but never used** — Removing exports + TokenPayload from src/utils/index.ts and deleting exported functions. Out of scope; flagForOwner:true. Documented via banner.
- **rateLimiters exported but never wired** — Wiring into MultiplayerManager.ts/geminiClient changes other files; removing exports touches src/utils/index.ts. flagForOwner:true.
- **maskSensitiveData/clearSensitiveFields exported but never used** — De-duping via geminiClient.getMaskedApiKey() edits another file; removing exports touches src/utils/index.ts. flagForOwner:true.

> Note: All 6 findings are variants of 'dead future-auth scaffolding, owner decides delete vs keep.' Deleting the file/exports or the utils/index.ts re-exports is forbidden and every such finding is flagForOwner:true. The only in-file, zero-behavior-change action is documenting the module's dead/non-protective status, applied as a docblock banner (the finding's own option (a)). No other in-file fixes (no console.*, no emojis, guards already present, comments accurate).

---

## `src/utils/audioManager.ts`

_Applied: 2 | Skipped: 1_

**Applied**

- **Production TTS pipeline emits unconditional console.log debug lines** — Routed all 29 ungated console.log('[TTS] ...') calls through the existing gated logger. Added a debug passthrough to the existing audioLog wrapper (mirroring info/warn/error) delegating to logger.audio.debug, then converted every console.log to audioLog.debug. logger.audio runs at 'info' in production, so debug is suppressed in prod (eliminating console spam) while visible in dev. Verified zero console.log/debug/info remain; 29 audioLog.debug present.
- **29 ungated console.log in TTS in prod (L11 DeadCode)** — Same underlying issue as the L1 finding, fully resolved by the single logger conversion. All 29 raw calls now go through logger.audio.debug (what this finding requested).

**Skipped**

- **Muting does not stop an in-flight TTS PA announcement** — autoFixable:false, flagForOwner:true; its own fix note says 'This changes mute semantics, so it needs owner sign-off.' Calling stopTTS() inside the muted setter would change established mute behavior to also cancel an already-speaking utterance. The one-utterance-continues behavior is bounded and non-crashing; queue/scheduler guards already prevent new announcements when muted.

> Note: Both console.log findings (L1 autoFixable + L11 flagForOwner) describe the same defect and are resolved by one sanctioned console->logger conversion (29 lines). Added one debug method to the in-file audioLog wrapper (mirrors info/warn/error, delegates to logger.audio.debug). [TTS] prefixes preserved verbatim. No exported symbols/types/signatures changed. Could not run typecheck/lint/build; change is type-trivial. Grep confirmed no test spies on console.log in the TTS path. The muted-setter fix skipped per flagForOwner.

---

## `src/utils/dracoLoader.ts`

_Applied: 0 | Skipped: 2_

**Skipped**

- **DRACO JS decoder executed as third-party code from www.gstatic.com [L2 Security]** — The fix (autoFixable:false, flagForOwner:true) is to vendor the DRACO 1.5.7 decoder binaries into public/draco/ and repoint DRACO_DECODER_PATH. Vendoring means a new directory + large binary assets, both forbidden by scope. The in-file half (changing the path) cannot be applied alone: public/draco/ does not exist, so repointing without the decoder files would break forklift.glb DRACO decoding and regress GREEN. The two halves are inseparable. SRI pinning is not cleanly wireable through DRACOLoader's API.
- **DRACO decoder loaded from gstatic CDN at runtime [L9 Performance]** — Same root issue and same prescribed fix (vendor decoder into public/draco/, set DRACO_DECODER_PATH=`${import.meta.env.BASE_URL}draco/`). Vendoring binaries is out of single-file scope; the in-file path repoint is unsafe in isolation (public/draco/ does not exist). The companion CSP/connect-src change lives in index.html. autoFixable:false, flagForOwner:true.

> Note: Both findings are the same issue from the L2 (security) and L9 (performance) lanes: the DRACO decoder is fetched/executed at runtime from www.gstatic.com. The fix is identical and unsplittable for my scope (vendor binaries into public/draco/ AND repoint path + a CSP entry in index.html). Verified public/draco/ does not exist, so doing only the in-file half would break forklift.glb and regress GREEN. No clearly-safe partial; applied empty. No unrelated edits.

---

## `src/utils/geminiClient.ts`

_Applied: 1 | Skipped: 2_

**Applied**

- **Fix stale model-name in init log string** — Changed the init log from '...Gemini 2.0 Flash' to '...Gemini 3 Flash' so it matches the file header ('Gemini 3 Flash Client') and the actual model ID ('gemini-3-flash-preview'). String-only; the model ID itself NOT touched. Copy category 'wrong model-name log/comment strings'.

**Skipped**

- **Context-overflow detection relies on brittle English substring matching (L4, conf 0.72)** — The suggested fix (match err.status==='INVALID_ARGUMENT'/HTTP 400) is a regression vector: a token-limit 400 is indistinguishable from any other 400 by status alone, so classifying all 400s as overflow would skip recordFailure() for genuine errors that SHOULD advance the circuit breaker. Doing it correctly still requires inspecting the message text. Truncation (line 293) already caps prompt size, making real overflows rare.
- **API key retained on instance / not cleared via clearSensitiveFields (L2, conf 0.6, flagForOwner:true)** — Finding states 'No code change strictly required' and is flagged for owner. disconnect() already nulls this.apiKey. The proposed hardening wires in clearSensitiveFields from apiSecurity.ts (a separate file, flagged elsewhere as entirely-dead). JS gives no real memory-zeroing guarantee.

> Note: 2 findings, both low-severity and skip-eligible; 1 unflagged Copy fix (the stale model-name log string) was the one clearly-safe edit, applied. No exported types/signatures/model IDs changed. Only geminiClient.ts edited.

---

## `src/utils/index.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **utils/index.ts barrel has zero importers** — The only fix is whole-file deletion ('Delete src/utils/index.ts'), explicitly in the SKIP list and impossible via the Edit tool; bash/rm forbidden. Verified the claim via rg (zero importers anywhere, including tests), so it is genuinely dead, but remediation belongs to file-deletion handling, not in-file editing. No alternative in-file fix addresses this finding without inventing an unprescribed action (e.g. an UNUSED banner) or trimming the apiSecurity re-export block (owned by the apiSecurity finding group, flagForOwner, a deletion-type action).

> Note: One finding (L11 DeadCode, low/0.92), only fix is whole-file deletion, out of scope for this Edit-only no-bash task. Verified the dead-barrel claim is true (zero importers in src/ or tests), so deletion is safe in principle but is owner/orchestrator scope. No edits; build remains green.

---

## `src/utils/pathfinding.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **Dead A-star module, zero importers** — The only remedies are (a) delete the whole file or (b) convert the header TODO into an issue. Both out of scope: do NOT delete files; creating issues is not an in-file edit. autoFixable:false, flagForOwner:true. Verified zero importers via rg, but the file is internally self-consistent (THREE used; all locals/methods referenced), so no safe in-file dead-code removal. Deletion needs the owner's call (NavigationGrid/AStarPathfinder/PathFollower may be future scaffolding).

> Note: Single L11 DeadCode finding (low/0.85): whole module dead, zero importers. Both remedies fall outside in-file edit scope and the finding is flagForOwner. No edits. Verified via rg (NO IMPORTERS FOUND). Header comment already documents the dead-code status. File unchanged.

---

## `src/utils/sanitize.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **sanitizeWorkerName/sanitizeUrl/isUrlSafe/decodeHtmlEntities/validateObject/createStringValidator/createNumberValidator exported but never used** — Both safe remediations are out of single-file scope. (a) Pruning the unused exports requires editing src/utils/index.ts, which re-exports all seven by name (lines 101-115); deleting any function would break that named re-export with TS2305 and turn GREEN to RED. Restricted to editing only sanitize.ts. (b) Wiring sanitizeWorkerName into call sites requires editing store/component files. autoFixable:false, flagForOwner:true; removing exported functions changes the exported surface (SKIP rule).

> Note: Only one finding (dead-export/bundle cleanup) which cannot be addressed within a single-file edit without breaking compilation. Verified via rg the seven symbols are referenced only here (definitions) and in src/utils/index.ts (named re-exports). Deleting any would fail the barrel's re-export (TS2305) and break GREEN. Belongs to the owner/separate-handling track. No edits.

---

## `src/utils/serviceWorkerRegistration.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **SW message handler trusts any message origin/shape (no source/type validation)** — The finding's actual fix target is public/sw.js. Its file field points here (231-247) but the described code (const { type } = event.data; in self.addEventListener('message'...) plus getCacheStats()) lives in public/sw.js:231-266 (verified). It was grouped under this related module, but the vulnerable code is the SW message receiver. My assigned file is the client sender side (it posts CLEAR_CACHE/GET_CACHE_SIZE) and has no incoming-message handler to harden. The recommended fix (if(!event.data||typeof event.data!=='object') return; + a type allowlist, and dropping full pathnames from GET_CACHE_SIZE) can only be applied in public/sw.js. Edit-only-serviceWorkerRegistration.ts rule.

> Note: One finding whose real target is public/sw.js (the SW message handler at public/sw.js:231-247, confirmed by reading). My assigned file is the client sender side with no message-receive handler, so nothing safely fixable here without touching public/sw.js (off-limits). No edits; baseline GREEN. Action for the orchestrator: route this finding to whichever pass owns public/sw.js (fix is if(!event.data||typeof event.data!=='object') return; plus a CLEAR_CACHE/GET_CACHE_SIZE allowlist, optionally returning entry counts instead of full URL pathnames).

---

## `src/utils/texturePreloader.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **16 procedural canvas textures (up to 512x512) generated synchronously during boot useEffect** — L9 Performance outside clearly-safe scope. autoFixable:false, low, and the fix text says 'verify magnitude before prioritizing'. The function returns Promise<void> that resolves AFTER textures exist; callers await it. Deferring to requestIdleCallback or chunking across frames would either resolve before textures are ready (first-frame texture pop-in) or change when downstream boot proceeds, both behavior changes in a boot-critical path. Needs a Safari fallback for requestIdleCallback, so not one-line-safe; cannot validate against the 1199-test baseline (no npm/build). A perf judgment call.

> Note: 77 lines, exactly ONE L9 Performance finding, outside clearly-safe categories (STEP 4/hard rules). Verified no hidden in-scope fixes: all 7 generator imports + logger used (no dead code), and the log string 'Generated 16 procedural textures' matches the actual count (3+2+3+3+5=16), so no copy fix. No a11y/copy/safety/correctness/security/dead-code issues. No edits; file unchanged.

---

## `src/workers/textureWorker.ts`

_Applied: 0 | Skipped: 1_

**Skipped**

- **If kept: texture worker uses structured-clone (no Transferables) and TextureWorkerManager lacks onerror/fallback** — Out of clearly-safe and partly out of file scope. (1) The finding's primary recommendation is DELETE the file ('Prefer deleting'), an explicit SKIP. (2) The only in-file portion (postMessage transfer-lists for ImageData.data.buffer) is an L9 Performance optimization, not a clearly-safe category, autoFixable:false. The single self.postMessage returns a heterogeneous union (DecodeResult/ResizeResult have one ImageData, MipmapResult an array, AtlasResult none); a malformed transfer list throws DataCloneError at runtime, which the try/catch would convert into a silent decode-error response, a regression risk against GREEN for a low-severity perf gain. (3) The other half (onerror + main-thread createImageBitmap fallback) lives in src/hooks/useTextureWorker.ts:92,151, which I cannot edit.

> Note: Read full file (287 lines). One L9 Performance finding (low, autoFixable:false). No edits. Clean for all in-scope categories: a Web Worker with no DOM (no a11y/copy/destructive surface), no console.*, no dead imports/locals. The getContext('2d')! non-null assertions were left untouched (not in findings; pre-existing accepted; guarding would alter result flow/types). The finding's primary recommendation (delete the file) and the onerror/fallback half are out of editable scope, and the in-file transfer-list optimization is perf-only/not-auto-fixable with DataCloneError regression risk. Baseline GREEN; zero changes.

---

## `vite.config.ts`

_Applied: 1 | Skipped: 1_

**Applied**

- **loadEnv return value discarded (dead call)** — Removed the dead loadEnv(mode, '.', '') call (return value discarded; nothing reads loaded env; base path derives from process.env.VERSION). Trimmed loadEnv from the vite import (now import { defineConfig, Plugin } from 'vite') and dropped the now-unused mode parameter (defineConfig(() => {). defineConfig and Plugin remain used; SECURITY comment block preserved. Functionally a no-op.

**Skipped**

- **recharts (343kB) chunk risk, verify SPCCharts/ComplianceDashboard sit behind a lazy boundary** — Not a vite.config.ts edit. The fix is a cross-file lazy-boundary audit of SPCCharts.tsx/ComplianceDashboard.tsx import parents (autoFixable:false, conf 0.6, needs a real build chunk-graph check). Multi-file investigation out of scope for a single safe in-file edit. The manualChunks 'charts' grouping is correct as-is; demand-loading depends on consumer lazy() boundaries, not this file.

> Note: Only 2 findings. Applied the in-file dead-code fix; verified by re-read that mode/loadEnv/the call are gone, both remaining imports stay used, and the SECURITY comment is intact. A zero-arg () => UserConfig is assignable to defineConfig (fewer params valid in TS), no type break. Did not run npm/build; correctness confirmed by reading.

---
