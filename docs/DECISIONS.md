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

### D-080 · The plant floor is played through the partner's proposals · [proposed] · 2026-11-13

Made under Nell's instructions "Proceed please, fix everything, and another pass please."
(2026-11-12), "Fix everything please. When all is fixed and done, push live please." and "Fix
all issues please." (2026-11-13). Nell ruled on no single decision, so this entry and every one
to D-118 is Nell's to confirm or reverse.
A floor decision arrives as the AI partner's proposal (top of the AI panel's Decisions tab, and
the phone panel): each answer priced, the partner's choice marked, a window on the game clock.
Unanswered, the partner's choice runs. A game hour later the record prices every answer again
with the same function. Each kind can be set to "Ask me" or "Decide and tell me". The
`prediction` and `coordination` cards, which did nothing when accepted, are gone.
Why: with no input every order shipped on time and no choice changed an outcome. No input now
delivers 52 orders on time over ten shifts, none late, ten A.
Note, 2026-11-13 (review 2): that figure is `npm run playtest:plant -- --suite=partner`, arm p
(net 42,593.2); the plain command runs the older arms a, b and c.
To reverse: `src/simulation/partnerProposals.ts`, `src/systems/partnerProposalRuntime.ts`.
Unfinished: automatic alarm reactions as a level the player grants were not built.
Source: the plan, `_contprompts/millos_mechanics_mastery_20261112.md`, D1 and item 3.0; its
wave log, rows 3a and 3d. Evidence: `docs/reviews/mechanics-20261112/`.

### D-081 · The first floor decisions, as built · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The plan named four (intake, the maintenance window, dispatch by grade, two answers per
incident). Eight proposal kinds were built: `programme` (take the next programme or hold it an
hour), `commitment` (take the next one early, beside the running one), `service` (service now
or run on), `dispatch` (send a part load now or hold up to 45 minutes), `forfeit` (D-110),
`intake` (accept, blend or refuse a grain lot on its moisture, protein and falling number,
under a charter only; refusing costs 120 and a seeded even chance the next truck is 45 minutes
late), `incident` (two priced answers for each of the eight incident kinds) and `temper`
(D-117). A "service at the quiet spell" answer is built and off
(`SERVICE_CARD.quietSpellOffered`): it never won.
Unfinished: blend was never offered in play (no silo had room).
To reverse: remove the kind from `PROPOSAL_KINDS` (`partnerProposals.ts`).
Source: the plan, D2; wave log 3a, 3b, 3c, 3e.

### D-082 · The plant is dock-bound: decisions are priced in what it responds to, and asked only when either answer can win · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The dock and the order book set the tonnes. On the ten-shift harness a mill down up to 240 game
minutes, two of four mills down, a packer down or the line at 0.6 to 1.2 shipped the same
kilograms (179.5 t, 44 on time): about 52 t of stock sits between mills and packers. So
decisions are priced in truck slots, grade against the order's minimum, lateness and money,
never in line tonnes. A kind is asked only when the harness has an arm where the other answer
wins and one where it loses; otherwise the partner decides and says what the other answer would
have cost. Asked today: `commitment` and `intake`. Decided and told: programme (hold never won,
78 of 78), service (8 of 8), dispatch (never raised), forfeit, every incident kind, temper.
To reverse: `DELEGATION_EVIDENCE` (`partnerProposals.ts`), `INCIDENT_DELEGATION_EVIDENCE`
(`incidentProposal.ts`).
Source: the plan, "Which levers bind" and "Phase 3 re-planned (proposed D22)"; wave log 3c, 3d,
3e, 7c.
Correction, 2026-11-13 (review 2): "78 of 78" and "8 of 8" were arithmetic, not measurement.
A hold always carries its hour against none, and running on always adds the service's part to
the failure's costs, so those records could not come out the other way; the same holds for
keeping an order the line cannot make. Those three records now state what each answer cost and
name no better one. The harness measures those kinds on arm totals instead: holding every offer
shipped 8 t and netted -1,477 against arm p's 209.5 t and 42,593; running on every service netted
25,348 with four breakdowns; keeping every unreachable order netted 4,646 against 15,822. They
stay decided. "Dispatch (never raised)" was false: it is raised twice in ten shifts when the line
is never serviced (arm q), and held both times the record ranked sending better both times. The
early programme's record judged on net alone; it now judges as the partner chooses, nothing late
first, then net. Asked still holds for it: waiting every time at demand 1, the record ranked
another answer than the partner's 11 times in 88; taking every time at demand 2, waiting was
better 14 times in 14 (`npm run playtest:plant -- --suite=ask`, which now checks the null claims
too).

