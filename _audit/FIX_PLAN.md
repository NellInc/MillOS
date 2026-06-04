# MillOS Launch Audit — Fix Strategy (post-audit execution plan)

Audit run: `wf_e2b978b8-8f6` (97 agents, 12 lanes). Findings land in `_audit/findings.json` + `findings.md`.

## Invariant
Baseline is GREEN (typecheck/lint/build pass, 1199 tests). Every batch must re-verify it. A batch that reddens the baseline is reverted, not patched forward.

## Triage rules (applied to findings.json)
1. **Drop** confidence < 0.5 unless severity=critical.
2. **Split by blastRadius:**
   - `local` + `autoFixable` + not `flagForOwner` → **AUTO** (parallel fix, one agent per file).
   - `ripple` (types.ts / store.ts / exported signatures / props / shared interfaces) → **SERIAL-INLINE** by me, all call-sites in one edit (cascade prevention).
   - `flagForOwner` true → **FLAG** (report to Nell; do not auto-apply). Includes: API-key persistence UX, legal docs publish, archive deletion (README screenshot ref), CSP tightening, charts lazy-load, any UX/behavior default change.
3. **3D/visual `.tsx`** edits (no test coverage): only AUTO if purely additive/non-render (a11y attrs, copy) — otherwise FLAG or low-confidence-skip.

## Execution order (per-batch reconcile, never one big end-reconcile)
1. **Batch A — Config & dead-files (lowest risk, high polish):** .gitignore coverage/, remove UIOverlay.tsx.original + *.glb.backup.glb + root perf-test/analyze/.py clutter (after confirming unreferenced), add .env.example, robots.txt/sitemap.xml/manifest.json, dead deploy workflows. → reconcile.
2. **Batch B — Copy & a11y (LOCAL, additive):** typos, version badges, stale model names, aria-labels, roles, focus, alt text. One agent per file, parallel. → reconcile.
3. **Batch C — Security wiring & correctness LOCAL:** wire sanitize* into multiplayer send/receive, null guards, console→logger, peer-message validation, error boundaries. → reconcile.
4. **Batch D — RIPPLE (serial, me):** any shared-type/prop/signature changes, all call-sites one edit. → reconcile each.
5. **Batch E — Perf LOCAL:** module-level reusable temporaries for per-frame allocations, shader-cache-key fixes, memoization — FLAG behavior-changing lazy-loads. → reconcile + spot-verify build size.
6. **Archive removal:** move `src/0.10 Archive/assets/Screenshot.png` → `docs/assets/`, update README, then `git rm -r src/0.10 Archive/`. → build.

## Reconcile command (each batch)
`npm run typecheck && npm run lint && npm run build && npm run test`
Then `npm run format` on touched files.

## Coverage honesty
Final report states which lanes/files were deep-read vs sampled (from `_audit/coverage.md`), and lists every FLAG item for Nell. No silent truncation.

## FLAG-for-Nell running list (seed; audit will add)
- API key persisted plaintext in `millos-ai-config` localStorage → warn-in-UI + optional sessionStorage (UX tradeoff).
- Legal: no privacy/terms exist; public millos.net + Gemini egress + localStorage + PeerJS + Google Fonts/jsdelivr → privacy notice warranted (draft only, don't publish).
- `src/0.10 Archive/` deletion blocked by README screenshot ref — move asset first.
- CSP `unsafe-inline`/`unsafe-eval` — likely required by R3F/WASM; verify before tightening.
- `prototypes/index.html` (4200-line AssetPrototypePage) shipped as 2nd vite build input — intended for prod?
- `public/v0.10|v0.20|v0.30` shipped historical builds + k8s/docker deploy workflows — keep or prune?
