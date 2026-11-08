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

### D-031 · A model is accepted at 8 of 10 from an independent judge; an improved one below that ships only if it beats the original blind · [proposed] · 2026-11-06

Every asset-loop round is graded by a fresh judge on a different model from the builder
(Sonnet when Opus builds) against the fixed rubric in `docs/ASSET_JUDGE.md`: a PASS needs
every one of twelve fixed views and every axis at 8 or more, no blocking defect and no
code-checked probe failure, and a model is accepted only after two consecutive passes on
the same bytes. A model that reaches the six-round cap below 8 ships only if a blind A/B
judge prefers it to the original (recorded as "improved"); otherwise the original is
restored. The bar is not lowered mid-programme, so triage and fix-run scores stay
comparable. On 2026-11-05 this accepted 8 models, kept 23 as improved, restored the
cottage and rejected three unjudged candidates.
Source: Nell, "FIX EVERYTHING USE YOUR BEST JUDGMENT ASK THE ADVISOR ULTRATHINK FIX THE PIG
ALSO" (2026-11-06), delegating the open question of the bar; procedure in
`.claude/commands/asset-loop.md`; evidence in `output/asset-loop-20261104/`.

### D-032 · The till body may use 72 render vertices · [proposed] · 2026-11-06

`world-station-register`'s `maxRenderVertices` rises from 36 to 72 in
`public/models/asset-manifest.json`. Thirty-six indices allow only a closed 12-triangle
wedge with knife edges, and every texture-only substitute (baked normal fillet, painted
arris, grain) was judged fake. Seventy-two allow a chamfered customer-facing ridge and front
corners (24 triangles). The deck plane under the runtime keys and the screen's facing stay
as `GasStationInstanced.test.ts` pins them. Every other budget is unchanged.
Source: Nell's delegation of 2026-11-06 (D-031); the builder's measured triangle minimums in
`output/asset-loop-20261104/fix-owned-outcomes.json`.

### D-033 · Models the game never renders are left as they are · [proposed] · 2026-11-06

`world-frog-authored-body`, `world-grain-elevator-authored-body`,
`world-pallet-staging-body` and `world-yard-dock-plate-body` are not polished: their loader
keys appear only in `src/utils/modelLoader.ts`, and no component draws them (measured with
`scripts/asset-loop/render-path.mjs`). They stay in the manifest with their provenance and
pass their contracts. Polish them if a component starts rendering them.
Source: Nell's delegation of 2026-11-06 (D-031); `output/asset-loop-20261104/disposition-overrides.json`.

### D-034 · The Cupid figure is rebuilt as authored geometry · [proposed] · 2026-11-06

`world-cupid-authored-body`'s figure is a stack of untreated primitives, and its owning
script (`scripts/refine-cupid-figure-contact.mjs`) can only seat it on the pedestal (a
hash-sealed vertical shift). The figure is rebuilt by a new authoring script, and the
scenic reconcile guard and the Cupid pins in `reconcile-scenic-models.test.mjs` follow the
accepted figure. Pedestal, envelope, budgets and placement stay as they are.
Source: Nell's delegation of 2026-11-06 (D-031); the blocked builder's analysis in
`output/asset-loop-20261104/fix-owned-outcomes.json`.

### D-035 · First-person walking stops at houses, garden walls, the perimeter fence and the closed shop · [proposed] · 2026-11-06