### D-083 · The Chronicle is tuned on the measured plant, and its fund is in the plant's currency · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The fund counts the plant's own money (`CURRENCY_TO_FUND` 1). Members reinvest a share of each
shift's surplus derived from measured net (`REINVESTED_PER_MEASURED_SHIFT` over the measured
4,259 a shift: 0.91% in the commit of 13 November, 0.82% in the final tune still running; it
was 0.25 of net at 0.18 fund a unit). Plans, mitigations and two event prices are rescaled to the unit (install:
wind 400 to 60, heat recovery 280 to 45, vibration monitoring 200 to 20). Trial tonnage is 1.2
times 19,500 kg a shift over the shifts gold allows; Grid Winter's energy cap goes from 0.08 to
0.008 a kg. Era gates and the rank ladder are unchanged. A saved fund keeps its number, read as
currency.
Why: it was tuned at 180x on 3 to 5 t a shift; at pace 30 the plant ships about 18 t, and the
fund stopped binding by shift 15.
To reverse: `src/chronicle/measuredPlant.ts`; `CURRENCY_TO_FUND` in `engine.ts`.
Unfinished: the final tune is still running (D-118).
Source: the plan, D3 and item 4.1; wave log 0.2, 4c, 7c.
Correction (2026-11-13, review 2): the final tune on the final plant set the share at 30 of
4,259 (0.70%), not 0.82%; `REINVESTED_PER_MEASURED_SHIFT` in `measuredPlant.ts` says why.
Correction (2026-11-14, review 2): the measured pace is 20,500 kg a shift, not 19,500 (arm p
re-run on the final tree), so the full trials ask 123,000 to 172,000 kg; the short ones are set
at 1.17 times the pace, 72,000 to 96,000 (74,000 to 98,500 at 1.2 cost skilled gold).

### D-084 · A 27-shift chronicle beside the 63, and a wet year that costs 5 · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The charter has a Length column: 27 or 63 shifts. The short form places everything scheduled at
floor(shift x 27/63), and each trial's window and tonnage shrink with it (Wet Harvest shifts 4
to 7, Inspection 8 to 11, Bakers' Rush 12 to 15, Grid Winter 16 to 19, Great Programme 21 to
25, the long night 23, the epilogue 27). Old saves are 63 shifts, and a digest of every close
pins a 63-shift run unchanged. The wet year now costs strong white 5 points, not 6, so moisture
meters hold 95 on a serviced line (99.2 - 5 + 1 = 95.2; before, 99.5 - 6 + 1 = 94.5). Drying
removes the penalty (D-117).
Why: 63 shifts is 16.8 real hours at 1x; 27 is about 7.2.
To reverse: `SHORT_CHRONICLE_SHIFTS` (`src/chronicle/schedule.ts`); `wheatPenalty` in
`cropYears.ts`.
Source: the plan, D3, items 4.2 and 4.6; wave log 4b.
Correction (2026-11-14, review 2): the short Grid Winter is announced six shifts ahead (shift
10), not three, the full form's notice; no energy plan can be installed by then (wind and heat
recovery are Regional, reached at shift 23 to 27), so it buys notice only; and a short chronicle cannot reach
Federated (installs run one at a time), so an era scores as the share of its length's ladder:
4 an era in 27 shifts, Regional 12, the same as Federated in 63 (`eraPoints`, `scoring.ts`).

### D-085 · The Chronicle's documents state pace 30, and its copy is in both languages · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
`docs/CHRONICLE.md` and the code comments now give a 63-shift chronicle as 16.8 real hours at
1x (4.2 at 4x). They no longer say 2.8 hours at 180x, that a shift with no truck is graded F,
or that relationships weight events. Chronicle copy ships in English and Brazilian Portuguese;
engine records stay canonical English and are translated at display. Buffalo's elevators and
the cotton-bag booklet were corrected from sources; OGAS, Cybersyn, Haggenmacher and Ganz were
confirmed as written (Gerovitch 2008; Medina 2006; HLS; US patent 251,124).
Supersedes D-009's clause "Chronicle copy is still English only"; the rest of D-009 stands, as
narrowed by D-048. No entry here recorded the 180x pace: D-059 mentions it only as history.
Source: the plan, items 1.12 and 1.13; wave log 1a; `docs/CHRONICLE.md`.

### D-086 · The cooperative season starts after the first delivery, and every plan runs the line at 1.0 · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
No season starts while `order-001` is open: the store refuses with a reason, and a save with a
season already running carries on. Steady, resequence and cover all run the line at 1.0.
Resequence reorders the campaign's own orders for the shift. Cover has a reader: on the one
shift whose drawn pressure takes a member away, the bench starts no new test and a service
waits unless someone covers. A season's end leaves a debrief that survives a reload.
Why: the season started itself at the tour's end and slowed the line to 0.78 for three shifts,
so cooperating was the slow option.
Supersedes the 4 October direction that the season starts autonomously once startup and an open
order are ready (`_contprompts/millos_owned_decisions_20261004.md:60`). It was Nell's
clarification and never entered in this log, so the conflict is Nell's to settle.
To reverse: `firstDeliveryFulfilled` in `src/stores/workplaceStore.ts`.
Source: the plan, D4 and items 2.6, 5.4; wave log 2b, 5c.

