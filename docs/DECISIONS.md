# Decisions

This log records the design decisions that later work has to respect, and who
made each one. It holds decisions about what MillOS is and how it behaves, not
work approvals or deploy permissions. Those stay in the `_contprompts/` work
orders.

## Rules

1. **Each entry has a tag.**
   - `[Nell]` means the cited source names Nell as the decider.
   - `[proposed]` means an agent proposed it, or a rule records it without
     naming who decided. Treat it as current until Nell confirms or replaces it.
2. **`[Nell]` outranks `[proposed]`.** When two entries conflict, follow the
   `[Nell]` one and raise the conflict. Never settle it silently.
3. **Nothing is deleted.** A changed decision gets a new entry with
   `Supersedes: D-nnn`. The old entry is marked `Superseded by: D-mmm` and stays
   in the log.
4. **Age is not authority.** An old entry still holds until something supersedes
   it. If it seems out of date because the game has moved on, ask Nell, and record
   her answer as a new entry instead of acting as if the old one has lapsed.
5. **Every entry cites a source**: a file and line, a commit, or Nell's own words.
   IDs are stable and never reused.

## Entries

### D-001 · Vehicles are uncrewed · [proposed] · 2026-08-10

The v0.40 release shipped forklifts with no operators.
Source: commit `a2662a8a` ("MillOS v0.40 definitive uncrewed release").
Superseded by: D-002.

### D-002 · Forklifts are crewed · [Nell] · 2026-10-31

Each forklift has a roster operator. `HUMAN_PRESENCE_POLICY.vehicleOperators` is
`true`, and the retired seated-operator components stay banned by name.
Source: `CLAUDE.md` §Forklift Crews and Driving ("Decision (2026-10-31, Nell)").
Supersedes: D-001.

### D-003 · Paid model generation is capped at 5,000 Tripo credits · [Nell] · 2026-09-07

