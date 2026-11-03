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