### D-087 · In a solo season the player is one role · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
In solo play the player is Packing. The store refuses the player's understanding, vote or cover
for another role. Coordinator, Quality and Maintenance answer from their stated values and make
their own calls: the Coordinator's Friday and Thursday decisions, Quality's inspection, and the
chair, sobras and handoff ballots. The "(blocked)" labels are gone; a refusal shows at the
button it answers, and the camera goes to the role that refused. The panel shows the next step
only, over a five-row role table (Packing, Quality, Maintenance, Coordinator, the adviser) by
Understands, Policy vote and Cover, with no digits. Separate turns and workshops keep every
role's own input.
Why: the player cast every member's ballot, so no refusal ever happened to them.
To reverse: `authoredSeasonCommand` in `src/simulation/bilateralWorkplace.ts`.
Source: the plan, D5 and items 5.1 to 5.3; wave log 5a, 5b.
Correction (2026-11-13, review 2): the reason line under each role's name and the next-step
sentence under the heading are gone, because they were helper text (D-012, `[Nell]`); a refusal
shows as its own wording at the control it answers, and only a step no control answers (the
shift running, an inspection, owed recovery) is read out. The authored sobras ballots no longer
come from a fixed table: each follows the role's need and what the season did (a losing shift,
a thin reserve), so in some seasons Packing's ballot decides and in others it is outvoted, and
the record names each need met or outvoted.

### D-088 · Friday is always an installment in solo play; changed terms re-ask every check · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Three rule changes follow from D-087. In a solo season the Coordinator's Friday call is always
the renegotiated installment, because its stated value prefers the stable sequence to a rush;
keeping the full order cannot be chosen. The season start not linked to an order is gone in
solo play. Changing the terms asks every understanding check again. Also: a season paused by a
stop or a drill resumes only after RESTART LINE (D-096), and an adopted arrangement survives the
experiment's close, a reload and later seasons.
To reverse: the Friday branch of `authoredSeasonCommand` (`c.shift === 0 ? 'renegotiate'`).
Source: wave log 5b.

### D-089 · Flour under an order's minimum is neither loaded nor paid for it; the lab bench is a resource · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
A truck loads a batch for an order only if the batch is tested and meets that order's minimum;
the same rule decides what is available and what is paid. Flour under a minimum can fill an
open order it does meet: a 93 batch goes to the community order (92), never to strong white
(95). The bench runs one test at a time, 6 game minutes each, queued by a player's "Test
first", then the earliest-due order's product, then the oldest. Trucks fill to capacity across
same-product orders (`fill`: 190.0 t, 48 on time, net +9,403 over ten shifts against the old
rule). Benchmarks keep the old rule and no bench.
Why: a failing load earned full revenue less 0.08 a kg. Cost of the bench: 3.5 t and two
deliveries over ten shifts.
To reverse: `BENCH_TEST_MINUTES` (`qcLabStore.ts`); `planShipment` (`shipmentPlan.ts`).
Source: the plan, D6, items 3.2 and 3.4; wave log 3a, 3b.

### D-090 · Service takes game time, and three free exploits are closed · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
A service takes the unit offline on the game clock (roller mill 45 game minutes, sifter and
packer 30, silo 20) and one part at the start, as its button says; a restart takes 75 game
seconds. A unit saved mid-service finishes on restore, and a fault that ends a service refunds
its part. Closed: a repair's restart no longer services the unit (it returns just under its
breakdown threshold, its service proposed); parts follow a reorder rule, arrive with the next
grain truck and are booked on a Parts line (game prices, unsourced); a down unit keeps its last
efficiency in the quality mean.
Why: measured, breaking two mills paid (+57) and never servicing cost nothing. Now two mills
down 240 minutes give 159.8 t and net 25,332, against routine service's 188.5 t and 38,184.
To reverse: `serviceMinutes` in `WEAR_CONFIG` (`productionStore.ts`); `src/systems/unitService.ts`.
Source: the plan, D7, item 3.3; wave log 0.2b, 3b, 3c.

### D-091 · Chronicle plans pay in the costs they avoid · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
A fund source, "Costs plans avoided", stands beside each plan's upkeep and reaches the fund in
full, where surplus reaches it at the reinvestment share (D-083). A paired control on the real
tick books exactly the energy wind and heat recovery save. Payback, from the probe: wind 6 to
11 shifts, heat recovery 6 to 10, vibration monitoring 1 to 6, all inside the 25 the plan set.
Plans also open floor options: moisture meters hold strong white in a wet year (D-084), and
blending bins lift a sprouted year's best stamp from 90.5 to 97.5.
Why: savings reached the fund at 4.5%, so plans cost more than they saved.
Unfinished: the wear credit is unproven (the control booked no parts either way).
To reverse: `AVOIDED_COST_RATE` in `src/chronicle/engine.ts`; `src/chronicle/avoided.ts`.
Source: the plan, D8, item 4.3; wave log 4b, 4c.

### D-092 · The federation's administrator is an offer the assembly may refuse · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The administrator no longer locks a member co-op's policies. The federation offers it; refusing
costs the federation 10, and accepting has the federation pay upkeep for its four shifts. The
ratchet stays. The notice names the rulings that brought it, and quotes the ICA's fourth
principle (autonomy and independence) from ica.coop.
Why: the lock went against the game's own Mondragon note and that principle.
To reverse: the `FEDERATION_ADMINISTRATOR_EVENT_ID` event in `src/chronicle/stewardDeck.ts` and
its handling in `engine.ts`.
Source: the plan, D9, item 4.11; wave log 4a, 4b.
Correction (2026-11-13, review 2): "no longer locks" is wrong. Refused, the administrator locks
nothing; accepted, it holds the policies where they stand for its four shifts, as the offer's
own text says (`startAdministration` in `engine.ts`).