On foot (desktop, mobile and the Rapier controller alike) the player is now blocked by the
five cottages (and Pearl Cottage's bay window), the garden front and side walls, the
allotment fence and shed, the mill perimeter fence, and the station shop, whose glazed front
and shut side door make it solid. Garden gates, cottage door approaches up to the wall,
the allotment gates, the front and back vehicle gates and the canal pedestrian gate stay
open. Before this a capsule walked straight through all of them. The solids live in
`src/utils/walkingObstacles.ts`, built from the layout datums, and each controller's own
collision check calls it. The byte-pinned navigation file is unchanged.
`walkingObstacles.test.ts` raycasts the real village geometry against the named constants,
and `firstPersonSpawn.sweep.test.tsx` proves that every camera and machine-focus spawn still
lands free. Not yet solid: the village civic buildings and the hedges, whose recorded
outlines include awnings and would block declared walks; they need measured wall bounds.
Source: Nell's delegation of 2026-11-06 (D-031); the capsule-walk findings in
`src/utils/__tests__/capsuleWalk.routes.test.ts`.

### D-036 · The canal metal bollard and the checkpoint booth get geometry budgets for their real profiles · [proposed] · 2026-11-06

`world-metal-bollard` rises from 96 to 324 render vertices (a 12-sided mooring profile:
foot chamfer, neck, overhanging lip, dome), and `world-checkpoint-booth` from 100 to 140
(a recessed door with a head, plus a plinth step). The index-counted budgets allowed only
an octagonal prism and a box with a slab roof, and every in-budget method was judged a
primitive. Both props are placed twice (two metal bollards on the canal coping, two
checkpoint barriers), so the raise costs a few hundred vertices in the whole world. The
wooden bollards, of which there are many, keep 96: their in-budget rebuild was accepted. The
booth's recess also needs the runtime west window pane in `CheckpointBarrier` to stop at
the door jamb. Every other budget is unchanged.
Source: Nell's delegation of 2026-11-06 (D-031); the builders' measured triangle minimums in
`output/asset-loop-20261104/fix2-outcomes.json`; placements in `FactoryExterior.tsx`.

### D-037 · Blue hour lights the ground from the sky · [proposed] · 2026-11-06

After sunset the hemisphere fill takes the larger of its sun-driven dusk curve and a
blue-hour term (`BLUE_HOUR_FILL_INTENSITY` 3.9 times the sky's own blue-hour weight,
`SceneEnvironmentIBL.tsx`), and the foothill shadow tint follows the same weight
(`OptimizedSkySystem.tsx`). Before this, the fill died about an hour after sunset while the
sky's blue hour peaked, so at 19:00 the ground sat at night level under a glowing sky.
At 19:00 Medium, ground luma rises from 15-34 to 20-41. At 17:30, 20:30 and 22:00 it is
unchanged within 0.1, so night stays dark. Exposure, lights and shadow casters are
unchanged. A blind A/B picked the after frames in 8 of 8 dusk scenes across both tiers.
This is a look choice: before/after sheets for each hour are in
`test-results/art-review/dusk-before-after/`.
Source: Nell's delegation of 2026-11-06 (D-031); the cause was measured by maps pass 2, and
millos-6e's measurement shows its lamp change is not involved.

### D-038 · The large propane shell joins the models left as they are · [proposed] · 2026-11-06

`world-propane-large-shell` is not rendered (`StorageTank.test.tsx:152` asserts that no
component draws it; the tanks use the vessel lathe), so like the four models in D-033 it
keeps its current delivery. A kept candidate (`78735951`) waits in `test-results/asset-loop`
in case a component ever draws it. This adds to D-033 and supersedes nothing.
Source: integrator report of 2026-11-06 in `_contprompts/millos_asset_loop_20261104.md`.

### D-039 · First-person walking also stops at the civic buildings and every hedge · [proposed] · 2026-11-06

This completes D-035. On foot the player is now blocked by the church (nave, tower base,
buttresses), the town hall, the pub, the school, the forge (walls and hearth) and the three
shops, each at its ground-level wall ring measured from the delivered GLB (the vertical faces
0.3-1.8 m up), not at the recorded footprints, which include awnings, eaves and stairs. Doors
stay solid. Joinery up to 0.3 m proud (sills, frames, shopfronts, plinth courses) is not
solid, and the town hall's two porticos and the forge's open bay stay walkable as porches. The
town-hall privet, every landscape hedge (cottage gardens, village meadow, crop field,
forecourt, lineside), the canal-walk hedge and the riverbank hedge are solid along their
layout lines, keeping every gap. No declared walk had to move. The main path and the lake
path keep their paving to the fence corner posts; their walks start a body clear of the post,
outside the fence, since neither corner has a gate. `walkingObstacles.test.ts` re-derives the
walls from the GLBs, so a model change fails it.
Source: Nell's delegation of 2026-11-06 (D-031); measurements in `walkingObstacles.test.ts`.

### D-040 · Four more models the game never draws are left as they are · [proposed] · 2026-11-06

`world-industrial-portal-unit`, `world-truck-tyre-unit`, `world-drainage-pipe-unit` and
`world-dock-door-panel` join D-033 and D-038: no component draws them. The tunnel arch, the
truck wheels and the dock door are built in TypeScript (`createBrickArchGeometry`, the
`OptimizedTruckBay` wheel lathe, `buildSectionalDoorGeometry`), and the tunnel's drainage
pipe has no instances. The drainage pipe is still preloaded on every tier
(`startupAssetPreload.ts`), so that preload is wasted download.
Source: Nell's delegation of 2026-11-06 (D-031); `output/asset-loop-20261104/runtime-contract-map.json`.

### D-041 · A forklift's fork datum is the floor · [proposed] · 2026-11-06

At fork height 0 every forklift tier now holds its pallet with the underside on the floor
and its tines in the pallet's fork pockets. Before, the datum stood 0.28 m up
(`FORKLIFT_PALLET_REST_ABOVE_FORK`): the compact and procedural tiers built their tines
0.3 m off the ground, the authored GLB's tines are at floor level (top 0.068 m), and the
authored pallet rode 0.3 m above them. Two blind Sonnet judges named it ("pallet floating
above the forks", run rt6, `forklift-close`), and a floor pickup or dropoff left the pallet
hovering 0.28 m over the hall floor in every tier, against `sampleForkliftLoadPose`'s own
"0 on the floor". Now the pallet origin is y 0.06 in all three tiers, the compact tines,
carriage plate and procedural forks drop by the same amount, the dock deck's fork height
is the deck itself (0.71, was 0.43), and the loaded-travel height of 0.32 m is now the
pallet underside's height. The travelling load's top falls from about 1.80 m to 1.52 m,
below the overhead guard (1.79 m), so it no longer hides the mast and guard head-on, and
the far billboard's load box follows it.
Source: Nell's delegation of 2026-11-06 (D-031); `dockLoading.test.ts`, `ForkliftModel.test.ts`.

### D-042 · The unused drainage pipe is no longer preloaded · [proposed] · 2026-11-06

D-040 found that `world-drainage-pipe-unit` was preloaded on every tier though no
`DrainageCulvert` is placed. `startupAssetPreload.ts` no longer lists it. If a culvert is
placed again, add it back to the list.
Source: Nell's delegation of 2026-11-06 (D-031); D-040.

### D-043 · Dawn mirrors dusk · [proposed] · 2026-11-06

The fill light is a function of sun elevation, so 05:30 lights the ground as 18:30 does and
06:30 as 17:30. A blind Sonnet judge failed 05:30 (`rt6-dawn-0530`) for a near-black lake
path, about (16, 24, 3). With the sun 7.5 degrees below the horizon, that is close to the
ground level D-037 accepted at 19:00 (luma 20-41), and the missing blue in the grass comes
from the grass albedo and the tone map's toe, not from the fill. So pre-dawn stays dark and
dawn keeps dusk's look; D-037 stands. The 06:30 judge's other complaint, lamps and windows
still at night strength under a lit sky, is real. Both follow `getExteriorLampLevel`
(`ExteriorLighting.tsx`, millos-6e's file), which is 94% on at 06:30. An exact dawn-only
change was sent to millos-6e on 2026-11-06 and is that session's decision.
Source: Nell's delegation of 2026-11-06 (D-031); `rt6-dawn-0530`, `rt6-dawn-0630`.

### D-044 · Exterior lamps run on a fixed clock · [Nell] · 2026-11-06

`getExteriorLampLevel` (`src/components/exterior/ExteriorLighting.tsx`) is a clock, not a
model of a light sensor. The lamps are fully on from 18:30 to 05:30 and off from 06:30 to
17:30, with a linear hour-long fade centred on sunset (18:00) and sunrise (06:00), so dawn
mirrors dusk. Weather no longer lights them: the old floors (storm 0.7, rain 0.42, cloudy
0.14) are gone, so under D-030 they stay hidden from the renderer all day whatever the sky.
The same level drives the village and factory window glow and the near-horizon city
windows, which follow the same clock.
It replaces a sun-elevation curve that was still 94% on at 06:30 and 17:30, under a lit sky
(blind judge, `rt6-dawn-0630`; D-043).
Source: Nell, 2026-11-06: "2 please, if you can get it very resource efficient", then
"just set it to come on at an appropriate time, no 'sensor' needed please."

### D-045 · LFM3-1.7B does not replace the on-device models · [proposed] · 2026-11-06

Liquid's LFM3-1.7B (`LiquidAI/LFM3-1.7B-ONNX` at `57c125df`, q4f16, 1.38 GB) was measured
against the shipped wiring (Qwen3.5-4B for strategy, the 0.8B routing lane) through the
app's own prompts in headless Chrome, with the gates fixed beforehand
(`scripts/local-router-tune/runs/prereg-lfm3.json`). It failed the strategy gate, so it is
not adopted (outcome C).
Strategy, healthy base, 30 answers per arm: 26/30 at the shipped 0.7 (two answers did not
parse) and 27/30 at Liquid's recommended sampling, against a gate of 29/30 and a same-day
control of 30/30. Five of its seven misses were the same case: of two machines in warning, it
named the milder (rm-104 for sifter-c). The other two did not parse.
Routing: 100/257 and Brazilian Portuguese 21/75, against the lane's 253/257 and 73/75 and the
official 4B's 215/257. It answered "No current incident" for most labels, and took a planted
answer 55 times in 75 injection cases. [Inference, untested] The rubric scores each queue's
first token, which suits Qwen's tokenizer ("Equipment" is one piece; for LFM3 it is "Equ"), so
it may handicap LFM3. Either way it would not change the outcome: strategy alone rules it out.
Timings are not comparable: machine load was 2-4 per core from other repos' test suites.
It would also have meant a second inference runtime (ONNX Runtime Web beside web-llm) and a
licence that ends at $10M revenue. To test it again, `MODEL=LFM3-1.7B-ONNX-q4f16
LFM3_TJS_DIR=<Transformers.js 4.3.2 node_modules> node scripts/local-router-tune/browser_eval.mjs
--headless` runs it through `scripts/local-router-tune/lfm3_shim.js`.
Source: Nell, 2026-11-06: "Is this any good for us?", then "Let's test please.";
`runs/browser-LFM3-1.7B-ONNX-q4f16-healthy.json`, the control
`runs/browser-Qwen3.5-4B-q4f16_1-MLC-lane-healthy-lfm3-control.json`, and the smoke
`runs/smoke-LFM3-1.7B-ONNX-q4f16.json`.

### D-046 · The canal finds are out of the water · [Nell] · 2026-11-07

The shopping trolley and the bicycle no longer lie tilted and half sunk in the canal
(x -143 and -147.5, z 36.5 and 54). They stand on the grass of the west bank, behind
the canal walk's kerb, either side of the waste bin at (-158, 70): the bicycle on a new
side stand at (-157.9, 66.8), the trolley upright on its casters at (-158.4, 71.6)
(`src/components/scenery/CanalFinds.tsx`, `CANAL_FINDS_LAYOUT`). They keep their silted,
oxidised finish, as things pulled out of the water. This reverses the placement the
code had recorded as intentional (the `FactoryExterior.tsx` mount comment and the
`GroundAlignment.test.tsx` pins); no earlier entry here recorded it.
Source: Nell, 2026-11-07: "Move the shopping cart and the bicycle out of the canal."

### D-047 · A road joins Riverside station to the valley road · [Nell] · 2026-11-07

Supersedes D-018's "no road leads there". The car park's road used to run 27 m south-west
and stop in the grass at the mill yard's south-east kerb corner. It is now the railway road,
one 5.5 m two-lane carriageway from the car park's south kerb (120, 60): south-west on the
line x + z = 198, 2.1 m clear of the kerb corner; west along z 94, between the yard kerb
(z 90.56) and the farm paddock (z 99); south along x 38, on the farm's west side; and west
into a flared T junction on the south valley road's east side at z 156. The valley road's
east edge line now breaks only across that bell mouth. Farm side: the farmhouse's north walk
runs on to the road's south edge. Gas station side: the junction is 16 m south of the gas
station's access road, on the same valley road. The lake walk crosses the road on a zebra,
cut short of each edge with a dropped-kerb apron instead of lying across the tarmac at the
road's own depth offset. The two front-parkland trees that stood in the new carriageway moved
to (55.5, 100) and (86.5, 99.5). No navigation graph routes vehicles or villagers, so none
was changed; the station forecourt already opened onto the car park with no railing between.
Rejected: a crossroads opposite the gas station access at z 140, because the bus shelter
and the shuttle's stop occupy that kerb; and a junction north of the shipping checkpoint
(z 90-105), which would send station traffic through the shipping yard.
Source: Nell, 2026-11-07: "Connect the train station to the road somehow. Ideally the farm
side and gas station side both."; `src/constants/railwayRoadLayout.ts`,
`src/components/exterior/railwayRoadGeometry.ts` and its test.

### D-048 · The interface is English unless someone chooses Portuguese · [Nell] · 2026-11-07

`detectLocale()` (`src/i18n/index.ts`) reads a `?lang=` link, then the saved
`millos-locale` choice, then falls back to English. It no longer reads the browser's
language list, so a browser that lists Portuguese no longer switches the interface by
itself. Nell's console showed the session starting in pt-BR (`phonon-40m-pt ready`) and
Chrome then translating the page pt to en. Supersedes the browser inference implied by
D-009; the Portuguese catalogues are unchanged.
Source: Nell, 2026-11-07: "I'm getting portuguse language when I don't have it selected
(should be 100% by default)."; `src/i18n/__tests__/i18n.test.ts` ("ignores the browser
language list").

### D-049 · The sim starts with the clock ticking · [Nell] · 2026-11-07

A pause (P, the pace menu, or any session hold) lasts only as long as its page.
`persistedGameSpeed` saves the pace that was running underneath the pause, and the
persist merge starts saves written while paused at standard pace. A restored physical
session resumes the same way. The first-visit tour still holds the clock while it shows,
and releases it when it ends.
Source: Nell, 2026-11-07: "Start the sim with the time ticking please."; tests in
`src/stores/__tests__/gameSimulationStore.test.ts` and `leadPass5.gameplay.test.ts`.

### D-050 · First person: Space jumps, E or a click acts, X stops the forklifts · [Nell] · 2026-11-07

The forklift emergency stop moved from Space to X, which is not a control's activation
key, so it also works while a clicked button keeps focus. In first person, Space jumps
(about 0.85 m; roofs and shelters stop the rise), and E, F or a left click boards or
leaves the forklift in reach. In the cab the forks rise on R and lower on Q. E no longer
flies the walker upward. The vertical field of view is 75 degrees, down from 105.
Source: Nell, 2026-11-07: "Reduce FOV in first person view please. Find a different button
for emergency stop so space can enable jump, and (e for activation/mouse click)."

### D-051 · The station shop's side door stands open · [Nell] · 2026-11-07

The shop door is a framed glass leaf swung 90 degrees inward, and the shop is walked as
its separate walls, door jambs, open leaf and nine fixtures. This supersedes D-035's
clause that the shut side door makes the shop solid.
Source: Nell, 2026-11-07: "Make the gas station door clear and also open.";
`src/components/GasStationInstanced.tsx`, `src/utils/walkingObstacles.ts` and its test.

### D-052 · The graphics tier never changes by itself · [Nell] · 2026-11-07

Adaptive quality is off in every preset, and the graphics store's v6 migration turns off
the saved flag, which no control ever set, so a saved `true` was only the old default.
After a stutter the tier stays as chosen; the FPS monitor may still suggest a change,
which needs a click. A downgrade that adaptive quality applied earlier in a session is
undone on the next load (`restoreSessionScopedQuality`).
Source: Nell, 2026-11-07: "Don't switch graphics mode please. There was a stutter, and then
all the gorgeousness went away."; `src/stores/__tests__/graphicsStore.test.ts`.

### D-053 · F is only fullscreen; Riverside's nameboards are mixed case · [Nell] · 2026-11-07

F no longer boards or leaves a forklift in first person; E or a left click does (D-050),
so F is the fullscreen shortcut everywhere. Supersedes D-050's "E, F or a left click".
The platform nameboards now read "Riverside" rather than "RIVERSIDE", as Translink's
Ocean Sans boards did, so the diamond tittle and humanist lowercase that identify the face
show on every station sign, not only the gable.
Source: Nell, 2026-11-07: "F is fullscreen, but you use it for forklift also?" and
"Railways station signs don't have the new font."; `FirstPersonController.forklift.test.tsx`,
`KeyboardShortcutsModal.test.tsx`.

### D-054 · The PA speaks only problems and pertinent updates, as a person would say them · [Nell] · 2026-11-07

The timed PA corpus is gone: twenty all-is-well notices ("The mill is calm", "Packing line
verified", "Lighting is tracking the sky") and the 25, 50, 75 and 90% target readouts. The PA
now speaks only on events: a machine warning, alarm or recovery (the same machine and status
again only after 180 s for warnings and recoveries, 30 s for alarms), drills and emergency or
forklift stops, a shift's end, the day's target made, and the on-device AI's incident notices.
Every line is worded as a person on a plant tannoy says it, with no menu names or colons, and
the caption is the spoken text; where to find a review stays on the bell notice. A transcript
row filed under a retired key, or a line whose text is only its key, is never queued, shown or
restored. The Characterful PA mode no longer has any lines of its own. This narrows what D-025
speaks; D-025 itself stands.
Source: Nell, 2026-11-07: "PA system is talking a lot of bollocks for nominal conditions,
instead of problems or pertinent updates.", "Doesn't sound very natural." (the PA had read
"Morning shift closed: grade A. Review in Overview, Shift debrief.") and, of a caption showing
"packingLineVerified", "Doesn't mean anything, looks broken and shitty.";
`src/components/game/shared.test.ts` (a nominal hour says nothing),
`src/stores/__tests__/announcementsStore.rawKey.test.ts`.

### D-055 · The English PA voice is Bryony · [proposed] · 2026-11-07

The default English PA voice is Bryony, a British, middle-aged female voice the catalogue
describes as "full, rich mid-range tones, softly relaxed", chosen from that description
because the tannoy band passes the mid-range, and not by ear. Brazilian Portuguese keeps
Débora, already female. Nell asked for a female voice; the choice of Bryony is an agent's,
made unheard, for her to confirm or swap. Edwin stays in Settings. Settings stores a voice
only when the player picks one, so a player who never chose hears Bryony and one who picked
Edwin keeps him.
Source: Nell, 2026-11-07: "Can we try a female voice for the AI/PA?";
`src/audio/paVoiceCatalog.ts` and its test.

### D-056 · The taco truck trades as "La Molinita" · [proposed] · 2026-11-07

The station-forecourt taco truck carries a painted identity instead of a plain "TACOS" band:
an invented name, "La Molinita" ("the little mill"), a corn-tortilla stall beside a flour mill,
on a shaped roof board with "TACOS DE MAÍZ" and two painted tacos, an awning valance
("TACOS · QUESADILLAS · ELOTES") and an A-frame chalk menu priced in pounds. It is one raster
atlas, like every other shop sign on the street, drawn by `scripts/author-taco-truck-sign.py`
with lettering from two SIL OFL fonts (Shrikhand, Caveat Brush) that do not ship. The board is
paint, unlit at night; its two gooseneck lenses and the festoon bulbs follow the lamp clock
(D-044). Painted signage, so not translated.
Source: Nell, 2026-11-07: "Taco truck could use a dedicated sign.";
`src/components/exterior/tacoTruckSignLayout.ts` and its test.

### D-057 · The hall has its staff facilities back, in two blocks south of the packing cell · [Nell] · 2026-11-07

Toilets with an accessible WC, a locker room, a staff room with a kitchenette, the mill
manager's office, a meeting room and a first-aid room stand on the hall floor again, as two
single-storey blockwork blocks with flat roofs: welfare at x -25 to -10.6 and office at
x 10.6 to 25, z -36.6 (office -34.6) to -28.6, either side of the receiving dock apron, with
their doors on the north face onto open floor. They replace nothing live: the earlier rooms
(break rooms, locker room, toilet block, manager's office) were in
`infrastructure/FactoryWalls.tsx`, which stopped shipping on 2026-08-02 when `MillScene`
moved to `OptimizedFactoryInfrastructure` (a87d07c7), and the driver break room and
restroom left `TruckBay.tsx` with the v0.40 uncrewed release (7411bc36). Those files stay
dead; this is new code (`src/components/facilities/`). Access: level floors, 1.1 m door
openings (0.98 m clear with the leaf open), an accessible WC to Approved Document M's layout
(1.5 m turning circle, pan 450 mm from the side wall, drop-down rail, lowered basin, pull
cord to the floor, outward door), a lowered kitchenette section with knee space, and table
ends left free for wheelchairs. The walls, leaves and larger fittings are first-person
walking solids; seats and door approaches are exported for routing people. No light source
is added: the hall's rows light the rooms, lamp faces are emissive, and each interior part
carries a `glow` weight that adds the rooms' always-on lamplight as emission in proportion
to its albedo (one shared uniform, `FACILITY_ROOM_GLOW`; ceilings take more of it, hall-side
faces none). No resident's routine was changed. Sign lettering is painted signage, so not
translated.
Source: Nell, 2026-11-07: "Ages ago we had toilets, break areas etc, but they came out at
some point. Manager's offices. Can you please add these back to the factory as appropriate,
with upgrades to make them charming and beautiful."; `src/components/facilities/facilityLayout.ts`
and its test.

### D-058 · Disabled colleagues and residents, and the adjustments they asked for · [Nell] · 2026-11-07

Five people use agreed adjustments, as anonymous roles in the existing roster (appended after
the forklift crews, since saves restore residents by index), written in the social model:
the register (`src/simulation/agreedAdjustments.ts`) names what each person asked for and who
it was agreed with, never a condition, and holds no number about anyone.
- `mill-quality-bench`, a quality technician who works from a manual wheelchair at a sit-stand
  bench set to seated height (QC_BENCH, -20, 2.55) and takes tea at a table with no fixed chair.
- `mill-operator-east` (existing) gets every alarm as light and vibration: a pager on the belt
  and a strobe lamp at the rm-104 workpost.
- `mill-packing-quiet`, a packing operator at packer 1 who takes breaks in a glazed quiet room
  (-27, 9.6) booked 10:00-10:30 and 14:00-14:30.
- `village-hall-clerk` (wheelchair, lunch 12:00-13:30) and `village-hall-officer` (long cane,
  13:45-15:15) come out of the town hall's front door and go to the market stall.
The town hall gets a two-flight 1:12 ramp from the front landing down its east side (the
landing is 0.80 m up; a ramp in front would not fit), handrails both sides, corduroy hazard
paving at the head and foot of the front steps and an induction-loop sign. The railway road's
zebra gets red blister paving on both dropped kerbs; the station car park's empty bay nearest
the station is an accessible bay with a transfer zone; the hall has twelve wall strobes (1 Hz,
synchronised, steady under reduced motion). Wheelchair users count as pedestrians to the
forklifts' give-way (`userData.seated` is false for them).
The factory AI acts on the register and on schedules alone (`src/utils/aiAccommodation.ts`),
never by watching anyone: it confirms each alarm went out as light and vibration, moves the
air-line purge out of quiet-room bookings, and the egress drill verifies a zone only with a
clear step-free way out (`src/systems/accessibleEgress.ts`). The two dock exits are a metre
up, so those zones verify on a service door's step-free route; a zone whose route and
alternative are both blocked by stopped forklifts stays unverified and says so. Cards are
filed completed, in English and Brazilian Portuguese.
Source: Nell, 2026-11-07: "Please add some people with disabilities, and show how they are
accommodated, including by the factory AI."; tests in `src/simulation/__tests__/agreedAdjustments.test.ts`,
`src/utils/__tests__/aiAccommodation.test.ts` and `src/systems/__tests__/accessibleEgress.test.ts`.

### D-059 · Water moves on render seconds; the canal is closed at both heads · [proposed] · 2026-11-07

The shared water phase (`WATER_VISUAL_TIME`) is render seconds, clamped at 0.1 s a frame,
and holds its phase while the world is paused (P, a session hold, or a benchmark without
`motion=1`), under reduced motion, in a hidden tab and during `holdFrame`. It was game
minutes x 0.38, authored at the old 180x pace; at the 30x default it ran at 0.19 s per
second, and with profile speeds of 0.025-0.38 the lake's bed caustics took minutes per
cycle. `WATER_PROFILES` speeds are now river 0.9, canal 0.4, lake 0.5, pond 0.35, and a
`drift` (river 0.45 m/s, canal 0.03 m/s) carries the ripple field downstream. Fish and
dragonflies share the clock and now move at their authored rates.
The main canal no longer runs 1 m past its outlet to an open end over the grass: the
outlet's north wall carries on across the canal and closes it, the closed south head spans
the canal's full outer width flush with the bank ends, and every bank carries world-scaled
UVs. Where the canal meets the outlet both waters measure depth to the stone actually there,
and the outlet's apron fades in over 3 m, so the seam is open water.
Source: Nell, 2026-11-07: "Can we animate water please", "Canal end near river, end is
fucked", "Z-fighting here also", "The other end of the canal isn't flush either."; tests in
`src/components/exterior/WaterSurface.test.tsx` and `src/components/exterior/canalJoins.test.ts`.

### D-060 · Forklifts work real loads between real places, with a driver at the wheel · [Nell] · 2026-11-07

Every forklift trip now moves a load that stands somewhere before and after it
(`src/simulation/forkliftCargoStations.ts`). FLT01 picks a pallet built at the end of the
shipping conveyor, 12 bags, only while released flour is waiting to ship, and sets it on the
shipping dock deck, from where it goes into the docked trailer. FLT02 carries packaging
supplies (flat-packed sacks, banded and wrapped) from the docked grain trailer, which puts one
pallet out per visit, to the packing-line store; grain itself stays bulk, so FLT02 no longer
carries flour sacks inward. A pallet changes hands between station and forks at engagement and
release; it no longer fades in or out on the forks. Every load has a visible end: a placed
pallet slides into the trailer within 3 plant seconds, before its forklift can back out, turn
and leave the dock lane (the truck keeps its doors open while it is in the lane); supplies at
the store are drawn down from the top over 90 plant seconds and the bare pallet goes onto a
stack beside it (at most six). FLT01 takes a pallet to the dock only for a truck on its way in
or docked. An operator finishes the job in hand: with a load on the forks the spell does not end
(the forklift does not report itself parked, so the held hour waits) until the load is delivered,
held at the dock while its truck is on the way in, or else put back whole at the collection
point when nothing stands there (the next pallet is built only once this one has left), or held
at the dock until a trailer can take it; empty, no new job is started, and the operator steps
off only with the forklift parked at its crew point, empty, forks down
(`forkliftSpellEndTask`, `forkliftParkedForCrew`). A pick or drop reads as one is driven
(`src/simulation/vehicles/forkliftWork.ts`): it slows to 1.5 m/s, stops a metre short with
the forks set, creeps in, lifts or places, backs 1.6 m straight out, then turns. It waits for a
pallet being built with its tines 3.5 m clear. Parked or held more than 2 s, it lowers its
forks (and any load) to the floor and lifts them before moving. It stops for anyone on foot
within 3.5 m of its route ahead (and the player walking in first person; anyone using a
wheelchair or a long cane always counts, seated or not, with 0.4 m more room), slows within 6 m, and
sounds its horn at most once every 20 seconds (SCADA stop code 11, `pedestrian-yield`). Its
seated operator holds the wheel at ten and two, turns it with the steering and looks back
over the right shoulder while backing out (`forkliftDriveCue`). The crew rules of D-002 hold:
a forklift whose crew has not stepped stands still for 2.5 s before it falls back to working
as if crewed; one whose operator is off when the session opens starts parked at its crew
point; a forklift that unmounts carries on where it stood. Truck loading still runs at the
dock's own rate (400 kg per plant second) independent of pallets, so a forklift carries one
pallet into each truck's load rather than the whole 5 t; the dock rate stays as it is, so
delivery deadlines are unchanged.
Source: Nell, 2026-11-07: "Forklifts don't have anyone manning them, and don't appear to
behave in a meaningful/intentional working fashion. Please audit and improve."; tests in
`src/simulation/__tests__/forkliftCargoStations.test.ts`,
`src/simulation/vehicles/forkliftWork.test.ts` and
`src/simulation/__tests__/forkliftCrewDrive.test.ts`.

### D-061 · Lottie or Edwin on the PA, and urgency that rises with a fault · [Nell] · 2026-11-07

The English PA voice is Lottie, chosen by Nell by ear from rendered auditions of every
female English voice through the tannoy filter; Bryony (D-055), picked from descriptions,
sounded flat beside Edwin. Settings offers two voices per language as a choice that speaks
when picked ("Hi, I'm Lottie..."): Lottie and Edwin in English, Débora and Marcelo in
Portuguese. A voice saved from the older full list still plays. Supersedes D-055.
Urgency follows the fault: warnings and alarms are worded with urgency ("Heads up! ...
needs a look, please."), a fault still unresolved after 3 and 6 minutes of running clock
is said again in rising terms ("still needs a look", "needs someone now"), and stops when
the machine recovers; a paused or muted plant builds no urgency. Alarms are delivered at
1.1x and warnings at 1.05x; good news is worded warmly. The Phonon 40M model has no style
control, so urgency comes from wording and speed. The PA mode is On or Off: "Characterful"
only differed by the filler D-054 removed, and a saved one reads as On.
Source: Nell, 2026-11-07: "It sounds flat and shitty compared to the male voice we had.",
"Lottie please", "Okay, yes please add urgency variations of such messages.", "offer the male
voice we just had, as well as 'Lottie', as an option for the player please. Have it speak
when switched"; `src/components/game/shared.test.ts`, `paVoiceCatalog.test.ts`.

### D-062 · Level personnel doors beside both docks; the town hall ramp is walkable · [Nell] · 2026-11-07

Each gable wall has a level personnel door beside its dock at x 37, the end of the east
walkway (`PERSONNEL_DOORS`, `src/constants/accessibilityLayout.ts`): 1.0 m clear by 2.2 m,
a steel frame through the plinth, a flush threshold, the leaf held open outward. The shell
leaves the opening (`buildFactoryGlazing`, `buildFactoryLowerWallSegments`). Inside, the east
walkway runs on to the wall with a yellow barrier along its last 5 m, an illuminated green
exit sign over the door and a directional one where the barrier begins; outside, a lit
bulkhead, a level landing with corner bollards, a painted green walk (the back one joins
the paved cross path behind the hall, `REAR_CROSS_PATH`) and an assembly point 14 m out with
its sign (`accessibility/StepFreeExits.tsx`). Both stay clear of the forklift lanes (west of
x 1.4), dock platforms (to x 18), staging and truck paths, and each door's 3 m approach is a
protected egress corridor (`protectedEgressApproaches`). The front and back egress markers
move to 2 m outside these doors, (37, ±52), and those zones verify on their own step-free
route again; the "verified on its alternative because the dock is a metre up" path is gone,
superseding that part of D-058. A stopped forklift on a route still sends the zone to its
alternative, and blocks it when both are blocked. The feed names the door in both languages.
The town hall ramp is walked, not walked through: the walking height includes its flights,
landings and both porticos, the 0.23 m step rule applies there, and the handrails and
portico columns are solid (`townHallWalkingHeight`, `townHallBlocks`). The portico's east
column base stands 0.12 m off the wall, so the ramp's top landing reaches the door in front
of it, on an apron over the east end of the steps (now 3.75 m wide); the clerks' route and
the hazard paving follow. The three civic ground lamps the ramp covered are low lights on
its outer rail posts, 0.4 m above the surface (`RAMP_LAMP_MOUNTS`); the civic lamp shadow
bake needs re-running for them.
Source: Nell, 2026-11-07, best judgement on the accessibility agent's finding that the front
and back exits run through docks a metre up; and on first-person walking passing through
the ramp. Tests: `accessibleEgress.test.ts`, `aiAccommodation.test.ts`,
`capsuleWalk.routes.test.ts` (ramp and door walks), `agreedAdjustments.test.ts`,
`firstPersonSpawn.sweep.test.tsx`, `civicLampShadows.test.ts`.
