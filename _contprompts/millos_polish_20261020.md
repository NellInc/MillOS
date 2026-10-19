# MillOS: polish everything (gameplay, animation, lighting) — continuation prompt, 20 Oct 2026

## Goal

MillOS should feel finished to a stranger who arrives by link, in English or pt-BR, with no
presenter: it plays well, it moves well, and it looks lit by a real sky. The previous session
made the shift playable and honest (one clock, a guided first delivery, recoverable failures,
a cooperative layer, a shift review). This session polishes **everything**, in three
workstreams plus the leftovers:

1. **Gameplay:** feel, pacing, clarity of goals and consequences across a whole day, not
   just the first delivery.
2. **Animation:** workers, forklifts, trucks, conveyors and product flow, machines, the
   camera, UI motion; nothing pops, slides, jitters, clips or freezes.
3. **Lighting:** day, dusk, night, weather, interior vs exterior, shadows, emissives and
   signage; no flicker, no washed-out or crushed surfaces.
4. **Everything left open** (listed below).

"Fix everything" means the full set. Stop only for a decision that is truly Nell's (ask
once, keep working elsewhere) or a hard resource limit; then report what remains, with counts.

## Where things stand (verify before trusting)

- Work is on branch **`claude/resolute-fix-20261018`**, worktree
  `/private/tmp/millos-resolute-20261018` (sparse: `assets/source/`, `test-results/`,
  `output/`, `dist-archives/` excluded). **78 commits ahead of `origin/main`, unpushed.**
  If `/private/tmp` was wiped, the branch is still in the repo's git; recreate the worktree
  from it (recipe below).
- Live site: PR #40, `v0.40-7f1429b06e39`. The branch above is **not live**.
- Full ledger of the last session (decisions, runtime evidence, waves A–G):
  `_contprompts/millos_resolute_fix_20261018.md` on the branch. Read its "Decisions
  taken", "Round 2" and "What remains" sections first.
- Last whole gate on the branch: typecheck, agent:typecheck, lint, format, manifest (after
  regenerating the gitignored inventory), build with `VERSION=v0.40`, validate:bundle,
  reachability, community, depth and shaders all pass; vitest 3,754 pass, 28 skipped,
  **5 fail, all environmental** (`assets/source` ENOENT under the sparse checkout:
  `scripts/crafted-assets.test.mjs` x3, `HeritageSignage.test.ts` x2). e2e 2/2.
- The primary checkout `/Users/nellwatson/Documents/GitHub/MillOS` holds **someone else's
  uncommitted work** (branch `codex/metal-startup-diagnosis`). Never edit it. Other
  worktrees under `~/.codex/worktrees/` and `/private/tmp/millos-live-startup-fix` are not
  yours either.

## Decisions waiting for Nell (ask once, in the same message as finished work)

1. **Idle camera orbit:** stays on by default as an exterior showcase (now kept outside the
   hall, stops at its first collision). Off by default is a one-line change.
2. **Reload safety:** a reload during a live cooperative shift settles it by design, so that
   season can no longer be "honoured". Now explained in the debrief; rule unchanged.