### D-093 · Desks of attention are cut · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Works, trade and council points are gone; a save holding them loads and drops them. The co-op
reserve at 100 or more counts as one long-night preparation.
Why: over 63 shifts about nine council costs fell against a refill of one a shift, so they
never bound. D10 said to keep them if the probe found a setting where they bind. A seeded
probe of 40 chronicles did find one where a desk reaches 0, but what the desks then refused
were lapses (decisions left to expire), not trades between options, so they were cut anyway.
That is a judgement against the plan's literal condition.
To reverse: restore the desk resources in `Cost` (`src/chronicle/types.ts`) from the history.
Source: the plan, D10, item 4.8; wave log 4a.

### D-094 · The goal is the programme's committed tonnes, not a daily bag count · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The HUD, tracker widget, Overview, phone sheet, Autonomy and the multi-objective dashboard show
the open programme (tonnes shipped of committed, next due, late), and nothing when none is
open. `productionTarget` and `DAILY_TARGET_BAGS` are gone from types, stores and saves (a
removed-field entry; old saves restore). The agent projection gives `campaign.programme`. The
PA's one line of good news moved with it: "The programme's delivered!" replaces "today's
target made".
Why: the 1,200-bag target counted stock nobody ordered and competed with the customer's
kilograms.
Supersedes D-054's "the day's target made". D-054 is `[Nell]`; its rule (good news only on an
event, one line) stands, and the change of event is Nell's to settle.
To reverse: `src/stores/programmeCommitment.ts`; the PA line in `src/components/game/shared.tsx`.
Source: the plan, D11, items 2.1, 2.5; wave log 2b, 2c, 2 tail.

### D-095 · A driven forklift gives way, works its stations and stops at the hall's walls · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Under manual control a forklift slows within 6 m of anyone on foot and stops within 3.5 m,
forward and in reverse, with the autopilot's constants, and logs a near miss once per approach.
In the cab, E or a click at a station the forklift is lined up for runs the autopilot's own
pick or drop, so the pallet counts as the trip it replaces; a pick with the forks wrong or above
a crawl is refused with an error line, near people or not. Elsewhere the same press steps the
driver down. A driven forklift stops at the hall's walls and passes only the two service doors.
This narrows D-050 and D-053 (`[Nell]`: E or a click boards or leaves) and extends D-060
(`[Nell]`) and D-058's give-way to the driver; Nell's to settle.
Unfinished: fences, hedges and staff-facility walls are not solid to a forklift.
To reverse: `forkliftManualDrive.ts`, `forkliftManualWorld.ts`; `requestWork` (`forkliftDriveStore.ts`).
Source: the plan, D12, items 6.1, 6.2, 6.6; wave log 6a, 6 tail.

### D-096 · Clearing a stop or ending a drill leaves the line idle until RESTART LINE · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
CLEAR EMERGENCY and END DRILL release the interlock and the forklifts and leave every unit idle.
RESTART LINE (`restartLine`, which takes focus) returns each unit the stop idled to its recorded
status; the bell says the line is ready. No agent command restarts the line; Reset Simulation
still does. The drill's record names each zone's result (clear, alternative, blocked or
unverified), any forklift that blocked it and the plant-clock time. While the Safety controls
are open, routes and refuges draw on the floor, red where a forklift stands.
Why: Machinery Directive 2006/42/EC Annex I 1.2.4.3 (EUR-Lex, read raw): disengaging the stop
"must not restart the machinery but only permit restarting". No ISO clause is claimed.
D-010 stands. No earlier entry recorded the restart at CLEAR or the drill's end.
To reverse: `resolveEmergency`, `endEmergencyDrill` (`gameSimulationStore.ts`).
Unfinished: the floor drawing has not been seen in pixels.
Source: the plan, D13, items 6.3, 6.4; wave log 6a.

### D-097 · Helper text is cut to D-012's wording; the loading quotes are sourced facts · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
About 440 strings were reviewed: about 172 cut, 107 trimmed to the state or a refusal, 6 moved,
16 replaced and about 140 kept with reasons. A price or consequence on a button is effect text,
not helper text. About carries the one disclaimer; the PA voice credit stays. The loading
screen's nine invented "principle" quotes are nine sourced milling facts, each naming its
publisher. AI narration cards no longer show; their Datalinks unlocks still happen. A catalogue
test fails on a new hint-named key or on more `title` tooltips.
This applies D-012 (`[Nell]`) and supersedes nothing.
Unfinished: not seen on screen on the cooperative and Autonomy surfaces, the Inspector, the
shift debrief or About. The working list, with each string's verdict and
the reason for every one kept, is `docs/reviews/mechanics-20261112/d14-helper-text-list.md`.
To reverse: per string, in its catalogue.
Source: the plan, D14, item 1.18; wave log 1a, 2b, D14.