No top-up purchase is authorised. Only reviewed jobs are submitted, one at a time.
Source: `test-results/tripo-world-20260907/pilot-plan.json` `approval` ("Nell: Go,
2026-09-07, following proposed 5000-credit cap. No top-up purchase authorized.");
enforced by `scripts/tripo-world-queue.mjs`.

### D-004 · The village is British/Dutch and the castle is white and blue; existing models keep their identity · [Nell] · 2026-09-29

Source: `_contprompts/millos_coherent_play_2026-09-29.md:524` (Nell: "Proceed
please, all of this..", approving recommendations that preserve "current model
identity, British/Dutch village, white-blue castle").

### D-005 · The village, farm and castle keep their pinned miniature style · [proposed] · 2026-10-04

Approved models and the miniature style take precedence over the photographic
reference. Photography informs their light and material response; it does not
authorise a photoreal replacement.
Source: `docs/VISUAL_FIDELITY_LOOP.md:48`. The 4 October 2026 approval at line
100 of that file covers the workflow; this style rule has no named decider.

### D-006 · The loading screen has no Continue button · [Nell] · 2026-09-29

The game starts only once it is ready. Reload stays available.
Source: `_contprompts/millos_coherent_play_2026-09-29.md:474` (Nell: "Get rid of
it, and proceed with your polishing please.").

### D-007 · The Chronicle never creates goods, revenue or orders · [proposed] · 2026-10-24

It reads closed shift reports and answers only with bounded `ChronicleEffect`
modifiers. It stays inert until a charter is signed.
Source: `CLAUDE.md` §The Mill Chronicle, rule 1; `docs/CHRONICLE.md:9`.

### D-008 · Nothing about the Chronicle crew is a number · [proposed] · 2026-11-02

Crew members are anonymous roles with a temperament, a value, a preference and a
need. No score, meter or loyalty value may be added for a person.
Source: `CLAUDE.md` §The Mill Chronicle, rule 8.

### D-009 · The interface is in English and Brazilian Portuguese · [proposed] · 2026-10-18

Every user-facing string goes through `src/i18n`, and pt-BR defines every English
key. Chronicle copy is still English only.
Source: commit `cee2edce`; `CLAUDE.md` §Interface Language.

### D-010 · The emergency drill verifies egress; it does not simulate an evacuation · [proposed]

Personnel hold their positions and the drill reports only verified zones.
Source: `CLAUDE.md` §Emergency Egress Verification Drill.

### D-011 · There is no build-time cloud AI key · [proposed]

Players enter their own provider key, which stays in page memory and is cleared on
reload. The WebGPU model works without a key.
Source: `CLAUDE.md` §Environment Setup.

### D-012 · There are no taglines or helper text · [Nell] · 2026-10-22

Cut subtitles, hints and secondary captions. If a screen needs one to make sense,
fix the layout instead.
Source: Nell's global rule, `~/.claude/CLAUDE.md` §No taglines or helper text
("2026-10-22: Nell's rule").

### D-013 · The medium graphics preset runs SSAO, Bloom and Vignette · [proposed]

This is deliberate. The earlier flicker was fixed by forcing linear tone mapping.
Source: `CLAUDE.md` §Graphics Quality Presets; `graphicsStore.ts`
`GRAPHICS_PRESETS.medium`.

### D-014 · The scene has one shadow-casting directional light · [proposed]

Source: `CLAUDE.md` §Preventing Future Flickering, rule 4.

### D-015 · There are no emoji in the codebase; the MillOS mark is used for branding · [proposed]

Source: `CLAUDE.md` §No Emojis; `LoadingScreen.test.tsx`.

### D-016 · The visual judge grades style coherence across a frame · [Nell] · 2026-11-02

A photoreal element next to a miniature-styled one counts as a defect, even when
each element scores well alone. The finding names the element that does not match
its neighbours; it is not a request to restyle the world.
Source: Nell approved this in session millos-10 on 2026-11-02, after a reviewer of
a different game remarked that its water was nearly photoreal while its buildings
were cartoonish. Implemented as axis 8 in `.claude/agents/visual-fidelity-judge.md`,
with the date in `docs/VISUAL_FIDELITY_LOOP.md`.

### D-017 · On-device routing runs on a tuned build; strategy stays on the official one · [proposed] · 2026-11-02

With the fast lane on, incident routing (`scoreNextToken`) runs on
`Qwen3.5-4B-millos-routing-q4f16_1-MLC`, a LoRA tune of Qwen3.5-4B for the five-way
queue choice. Strategy, whose text lands in decision cards, stays on the official
mlc-ai build. Without the fast lane, both run on the official build. The lane now
adds a 2.4 GB download on devices where it is on by default (8 GB or more).
Why: in Chrome through the app's own code, the tuned build routed 251/257 frozen
cases against the official build's 215/257 and took a planted answer once in 50
against 14 times, but named the faulted machine 27/30 against 30/30 on the
strategy check, with one unparsed answer and one corrupted machine id.
Source: Nell asked for the tune ("Let's do it all please, in modal.com using your
best judgment. We can host on HF.", 2026-11-02); the measurements are
`scripts/local-router-tune/runs/browser-*.json`; the weights are Hugging Face
`NellWatson/Qwen3.5-4B-millos-routing-q4f16_1-MLC` at `6b8368ad`; the wiring is
`routingLane` in `src/utils/webgpuClient.ts`.

### D-018 · Riverside station replaces the east truck tunnel; no road leads there · [proposed] · 2026-11-03

The east end of the valley is Riverside station. The truck tunnel portal at
(160, 50), its connecting road from x 147 to 135 and the ground blob under it are
gone, and so is the 4.5 m road continuation that finished the gap to that portal.
Why: the local railway work removed the portal for the station; upstream's scene
recovery (6b48ce85), written without the station, restored the road to it. After
the two met on 2026-11-03 the road ran into the station's front wall.
Source: Nell's "Use your best judgment on all issues" (2026-11-03) on the choice
laid out to her; the station is `RAILWAY_STATION` in `src/constants/railwayLayout.ts`;
the removal is in `src/components/FactoryExterior.tsx` with
`exterior/portalContinuation.test.tsx` deleted.

### D-019 · The routing lane runs v2; a single tuned build stays off until it passes · [proposed] · 2026-11-03

The routing lane (D-017) now loads v2 of the tuned build: Hugging Face
`NellWatson/Qwen3.5-4B-millos-routing-q4f16_1-MLC` at `5015631b`. v2 adds a
retention term that holds its strategy answers to the base model's, so that one
build could serve routing and strategy and the lane's second 2.4 GB download
could go. The gate for that was fixed before the run: at least 29/30 on the
healthy-base strategy check in Chrome, with no malformed ids. v2 scored 28/30
(one empty answer under machine load, one unparsed), so it failed by one, and
the official build keeps strategy. It routes 253/257 as v1 did in the lane and
generates more cleanly than v1, which is why it replaces v1 there.
Source: Nell's "Use your best judgment on all issues" (2026-11-03);
`scripts/local-router-tune/runs/r2.json` (bf16: strategy 73/80 parsed against
the base's 72/80) and `runs/browser-Qwen3.5-4B-millos-routing-q4f16_1-MLC-healthy.json`.

### D-020 · Water adapts the inland subset of an ocean renderer, in our own code · [proposed] · 2026-11-03

Asked to adapt Three.js Water Pro (threejswaterpro.com), MillOS takes only what
applies to a river, canal, lake and ponds, and writes it from the published
techniques. Submerged beds now get caustics: a refracted-ray Jacobian over the
water's own clock and wind, multiplying the bed's direct light at unchanged mean
(`src/utils/waterCaustics.ts`, on the lake basin and the river-bed terrain).
Not adopted: FFT/JONSWAP swell, whitecaps, buoyancy, the infinite clipmap and the
underwater camera. They model open sea, and `WATER_PROFILES` holds inland swell to
0.5-12 mm. Ocean-grade realism beside the model-scale buildings would also break
D-016. Already covered here: regional scene reflection on High/Ultra, the duck and
weir wakes, and time and weather. Still open: depth-buffer contact foam and true
refraction, which each need a separate depth or colour pass.
Why: the product is commercially licensed (All Rights Reserved) and its bundle is
obfuscated, so none of its code is read or reused; it is WebGPU/TSL while MillOS
is WebGL.
Source: Nell's "Can we adapt these ourselves please?" (2026-11-03); measured with
`npm run measure:surfaces -- --toggle-key=disableWaterCaustics`.

### D-021 · The routing lane runs a 0.8B tune; the 4B tune stands down · [proposed] · 2026-11-03

The routing lane (D-017) now loads `NellWatson/Qwen3.5-0.8B-millos-routing-q4f16_1-MLC`
at `ef377996`, a Qwen3.5-0.8B trained on the same data with the same settings as
the 4B tune. The lane's extra download falls from 2.4 GB to 0.45 GB and its GPU
memory from 3.9 GB to 1.6 GB. The 4B v2 build (D-019) stays pinned but unused, and
a 2B tune (`NellWatson/Qwen3.5-2B-millos-routing-q4f16_1-MLC` at `75f9e49f`) is
pinned beside it.
The rule was fixed before measuring: the smallest build reaching 248/257 in Chrome
takes the lane. The 0.8B routed 248/257 and the 2B 250/257, and a second run of
each gave the same answer on all 257 cases. With the 4B model and the 0.8B lane
loaded together, routing was again 248/257, case for case, and strategy named the
fault 10/10.
Cost: Brazilian Portuguese routing on the fresh test set is 26/30, against the 4B
tune's 30/30 and the 2B's 29/30; the official build scores 22/30. The 2B would
recover three of those for 0.65 GB more.
The settings label now shows the lane's own GPU memory (`fastLaneVramGb`), not the
main model's.
Source: Nell's "Can we tune it even further in performance?" (2026-11-03); the
runs are `scripts/local-router-tune/runs/browser-Qwen3.5-{0.8B,2B}-millos-routing-q4f16_1-MLC.json`
and `runs/browser-Qwen3.5-4B-q4f16_1-MLC-lane-healthy.json`; training is `runs/s08b.json`
and `runs/s2b.json`; the wiring is `routingLane` in `src/utils/webgpuClient.ts`.

### D-022 · The 0.8B routing tune is retrained with more Brazilian Portuguese · [Nell] · 2026-11-04

The routing lane (D-021) now loads `NellWatson/Qwen3.5-0.8B-millos-routing-q4f16_1-MLC`
at `914fde01` (branch `s08b-pt`, also on `main`). It is the same 0.8B tune with the same
settings, trained on 1,848 more Brazilian Portuguese notes (7,475 in all, 2,714 in
Portuguese), kept on the same three-way teacher agreement.
In Chrome it routes 251/257 against the first revision's 248, Brazilian Portuguese 29/30
against 26/30, and a new 75-note Portuguese test set 73/75 against 71/75. One of MillOS's
own 16 incident texts is now refused: the right queue led at 0.95, but the five queue
probabilities summed to 0.971, under the 0.99 floor, so nothing was routed.
The bar was written to `scripts/local-router-tune/runs/prereg-s08b-pt.json` before any test
or training note existed, and all four conditions passed. Had it failed, the 2B tune would
have taken the lane.
Source: Nell chose the expansion over the tuned 4B ("Proceed please.", 2026-11-04). The
runs are `runs/s08b-pt.json` (Modal) and
`runs/browser-Qwen3.5-0.8B-millos-routing-q4f16_1-MLC-{s08b,s08b-pt}.json` (Chrome, same
day). The test set is `eval/test3.json`, hashed in `eval/MANIFEST.json`.

### D-023 · Traffic on the valley roads keeps right · [Nell] · 2026-11-04

Every truck and the village bus drives the middle of the lane on its right, coming in and
going out. On the south road that is x 22.5 toward the yard and x 17.5 out to the tunnel
(`SOUTH_ROAD_LANES` in `src/constants/siteLayout.ts`). The north road is the same layout
turned half a revolution, as the receiving truck's route is. Before this the trucks drove
the x 20 centre line in both directions. Both checkpoints were laid out for traffic on
the left; now each arm swings in from its own lane's kerb, and each stop line spans only
its own approach lane. The bus stop moved from the southbound lane to the kerb
(`BUS_STOP`, x 25.7), so a truck in that lane passes a bus standing at the stop. The
shipping truck and the bus share both lanes, so each gives way to the other before it
starts (`src/simulation/vehicles/southRoadTraffic.ts`). Yard props beside the inbound
lane moved with it, and the turn into the yard moved 1.5 m north to stay clear of the
staging block.
Source: Nell, "Please ensure that the trucks (and bus) stays on the right side of the road
when entering and leaving." (2026-11-04). Checked by `truckController.test.ts` (no tractor
or trailer corner on the wrong side of the centre line on the road) and
`southRoadTraffic.test.ts` (no truck within 0.25 m of the bus across a service day).

### D-024 · Local strategy stays at temperature 0.7 after a 0.3 trial · [proposed] · 2026-11-04

Local strategy generation keeps temperature 0.7. With the 4B and the 0.8B routing lane
loaded as shipped, 0.3 named the faulted machine 50/50 times and 0.7 48/50, in one page
load with the arms alternating. Median time was the same (33 s). Both 0.7 misses were
unparsed answers, not wrong machines. The bar written before the run asked for a margin
of 3, so 0.7 stays.
A second run with the arm order flipped and every answer stored (rule written first:
`runs/prereg-strategy-temperature-2.json`) gave 0.3 47/50 and 0.7 48/50: 97 against 96
over both runs, under a bar of 4. At 0.3, 11% of priorities repeated word for word across
different cases, against 1% at 0.7 (`temperature_read.py`). 0.7 stays.
Source: Nell's "2" (2026-11-04, choosing the test); the rule is
`scripts/local-router-tune/runs/prereg-strategy-temperature.json`, the run
`runs/browser-Qwen3.5-4B-q4f16_1-MLC-lane-healthy-temperature.json`.

### D-025 · The PA speaks with an on-device voice · [Nell] · 2026-11-04

PA lines are spoken as well as captioned. Gradium's Phonon 40M models run in the
browser through blixt/phonon (WebGPU, else WebAssembly): `phonon-40m-en` in English
and `phonon-40m-pt` in Brazilian Portuguese, whose catalogue voices are all `pt-br`
(`src/audio/paVoice.ts`). `HUMAN_PRESENCE_POLICY.humanVoiceAudio` is now `true`, and
`validate:community` requires it. Host speech synthesis (`speechSynthesis`) and the
retired worker voices and radio chatter stay banned by name. A Settings toggle beside
PA captions turns the voice off; it is on by default and sounds only after the first
unmuted gesture, never in benchmark runs. The first spoken line downloads about
54 MB per language from Hugging Face into the browser's cache.
The 40M weights are CC BY-NC 4.0: MillOS may use them only while it is
non-commercial. A commercial MillOS must switch to the Apache 2.0 Phonon 31M
(English only) or another voice, and drop pt-BR speech until a permissive model
exists. The credit the licence asks for is in the About dialog.
Before this the runtime was caption-only: `humanVoiceAudio: false` since the v0.40
release (commit `a2662a8a`), enforced by `validate:community`. No earlier entry recorded
that as a decision, so nothing here is superseded.
Source: Nell, on whether to use Phonon for realtime TTS: "Do it please, and this is
non-commercial so we can use 0.40." (2026-11-04; "0.40" read as the 40M models).

### D-026 · The dock is liquid glass whose tint follows the daylight · [Nell] · 2026-11-04

Superseded by: D-027 (scope widened to the whole interface).

The navigation dock uses `.millos-glass` (`src/index.css`): a blurred, saturated
backdrop under a navy tint, with a lit rim, an inset streak and a projection shadow.
The tint runs from 42% at night to 62% at noon, driven by `--millos-glass-daylight`,
which `src/components/ui-new/glass/glassDaylight.ts` writes from the scene's own
atmosphere sample (daylight times the weather's light multiplier). The text stays
light at every hour, so only the tint moves. Reduced transparency and high contrast
fall back to the earlier near-opaque panel.
Left out on purpose: SVG edge refraction (`backdrop-filter: url()` is Chromium-only
and adds a displacement pass per frame over the live canvas), a light-glass mode
(it would need dark text), and text blend modes. Data-dense panels such as the
sidebar stay near-opaque; the glass belongs on small chrome.
Evidence: `npm run capture:operations -- --set=glass` captures glass against the
replaced classes in one build. Label contrast was about 9.6:1 at noon and 12.8:1 at
night, against 11.8:1 and 12.2:1 before.
Source: Nell, after the noon and night comparison: "Keep it please good job"
(2026-11-04).

### D-027 · The whole interface is liquid glass, cut thin or thick · [Nell] · 2026-11-05

D-026's glass is now the material of every top-level interface surface, not just
the dock. Thin glass (`.millos-glass`, 42% tint at night to 62% at noon) is on the
small chrome: dock, music player, camera chip, Target button, weather pill,
camera-preset menu, minimap frame, startup status and the phone touch controls.
Thick glass (`.millos-glass-thick`, 70% to 82%) is on surfaces that carry dense
small text: the top bar when attached, the sidebar, notifications, the full SCADA
workspace, the phone sheet, the dashboards, inspectors, tooltips, the guide card,
achievements and the shortcuts dialog. Surfaces that scroll themselves add
`.millos-glass-scroll`, which draws the rim with inset shadows. The rim was darkened
at Nell's request ("The white outline of the interface, should it not be darker?"),
and the thick cut was thinned from 88-94% at her request ("A bit more please. On
those oens.").
Not glass, on purpose: the dim scrims behind modals; alarm and emergency surfaces
(`EmergencyOverlay`, the shortcut and emergency-stop notice, PA announcements),
which must stay solid and loud; and sub-surfaces nested inside a glass panel
(cards, sticky headers), which would stack blur on blur. The two cuts and those
exclusions are the agent's proposal within Nell's decision.
Evidence: `npm run capture:operations -- --set=glass-interface --time=12` and
`--time=22`. Label contrast on glass stayed at or above 7:1 at both hours, after the
SCADA workspace subtitle moved from slate-400 to slate-300.
Supersedes: D-026 in scope only; D-026's dock values stand.
Source: Nell, after D-026: "But should it not be the whole interface?" (2026-11-04).

### D-028 · The local model is told to focus on the worst readings · [Nell] · 2026-11-05

When the local Qwen3.5-4B writes strategy, its prompt carries one more line: "When more
than one machine is in warning, focus on the one with the worst readings: highest wear,
then vibration, then temperature." Cloud backends get the prompt as before.
Why: with two machines in warning, the 4B named the milder one in 7 of 30 answers. With
the line it named the worse one in 30 of 30, and nothing else got worse: other cases 39/40
against 38/40, parsed 70/70 against 69/70, median 37.7 s against 37.2 s, 2.4% of priorities
repeated across cases against 1.0%. All five conditions of the bar written before the run
passed. It ran in Chrome with the 0.8B routing lane loaded, as shipped, over five page
loads that alternated which prompt came first; the original single page load crashed
under machine load, and the change of plan was recorded before any result was seen.
Claude Haiku 5.5, the default cloud model, was then measured on the same 14 prompts with
the app's own request (`runs/prereg-severity-line-haiku.json`, `runs/haiku-severity.json`):
30/30 on two-anomaly cases and 40/40 on the rest without the line, the same with it, so
it does not need the line and cloud prompts stay as they were. Other cloud models were not
measured.
Source: Nell's "1 please." (2026-11-04, choosing the test); the bar is
`scripts/local-router-tune/runs/prereg-severity-line.json`, the runs are
`runs/browser-Qwen3.5-4B-q4f16_1-MLC-lane-healthy-severity-r{1..5}.json`, scored by
`severity_score.py`; the wiring is `STRATEGIC_SEVERITY_LINE` in `src/utils/aiEngine.ts`.

### D-029 · The loading bar counts every kind of startup work · [Nell] · 2026-11-06

The loading bar is a weighted sum of four counted phases, and the status beside it names the
phase that is holding the cover, with its count ("Compiling shaders · 92 of 184"):
download (files fetched of those requested), building the world (startup tasks finished,
plus scene sections committed, of those started or rendered), shaders (programs linked of
those the startup prewarm submitted) and settling (frames within the 34 ms budget in the
45-frame readiness window). The old bar filled from file downloads alone, reached 95% within
two seconds and then sat there until readiness, for minutes on a slow device.
The weights (download 10, build 45, shaders 35, settle 10) are each phase's measured share of
a visitor's load (plain URL, 1280x800: 3%, 48%, 41% and 6% of 20.8 s). The bar never moves
backwards and shows 100 only at readiness. The live region announces the phase name only;
the count is visual. None of it gates readiness: `startupProgress.ts` only reads counts.
Known limit: the world's scene sections commit together when their Suspense boundary
resolves, so the bar can hold for about five seconds while they are built.
Source: Nell's "try for honest total loading bars" (2026-11-05); the recordings are a
visitor's load at normal speed and at 2x CPU throttle; the code is `src/utils/startupProgress.ts`,
the counts in `src/utils/startupReadiness.ts`, `StartupReadiness.tsx` and `recoverableLazy.ts`.

### D-030 · Exterior lamps are lights only while lit; their other state is prewarmed · [Nell] · 2026-11-06

Every lamp driven by `ExteriorLampDriver` (the civic square, station canopy and door, lock
gate, pub sign and the other `ExteriorPointLight` and `ExteriorDownlight` users) is hidden
while the lamp level is off and has faded out, and shown the moment it rises. At noon on Low,
35 of the scene's 38 punctual lights were these lamps at zero intensity: they added nothing to
a pixel, yet each held a slot in every lit program and an upload every frame, about a quarter
of a frame on a slow CPU. Hiding changes the light count in three's program key, so five
seconds after readiness the other state is compiled once, in one synchronous task; three keeps
every variant until a material is disposed, so dusk and dawn switch programs instead of
compiling them.
Measured: the lamps-on moment takes one 67 ms frame on Low and 83 ms on Medium with the
prewarm, against 950-1,150 ms without it. Before and after captures at noon and 22:00 differ
by under 1% of pixels (water and vehicle motion between captures). With the change the branch
reached strict readiness at 2x CPU throttle where main could not (3 of 3 against 0 of 3;
2 of 3 against 1 of 3 under a load average near 200).
Not adopted: removing the lamp lights on Low, which darkened the night square, and a CI
fallback through "Open loaded scene", which would break `validate-jev-browser.mjs`'s rule
that normal startup is mandatory.
Source: Nell's "FIX EVERYTHING USE YOUR BEST JUDGMENT" (2026-11-06) after choosing a cheaper
Low tier (2026-11-06); the code is `ExteriorLampDriver` in
`src/components/exterior/ExteriorLighting.tsx`, with `window.__MILLOS_LAMPS__` as the
benchmark-only instrument used to measure the lamps-on moment.