3. **Native Brazilian reader** for the cooperative vocabulary and newer strings ("Ver a
   expedição", "Acordo entre turnos", wear warning, reload reason).

If Nell has answered any of these in the conversation, follow the answer.

## Open items carried over (fix or verify; each is part of "everything")

Seen only in unit tests, never in a browser: verify each in pixels, EN and pt-BR:
- the repair countdown ("Service unit at work: N min of game time left") after a breakdown;
- Overview/mobile pace buttons under a handoff hold;
- the close-experiment button after a decided handoff shift;
- the message after leaving a season from the shift debrief;
- the follow-on replacement notice on the season card;
- an open serious incident in an ungraded shift review.

Also open:
- The 7.5-minute standard-pace narrative run (orders 1–2, changeover, Truck 1 of 2) was on
  the pre-round-2 build; repeat it on the current build.
- No SCADA setpoint control exists in the UI; the operator decision-log path is wired but
  unused. Decide (with evidence of intent in the code/docs) whether a control belongs in
  the SCADA panel; if it does, build it with its log entry; if not, record why.
- No axe scan of the loading overlay (was judged non-deterministic). Find a deterministic way
  (e.g. `page.route` holding one asset) or record why not.
- Time to `millosStartupReady`: 35–57 s on this machine under load 5–25. Investigate the
  critical path (what holds the overlay at "Preparing the complete scene" ~95%), the
  first-visit Low tier, and the "Use low graphics" escape. No FPS claims while load exceeds
  3 runnable per core.
- Not re-opened unless new evidence: audit findings 20, 25, 27, 39 (refuted by both refuters).

## Constraints Nell has stated (binding)

- **Her machine overheats.** Run the app only when runtime evidence is truly needed; batch
  runtime checks into as few sessions as possible; close the tab and server at once.
  Subagents run nothing heavier than their own test files (`--maxWorkers=1`); the full
  suite runs once per wave. Renders take `.capture.lock` (scripts already do).
- **Disk is often under 2 GB.** `df -h /` before any build; delete your own `dist` after
  each build. A full worktree checkout is ~2 GB: never create one (use the sparse recipe).
- **No FPS claims** while load exceeds 3 runnable per core (`uptime`, divide by cores).
  Benchmarks carry a `load` field; a red result at high load is not a regression.
- **Hooks:** a safety hook guards paths containing `hooks`. Committing or patching
  `src/hooks/*` needs Nell to run `consent-gate approve policy-gate-edit` (ask, stating the
  exact change). The same consent hook blocks Bash heredocs and inline code containing
  `>`-like text (`=>`, `>>>>>>>`), treating it as a redirect: write files with Write/Edit,
  put scripts in files. Report every hook or surface-tripwire notice and say whether the
  command could have written hooks, settings, agents, rules, constitutions or consent tooling.
- **Pushes cost money.** Push or deploy only when Nell says "live", "ship" or "get it live";
  then carry it through to served bytes. End every site report with exactly one of
  "local only — not live" or "live — verified in the served bytes".
- **Visual claims need pixels.** Screenshot the real surface and look at it. Verify pt-BR
  through the in-app switcher from an English load (watch for `html.translated-ltr`). Keep
  a defect watchlist and re-verify the whole list after any later edit to the same surface.
- Never touch surfaces you did not open (other agents' servers, browsers, worktrees,
  processes). A `chrome-headless-shell` tree using SwiftShader was seen running and is not
  yours; Blender, Chrome, Codex and Python jobs also load this machine.
- Plan review goes to the advisor, never GPT. Prefer subagents pinned to Opus 5.5 at high
  effort; never fork for bulk work. Every subagent prompt starts with the delivery contract
  ("Your plain text output is not visible to the lead…").

## Operational knowledge (learned the hard way)

- **Build and preview:** `VERSION=v0.40 npm run build` (without `VERSION` the base path is
  wrong and every asset 404s). Preview:
  `VERSION=v0.40 node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4188 --strictPort`,
  URL `http://127.0.0.1:4188/v0.40/`. Kill by PID (`pkill` is hook-blocked); check the
  PID's cwd is your worktree before killing.
- **Headless on the real GPU:** Playwright Chromium with
  `--use-angle=metal --enable-gpu --ignore-gpu-blocklist --mute-audio` (software GL times out).
  The repo's `playwright.config.ts` runs headed locally; use a scratch config with
  `headless: true`, those launch args, `testDir` and `webServer.cwd` pointing at the worktree.
- **Wait for readiness,** not a fixed sleep: `document.documentElement.dataset.millosStartupReady === 'true'`.
  The UI mounts behind the loading overlay, so "button visible" is not "app ready".
- **Probe state** via `window.__MILLOS_AGENT__.query({view:'domain', domainId:'simulation'|'campaign'|'production'|'experience', fields:[...]})`.
- **localStorage `millos-workplace-laboratory` is a settled snapshot,** not live state:
  `saveWorkplace` settles any active shift under "Reload safety". Don't read it as the
  live phase.
- Port 4190 is on the Fetch bad-ports list (Node `fetch` refuses it); use 4191 etc.
- In zsh, `$VAR` holding several paths does not word-split; use an array `F=(a b c)`.
- `git branch --list` prefixes worktree-checked-out branches with `+`.
- The agent manifest (`build/generated/agent/*`, gitignored) goes stale whenever agent
  commands or workplace mutations change: `node scripts/generate-agent-manifest.mjs`, then
  `npm run agent:manifest:check`.
- `npm run typecheck` uses `tsconfig.typecheck.json`, which excludes tests; the IDE shows
  test-file type errors the gate does not. No tsconfig covers `e2e/`.
- Background agents can all die at once on a stalled API request. If their transcripts stop
  growing together, stop them (TaskStop) and resume each with SendMessage; committed work
  survives.

**Sparse wave worktree recipe** (≈40 MB instead of ≈2 GB; shares `node_modules` and
`public` by symlink). Put it in a script file and run with `bash`:

```bash
G="$1"; BASE="$2"; MAIN=/private/tmp/millos-resolute-20261018
WT=/private/tmp/millos-wave-$G-<date>
cd "$MAIN" && git worktree add -q --no-checkout "$WT" -b "claude/<name>-wave-$G" "$BASE"
cd "$WT"
git config --worktree core.sparseCheckout true
git config --worktree core.sparseCheckoutCone false
git config --worktree sparse.expectFilesOutsideOfPatterns true
git config --worktree core.excludesFile <file containing the line /public>
printf '%s\n' '/*' '!/assets/source/' '!/test-results/' '!/output/' '!/dist-archives/' '!/public/' \
  > "$(git rev-parse --git-dir)/info/sparse-checkout"
git read-tree -mu HEAD
ln -s "$MAIN/node_modules" node_modules; ln -s "$MAIN/public" public
git status --short | wc -l   # must be 0
```

Remove with: `rm` both symlinks (no trailing slash), `git worktree remove`, `git branch -d`.
If the main worktree itself is gone, recreate it sparse the same way from the branch.

## Tools the repo already has for this work (read their headers first)

- `npm run capture:art -- --label=<name> [--set=art|full|quick|exterior|interior] [--quality=low|medium|high|ultra] [--time=<hour>] [--weather=clear|cloudy|rain|storm]`:
  judge-ready art sheets (fresh build by default; check disk; set `VERSION` if needed).
  Scenes: overview, interior, silos, milling, sifting, packing, process-floor, tank-farm,
  logistics-close, forklift, shipping, receiving, yard, water, moon.
- `npm run measure:surfaces -- --label=<name> [--quality=low]`: paired on/off/on surface
  treatment control; `changedFraction === 0` means the term is inert.
- `npm run benchmark:runtime`: frame-time benchmark with `load` and `pageClean` checks;
  interleave arms, at least three pairs, ~2 ms drift floor (CLAUDE.md "Measuring a Visual or
  Performance Change").
- `npm run capture:operations`: operational review captures.
- Agents in `.claude/agents/`: **visual-fidelity-judge** (grades an art sheet against a
  rubric, PASS/FAIL), **blind-ab-judge** (did a change help? use `scripts/stage-blind-ab.mjs`),
  **graphics-debugger**, **react-three-fiber-specialist**, **millos-architecture-guard**.
- `npm run validate:reachability` before editing an unfamiliar 3D file (91 modules are dead
  code that looks live; `--why=<path>`).
- CLAUDE.md's graphics sections are binding: shader cache keys, flicker rules, z-fighting
  layers and polygon offsets, DataTexture colour spaces, world-surface treatment, lit paint
  vs unlit light sources, smoothstep spans, one variable per A/B.

## Method

1. **Orient** (read-only): ledger, CLAUDE.md graphics sections, the tools above; `df -h /`,
   `uptime`. Recreate the worktree if needed. Rebase on or merge `origin/main` only if Nell
   says to push; otherwise stay on the branch.
2. **Advisor** on the plan before any edit.
3. **Baseline, named:** the whole gate (as above) with failing test names; one art-sheet
   capture at medium and at low (`--set=art`, plus `--time=6`, `--time=19`, `--time=22`
   and one `--weather=rain`) as the visual baseline; one runtime play-test as a stranger in EN
   and pt-BR covering a whole game day at 4x after a standard-pace first delivery (frames
   every 15–20 s, navigations logged, console errors, the open items above).
   Have **visual-fidelity-judge** grade the baseline sheets; use its rubric findings.
4. **Audit** (read-only, a Workflow is pre-authorised for a clear fan-out): finders by
   dimension (gameplay clarity and pacing over a full day; animation per actor class:
   workers, forklifts, trucks, conveyors/product, machines, camera, UI motion; lighting per
   time/weather/zone; accessibility and reduced motion; pt-BR), each finding verified by two
   refuters, with file:line and a reproduction. Dedup against the ledger.
5. **Fix waves** in sparse worktrees, one workstream per agent, failing-test-first for logic;
   for visual changes, a paired capture (same build, one variable, `--set` covering the
   affected scenes) judged by **blind-ab-judge**, plus `measure:surfaces` where it applies.
   Agents never run builds or browsers; the lead batches captures. Merge waves into the
   branch, resolve conflicts by keeping both intents, rerun overlapping tests.
6. **Whole gate** once per wave, compared with the named baseline.
7. **One batched runtime confirmation** covering every visual and gameplay claim, EN and
   pt-BR, 1366×768 and 1280×657 (and one phone viewport for UI motion), final art sheets
   graded again by visual-fidelity-judge. Then close the browser and server, delete `dist`.
8. **Ledger** in `_contprompts/` on the branch: baseline, findings, decisions, evidence,
   what remains with counts. Commit. **Advisor** before declaring done.
9. **Report:** **Blocked on me** (first) · **Changed** · **Found**, separating pixel-verified
   from test-only claims, then exactly "local only — not live" (unless Nell said ship and it
   is verified in the served bytes).

## Gameplay polish: what "good" means here

- Within a minute a stranger knows the goal; after the first delivery the card always shows
  the current goal and next step (it now does; check later orders and later shifts).
- Every pace (pause, 1/2x, 1x, 2x, 4x) keeps clock, deadlines, production, trucks and
  forklifts consistent; P restores only its own hold.
- The afternoon and night shifts are worth playing: real choices, readable consequences,
  failures that can be recovered (breakdown → repair with time, QC hold, shortage, late
  order), a review at each shift close that persists across reload.
- The cooperative layer stays obvious and reversible: take over, pause, leave, resume after
  reload; surplus reachable on the default path.
- No dead time without explanation; no silent freezes; nothing important only in a spoken
  PA line (it must also be in the bell or on screen).

## Animation and lighting: what "good" means here

- Motion is continuous at every pace and frame rate (time-scaled, not frame-scaled; the idle
  orbit was frame-scaled and drifted into a mill). Paused means paused for simulation
  actors; cosmetic loops may keep running only if that is intended and stated.
- Reduced motion is honoured everywhere (OS setting and in-app).
- Actors never interpenetrate geometry or each other (forklift queue vs near miss rules,
  trucks at the dock, workers on walkways).
- Lighting reads correctly at 06:00, 12:00, 19:00, 22:00 and in rain; interior vs
  exterior exposure balanced; painted surfaces lit, light sources unlit; no flicker on
  medium+; Low tier never black-screens.
- Every claim is backed by a paired capture or a measured ratio, never "looks better".