### D-098 · Mute silences sound only; PA captions continue while muted · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Muted, every PA line is still filed, captioned, kept in the transcript and read to screen
readers. The voice neither loads nor speaks; muting mid-line stops it, and the caption stays its
own reading time (at least 10 s, 80 ms a character). Unmuting replays nothing. The HUD's result
bell is quiet while muted.
D-061 `[Nell]` stands whole: a paused or muted plant builds no urgency. Muted, a fault is
captioned once and is not said again in rising terms until the sound is back. The first build
of this entry let a muted plant build urgency in captions; that went past the plan's D15
("Mute silences sound only") and against D-061, and was withdrawn on 2026-11-13 before merge.
Whether a muted player should get the rising notices is Nell's to settle.
Why: a player who is deaf, or keeps sound off, received no PA, a facility stop included.
Another session's D-070 (uncommitted when this was written) records the same rule.
To reverse: `voiceActive` and the mute effects in `PAAnnouncementSystem.tsx`; the filing in
`shared.tsx`.
Source: the plan, D15; wave log "D15, D17, D21".

### D-099 · Walking is at a person's pace, and the hall's walls are solid · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
In first person the player walks 1.4 m/s inside the hall (2.7 with Shift) and 2.7 outside (5
with Shift), beside colleagues at 1.25. The 128 m hall diagonal takes 91 s (47 hurrying). The
paces are sourced in the file. The hall's walls, jambs and open door leaves stop a walker, and
the four egress routes walk clean. Residents answer E or a tap with a card: role and what they
are doing, and for the D-058 colleagues the adjustment by its register name, never a condition.
Why: walking was 12 m/s and sprinting 43 m/s, so the hall was crossed in two seconds, at speeds
the forklift give-way was never built for.
Extends D-035 and D-039 (walking solids in the village) to the hall. No earlier entry set a
walking speed.
To reverse: `HALL_WALK_SPEED` and its neighbours in `src/utils/walkingPace.ts`.
Source: the plan, D16, items 6.5, 6.6; wave log 6a.

### D-100 · The per-forklift Efficiency figure is gone · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Safety analytics no longer show each forklift's "Efficiency %". Speed zones now change
something: with the west-walkway zone the seeded run records no near misses, without it some.
Why: the figure read as a number about the forklift's one operator, and fell every time the
forklift gave way, so it marked down safe driving. That sits badly with D-058's rule of no
number about anyone.
No earlier entry recorded the figure.
To reverse: restore it from the history; `SafetyAnalyticsPanel.noOperatorFigure.gameplay.test.tsx`
pins its absence.
Source: the plan, D16, item 6.7; wave log 6a.

### D-101 · The town hall ramp is rebuilt to Approved Document M · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Two 6.8 m flights at 1:17 (Table 1 allows 1:16.8 at that going), 1.505 m clear, landings of
1.55 m (mid), 2.2 m (head) and 1.25 m (foot): 15.15 m in all, each limit quoted in `DOC_M_RAMP`.
Of clause 1.26's fourteen provisions, eleven are met, one is not needed, and slip resistance
and friction are not modelled. The privet was cut back and three rail lamps moved (lamp atlas
`14ffdb8f`). A test pushes a 0.72 m wheelchair from the street to the door.
Why: the old ramp (two 4.8 m flights at 1:12, rising 0.4 m, 1.3 m wide) failed Volume 2 Table
1 (about 0.32 m rise for that going) and the 1.5 m width.
Supersedes the ramp geometry in D-058 ("a two-flight 1:12 ramp") and D-062. Both are `[Nell]`;
their intent, a walkable step-free route, stands. Nell's to settle.
Unfinished: the portico's own door landing is 0.8 m deep; no sign points to the ramp.
Source: the plan, D16; wave log 6a, 6 ramp; `src/constants/accessibilityLayout.ts`.

### D-102 · The cornmeal customer is "Community Polenta Kitchen" · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The corn product shows as "Cornmeal" / "Fubá" and its customer as "Community Polenta Kitchen"
in both languages, a proper name under the glossary, through one function. Stored names and ids
are unchanged, so saves restore. The Chronicle's strings follow.
Why: "Community Pasta Works" ordered semolina milled from corn, and pasta semolina is durum
wheat. Read raw: 21 CFR 137.320 (semolina is ground durum), 137.250 and 137.275 (corn meal),
Embrapa Documentos 59, ANVISA IN 351/2025. Codex could not be fetched.
To reverse: `src/stores/customerNames.messages.ts`.
Source: the plan, D17; wave log "D15, D17, D21", 4c.

### D-103 · Sobras settle once a season, as Lei 5.764/71 sets out · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Sobras settle at the season's end, net of losses: 10% to the Reserve Fund and 5% to FATES first,
the rest to the members' chosen destination in proportion to minutes worked. A losing shift
shrinks the pool. The reserve carries over and pays for purchases with a receipt. The law was
read from the Câmara dos Deputados' published text (planalto.gov.br redirected to a home page);
articles 4 VII, 28, 44 II and 89 are quoted with the URL in the code.
Why: sobras went whole to one destination, split equally, every shift.
Unfinished: the plan's community share shown in the village was not reported built.
To reverse: `RESERVE_FUND_SHARE`, `FATES_SHARE` (`src/simulation/workplaceCampaign.ts`).
Source: the plan, D18, item 5.5; wave log 5a, 5b.
Correction (2026-11-13, review 2): no screen shows a member's share any more; the debrief and
the Lab show the pool and its split by destination (members, Reserve Fund, Assistance Fund),
because per-role amounts are a number about a person (D-058, `[Nell]`). A vote no destination
carries now settles by art. 4 VII's default (to members by minutes worked) and says so; a
charter without shared surplus keeps it in the Reserve Fund at archive, and a charter with it
cannot archive until it is shared, so no pool is lost. English says "surplus" and "Assistance
Fund" (glossary); Portuguese keeps "sobras" and "FATES".

