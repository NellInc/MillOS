# MillOS Launch Audit — Executive Summary

_12-lane audit: 266 findings (2 critical, 42 high, 96 medium, 126 low). Detail: `findings.md`; all owner-decisions: `FLAGS.md`._

## What was FIXED & verified (baseline green: 1199 tests)

- **~190 safe LOCAL fixes** across **61 code files** (throttled per-file fix-swarm + inline), each preserving typecheck/lint/build/1199-tests.
- WCAG a11y (dialog roles, focus traps, ESC, aria-live, accessible names), API-key privacy disclosure, destructive-reset confirmations + full data-clear, CSP host-adds (PeerJS `0.peerjs.com`, DRACO `www.gstatic.com`), SCADA adapter error-handling/timeouts, multiplayer null-guards, AI-engine lifecycle/backoff, dead-code/unused-import removal.
- **3 new hygiene files** (`.env.local.example`, `robots.txt`, `sitemap.xml`); `coverage/` gitignored+untracked (48); README env-setup corrected; `package.json` 0.20.0→0.30.0.
- 2 swarm regressions caught & repaired: AICommandCenter tab-role test, `vite.config.ts` minify typing.

## ⛔ LAUNCH-BLOCKERS — your decision/verification

- **[CRITICAL]** `src/utils/geminiClient.ts:135` — Gemini model 'gemini-3-flash-preview' likely invalid for the legacy @google/generative-ai SDK — live AI silently dead at launch
  - → Owner decision: confirm the exact model ID the user's API key + @google/generative-ai 0.24.1 actually serves (live smoke test). If Gemini 3 is intended, migrate to @google/genai and set a verified ID; otherwise set a known-served ID (e.g. a current 2.0/2.5-Flash). In the SAME change, fix the stale '2.0 Flash'/'Flash 3' log+comment strings and re-check the GEMINI_FLASH_*_COST constants against the chosen model's published pricing.
- **[CRITICAL]** `public/v0.20/` — 418MB duplicate v0.20/ asset tree ships to GitHub Pages in the build
  - → Remove public/v0.20/ from the deployed tree (move out of public/ or exclude in a build step). It is a stale snapshot of a prior published build; runtime paths use import.meta.env.BASE_URL ('/').
- **[HIGH]** `.github/workflows/deploy.yml:79` — CNAME file never copied into the deployed Pages artifact
  - → Add a step before upload: `cp CNAME staging/CNAME` (and ideally also into staging/v0.30/ if subpaths are served directly). Resolve the apex/www question first (see related finding).
- **[HIGH]** `SettingsPanel.tsx:458-468` — Reset clears 5 of 16 keys; plaintext Gemini key survives
  - → Add Clear all data removing every millos key or a Forget API key button.
- **[HIGH]** `GeminiSettingsModal.tsx:266-277` — No disclosure plant data sent to Google Gemini
  - → Add notice MillOS sends simulation state to Google Gemini under Google Privacy Policy.
- **[HIGH]** `src/components/ui-new/sidebar/ContextSidebar.tsx:33` — MultiplayerPanel imported EAGERLY, pulling peerjs into the boot path
  - → Make MultiplayerPanel lazy to match siblings: `const MultiplayerPanel = lazy(() => import('../panels/MultiplayerPanel').then(m => ({ default: m.MultiplayerPanel })));` and wrap its render at line 168 in the existing Suspense. Defers peerjs to first panel open.
- **[HIGH]** `.github/workflows/ci.yml:17,32,41,57` — CI cannot fail on lint or test — green CI does not gate regressions
  - → Remove `exit 0` (revert to `npm run lint`) and `|| true` from the test step, and drop `continue-on-error: true` once flakiness is addressed; if Vitest worker crashes are the real concern, scope the tolerance to that specific exit condition rather than swallowing all failures. Requires owner sign-off (changes what CI blocks on).
- **[HIGH]** `.github/workflows/release.yml:58-95` — release.yml deploys a SECOND, conflicting GitHub Pages site on tag push
  - → Remove the `deploy-ghpages` job from release.yml (let deploy.yml own all Pages deploys), OR make it mirror deploy.yml's versioned staging. Owner decision: which workflow owns Pages.

## 11 RIPPLE items (cross-file — exact patches in `findings.md`)

- **[HIGH]** `src/stores/gameSimulationStore.ts:830 (with src/components/MillScene.tsx:824 and src/components/WorkerSystemNew.tsx:383-385)` — Fire-drill evacuation metrics never complete when camera is outside the factory
- **[HIGH]** `src/multiplayer/SignalingService.ts:85-90` — Room-not-found error never reaches join UI
- **[HIGH]** `src/multiplayer/MultiplayerManager.ts:280` — Host trusts unvalidated, spoofable fields from untrusted guest messages (no payload validation, no default case)
- **[MEDIUM]** `src/index.css:28` — Type-scale fragmentation: text-xs override to 14px forces 1089 arbitrary sub-12px font sizes across 82 files
- **[MEDIUM]** `src/types.ts:841` — Roster targetMachine 'mill-1.5' references a nonexistent machine
- **[MEDIUM]** `src/types.ts:931` — Roster targetMachine 'sifter-0' references a nonexistent machine
- **[MEDIUM]** `src/components/UIOverlay.tsx:1296` — UIOverlay (the entire old top-level UI, ~2000 lines / 89KB) is superseded by ui-new/GameInterface and no longer rendered
- **[MEDIUM]** `src/protocols/vcp/decoder.ts:36` — VCP encoder/decoder roundtrip collision: 'mastery' encodes to 'M' and decodes to 'meaning'
- **[MEDIUM]** `src/components/ui/KeyboardShortcutsModal.tsx:166` — Secondary text color text-slate-500 fails WCAG AA contrast on dark panels
- **[LOW]** `src/systems/bas/educationalContent.ts:2` — Educational content names the system 'BAMS' while README/UI call it 'BAS'
- **[LOW]** `src/components/index.ts:1-90` — components/index.ts barrel has zero importers — and is the only thing (besides a test) keeping orphaned UIOverlay 'reachable'

## Remaining flagged (166 total — see `FLAGS.md`)
Asset bloat ~490MB (v0.20/ tree, GLB backups, texture sources, 140MB MP3s), legal drafts (privacy/ToS), UIOverlay dead-code (~2000 lines superseded by ui-new), prototype lazy-load, OG image dims, dock mobile-overflow, type-scale refactor.
## Runtime verification (npm run preview + agent-browser, software-WebGL)
- App **boots clean** under the production meta-CSP: static loading screen → React `LoadingScreen` → 3D scene + `ui-new` overlays + onboarding modal all render.
- **Zero CSP violations, zero console errors** across boot. Confirms the CSP edits are safe: swarm added `0.peerjs.com`; I added the missing **`https://www.gstatic.com`** (DRACO decoder host) — without it, DRACO-compressed GLB models would have failed to decode in production (green tests, broken site). `dracoLoader.ts` still fetches the decoder from gstatic and `public/draco/` does not exist, so the CSP host is required.
- WebGL scene rendered (factory interior, worker GLB models visible). 3D verified via swiftshader; native GPU unavailable in this harness.

## Note — applied change to confirm
- `package.json` **0.20.0 → 0.30.0** was applied by a fix agent (version-consistency with the `/v0.30/` deploy). Low-risk and aligns with `deploy.yml`, but it is a release-versioning decision — please confirm it's intended.