### D-104 · The Chronicle's quiz is built from the player's own record · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Each round leads with questions from the player's record: what followed a ruling, what an
installed plan changed, why a trial failed. Only a first attempt earns (saved `quizAttempted`;
an old save counts questions already answered as attempted). Options reorder by the seeded
generator. A note read before the Chronicle unlocked it now counts. The cutaway lessons ask
what the live cutaway shows, with the answer's position seeded.
Why: the quiz tested recall, never shuffled, and could be guessed until right.
To reverse: `src/chronicle/quiz.ts`.
Source: the plan, D19, items 7.2, 7.3; wave log 7a.

### D-105 · The chair is "Presidência"; a native reader is still owed · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
The workspace is "Autonomy" / "Autonomia" on every surface, the season is "Cooperative season" /
"Temporada cooperativa", and each charter title is defined once. The elected chair is
"Presidência", the law's own word; the role stays "Coordenação", which had named both.
Unfinished: no native Brazilian Portuguese reader has reviewed the cooperative vocabulary. The
plan's D20 stays open.
To reverse: the workplace catalogues.
Source: the plan, D20, item 5.8; wave log 2b, 5b.

### D-106 · A pace button ends only the player's own pause · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Any other hold on the clock (the tour, the layout planner, a failed restore, SCADA) refuses a
pace button and is named, as P already did. Two holds whose only way out was a pace button have
their own release: "Continue without the save" and "Resume the clock". A restore unfinished
after 60 s of wall time takes the failed-restore path, and the tick releases the SCADA hold
when the mode returns to simulation. The agent's pace command can still override a hold.
Why: one rule for both controls; a pace button was silently clearing other features' holds.
D-049 (`[Nell]`) stands: the sim starts ticking and a hold lasts only for its page. Its tests
had pinned the old pace-button behaviour; if Nell meant that, D-049 wins.
To reverse: the pace action in `src/stores/gameSimulationStore.ts`.
Source: the plan, D21; wave log "D15, D17, D21", plant tail.

### D-107 · A tie in the assembly carries a move off a red line or a condition's step · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
In part three's assembly a tied vote now carries a policy move off a red line (Any lot, Lean,
Spot) or off the step a standing condition needs left, and the record says why it carried.
Every other change still needs more votes for than against.
Why: over all 64 crews, 4 could be trapped on Lean stock by a 1 to 1 tie; now none can, and
Chronicle rule 4 calls a state with no way out a bug. Keyed only on a running warning, the same
crews stayed stuck once the village had acted, so the rule is wider than planned.
To reverse: the tie rule in `src/chronicle/governance.ts`; `governance.test.ts` pins it.
Correction (2026-11-14, review 2): a tie carries only when someone voted. An all-abstain 0-0
vote is no tie and carries nothing, because nobody chose the move; the 64-crew no-trap test
still finds no crew trapped. `governance.review2.test.ts` pins it.
Source: the plan, item 1.2; wave log 1a, 1a tail.

### D-108 · Achievements: Full Capacity's rule, deferrals, and achievements that point at the game · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Full Capacity is "production speed at 100% with every machine running and none in warning".
Decision Review counts deferrals, so no two achievements count one answer. "Interlock Proven"
is "Egress Verified", earned by the drill. Seven new ones: first on-time delivery, first A
shift, first programme accepted (the player's own acceptance only), first challenge, first hold
resolved, first season, charter signed. The list opens from More on phones.
Why: Full Capacity's load mark was out of reach (best whole-line load 72 at the 0.8 boot rate,
77 at 1.0, against 80), and nothing rewarded a delivery, a grade or the Chronicle.
Unfinished: an old save with a charter already signed keeps "charter signed" locked until the
next signing.
To reverse: `src/stores/achievementsStore.ts`.
Source: the plan, items 1.14, 2.3; wave log 1a, 2b, plant tail.

### D-109 · N, B, L and M open the commitment, the bell, Safety and the Chronicle; the Production dock entry is gone · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
N opens the shift commitment, B the bell, L Safety and M the Chronicle; M had been left unbound
on purpose. All four are listed in the help. Ctrl+B stays blueprint mode. The dock's Production
entry is removed: it opened the same panel as Overview, which is now the one entry.
D-050 and D-053 (`[Nell]`: Space, E, X, F) are untouched.
To reverse: `WORKSPACE_KEYS` in `src/hooks/useKeyboardShortcuts.ts`; the dock items.
Source: the plan, item 2.10; wave log 2b.

### D-110 · An order is forfeited 240 game minutes past due · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
An order still open 240 game minutes after it was due is forfeited: a fee of four hours of its
late rate on the kilograms it lacked, a review line that counts as a late delivery, one bell. A
forfeit always costs more than delivering late, and in the Chronicle it costs a customer what a
late close does. The tick computes the best stamp each grain allows and does not mill for an
order above it. A programme can be taken while an order is open (`commitment`, D-081).
Why: once the line could not make 95, the strong-white order stayed open, no programme was
offered and the plant stopped taking work, a state with no way out. Measured: the latest
delivery at doubled orders was 76 minutes late, at tripled 252.
To reverse: `FORFEIT_LATENESS_MINUTES` (`src/stores/operationsCampaignStore.ts`).
Source: wave log 3b, advisor (04:35), 3c, 4c.
Note, 2026-11-13 (review 2): one exception. While the truck at the dock is loading or ready with
flour of the order's product and no other open order of that product would take it, the
forfeit waits for that truck to leave (about 15 game minutes): the truck delivers to the order at
its late terms and only what is still lacking is forfeited. Before, the truck left with that
flour unpaid and its grain debited. A truck held at the dock does not hold the forfeit
(`truckLoadingFor`). Found by reading; no harness arm reached it. The wait is bounded by one dock
cycle past the bound (81 game minutes, `DOCK_PROJECTION.cycleMinutes`: a docked truck leaves before
the next is due); a truck still there then (a stop holds the dock) does not hold the forfeit, and
at its departure a load no open order takes stays in stock instead of leaving unpaid.

### D-111 · Lot genealogy is kept three game days, and the save is version 2 · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
A released lot received more than three game days ago merges into its grain's "earlier stock"
lot. Mass and balances are unchanged; held and recalled lots never merge; a hold on earlier
stock reaches the merged lots. So a recall or supplier notice can name a lot from the last three
game days, and anything older only as earlier stock. Lots are written compactly, and the save
is version 2: an older build refuses it, leaves it untouched, holds the shift and warns. A
refused autosave now rings a warning.
Why: autosave stops above 3,000,000 bytes, and the worst case reached that near game day 15.8
(a full chronicle is 21 days). Now: 519,356 bytes at shift 21 (815,160 before); 716K to 762K at
most over a chronicle, against a 750,000-byte budget.
To reverse: `GENEALOGY_RETENTION` (`src/stores/materialFlowStore.ts`).
Source: wave log "save", 3d.

### D-112 · The silos feed only the line's plan · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
With no order open the silos feed nothing and the line stands; with a plan each mill takes one
grain at a time. Stock is no longer built with no order open. Benchmarks keep the old open
valves.
Why: with no order open the silos fed both grains to every mill. At line rates 1.6 and 2.0 wheat
and corn mixed in one mill's input buffer and the packers filled with semolina nobody ordered,
which stalled the plant; the cause predates this work. Ten shifts at rate 2.0 now ship 203.5 t,
51 on time, ten A.
To reverse: `PLAN_ONLY_SILO_FEED = false` (`src/stores/materialFlowStore.ts`).
Source: wave log 3b (finding 1), 3c.

### D-113 · Grain has a price · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
Wheat costs 0.46 and corn 0.33 a kg, derived from USDA ERS tables updated 10 November 2026 (the
working is in the file), booked at intake with stock carried at cost. Grain, Parts and the
change in stock held show on the shift card and review, and the Chronicle's net reads them.
Why: the plant had no grain, labour or parts cost; all cost lines were 4 to 6% of revenue. Now
grain is 72.9% of revenue and every other line under 1.5%; no-input net is about 3,850 a shift
(about 14,760 before).
Unfinished: parts prices are game prices, unsourced.
To reverse: `GRAIN_PRICE_PER_KG` (`src/simulation/grainPrice.ts`).
Source: the plan, item 3.8; wave log 3b, 7b.

### D-114 · One line rate, and the roll-speed setpoint is that rate · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse. The plan left 7.5 to Nell.
The mill has one rate, the player's slider; the setpoint no longer multiplies it. Roll speed is
that rate: 0 to 2,000 RPM maps onto 0 to 200%, a write sets the rate through the slider's own
action and states the result ("Line rate now 120%... wear x1.22, energy x1.10", seen), and a
write outside the band is refused. Above 100% the line wears faster and uses more energy per
tonne. Roll-speed alarm limits are removed: they only reported where the slider was.
Why: the setpoint changed nothing and 200% always won. Measured: best net per tonne at 0.8
(201.7), with 0.8 to 1.2 within about 1%; total net peaks at 1.2.
To reverse: `src/scada/lineRateSetpoint.ts`; the roll-speed tags in `tagDatabase.ts`.
Source: the plan, items 3.6, 7.5; wave log 3b, 3c, 7b, plant tail.

### D-115 · Numbers no rule reads are removed; the layout planner sits behind More · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse. The plan left 7.8 and 7.9
to Nell.
Removed: the multi-objective dashboard's 250 kW target, carbon objective and row, 98% quality
target and blended score, and both utility-vessel displays (the vessels in the world stay).
Connected instead: quality against the line order's minimum, energy against the bill's tariff.
The certificate's state is shown nowhere and set by nothing outside tests. The layout planner
is an engineering tool opened from More; closing it releases its pause.
Why: nothing on screen should be a number that no rule reads, and a normal plant always missed
those targets.
To reverse: `src/components/ui/MultiObjectiveDashboard.tsx` and the More menu, from the history.
Source: the plan, items 7.8, 7.9; wave log 7b.

### D-116 · SCADA tags can go uncertain; alarm priority follows consequence · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse.
During the network incident about a quarter of read-only tags read UNCERTAIN and hold their
last value, the same seeded subset for the same incident, clearing when it resolves; never in
benchmarks. An uncertain reading cannot raise an alarm, and in simulation mode the plant reads
the real value under a held tag. A trip on a tag that endangers people is CRITICAL and its
warning HIGH; on a tag that stops the plant, HIGH and MEDIUM; on anything else, MEDIUM and LOW.
Every alarm had been HIGH or CRITICAL. The HUD bell rings for every alarm on a people or plant
tag; process alarms stay on the SCADA panel.
Why: the history note already claimed uncertain tags, and an alarm list that is all urgent
teaches nothing.
To reverse: `tagAlarmConsequence` (`src/scada/tagDatabase.ts`), `alarmPriorityFor`
(`AlarmManager.ts`).
Source: the plan, item 7.4; wave log 7a, plant tail.

### D-117 · Tempering is a card the partner runs · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12),
which ruled on nothing singly; Nell's to confirm or reverse. The plan left 7.7 to Nell.
Once a shift, under a charter, when the wheat about to be milled reads wet, a card offers
"Temper as it comes" (the year's 5 points) or "Dry first, then temper" (no points, at the
drying's energy, about 50 to 95 a shift, after the 2-hour rest). The partner dries and says so.
The Chronicle's flat wet-year payment is gone; the wet-intake event keeps its id and answers,
which make drying free or half price for three shifts.
Why: drying won 114 comparisons of 114. Wet year, ten shifts: never dry, 0 of 16 strong-white
orders made, net 15,822; always dry, 16 of 19, net 41,105. Figures are Kansas State MF-2353's
only. No dry-year card: a dry year has no penalty.
Unfinished: attentive players sit at 0.0079 a kg against Grid Winter's 0.008 cap, so drying in
a wet Grid Winter would break it.
To reverse: `temper` in `DELEGATION_EVIDENCE`; `src/chronicle/temper.ts`.
Source: wave log 7c.

### D-118 · The plan's own measures: met, not met, not measured · [proposed] · 2026-11-13

Made under Nell's "Proceed please, fix everything, and another pass please." (2026-11-12); Nell
ruled on no single decision, so this record is Nell's to read against the plan's targets.
As of 13 November, 16:30 GMT, against the plan's "How we will know it worked". No stranger
session was run, so every measure that needs a play-tester is unmeasured.
- Met: a no-input run still delivers (ten shifts, 52 on time, none late, ten A; produced by
  `npm run playtest:plant -- --suite=partner`, arm p, not the plain command, note of 13
  November, review 2); under 150
  words before the first cooperative decision (12 idle, 101 at a season's start, 117 at most;
  Portuguese 14, 113, 133); an idle player ranks in the Chronicle's lowest two.
- Not met, pending the final Chronicle run: answering every decision adds at least 25 points
  (attentive minus idle 19 and 21 on the two lengths); full-length Wet Harvest gold for the
  skilled player (3 of 8 seeds); one full-length buyer's fund ends at 1,481 against a 1,380 cap.
- Not measured: decisions per ten minutes at 1x; skilled play against the partner over 20
  programmes (nearest: taking a programme early when no order is at risk nets 16% more than
  never, but the partner now does it); a first decision within 3 real minutes; naming the goal
  with the guide closed; Chronicle decisions per real hour; every stated fact sourced.
- Built, partly seen: the HUD result of a fulfilled order (seen; its sound not heard); lab
  readings beside their limits (falling number only under a charter, not yet seen).
Source: wave log "probe", 4c, 3d, 5b, fix.
Correction (2026-11-14, review 2): on the final probe the Wet Harvest gold for the skilled
player and the buyer's fund cap are met in both card modes; the 25-point measure is still not
met (figures in `docs/CHRONICLE.md`, "Measured tuning (2026-11-13)").
Correction (2026-11-14, review 2): an idle player wins trial medals (silver, once bronze) and
no tonnage takes them away without taking the attentive player's: the plant is dock-bound
(D-082), answering the cards does not raise tonnage, so a tonnage medal cannot tell an
attentive player from the partner's defaults. Kg at silver's shift, seeds 101 to 108 (s
silver, b bronze, f failed; final probe, cards asked, then left):
  short Wet Harvest, shift 4: idle 90.5s 90.5s 90.5s 90.5s 80.5s 90.5s 87.5s 90.5s; attentive
  90.5s 90.5s 90.5s 90.5s 90.5s 90.5s 82.5s 90.5s, left the same but 87.5s for seed 107.
  short Bakers' Rush, shift 4: idle 59.5f 84.5s 58.5f 84.5s 74s 84.5s 64.5f 59.5f; attentive
  79.5s in every seed, left 85.1s 84.5s 79.5s 84.5s 84.5s 84.5s 79.5s 84.7s.
  full Wet Harvest, shift 6: idle 127.5s 57.5f 104f 127.5s 114b 127.5s 45.9f 83.5f; attentive
  127.5s in all but 132.5s (106) and 127s (107), left 127.5s in every seed.
The trials were left as they are; the probe's gate stays "the idle player wins no gold".
