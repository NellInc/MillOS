# MillOS mechanics mastery, 12 November 2026

A review of every game mechanic that ships, and a plan to make them correct,
fun, engaging and educational. Written by Claude Fable 5.2 for Nell. All
implementation under this plan is done by Opus 5.5 agents (`model: opus`,
`effort: high`), as Nell asked.

**Status: local only, not live. No product source was changed.** The additions
are this file, `docs/reviews/mechanics-20261112/` (the ten reports, the play
ledger, the probe's data and the tools) and, git-ignored and local to this
machine, `output/mechanics-review-20261112/` (nine screenshots and the
reachability listing).

## How the review was done

| Source | What it gave | Where |
|---|---|---|
| Ten read-only Opus 5.5 reviewers, one per area, on a frozen snapshot of `ffe9e70e`, each answering the same eight-point rubric with file and line for every claim | About 190 mechanic rows, 110 findings, 90 defects and 80 proposals | `docs/reviews/mechanics-20261112/reports/01` to `10` |
| One headless play session from a cold start, 13 minutes, acting only on what was on screen | What a stranger meets in the first 13.5 game hours | `docs/reviews/mechanics-20261112/playtest-ledger.md`; shots in `output/mechanics-review-20261112/playtest/shots/` |
| A seeded Chronicle balance probe: whole 63-shift chronicles on the real engine, with shipped kg, grades and one lab pass a shift fed in as inputs | How the fund, the eras and the score respond to a given tonnage. It cannot show what a player's choices do to the plant | `docs/reviews/mechanics-20261112/balance/`, probe in `.../tools/` |
| My own reading of the eleven claims the plan leans on most | Each marked **Checked** below. It means I read the cited lines or saw it in the play session, not that a test reproduced it | this file |

Only shipped code was reviewed: 761 of 844 modules reach the browser
(`output/mechanics-review-20261112/reachability-ffe9e70e.txt`). The October
play-test's ten findings were re-checked: three fixed with tests, four partly
fixed, one still there (unread notices), one fixed in code only, one never a
defect (report 09, Q3).

Limits. Nothing below was measured for frame rate or real-time pacing: the
machine ran at a load of 375 to 600 on 10 cores all session, with no idle CPU.
The reviewers read and did not run, so their runtime claims are tagged
`[Unverified]` in the reports unless a test pins them. No whole-gate baseline
was taken, for the same reason (see "Running it").

---

## Decisions for Nell

These are the calls that change what a mechanic is, or touch a `[Nell]` entry.
Everything else in the plan can proceed without them. The five marked **first**
unblock the most work.

| # | Decision | Recommendation |
|---|---|---|
| D1 **first** | **Is the plant floor watched or played?** Today the controller makes every call and makes it well: with no input every order ships on time. | **Played, through the partner.** The partner proposes each floor decision with its price on the button; you take it, change it or let it stand. Unanswered, the partner's choice runs, so the plant never stalls and benchmarks see no change. See "The idea". |
| D2 **first** | Which floor decisions come first. | Four: **intake** (accept, blend or refuse a lot on its readings), **maintenance window** (service now, in the dispatch wait, or run on), **dispatch by grade** (off-spec stock is held and may fill a lower spec), **two costed answers per incident**. Later: mill setting and extraction, a changeover cost for the rush, a price for grain. |
| D3 **first** | The Chronicle is tuned for a pace that no longer exists. Re-tune it on the plant as measured at pace 30, and offer a short chronicle. | Yes to both. 63 shifts is 16.8 real hours at 1x; offer 27 shifts (about 7 hours) beside it. |
| D4 **first** | The cooperative season starts itself at the tour's end (your 4 October direction) and slows the line to 78% for three shifts. | Start it after the first delivery is fulfilled, and make the steady plan 1.0, so cooperation is never the slow option. |
| D5 **first** | In solo play the player casts every member's ballot. | The player is one role. The others vote from their stated values, as the Chronicle crew already do. Refusals then happen to the player. |
| D6 | A load that fails its recipe still earns full revenue, less 0.08 a kg. | A failing load is held at the dock. It can be retested, recalled or sent to an order with a lower minimum. |
| D7 | Maintain is a 1.2 second timer that never stops the unit. | Servicing takes the unit offline for a time on the game clock. |
| D8 | Improvement plans cost more than they save: savings reach the fund at 4.5%. | Plans pay in what they save, and open better options on the floor (meters show lot readings, bins allow blending). |
| D9 | The federation's administrator locks a member co-op's policies, against the game's own Mondragon note and the ICA's fourth principle. | Recast it as support the assembly can accept or refuse at a cost to the relationship. Keep the ratchet. |
| D10 | Desks of attention never bind (about nine council costs in 63 shifts against a refill of one a shift). | Cut them, unless the Phase 4 probe shows a setting where they bind. |
| D11 | The HUD's daily bag target (1,200 bags) counts stock nobody ordered and competes with the customer's kilograms. | Replace it with the programme's committed tonnes. |
| D12 | A driven forklift passes through people, and its loads count for nothing (D-060). | It gives way as the autopilot does (slows at 6 m, stops at 3.5 m), and a pallet the player moves counts as the trip it replaces. |
| D13 | CLEAR EMERGENCY restarts every machine at once. | Reset, then a separate Restart line. The machinery-safety standards are reported to require this (ISO 13850, IEC 60204-1, from secondary sources `[Unverified]`); read the clause first. |
| D14 | Where D-012 ends. Dozens of strings are helper text by its wording (listed in reports 02, 03, 04, 06, 09 and 10): hints under controls, disclaimers, loading quotes, narration cards, `title` tooltips. | Cut all but error text on a refused action and one line in About. Replace the invented loading quotes with sourced one-line facts, or cut them. |
| D15 | Muting hides the PA's captions as well as its sound, by design (CLAUDE.md, "React State Synchronization Patterns"). | Mute silences sound only. |
| D16 | Walking is 12 m/s and sprinting 43 m/s beside colleagues at 1.25. Each forklift's "Efficiency %" reads as a number about its one operator and falls every time it gives way. The town hall ramp (two 4.8 m flights at 1:12, 1.3 m wide) may not meet Approved Document M. | Near-real walking inside the hall. Cut the efficiency figure. Check the ramp against the document and fix or reword. |
| D17 | "Community Pasta Works" orders semolina milled from corn. Pasta semolina is durum wheat. | Rename the customer (polenta or cornmeal), or switch the grain, after a source check. |
| D18 | Sobras are sent whole to one destination, split equally, every shift. By report 05's recollection `[Unverified]`, Brazilian co-operative law takes reserves first and returns the rest in proportion to each member's work, once a year. | Read Lei 5.764/71, then model it on what it says. |
| D19 | The quiz tests recall, never shuffles and can be guessed until right. | Build questions from the player's own record; first attempt only; seeded shuffle. |
| D20 | Carried from October: a native Brazilian reader for the cooperative vocabulary. | Still needed. It now also covers "coordenação", which names both a role and the elected chair. |
| D21 | A pace button clears every other feature's hold on the clock (tour, layout, failed restore); P names the hold and refuses. A test pins this, and D-049 is yours. | One rule for both: name the hold and refuse. |

Two things need your hand rather than your judgement: items that touch
`src/hooks/*` need Nell's approval first (marked **hooks**
below, four items), and new `docs/DECISIONS.md` ids must be allocated on `main`
at merge, because another session holds uncommitted entries there.

---

## The finding

MillOS is an honest simulation with good writing, and at `ffe9e70e` it is closer
to a film than a game. Almost everywhere, the player's choice is missing, has
one right answer, or changes nothing that anything reads.

### What is strong and must be kept

1. **The ledger is honest.** Orders are credited only from sealed, released
   batches on a departed manifest, never twice (report 02). Mass is conserved
   and traceable lot to batch (03).
2. **One time model.** Every pace keeps the first programme on time, pinned by
   test (01).
3. **The shift review is causal**: per-order outcomes, the reason, the gap to
   the next letter and one thing to try (02).
4. **The Chronicle's rules are fair**: seeded chance, the price on the button,
   free defaults, and a way out of every state but one (07, 08).
5. **Debts and recurrences land.** A broken promise costs more than refusing
   would have, and the letter names it (08).
6. **Crop years make grain chemistry matter**, and dust and neglect cause fires
   (07, 10). These are the two places where play already teaches.
7. **The autopilot forklifts model safe practice**: slow at 6 m, stop at 3.5 m,
   more room for a wheelchair or a cane, forks down when parked (04).
8. **The alarm model follows ISA-18.2**, the grounded adviser abstains rather
   than guesses, and the matched replay is a real counterfactual (03, 05).
9. **The agreed-adjustments register** names what was asked and by whom, never
   a condition and never a number (04).
10. **The history notes are carefully written**; 28 of 34 checked facts stand,
    four need correcting and two are unconfirmed (10).

### What is wrong, in eight lines

1. **The plant plays itself.** With no input every order ships on time and
   later programmes finish 20 game minutes early (02, pinned by
   `UnifiedGameTick.playableJourney.test.ts`). In play the game first
   needed me about seven game hours in. **Checked** by play.
2. **The levers that exist are free, dominated or inert.** Maintain is a 1.2 second
   timer (**Checked**) that by report 01's reading costs no downtime, and parts
   never run short. The line rate is in
   Settings and 200% always wins (01). Deferring the rush always loses (02).
   Mitigating an incident is free (02). A retest returns the same letter (03).
   The one SCADA setpoint changes nothing (03). Trucks take no input (03).
   Speed zones cost and gain nothing (04). A driven forklift moves nothing (04).
3. **Success is silent.** A fulfilled order writes a log row and nothing else
   (**Checked**, `operationsCampaignStore.ts:2466-2496`). Achievements and
   milestones go to a queue nothing reads (**Checked**: no reader exists).
4. **The layers do not hand the player on.** The goal leaves the screen when
   the guide closes. Nothing mentions the Chronicle. No achievement rewards a
   delivery, a grade, the season or the Chronicle (09). **Checked** by play.
5. **The Chronicle's balance is stale.** It was tuned at 180x; standard is 30
   (**Checked**, `simulation/pace.ts:20`), so 63 shifts is 16.8 real hours at
   1x. Report 07 argues from the code that at today's throughput every tonnage
   target falls in a shift or two and the fund goes unspent `[Unverified]`:
   nobody has measured the plant since the pace changed. Passing a lab test
   pays know-how and certifier standing with no limit (**Checked**,
   `engine.ts:736-750`, `OverviewPanel.tsx:643`). With the plant held fixed,
   answering every decision adds only 9 to 15 of the 60 points (probe).
6. **The teaching sits beside the play.** The lab computes moisture, protein
   and falling number and shows a letter (**Checked**). Datalinks explains the
   simulator, not milling. The plant's AI cards raise "confidence" when you
   agree and do nothing when accepted (10).
7. **Some of what it teaches is wrong.** Off-spec flour pays (**Checked**,
   `operationsCampaignStore.ts:2456-2463`). A contaminated supply keeps
   shipping (02, 03). Resetting an emergency stop restarts the plant (04).
   Raising an objection or running the drill mid-shift forfeits the season (05).
8. **The cooperative is a reading exercise.** About 550 words on first open and
   18 clicks to a first shift. The player votes for everyone, and each refusal
   is announced on its own button: "(blocked)". Every plan slows the line
   (**Checked**: 0.78, 0.90, 0.98) and nothing reads the season's result (05, 06).

### What the balance probe can and cannot say

The probe runs whole chronicles on the real engine, but the plant is not in the
loop: shipped kg, shift grades and one passed lab test a shift are fed in. So
it shows how the Chronicle's own books respond to a given tonnage, and nothing
about what a player's choices do to the plant. Three things it seemed to show
are true by construction and are not findings: that medals ignore player style,
that an idle player ranks well, and that the hard charter costs nothing.

What it does show, for a player who buys every plan they can, against one who
buys nothing (beginner charter; 120 seeds in the first row pair, 20 in the
others):

| Tonnage fed in | Player | Era reached | Plans installed | Fund at end | Lowest fund | Score of 60 |
|---|---|---|---|---|---|---|
| 3,000 kg every shift, grade A | buys nothing | Village | 0 | 6,397 | 384 | 26 |
| 3,000 kg every shift, grade A | buys all | Federated | 13 | 2,156 | 294 | 38 |
| 5,000 kg every second shift | buys nothing | Village | 0 | 3,253 | 294 | 16 |
| 5,000 kg every second shift | buys all | Regional, mostly | 11 | 312 | about 1 | 25 |
| 5,000 kg every shift | buys nothing | Village | 0 | 7,279 | 396 | 24 |
| 5,000 kg every shift | buys all | Federated | 13 | 3,195 | 310 | 37 |

1. **The economy binds at the tonnage it was tuned on and nowhere above it.**
   At 5 t every second shift the buyer's fund touches zero and austerity comes
   in 19 of 20 runs. At 5 t a shift it ends with about 3,000 unspent.
2. **The Chronicle's own decisions are worth 9 to 15 points of 60** with the
   plant held fixed. The rest of the score follows tonnage.
3. **Something happens most shifts.** About 40 events a chronicle, 5 to 8 quiet
   shifts of 63, the longest quiet run about 2. At 16 real minutes a shift that
   is still one decision every 20 minutes or so at 1x.
4. **Six of 39 events were never drawn** by these simple players. They need
   marks or a suspension the players never reached; that is not a defect.

Trial medals in the probe are arithmetic on the tonnage fed in, and its Grid
Winter result rests on energy figures I assumed, so neither is reported.

---

## The idea

**The partner proposes; you decide; the record shows who was right.**

MillOS already has every part of this and uses them for nothing:

- The AI Command Center files a decision card every six seconds with Accept,
  Defer and Reject. Accepting most cards does nothing (report 10, F3).
- The shift review already separates what the operator chose from what the
  controller chose (02).
- The Chronicle already has delegation levels, halved know-how for delegated
  decisions, and reversible initiatives (07, 10).
- The controller already makes every floor decision, so there is a sound
  default for each.

So the floor decisions become the cards. Each one arrives where it happens, at
the dock, the mill or the truck, as the partner's proposal with its cost on the
button and at least one other answer. Left alone it runs as proposed. An hour
later the record says what it cost and what the other answer would have cost.

This gives the plant a game without taking away the film. A new player can
watch and still deliver. A player who knows that a sprouted lot wants blending,
or that the dispatch wait is a free maintenance window, beats the partner and
sees it in the margin. Trust is taught by doing: you hand a lever over when the
partner has earned it there, and take it back when it has not. Plans in the
Chronicle then pay through the floor: meters show a lot's readings, bins make
blending possible, monitoring warns earlier.

It respects every standing rule. Costs on buttons are effect text, not helper
text (D-012). Nothing is created (D-007). Nothing scores a person (D-008).
Benchmark mode holds the game clock, so its frames do not change; where a rule
changes (3.3 to 3.6), the journey tests that pin today's timings are re-pinned
once, and a no-input run must still deliver every order on time.

If D1 is "watched", the plan still holds: Phases 0 to 2 and most of 4 to 7
stand, Phase 3 shrinks to its teaching fixes, and the Chronicle and the
cooperative carry the play.

---

## Every mechanic, with a verdict

Verdicts: **keep**, **tune**, **rework**, **connect** (it works but nothing
reads it), **cut**. "Plan" names the item that acts on it.

### Plant and time (report 01)

| Mechanic | Verdict | Plan |
|---|---|---|
| Pace: pause, 1/2x, 1x, 2x, 4x | keep | D21 |
| Line rate 0 to 200%, in Settings | rework | 3.6 |
| Automatic line setpoint | connect | 3.6 |
| Maintain, routine service | rework | 1.4, 3.3 |
| Schedule and complete a predicted service | rework | 1.4 |
| Repair work order: start, verify, restart | keep | |
| Restart a tripped or idle unit | keep | 1.5 |
| Parts stock and restock | tune | 3.3 |
| Wear warnings and predictions | tune | 1.4, 1.5 |
| Daily bag target and milestones | rework | 2.5, 2.2 |
| Throughput and line-state chips | keep | |
| Machine flow state: starved, blocked | keep | |
| Energy dashboard and tariff | connect | 7.6 |
| Weather buttons in the Safety panel | cut or move | 6.8 |
| Grain receiving | connect | 3.1 |
| Clock holds, ten holders | tune | D21 |

### Operations campaign and the shift (02)

| Mechanic | Verdict | Plan |
|---|---|---|
| Guided first programme, three fixed orders | tune | 2.1, 3.1 |
| Choosing the active commitment | rework | 3.4 |
| Accepting the next programme | tune | 2.4 |
| Rush order | rework | 3.7 |
| Recipes | rework | 3.4 |
| Constraints, "Blocked" and "Attention" lines | tune | 1.7 |
| Next-action button | keep | |
| Incident lifecycle | rework | 3.5 |
| Recovery challenges | rework | 3.5 |
| Failure-cost rates | keep | |
| Economics ledger | connect | 3.8, 7.6 |
| Utility vessels | cut or connect | 7.9 |
| Shift grade | tune | 1.7 |
| Shift debrief and provisional report | keep | 7.6 |
| Decisions log | keep | 3.0 |
| 3D incident beacons | keep | |
| Multi-objective dashboard | connect or cut | 7.9 |
| Plant readiness index | rework as OEE | 7.6 |

### Lab, trucks, planner, inspection, SCADA (03)

| Mechanic | Verdict | Plan |
|---|---|---|
| Test batch | rework | 1.1, 1.8, 3.2 |
| Place hold | tune | 3.4 |
| Retest and release | rework | 3.2 |
| Recall | keep | |
| Trace batch, genealogy balance | keep | |
| Supplier contamination response | rework | 1.9 |
| Dispatch quality interlock | connect | 3.4 |
| Certification status | cut or connect | 7.9 |
| Truck cadence, delay, demurrage | rework | 3.4 |
| Forklift blocking a truck | keep | 1.16 |
| Layout planner | rework | 7.8 |
| Process inspection cutaways and questions | rework | 7.2 |
| SCADA alarm acknowledge, shelve, suppress | connect | 7.4 |
| SCADA setpoint, mill roll speed | rework | 7.5 |
| SCADA trends, events, export, locate | keep | |
| SCADA fault lab | rework | 7.4 |

### Walking, driving, the world, safety (04)

| Mechanic | Verdict | Plan |
|---|---|---|
| Walk, sprint, jump in first person | tune | 6.6 |
| Climb a silo ladder | cut or connect | 6.9 |
| Ring the school bell | keep | |
| Board and drive a forklift | rework | 6.1, 6.2 |
| Raise and lower forks | rework | 6.2 |
| Displace a crewed operator; lane return | keep | |
| Stand in a forklift's path | connect | 6.1 |
| Farm windmill lesson; henhouse inspection | connect | 6.5 |
| Animals and ducks | keep | |
| Forklift-only stop (X) | tune | 1.17 |
| Facility emergency stop | rework | 6.3 |
| Egress verification drill | rework | 6.4 |
| Speed zones | connect | 6.7 |
| Safety config sliders, analytics, heat map | tune | 6.7 |
| Mini-map | tune | 6.9 |
| Blueprint mode | keep | |
| Phone walk and drive | tune | 1.17 |
| Agreed adjustments (D-058) | connect | 6.5 |

### The cooperative (05, 06)

| Mechanic | Verdict | Plan |
|---|---|---|
| Charter: coordinator-led, team, member governance | keep, rename | 5.8 |
| Configure terms | tune | 5.1 |
| Plan choice: steady, resequence, cover, rush | rework | 5.4, 5.6 |
| Understanding checks, ballot, cover consent | rework | 5.2, 5.3 |
| Authored peers, who always approve | rework | 5.3 |
| Pressure cards | rework | 5.3 |
| Episode decisions: Friday, Monday, Thursday | rework | 5.3, 5.7 |
| Objection, resolved by its raiser | keep | 5.2 |
| Activate, withdraw, stop, tick | keep | 1.10 |
| Chair election | cut or connect | 5.9 |
| Sobras vote and distribution | rework | 5.5 |
| Season flow: next, leave, archive, resume | keep | 5.10 |
| Customer commitment credit | keep | |
| Handoff experiment and episodes | connect | 5.9 |
| Grounded adviser | keep, extend | 5.6 |
| Autonomous season; take over, hand back | rework | 2.6, 5.10 |
| Separate turns; matched replay; pilot export | keep | 5.1 |
| Ten-minute guide; companion card | rework | 5.1 |
| People in the scene showing rest, cover, recovery | keep, expand | 5.11 |

### The Chronicle (07, 08)

| Mechanic | Verdict | Plan |
|---|---|---|
| Charter | rework | 2.7, 4.2 |
| Crop year; direct treatment | tune | 4.6, 4.9 |
| Eras | tune | 4.1 |
| Plan and install | rework | 4.3 |
| Upkeep shortfall; voluntary austerity; duct fire | tune | 4.1 |
| Contractors | rework | 4.9 |
| Forecasts and paid mitigation | tune | 4.4 |
| Authored events, part one (20) | tune | 4.4 |
| Customer relationships | connect or cut | 4.9 |
| Trials (5) | rework | 4.1, 4.5 |
| Challenge medals; training mode | tune, keep | 4.1 |
| Delegation 0 to 3; partner's brief | tune | 4.7 |
| Notes and quiz | rework | 7.3 |
| Lab pass credit | fix | 1.1 |
| Score and rank | tune | 4.1 |
| Marks and the record; debts and recurrences | keep | |
| Echoes and variants ("Because...") | connect | 1.3 |
| Choices the record rules out | rework | 1.3 |
| Standby cover; errands | tune | 2.8 |
| Arbitration; valley meeting; bigger offers | keep | 4.4 |
| Cleaning log, suspension, audit | tune | 4.9 |
| Four organisations | connect | 1.3 |
| Certifier standing | tune | 1.1 |
| Desks of attention | cut or rework | 4.8 |
| Long night | rework | 2.8 |
| Character and epilogue | keep | |
| Policy ladders | rework | 1.2, 2.9 |
| Crew and assembly | rework | 1.2, 4.10 |
| Standing conditions; red lines | keep, tune | 1.2 |
| Return and ratchet | keep | |
| Co-op reserve | rework | 4.8 |
| Administrator | tune | 4.11 |
| Eight tabs, overview, decision dialog | rework | 2.9 |

### Onboarding, goals, rewards (09)

| Mechanic | Verdict | Plan |
|---|---|---|
| Three-card tour | tune | 2.1 |
| Guided first delivery | rework | 3.1 |
| Shift commitment card | connect | 2.1, 2.4 |
| Shift debrief; accept next programme | keep | 2.4 |
| Achievements | rework | 2.3 |
| PA captions and voice | keep | D15 |
| Bell notifications | tune | 1.17, 2.2 |
| Clock-holder chip | keep | 1.17 |
| Keyboard shortcuts and help | tune | 2.10 |
| Dock, seven items and More | tune | 2.10 |
| Returning player | rework | 2.5 |

### The seams between layers, and the places beyond the mill (04, 09)

| Mechanic | Verdict | Plan |
|---|---|---|
| Tour to first delivery | keep | |
| First delivery to free running | connect | 2.1, 2.2 |
| Operations campaign to cooperative season | rework | 2.6 |
| Any layer to the Chronicle | connect | 2.4, 2.7 |
| One session to the next | rework | 2.5 |
| Cooperative season to the Chronicle record | connect | 5.10 |
| Village, castle, canal and its finds, Riverside station, taco truck, lake, bus: scenery with nothing to do | connect | 6.5 |

### Learning and the AI partner (10)

| Mechanic | Verdict | Plan |
|---|---|---|
| Datalinks reference | rework | 7.1 |
| History notes | keep, connect | 1.12 |
| Learning note in onboarding | keep | 7.1 |
| Windmill cutaway | tune | 6.5 |
| AI narration cards; loading quotes | cut or rewrite | D14 |
| Rules-layer decision cards | rework | 1.11, 3.0 |
| Automatic alarm reactions | needs Nell | 3.0 |
| Decision evidence replay | tune | 3.0 |
| Strategic layer priorities | connect | 3.0 |
| Lights-out on-device operator | keep | |
| Jev incident routing | keep | |
| Agent cockpit: preview, approve, commit | keep | |
| Reverse an initiative | keep | |

---

## The plan

Sizes: **S** under a day, **M** days, **L** a week or more. **Safe** means it
needs no decision. Each item names its evidence as report and section.

### Phase 0: ground truth (do first; S)

| Item | Change | Working if |
|---|---|---|
| 0.1 Baseline | In the worktree, on a quiet machine: `npm run typecheck`, `lint`, `test`, `format:check`, `build`, `validate:reachability`, `validate:community`. Record pass and fail counts and the names of failing tests in this file. | The counts and names are written here before the first product edit. |
| 0.2 Measure the plant | A store-level script (no browser) that runs ten shifts at pace 30 with each programme accepted when offered, and again with none accepted, and writes kg shipped, net, energy cost and grade per shift. | Two tables in this file. Every later tuning number cites them. |
| 0.3 Keep the probe | Add `docs/reviews/mechanics-20261112/tools/chronicleBalanceProbe.playtest.ts.txt` (archived; renamed 2026-11-14 so no runner picks it up) to `src/chronicle/__tests__/`. It already skips unless `MILLOS_BALANCE_OUT` is set. Feed it 0.2's throughput. | `npm test` time is unchanged; the probe runs on request in under a minute at 20 seeds. |
| 0.4 Keep the play tools | Move `tools/play-host.mjs` and `play-step.mjs` into `scripts/` as `playtest:stranger`. They hold the primary checkout's capture lock and stop themselves after a set hold. | A stranger session can be run and stepped from the shell with no window opening. |

### Phase 1: defects and false teaching (safe; mostly S)

Each fix starts with a failing test on the real path.

| Item | Change | Working if | Old contract | Evidence |
|---|---|---|---|---|
| 1.1 Lab credit farm | In `closeShift` (`chronicle/engine.ts:736-750`), credit at most one pass per batch per shift for know-how and standing. | Twenty Test presses on one batch add 1 know-how and 0.08 standing. | Saved `seenQcTestIds`. | 03 D1, 07 F4. **Checked** |
| 1.2 A policy can trap | Enumerate all 64 crews. A move that heeds a running red line or clears a standing condition carries on a tie. | A test over every crew: every red-line rung and every condition-raising rung can be left. | `governance.test.ts:183` ("a tie does not carry") changes for these moves only. Chronicle rule 4 already calls a state with no way out a bug. | 08 D1 |
| 1.3 Cause reaches the player | The decision dialog prints an echo's and a variant's "Because" line. Result notices carry the changes they made. Each organisation shows its last three changes and the 34 and 67 thresholds. A choice the record ruled out shows as gone, with its reason. | `steward.test` asserts a notice containing "growers -10"; the valley meeting dialog shows its because line. | `presentation.ts` translates notices by exact English match: new templates, and old saves still translate. | 08 F2, D3. **Checked** |
| 1.4 Maintenance prediction and price | A wear crossing predicts the failure it will have (`inferBreakdownType`). A booked service costs what Maintain costs. The scheduled time is used or removed. | New cases in `UnifiedGameTick.maintenance.test.ts`: "predicts the type it breaks with", "a booked service costs what Maintain costs". | Saved `maintenanceSchedule.partsNeeded`; `breakdown` agent commands. | 01 D1 to D3 |
| 1.5 Wear notice goes to the unit | "Open repair" on a wear notice selects the machine and focuses Maintain. Restart readings come from the seeded generator, not `Math.random`. | A `StatusHUD` test where a wear notice opens the Inspector. | `openRepairWorkspace` callers; `PlayableShift.repairRoute.test.tsx`. | 01 F4, D7 |
| 1.6 Player lab actions are the player's | Lab actions taken by the player are logged as the operator, not "Autonomous QC controller". | The shift review lists a player's test under operator choices. | Log rows in saves keep their old source. | 03 D6. **Checked** |
| 1.7 Graded down by the clock | "Commitment due soon" stops counting as a carried risk. | An on-schedule order due 30 minutes after the close still allows an A. | Saved reports keep their letter. | 02 F7 |
| 1.8 The lab shows what it measures | Add `fallingNumber` to the test result. Show moisture, protein and falling number on each test and each receiving lot, beside the limit of the order it would serve. | A sprouted-year test shows a falling number under 250; the falling-number history note is now true. | Saved `testHistory` (optional field, plus a fixture); SCADA quality tags; both languages. | 03 F1, 10 F2. **Checked** |
| 1.9 Contamination holds its lots | The supplier incident names the source lots in the silos when it is raised, so flour milled from them forms on hold. | A batch packed from a held lot stays held until the alert is released or recalled, and closing the alert frees it. | Open alerts in saves; the Chronicle restore path. Confirm the release path first: a stuck hold would break rule 4. | 02 F5, 03 F3 |
| 1.10 Voice and safety cost the season nothing | A shift ended by an emergency, a drill, or an objection since resolved, resumes as a reload-interrupted shift does. | `workplaceAutoplay.pass4.test.tsx` asserts "honoured" after a drill and a resume. | Saves holding the emergency `reviewReason`. | 05 F3 |
| 1.11 Honest AI cards | Remove the CPU and MEM tiles (invented numbers). Confidence stops moving with accept and reject. A maintenance card that opens no work order says what accepting does. | An engine test: confidence is unchanged by ten rejections. | Agent `decision.respond`; saved `aiDecisions`. | 10 F3, D3 to D5 |
| 1.12 Four facts | Buffalo's elevators ("by the mid-1850s"), Glushkov's warning (a fortyfold growth in planning staff by 1980), the cotton-bag booklet ("in the 1930s"), and Cybersyn's dates and figures (cite Medina or soften). Align the Portuguese sacks note with the English. Verify each against the raw source before editing. | A source line beside each corrected fact in `chronicle/history.ts`. | Both catalogues; quiz questions that quote the old wording. | 10 Q3 |
| 1.13 Stale statements | `docs/CHRONICLE.md`: 2.8 hours and 180x, "a shift with no truck is graded F", relationships weighting events, English-only copy. Code comments in `pace.ts`, `UnifiedGameTick.ts`, `forkliftDriveStore.ts`, `MiniMap.tsx`, `WorkplaceReplay.tsx`, `operationsPlay.ts`. D-009 needs a superseding entry, allocated on `main`. | The doc gives 16.8 hours at 1x and 4.2 at 4x. | None. | 07 D2, D8; 08 D5; 01 D8; 04 D10 |
| 1.14 Achievements that cannot be earned or misname | "Full Capacity" needs every machine at 90 load; the default rate gives 80. "Interlock Proven" is earned by the egress drill. Two achievements count one action. **hooks** | Each is earnable in a default session and says what earned it. | Saved achievements list. | 09 D2 to D4 |
| 1.15 Copy that points nowhere | The season's end says "rehearse safe reload"; the review's advice names a recipe target Overview does not show; "Skip guide and run fictional demo" is the hand-back; the shift card says "Check remaining incident effects in SCADA" when the restore is in the Chronicle. | Each line names a control that exists. | Both catalogues. | 05 F9, 06 D8, D9; 02 D3, D5 |
| 1.16 A held truck says why | A truck stopped by a parked or driven forklift raises a notice naming the forklift. | Driving FLT01 into the truck's approach produces the notice. | None persisted. | 04 D3 |
| 1.17 Phones | A bell and a held-clock chip in the compact overlay. A forklift stop in the Safety panel. The bell rings, and a ladder climbs, in first person on a phone. **hooks** for the stop key path. | A compact-layout test finds the bell and the chip; a mobile test sets the forklift stop. | Touch tests of the D-pad. | 09 F8, 04 F8 |
| 1.18 Helper text, the clear cases | Remove subtitles, hints under controls and `title` tooltips where the screen stands without them: planner notes, setpoint helper, fault-lab banner, drill description, safety-config help lines, Datalinks and Autonomy subtitles. Screenshot each surface before and after, headless. The cases that need D14 wait. | No caption under any control on those surfaces, and each still reads in a screenshot. | Both catalogues; tests that find text by those strings. | 02 F12, 03 D4, 04 F10, 10 F7 |

### Phase 2: one goal, a visible win, and a way onward (mostly safe)

| Item | Change | Working if | Needs |
|---|---|---|---|
| 2.1 The commitment on the HUD | Replace the constant "SCADA SIMULATED" with customer, shipped of required kg, and time due. Clicking opens the commitment. | With the guide closed, a play-tester can still name the order. | Safe. 09 P2 |
| 2.2 A win you can see and hear | Give the celebration queue a renderer: a short result beside the HUD target ("Riverside Bakers' Cooperative: 6,000 kg, on time"), with a sound that is not the PA. Fire it on a fulfilled order, a shift grade and an unlock. Surface unread notices once. | Fulfilling `order-001` renders a status naming the customer and "on time". | Safe; D-054 limits speech, not sound. Save fixture for the new type. 09 P1 |
| 2.3 Achievements that point at the game | Add: first on-time delivery, first A shift, first programme accepted, first challenge, first hold resolved, first season, charter signed. Show the list on phones. **hooks** | Each new id has a tracker test. | Safe. 09 P3 |
| 2.4 The next layer, offered | When a programme completes, the card offers three buttons: next programme, cooperative season, Chronicle charter. | The local funnel counts charters opened from here. | Safe. 09 P4 |
| 2.5 The returning player | After a restore with an active order and no guide open, open the compact guide on that order once. Replace the bag target (D11). | A reload test shows the current order. | 2.5b needs D11. 09 P6, 01 P5 |
| 2.6 The season arrives as a layer | It starts after the first delivery (D4). Its end is a debrief, not a badge. One name for the workspace across dock, sidebar, phone and chip. | No season starts before `order-001` is fulfilled; a visible surface remains after it ends. | D4. 09 P5, 06 P4, P6 |
| 2.7 The charter says what is signed | The Sign button carries the commitment: shifts, real hours at this pace, the first trial's shift. | A play-tester can say how long a chronicle is before signing. | Safe; effect text. 07 F13 |
| 2.8 The long night from shift 3 | Show its card from the first errand, with what counts and the threshold. Put each front's incident and its production cost on the shift-54 buttons. Mark the four plans that prepare for it. | The card renders at shift 3; a play-tester names two intake preparations by shift 20. | Safe. 08 P1 |
| 2.9 "Needs you" | One list at the top of the Chronicle overview: fire, shortfall, events, countdowns, an open proposal, owned incidents, organisations within 5 of cool. Each policy rung prints what it sets off: its red line, any condition, the projected vote. | Under 15 numbers above the fold; a countdown shows on the overview. | Safe. 08 P4, P5 |
| 2.10 Keys and dock | Overview and Production open one panel: merge them. Put the commitment, the bell, Safety and the Chronicle on keys. | The four verbs have keys listed in the help. **hooks** | Safe. 09 F7, F10 |

### Phase 3: the miller's hands (needs D1 and D2)

| Item | Change | Teaches | Working if | Evidence |
|---|---|---|---|---|
| 3.0 The card is the lever | Floor decisions arrive as the partner's proposal: cost on each button, a default, a window, then the partner's choice runs. The record compares what was chosen with what the other answer would have cost, an hour later. The plant's fake cards go. Automatic alarm reactions become a level the player grants. | Bounded authority, reversibility, an audit trail, when to delegate | A no-input run still delivers every order on time. The record shows at least one proposal per shift where the other answer was better. | 10 F3, F4, P8 |
| 3.1 Intake | When a grain truck docks, its lot's moisture, protein and falling number show at the dock. Accept into a named silo, accept for blending, or refuse at a fee, with a seeded effect on the next delivery. Lots carry readings only under a signed charter, so intake is asked only then; the first guided delivery's one real decision is the seeded worn mill's maintenance window (3.3). | What the three readings mean for flour | A play-tester refuses a sprouted lot and keeps the next order's grade. Without a charter no intake card appears. | 03 P4 |
| 3.2 The bench is a resource | New batches await a test. A test takes game time; one runs at a time. The grade is read against the order's own minimum. | Assurance against throughput | `playableJourney` still delivers on time; a 93 batch fails a strong-white order and is held. | 03 P1, P3 |
| 3.3 The maintenance window | Servicing takes the unit offline on the game clock (D7); Maintain and Restart stop running on wall-clock timers. In the dispatch wait it costs nothing, mid-order it costs tonnes, run to failure costs a longer repair. Parts are stocked by choice, not by every truck. | Planned against reactive maintenance, spares | A test shows kg lost under each of the three choices. | 01 P2 |
| 3.4 Dispatch by grade | Stock below an order's minimum is not loaded for it (D6). It can fill a lower spec. "Dispatch now" sends a part load. A single held batch isolates itself, not every truck. | Quality release, due dates, demurrage | 93-quality flour fills the school order, never the bakery order. | 02 P1, 03 P5 |
| 3.5 Two answers per incident | Each incident offers two costed responses booked to the existing economics: shed a mill or ride through; recall now or test first. Recovery challenges become the same thing, met in play rather than started from a fold. `bearing_overheat` is raised by an ignored wear warning. | Trade-offs under failure | A test proves neither answer wins in every programme. | 02 P5, P8 |
| 3.6 The mill setting | One rate, the player's, shown beside production. Above 100% the mill runs hotter and wears faster than it gains. Wear costs throughput as well as quality. | An optimum to find; wear felt as tonnes | A rate sweep whose best kg per part is below 200%. | 01 P3 |
| 3.7 The rush is a trade | A grain change costs a fixed flush to waste, so in some programmes deferring the rush wins. Declined on 20 October as a new mechanic; raised again under D2. | Changeover cost | `playableJourney` cases where deferral wins in one programme and loses in another. | 02 P4 |
| 3.8 Grain has a price | A source-checked cost per kg received. | What a mill really spends on | Grain is the largest cost line in a shift report; unsold stock shows a loss. | 01 P6 |

### Phase 4: a fair measure (needs D3, D8 to D10)

| Item | Change | Working if | Evidence |
|---|---|---|---|
| 4.1 Re-tune on the measured plant | From 0.2: `CURRENCY_TO_FUND`, each trial's tonnage with gold near 1.2 times the measured pace and silver at 1.0, era gates, and the rank ladder. | Gates run with the tick in the loop (0.2's harness producing the evidence, not fixed inputs; with fixed inputs they pass vacuously): a player who answers nothing ranks in the lowest two; gold is reached by the skilled player and not by the idle one; the fund never locks and never ends above three times the dearest plan. | 07 P1 |
| 4.2 A shorter chronicle | A length choice on the charter: 27 or 63 shifts, with trials and scheduled events compressed. | More `ended` outcomes in the local funnel. Saves keep their length. | 07 P8 |
| 4.3 Plans as investments | A fund source for cost a plan avoided, at the full rate. The ledger shows it beside the plan's upkeep. | Wind, heat recovery and vibration monitoring each pay back within 25 shifts at the measured pace. | 07 P3, F15 |
| 4.4 No beaten advice | Retune the six recommendations another choice beats. A deck test values every choice and fails when a non-recommended one beats the recommended one by more than 30 fund. Remove the dominated "Cover the roller floor". Price mitigation against the damage it avoids. | The deck test passes. | 07 P5, F6; 08 F7 |
| 4.5 Trials test the player | Each trial names a thing the player does on the floor (3.1 to 3.5), and its failure says which condition broke it. Grid Winter is telegraphed six shifts ahead and names both levers: output per hour and night running. | A play-tester can say why a trial failed. | 07 F2, P7, D6 |
| 4.6 Margins as numbers | The trial card and the crop-year line show the margin: "strong white 93.5 / 95". Moisture meters can save strong white in a wet year (today 99.5 - 6 + 1 = 94.5). | A play-tester can say why the Wet Harvest failed. | 07 P4, D3 |
| 4.7 The partner's purse and brief | A crop treatment may exceed the 15% share, as fire suppression does. Hand-overs follow the brief among free answers. | A delegated run treats the wet year; a "Good neighbour" brief docks rather than terminates. | 07 P6, 08 P8 |
| 4.8 Desks and the reserve | Cut the desks, or make paid part-one options cost a point and slow the refill (D10). The reserve counts as one long-night preparation at 100 or more. | If kept, a seeded run where a desk reaches 0. | 08 P7, F10 |
| 4.9 The small dead ends | Contractor traits that do nothing on seven plans. "Switch recipe" offered where recipes belong to customers. "Condition the grain" for drying. Relationships that saturate in five programmes. The certifier reacting to every internal test. | Each label does what it says. | 07 F7, F8, D4, D5, F15; 08 F15 |
| 4.10 The crew meets the record | A ruling that cuts against a member's value raises a standing objection, met through the existing concession. A concession that cannot change the vote is refused before the money is spent. | No number about anyone; `steward.test.ts:194` gains the new readers. | 08 P6, D2 |
| 4.11 The administrator | Recast per D9. Its notice names the rulings that brought it. | The notice lists causes; the assembly can refuse. | 08 F6, F15 |

### Phase 5: a cooperative you can feel (needs D4, D5, D18)

| Item | Change | Working if | Evidence |
|---|---|---|---|
| 5.1 One step at a time | The panel shows the next decision only, from `deriveWorkplaceGuidance`. Facilitator tools, replay and exports go behind one disclosure. | Under 150 words on first open; 8 or fewer clicks to a first approval. | 06 P1 |
| 5.2 A role table | Rows are the roles and the adviser; columns are Understands, Policy vote, Cover. Each objection's Resolve sits on its raiser's row. Checks are re-asked only when their terms changed. | A play-tester can name who still has to act without opening anything. | 06 P2 |
| 5.3 Refusals happen to you | The player is one role (D5). The others answer from their values: Maintenance declines cover after ten season minutes, the Coordinator refuses a plan that leaves under a shift's wages, Quality refuses while an inspection is open. Drop "(blocked)" from the four labels. The camera goes to the role that refused. | One plan activates under member vote and is refused under team consent; play-testers recount Quality's no unprompted. | 05 P1, 06 P3 |
| 5.4 Cooperation is not the slow option | Steady is 1.0 (D4). Cover and resequence relieve the real bottleneck. | The HUD rate is unchanged under steady. | 05 P6 |
| 5.5 Sobras as sobras | Reserves first, the rest in proportion to minutes worked, settled at the season's end, net of losses, with the community share visible in the village (D18). | A losing shift shrinks the pool; a play-tester sees the community share. | 05 P5 |
| 5.6 Forecasts from the real plant | The plan forecast uses the adviser's simulation of the real flow, and says when pacing will not change dispatch. | Forecasts follow plant state; shipped kg falls within the adviser's bounds. | 05 P3 |
| 5.7 Monday's sample is a real one | The hold comes when a real batch of the linked order awaits a test, and inspecting runs the lab's test. | Monday holds only with a pending sample. | 05 P4 |
| 5.8 One name each | One label for the place and one per charter, in both languages. "Presidência" for the chair, with the native reader (D20). | A grep finds one string per concept. | 06 P6, D1, D4 |
| 5.9 Dead choices get a reader or go | The chair breaks review ties, or goes. The reserve funds the next purchase, visibly. The two autonomy settings merge. Handoff episodes change something or go. An adopted arrangement outlives its cycle. | Each remaining choice has a test for its effect. | 05 P7, F7 |
| 5.10 Seasons differ and return | The seed draws the order of pressures, which member declines and Monday's minute. A second season can start by itself. Season outcomes enter the Chronicle record. | Two seasons from two seeds differ in a test. | 05 P8, F9 |
| 5.11 Moments in the scene | On approval the four mapped people gather at the staff block. On Monday the quality technician stands at the packer. "Take over" sets the Packing camera. | A pose test beside `communityLife.test.ts:108`, and screenshots. | 06 P5 |

### Phase 6: the body and the world (needs D12, D13, D16)

| Item | Change | Working if | Evidence |
|---|---|---|---|
| 6.1 The driver gives way | The manual branch slows within 6 m of anyone on foot and stops within 3.5 m, and logs a near miss when the driver closes at speed. | A pedestrian 3 m ahead gives speed 0. | 04 P1. **Checked**: the manual world test has no people in it |
| 6.2 Driving has a job | Drive FLT01 or FLT02 to its pick station with forks low and press E: the existing pick runs, and the drop completes the trip. A pick with forks raised or at speed near people is refused with an error line. | A manual pick and drop moves one station pallet. | 04 P2 |
| 6.3 Reset, then restart | Clearing a stop or ending a drill leaves machines idle. A separate Restart line brings them back. | `resolveEmergency` leaves every machine idle until restart. | 04 P3 |
| 6.4 A drill you prepare for | Before START the routes and refuges draw on the floor and a forklift on one shows red. Afterwards a record names each zone's result and any forklift that blocked it, timed on the game clock. Nobody evacuates (D-010). | A forklift parked on the west route gives "alternative" and a record entry. | 04 P4 |
| 6.5 People and places you can read | Each resident answers E or a tap with a card: role, what they are doing now, and for the five D-058 colleagues the adjustment by its register name. No condition, no number. The windmill and henhouse work in first person and unlock their Datalinks entry. | Every task has a Portuguese string; a play-tester can say why the packer leaves at 10:00. | 04 P5, P9 |
| 6.6 Solid walls, real pace | The hall's walls stop walking and driving, with the doors open. Walking is near-real inside the hall (D16). | A capsule stops at the gable wall and passes the personnel door. | 04 P6 |
| 6.7 Speed zones that matter | With 6.1, a zone at a crossing prevents near misses and the heat map shows it. The per-forklift efficiency figure goes (D16). | Two seeded runs, with and without the west-walkway zone, differ in recorded near misses. | 04 P7 |
| 6.8 Weather | Remove the buttons from the Safety panel, or lock them during a severe-rain incident. | The sky cannot contradict the incident. | 01 P7 |
| 6.9 Small things | A reason to climb the silo ladder, or remove it. The mini-map shows the player, the exits and the trucks. First-person help lists R, Q and X. | Each has a visible result. | 04 D11, D12 |

### Phase 7: teaching through the play

| Item | Change | Working if | Needs | Evidence |
|---|---|---|---|---|
| 7.1 Milling in Datalinks | Six source-checked entries in both languages: cleaning and tempering, break and reduction, purifiers, extraction and ash, what a baker needs, dust explosions. Each linked from the stage it explains. The shader-cache entry moves to the developer section. | Every delivery stage links a milling entry. | Safe | 10 P3 |
| 7.2 Lessons from the live cutaway | Questions ask what the cutaway shows: which roll runs faster, where a deck sends its overs, how full the silo is. The right answer's position is seeded. Completion is recorded. Rolls turn at different speeds. | An answer-position test; a source list for each fact. | Safe | 03 P8, 10 F6 |
| 7.3 A quiz from the record | D19. Reading a note in Datalinks counts once, as in the Chronicle. | A second attempt earns nothing; options permute by seed. | D19 | 10 P5, P6 |
| 7.4 SCADA that can be wrong | During the network incident a seeded subset of tags reads UNCERTAIN and stale, as its history note already claims. Alarm priority follows consequence, so most read LOW or MEDIUM. | Tags go UNCERTAIN in a SCADA test. | Safe | 03 P6, D3 |
| 7.5 The setpoint matters or goes | Roll speed moves mill throughput, wear and quality within a band, or the control is removed. | Either a test of the effect, or no control. | Nell | 03 P7 |
| 7.6 OEE and cost per kg, named | The shift review states availability times performance times conforming share, and margin per kg shipped. The energy dashboard's tip names a lever that exists, or goes. | A pinned review line in both languages. | Safe | 02 P6, 01 F5 |
| 7.7 Tempering as a decision | In wet and dry years the player sets a temper target and rest time, in place of the flat 200-fund treatment. | Too little costs quality; too much costs throughput. | Nell; L | 10 P7 |
| 7.8 The planner's purpose | Keep it as an engineering tool behind the More menu, with its notes cut, or feed its trips from completed unloads so a layout changes the dock. | Its effect on a shift is stated or measured. | Nell | 03 F6 |
| 7.9 Display with no reader | Utility vessels, the multi-objective dashboard's targets, the certification state: connect each to a decision or remove it. | Nothing on screen is a number that no rule reads. | Nell | 02 F10, F11; 03 D5 |

---

## How we will know it worked

| Measure | Today | Target |
|---|---|---|
| Decisions offered in an ordinary ten minutes at 1x, no incident | 1 to 2 (report 01); none required in the first seven game hours (play) | 4 or more, and a no-input run still delivers |
| Skilled play against the partner's defaults, shift margin over 20 programmes | no difference possible | 10% or more, with no answer that wins every time |
| First decision that changes an outcome | "Accept next programme", about 16 real minutes in | within 3 real minutes |
| A play-tester can name the current goal with the guide closed | no | yes |
| A fulfilled order is seen and heard | a log row | a result on the HUD and a sound |
| Chronicle, the plant held fixed: what answering every decision adds to the score | 9 to 15 of 60 (probe) | at least 25, and answering nothing ranks in the lowest two |
| Chronicle decisions per real hour at 1x | about 4.5 | 12 or more |
| Words before the first cooperative decision | about 350 to 550 | under 150 |
| Lab readings on screen | a letter | moisture, protein, falling number, each beside its limit |
| Stated facts with a source on file | not tracked | all |

After Phases 2, 3 and 5, run one stranger session each on desktop English,
phone, and Portuguese, on a machine under 3 runnable per core.

---

## Running it

1. **Where.** A worktree of this repository (`<repo>`)
   on branch `claude/mechanics-review-20261112` at `ffe9e70e`. It is clean and
   has `node_modules` installed (with `PUPPETEER_SKIP_DOWNLOAD=1`; the plain
   `npm ci` fails on Puppeteer's download and nothing in the repo imports it).
   The primary checkout holds another session's lighting work: leave it alone.
2. **Who.** Opus 5.5 implementers, `effort: high`, fresh agents, never forks.
   Every brief opens with the delivery sentence from the global rules, names
   its files, and says what still speaks the old contract.
3. **How.** Failing test first, on the real path. Each agent runs only its own
   test files with `--maxWorkers=1`. The whole gate runs once per wave, and the
   delta against 0.1's baseline goes in this file. Visual changes are verified
   headless under the capture lock, with screenshot paths reported.
4. **Lanes for Phase 1**, so no two agents hold one file:
   Chronicle engine (1.1, 1.2, 1.3) · maintenance (1.4, 1.5) · lab (1.6,
   1.8) · workplace (1.10, 1.15) · AI cards (1.11) · content (1.12, 1.13) ·
   interface (1.16, 1.17, 1.18). Then 1.7 and 1.9, which share
   `UnifiedGameTick.ts` and `qcLabStore.ts` with the first wave. 1.14 and part
   of 1.17 wait for that approval.
5. **Rules that bind every item.** Both languages through `src/i18n`. No emoji.
   No number about a person. Seeded chance only. Inert in benchmarks. A change
   to saved state carries a migration and a fixture. New facts are checked
   against the raw source. Decision-log entries are written on `main` at merge.
6. **Not started, and why.** No implementation ran in this session: 0 of the 18
   Phase 1 items are begun and no baseline was taken. The machine
   had no idle CPU, 31 GB in the memory compressor and swap nearly full, from
   other sessions' work; a typecheck was still starved after 22 minutes. A
   baseline taken then would have named failures that were only timeouts.
   Start with 0.1 when `uptime` shows under 30 on this machine, or run the
   gates on a rented cloud VM if Nell agrees to the repository going there.

---

## Not reviewed

Phone layout and Portuguese at runtime; first-person play at runtime; the
bodies of `LayoutPlanner.tsx`, `WorkplaceReplay.tsx` and
`WorkplacePackingEvidence.tsx`; the agent cockpit's capability list; the two
replay systems; the music player; the cloud and ChatGPT clients; the workshop,
pilot and separate-turns flows; truck and forklift controller internals. Each
report ends with its own list.

## Open evidence

- Real kg, net and energy per shift at pace 30 (item 0.2). Reports 01, 02 and
  07 derive different figures from the code; none is a measurement.
- Whether plan pacing changes any shipment (report 05, F1): a matched replay of
  steady against no agreement would settle it.
- Whether the hall's walls stop a walker (04, F4), and whether grain beyond a
  silo's space vanishes at receipt (03, D7). Both are read from code.
- The emergency-stop clause, Approved Document M's ramp table and Lei 5.764/71
  are cited from secondary sources and must be read before copy is written.

---

## Execution ledger (from 12 November, 16:20 GMT)

The ledger here is the published summary as of 13 November; the working ledger with operational detail is kept outside the repository.

Nell, 12 November: "Proceed please, fix everything, and another pass please."
The 21 recommendations above are treated as accepted and will be drafted as
`[proposed]` decision entries quoting that line, with ids allocated on `main`
at merge.

### Baseline (item 0.1), clean `ffe9e70e`, gate VM, Node 22.23.4, 12 November 17:15 GMT

| Gate | Result |
|---|---|
| `typecheck`, `agent:typecheck` | pass |
| `lint`, `format:check` | pass |
| `validate:depth`, `validate:shaders` | pass |
| `agent:manifest` and its check | pass |
| `npm test` | 8,132 tests in 2,597 files: 8,131 passed, 0 failed, 1 skipped (30 minutes on 4 vCPU) |
| `build`, `validate:bundle`, `validate:reachability` | pass |
| `validate:community` | pass (run after the build; it needs `dist`) |

No failing test to name. Every later delta is against this.

### Wave log

| Wave | Items | State |
|---|---|---|
| Smoke | 1.1 | done: one pass per batch per shift; 6 new tests fail before and pass after |
| 1a | 1.2 | done: 4 of 64 crews could be trapped on Lean stock, all on a 1 to 1 tie; now none. **Rule change to tell Nell:** a tie in the assembly now carries a move off a red line (Any lot, Lean, Spot) or off the step a standing condition needs left; every other change still needs more votes for than against. Wider than planned: keyed only on a running warning, the same crews stayed stuck once the village had acted |
| 1a | 1.3 | partial: because lines, changes on notices, last three changes and thresholds per organisation, ruled-out choices shown. Policy, quota and red-line changes write no history, so they are absent from the organisations' history (needs saved state) |
| 1a | 1.4, 1.5 | done: a wear crossing predicts the failure it will have; a booked service costs one part like Maintain; `scheduledTime` no longer shown; wear notice goes to the unit; Restart readings are fixed values |
| 1a | 1.6, 1.8 | done: the lab shows quality beside the order's minimum, moisture, protein and falling number; player lab actions are logged as Operator. Not yet seen on screen |
| 1a | 1.7, 1.15 (campaign) | done: due-soon is not a carried risk; quality advice points at the guided delivery; Chronicle-owned incidents route to the Chronicle |
| 1a | 1.10, 1.15 (workplace) | done: a drill, stop or resolved objection pauses a campaign shift so it resumes; a season can still end honoured. Also found and fixed: sharing sobras during a paused shift made the save unloadable |
| 1a | 1.11 | done: confidence fixed per card kind; CPU and MEM tiles removed; card text says what accepting does. `prediction` and `coordination` cards do nothing when accepted and now say so |
| 1a | 1.12, 1.13 | done: Buffalo and the cotton-bag booklet corrected from sources; OGAS, Cybersyn, Haggenmacher and Ganz confirmed as written (Gerovitch 2008; Medina 2006; HLS; US patent 251,124) and left. Docs and comments brought to pace 30 |
| 1a | 1.14 | partial: "Interlock Proven" is now "Egress Verified"; Full Capacity's mark is 80. Whether a default session earns it is unproven (best seen 73 with no truck shipping). The two achievements that count one response are unchanged |
| 1a | 1.16, 1.17 | done except the phone ladder: a held truck files one bell notice naming the forklift; the compact layout has the bell and held-clock chip; STOP FORKLIFTS in the Safety panel; a phone context button rings the bell |
| 1a | 1.18 | partial: 27 captions cut on planner, SCADA lab, Datalinks, Autonomy, Energy and Safety. Six lines left because each carries a fact the player needs (setpoint helper; planner `loadingCapacity`, `pausedNote`, `runningNote`, `controlsChanged`): they need a layout change |
| 1a gate | whole gate, gate VM, 18:25 to 18:55 GMT | every gate passes but `npm test`: 8,248 tests in 2,652 files, 8,244 passed, **3 failed**, 1 skipped (baseline 8,131 passed, 0 failed; 116 tests and 55 files added). The three: `riverbankHedgeGrounding.test.tsx` (byte pin on `TruckBay.tsx`; diff reviewed, 23 added lines for the hold notice, re-pinned with a dated note), `WorkplacePressureChapter.test.tsx` ("Delivery shortfall:" copy, in the tail's list), `TimelinePlayback.language.gameplay.test.tsx` (AI card wording, in the tail's list) |
| 1b | 1.9 | done: the supplier notice names the lots in the silos; flour packed from them forms on hold; closing the alert frees it; a lot stays held while a second open alert names it. Carried to the 3.2 and 3.4 lane: (a) retesting the stock held at the raise closes the alert and frees later flour from the named lots untested; (b) the agent command `quality.release-batch` (`runtimeCommandHandlers.ts:560-568`) checks only the alert's named batches, so it can release a batch held through a named lot; (c) flour already in the mills, sifters and packers at the raise still forms released |
| 2a | 2.7, 2.8, 2.9 | done, not yet seen on screen: Sign button carries shifts, real hours at the current pace and the first trial; the long night's card shows from shift 3 with each front's incident and production cost; "Needs you" list tops the overview (13 numbers with every need present); each policy rung prints its red line, condition and projected vote. `engine.ts` untouched |
| 0.2 | plant measurement | done: `src/systems/__tests__/plantMeasure.playtest.test.ts` (skips unless `MILLOS_PLANT_MEASURE_OUT` is set); results in `docs/reviews/mechanics-20261112/balance/plant-measure-wave1.json`. See "The plant as measured" below |
| 1a tail | cross-lane leftovers | done: `'chronicle'` routed through the interface on desktop and phone; status bars get the machine-focus route; pause copy for drill, stop and objection; AI tiles' ids gone from specs; a carried tie says why; drill copy names the step-free check; a hand-placed hold says so |
| 2b | 2.1, 2.2, 2.5 · 2.4, 2.6 · 2.3, 2.10, 1.14 rest · 1.1 and 1.3 rest · 1.18 rest | running (five lanes, from 19:30 GMT) |
| 2b | 1.18 rest | done, not yet seen on screen: the six lines are gone; each fact is now a readout, a table row, a refusal or a write's result. Two behaviour changes: the planner's Apply and Undo stay enabled while the mill runs and answer with the store's refusal; the setpoint's "does not change throughput" shows only after a write |
| 2b | 1.1 and 1.3 rest | done: a batch earns once in a chronicle (saved `creditedQcBatchIds`, optional, capped at 200, keyed by material session and batch); the ledger line reads "Batches that passed QC"; every organisation change now saves its cause (`governance.partyChanges`, optional, last 40) and the Partners tab lists it. Old saves restore; an old save's `qc` total still includes per-test credit |
| 2b | 2.3, 2.10, 1.14 rest | done, not yet seen on screen. Seven achievements, each earned on its store's event; the list opens from More on phones. Dock: Production removed, Overview is the one entry. Keys: N commitment, B bell, L Safety, M Chronicle, listed in the help. **Four rule changes to tell Nell:** (1) Full Capacity is now "production speed at 100% with every machine running and none in warning", because the old load mark was unreachable (best whole-line load measured 72 at the 0.8 boot rate, 77 at 1.0, against a mark of 80); (2) Decision Review counts deferrals, so no two achievements count one answer; (3) M, deliberately unbound before, opens the Chronicle; (4) the Production dock entry is gone. Left: an old save with a charter already signed keeps "charter signed" locked until the next signing; a forward replace of under 60 plant minutes could still award |
| 2b | 2.1, 2.2, 2.5 | done, not yet seen on screen. The HUD names the active order (customer, kg shipped of required, due time) where "SCADA SIMULATED" was; a fulfilled order, a graded shift and an unlock each show once beside the target with the cycle bell (quiet when muted, PA off, in benchmarks; late or off-spec deliveries do not ring); after a restore with an order open the compact guide opens on it once. D11 part done: HUD, PA line and tick milestones moved to the programme's committed tonnes; six other readers of the bag target were outside the lane |
| 2b | 2.4, 2.6 | done, not yet seen on screen. A completed programme offers the next programme, the cooperative season and the Chronicle charter; the funnel counts charters opened from there. No season starts before `order-001` is fulfilled (a save with one already running carries on). Steady, resequence and cover all run the line at 1.0, so steady now beats the other two until 5.4 gives them something to buy. A season's end leaves a debrief that survives a reload. The workspace is "Autonomy" / "Autonomia" everywhere. **For the merge:** `docs/DECISIONS.md` has no 4 October season entry to supersede (the direction lives in `_contprompts/millos_owned_decisions_20261004.md`), so D4 needs a new id. Still at 0.78: the handoff experiment (`workplaceImprovement.ts:224, 233`, `workplaceAdvice.ts:34`), for 5.4 and 5.9 |
| 2d | wave 2 leftovers | done: the pacing chip shows only while the agreed pace is below the plant rate (never under steady); old workspace names gone from catalogues, the capture script and the e2e spec; the scripts wait for a fulfilled `order-001` before any season start. The two scripts were not run (no browser here) |
| 2 mid gate | whole gate, gate VM, 20:51 GMT, tree still moving | static gates pass; tests: three failures, two in `StatusHUD.test.tsx` (since fixed by 2d) and `src/agent/__tests__/workplaceRuntime.test.ts` (pins a funded agreement by a line pace below 1; goes to the tail) |
| 2 tail | closing wave 2 | done. The lab's season start before the first delivery reproduced and is now refused at the store with a reason; 132 tests that started a season with `order-001` open now fulfil it first. `productionTarget` and `DAILY_TARGET_BAGS` are gone from types, store and saves (a removed-field entry; the four real-save fixtures restore). The agent test pins a funded agreement on its own terms. Every folder's tests pass on the VM |
| before | harness on the quiet tree, 00:47 GMT | arm (a) is identical to wave 1's figures in every row (179.5 t, 44 on time), so Phases 1 and 2 did not move the plant. Saved as `balance/plant-before-phase3.json`: Phase 3's "before" |
| **2 gate** | whole gate, gate VM, 00:47 to 01:34 GMT, tree as of 00:46 GMT | **green.** Every gate passes. `npm test`: 8,409 tests in 2,724 files, 8,402 passed, **0 failed**, 7 skipped (baseline 8,131 passed, 0 failed, 1 skipped; 277 tests and 127 files added by Phases 0 to 2; the six extra skips are the measurement harness, which runs only on request) |
| captures | Phase 1 and 2 surfaces in a headless browser on the gate VM (Mesa llvmpipe, about 3 FPS, render-only systems switched off through the runtime's own perf switches) | done: nine of ten surface groups reached by play, 128 screenshots (kept outside the repository), console errors, page errors and failed requests zero in every run. The tool is `scripts/playtest-surfaces.mjs` (item 0.4). **17 defects**, two confirmed by me in the pixels: the HUD row at 1280 px cuts the commitment and the result line ("Achievemen…", "T." in Portuguese), so the win is never read; the lab's season-start refusal renders out of view of its button. Others: no held-clock chip on the phone; phone AI cards clamp their text; a see-through notifications panel; floating dashboards collide; the multi-objective summary contradicts its figures; captions left on Energy, Overview, planner and SCADA; "Falling number" always a dash; one action with two names; English filter chips and "1 tags" in Portuguese SCADA; the long night's counter breaks over three lines; cramped Portuguese Chronicle tabs; emergency banners cover the HUD; the third onward button below the fold at 1280×657 in Portuguese. Not reached by play: the "Needs you" list, a "Because" line, the ledger line, Partners' recent changes. Looks right: dock, keys and help, the Sign button, policy rungs, plan marks, Safety stop and drill at all widths, the AI panel without CPU and MEM, the setpoint's result, the compact guide after reload, the three onward buttons in English, the season debrief card, Datalinks, Portuguese number formats outside SCADA. Noted: a touch phone held upright gets only "Rotate to landscape", so the 390 px frames are a narrow window, not a real phone |
| fix | the 17 capture defects | all 17 fixed in code. The twelve in the HUD and panels lane: ten seen in new screenshots (English and Portuguese, phone where relevant), and I confirmed the worst in the pixels: at 1280 px in Portuguese the commitment reads in full ("Community Pasta Works · 0 / 4.000 kg · Vence em 2h 5min") and the result has its own line under the row. Render-test only (three later rebuilds would not start the game): the production-line paragraph's cut, the notifications list over the reflection card, a delivered-order result sentence, proposal cards' priced buttons on the phone. The other five were fixed by the lab, SCADA, Chronicle and cooperative lanes, not yet seen. Left: the "line idle" chip still truncates in Portuguese; with both dashboards and the sidebar open they overlap; the multi-objective dashboard's 250 kW, carbon and 98% targets are read by no rule and a normal plant always misses them (7.9); the phone's emergency banner still covers the bell row; `operationsCampaignStore.messages.ts:87/204` still says "production programme" |
| **tree** | **the game does not start on the current tree** (found by the fix lane's rebuilds, 05:30 GMT) | the ramp lane's uncommitted geometry moved the hall verge and the runtime throws "Stale civic lamp visibility atlas: hall-verge moved" at start-up; a second rebuild failed to compile at `src/chronicle/engine.ts:121` mid-edit. The ramp lane has been told to finish the re-bake or revert completely, first. **Cleared at 05:58 GMT:** the lamp atlas was re-baked on the gate VM (control first: baking the unchanged tree there reproduced the shipped atlas byte for byte), `CIVIC_SHADOW_ASSET_VERSION` is `14ffdb8f`, and a fresh build of the tree reached "world ready" with no page errors |
| 3a | 3.0a the shipment seam | done: `planShipment` in `src/simulation/shipmentPlan.ts`, pure, no tick state. With the default policy all 5,518 harness figures match the "before" run, and a unit test checks it against a copy of the old inline rule over 3,000 cases. New manifests carry an optional `orderId` that crediting honours. **The first lever with a measured size:** over ten shifts every policy makes exactly 59 departures (the yard fixes the trucks; only the load moves). Default: 179.5 t, 44 on time, net 148,642. `fill` (load to the truck's capacity across same-product orders): 190.0 t, 48 on time, net +9,403. `partial` (leave at 2,500 kg): 115.0 t, 17 on time and 10 late, net -54,195. `fill` beats today's rule on every measure, so it becomes the partner's default in 3.4, not a choice. Found on the way: today the active order sizes a load but crediting gives it to the most urgent order of that product |
| 3a | 3.0 partner proposals | done, not yet seen on screen. Core `src/simulation/partnerProposals.ts` (a kind is one registry entry; the hour-later comparison calls `priceOption` again), store, tick runtime, cards at the top of the AI panel's Decisions tab with a priced button per answer, the partner's choice marked, minutes left, and "Ask me / Decide and tell me" per kind; the bell rings. Kinds: `programme` (accept now or hold; window 24 game minutes, 48 s at 1x) and `service` (service now for one part, or run on, priced at the expected repair and the quality lost; window 30). Pressing Accept or Maintain yourself answers the proposal as the operator. The `prediction` and `coordination` cards, which did nothing, are gone. Harness: arms a, b, c identical to "before"; **no input at all now delivers 43 orders on time, ten A, no breakdowns** (it stopped at shift 3 before); answering every service "run on" gives AAAABBBBBF and the record shows the partner was right 8 times of 8. New baseline `balance/plant-after-proposals.json`. Open, passed on: the save is 855 KB against a 750 KB budget (history windows in the material store); only 6 of 23 partner record lines reach a shift review (the report keeps eight controller lines); no proposal cards on the phone sheet; alarm reactions as a granted level not built; the agent's `decision.respond` now acts across three domains |
| 3b | 3.4 dispatch by grade, 3.2 the bench, `fill`, a `dispatch` kind, loose ends | done but for showing proposal records on the shift card; not yet seen on screen. A truck loads a batch for an order only if the batch is tested and meets that order's minimum; the same split decides what counts as available and what is paid. A 93 batch goes to the community order, never to strong white; no order is paid for flour under its minimum; `fill` is the truck rule (benchmarks keep the old rule and no bench). The bench: one test at a time, 6 game minutes (`BENCH_TEST_MINUTES`), queue by a player's "Test first", then the earliest-due order's product, then oldest; it costs 3.5 t and two deliveries over ten shifts. `dispatch` kind: "Send now" or "Hold" up to 45 minutes. Harness, ten shifts: no input 190.5 t, 47 on time, none late, ten A, no failing kilogram and none loaded under a minimum; "run on" 159.5 t, AAAABBBBCF. **A rule-4 hole found, to fix before release:** once the line cannot make 95 the strong-white order stays open, and the next programme is only offered when every order is fulfilled, so the plant stops taking work (the two unserviced arms ship nothing in shift 10); servicing is the way out in the plant, but a Chronicle crop-year penalty under 95 would have none. Loose ends: untested flour from a notified lot goes back to the bench (a deviation: closing an alert does not wait for it); the agent's release command refuses a batch from a notified lot; buffers carry their lots; the save is 743,208 of 750,000 bytes (under 1% headroom); each shift report keeps every resolved proposal as keys (24 of 24), not yet displayed. Falling number is hidden when there is no reading (it is set only under a charter); quality and minimum are separate readouts |
| advisor | review at 04:35 GMT, after both 3b lanes | (1) the stall blocks release: fix it with 3.7 as one gate (a programme may be taken while an order is open; an unfillable order is forfeited at a stated lateness). (2) No card is yet a proven decision: of 23 proposals, 0 where the other answer was better. Rule adopted: a kind is asked only if the harness has an arm where the other answer wins and one where it loses; otherwise the partner decides and tells. Commitment is the one lever with a measured interior optimum; re-measure it. (3) The jam at 1.6 and 2.0 blocks release. (4) Make the work durable. (5) Whole gate now. (6) Wire the Chronicle's net to the new lines before 4.1. (7) Check the save against its worst case. (8) Phone frames were a viewport no phone shows: recapture in landscape with touch. (9) To live: commit, rebase on `origin/main`, whole gate on the rebased tree, captures, the fresh review pass and its fixes, re-gate, pull request, merge only on green CI |
| 3c | the stall with 3.7; which kinds are asked; the jam; one rate; the save; loose ends | done but for the save (below). **Stall fixed:** an order still open 240 game minutes past due is forfeited (`FORFEIT_LATENESS_MINUTES`): a fee of four hours of its late rate, a review line that counts as a late delivery, one bell; a forfeit always costs more than delivering late. The tick computes the best stamp each grain allows; an order above it is not milled for (before, 13 t of 94.5 flour packed for the 95 order jammed two packers). New kinds `forfeit` and `commitment` (take the next programme early, one beside the running one). Wet-year charter, no input: the 92 and 90 orders ship on time, the 95 order is forfeited at due with the reason recorded, the next programme is taken. **Which kinds are asked: none.** By the rule, every kind defaults to "decide and tell me": programme (hold never won, 78 of 78), service (8 of 8), dispatch (never raised), forfeit, commitment. Proposals per shift where the other answer was better: **0** with no input. Commitment arms, ten shifts (t / on time / late / net): never early 189.5 / 46 / 0 / 38,507; when the button showed no lateness 227.0 / 39 / 17 / 44,284; always 250.5 / 32 / 30 / 49,375. So taking early is worth up to 28% of net and the button's lateness price is wrong (it showed none and 17 came late): **the one lever that could be a decision, once its price is true.** **Jam fixed:** it predates Phase 3: with no order open the silos fed both grains to every mill; now no plan means no feed and a mill takes one grain at a time (`PLAN_ONLY_SILO_FEED`; stock is no longer built with no order, a design change). Ten shifts at rate 2.0: 203.5 t, 51 on time, ten A. **One rate:** the setpoint no longer multiplies it; best net per tonne 206.5 at 0.8, about 13 above both ends (noise about 1.5); total net peaks at 1.2. A part is refunded if a fault ends the service. The bench credits no know-how (0 from 118 passes). No input, ten shifts: 46 on time, none late, ten A, net 38,507 |
| **save** | **blocks release** | autosave refuses and stops saving above 3,000,000 bytes; the worst case reaches that at about game day 15.8 (a 63-shift chronicle is 21 days). What grows is lot genealogy. At shift 21 the worst case is 815,160 bytes. Rule set by the lead for 3d: keep full genealogy for everything still on site, anything an open alert names, and batches shipped in the last three game days; older genealogy is dropped |
| 3d | the save; a true price for `commitment` | done, with a follow-up running. **Save, no longer a blocker:** every parcel and batch carried an entry for every lot it had ever mixed with. A released lot more than three game days old now merges into its grain's "earlier stock" lot (mass and balances unchanged; held and recalled lots never merge; a hold on earlier stock reaches the merged lots), and lots are written compactly. Worst case at shift 21: 519,356 bytes (815,160 before; 31% under the 750,000 budget). Across a whole chronicle the largest save is 716K to 762K, flat within 6% from shift 30 to 69 (it reached 2.8 MB and stopped at shift 40 before). A refused save now rings a warning (it was an unseen "info"). The rule as built keys on a lot's receipt date, because the silos mix. **Commitment price:** the old projection timed trucks from arrival, assumed a 4,450 kg payload and ignored stock and the line; it missed 185 of 370 late completions. The new `projectDock` misses 8 of 370. Ten shifts, never / priced / always early: demand 1: 189.5 / 214.5 / 250.5 t, 46 / 52 / 32 on time, 0 / 0 / 30 late, net 38,507 / 44,615 / 49,375; demand 1.5: 51,242 / 51,592 / 48,908; demand 2: 52,760 / 52,760 / 26,662. **So taking when the button shows no order at risk is worth 16% of net at ordinary demand with nothing late, and taking blindly loses at high demand. The ask rule now says: ask.** The partner's own choice is still "Wait". Follow-up: the record credits a take with the whole programme's margin (2,300) where the measured gain is about 1,020, and ignores grade; with no input it says the other answer was better 58 times of 58. Being fixed so the credit is what bringing the programme forward is worth, and so the partner is not reliably wrong. Also: an older cached build cannot read the compact save (version check being confirmed). **Follow-up done (09:05 GMT):** a take is now credited with what bringing the programme forward earns (two projected schedules compared; 900 credited against 1,018 measured per take at ordinary demand, within 12%); each button shows its schedule's grade cap. The partner now takes when no order is at risk and waits otherwise; the record says the other answer was better 19 times of 46 (58 of 58 before); the rule still says ask. **No input, ten shifts: 52 on time, none late, ten A, net 42,593.** The save is version 2; an older build refuses it, keeps the save untouched, holds the shift and warns. Five `playableJourney` tests pin the old one-programme behaviour (to the plant tail) |
| plant tail | re-pins, holds, the bell, housekeeping | done; every plant test folder passes (systems 229, stores 896, simulation 795, scada 422, agent 108, utils 1,046, `src/store.*` 73; no failures). `playableJourney` re-pinned: the rush tests answer "Wait" as a player could; a new test pins the default (four programmes taken early over 36 game hours, every order on time, the tightest with 37.5 minutes to spare). A restore unfinished after 60 seconds of wall time takes the failed-restore path. The tick releases the SCADA hold when the mode returns to simulation. **Reproduced and fixed:** a mill whose temperature tag was held by the network incident stayed tripped while it ran; in simulation mode the store now reads the real value under a held tag while the panel still shows it uncertain. **The bell:** every plant warning alarm, quality holds, unresolved recalls and the dispatch interlock had gone quiet when priorities changed; the bell now rings for every alarm on a people or plant tag; roll-speed alarm limits removed (they only reported where the slider was). `bookDemurrageCharge` reviewed: no defect. **0.3 and 0.4 done:** `npm run playtest:plant`, `playtest:chronicle`, `playtest:surfaces` (takes the capture lock, headless), documented in `docs/development.md`; `npm test` skips all 77 instrument tests. "First programme" is earned only by the player's own acceptance. The agent's `decision.respond` declares its side effects in material, quality and logistics (an agent recall on a supplier notice had been failing); 28 tests in nine `src/store.*` files that no folder run covered were failing on a missing stand-in and are fixed |
| 3e | 3.1 intake and 3.5 two answers per incident | done; not yet seen on screen. **Intake (under a charter only): the first kind the rule says to ask.** The crop-year penalty is now read from the grain each packed portion was milled from (`lotQuality.ts`), so which lot went into which silo matters; a silo of one year's lots stamps exactly the old figure. The card shows the lot's moisture, protein and falling number and offers accept, blend or refuse (a fee of 120 and a seeded even chance the next truck comes 45 minutes late). Sprouted year, 20 shifts: old plant-wide rule 0 of 22 strong-white orders made, 42 forfeits, net 19,082; accept every lot 16 made, net 48,271; refuse every lot 0 made, net 8,993; the partner's choice per lot 18 to 20 made, net 54,521 to 57,556. In a typical year accepting is right (refusing everything ends at -1,498 and an F). Left to the partner, the record found another answer better 3 times of 84. Asking has a price: the ten-minute window cost 3,035 of net against the same choices pressed at once. Blend was never offered in play (no silo had room). No charter: identical to the kilogram, no card. **Incidents:** each of the eight kinds has two priced answers; plant-raised ones (a started challenge; a mill that fails with its wear warning ignored, now `bearing_overheat`) resolve 120 game minutes after being answered; Chronicle-owned ones keep the Chronicle's acknowledge and restore. Delayed truck: relief wins when an order is due soon, waiting wins with slack, by about 10 of net either way; dust filter: changing it wins on a worn line. No arm found the partner's incident choice beaten, so incidents are decided and told. Outside its lane: `bookDemurrageCharge` added to the campaign store |
| 5c | 5.4, 5.6, 5.7, 5.11 and the old names | done, with a follow-up running; 127 files, 901 workplace tests pass; `validate:community` passes; not yet seen on screen. **5.4:** resequence calls the campaign's own order activation (the rush first or last for the shift), survives a reload, and its button names who is served first and each order's minutes in hand; cover has a reader in the plant (`workplaceCrew.ts`): while a member is away the bench starts no new test and a service waits, unless another member covers. **5.7:** Monday holds only while a real batch of the season's order awaits its test; "Inspect" puts it first on the bench and the record states its real quality against the order's minimum. **5.6:** a "Forecast from the plant now" button, from the adviser's simulation and the dock projection, says plainly when a plan will not change dispatch; the adviser had been abstaining whenever a batch was on the bench (fixed). **5.11:** the four mapped people stand at the staff-room door for three game minutes after an agreement; Quality stands at the packer during Monday's hold; nobody on a break or seated is moved; "Take over" sets the Packing camera. Both are cuts, not walks. The two disowned `PlayableShift` tests were wrong, not the code (Friday's installment; the player casts only Packing's vote). **Follow-up, against D4:** as built every season shift opened with a member away for ten minutes, so steady cost something every shift; being changed so an absence happens only on the shift whose drawn pressure it is, a service does not start while its member is away, and the Inspector names the wait. **Follow-up done (09:20 GMT):** an absence is one shift of the season, only when the draw gives that pressure, and every other shift behaves exactly as with no season (D4 holds); a service asked for while Maintenance is away does not start and takes no part until they are back; the Inspector and the lab name who is away and when they return. 125 workplace files, 775 tests pass. Left: a waiting service is not saved, so a reload drops it (its wear prediction remains, so it is proposed again) |
| 7b | 7.5, 7.6, 7.8, 7.9; Phase 3 on screen; leftovers | done; part seen in pixels. **7.5 (a choice made for Nell):** the roll-speed setpoint is the slider's line rate: 0 to 2,000 RPM maps onto 0 to 200%, a write sets the rate through the slider's own action, the result line states the new rate and wear and energy per tonne against 100% ("Line rate now 120%… wear ×1.22, energy ×1.10", seen), a write outside the band is refused. Side effect: roll-speed alarms follow the slider (LO under 60%, HI over 160%). **7.6:** the review states availability × performance × conforming share, their product and margin per kg shipped (definition from oee.com, read raw); a line waiting on the dock is not counted as a speed loss. **Phase 3 on screen:** grain bought, parts bought and the change in stock held on the shift card and review; the partner's proposals listed once with their comparisons; the dashboards and SCADA feed apply the bill's above-100% penalty; stock held is no longer a cost in the replay store. **7.8 (a choice):** the planner opens from More; closing it releases its pause. **7.9 (a choice):** removed as numbers no rule reads: the 250 kW target, the carbon objective and row, the 98% quality target, the blended score, both utility-vessel displays; connected: quality against the line order's minimum, energy against the bill's tariff. The certificate's state is shown nowhere and set by nothing outside tests. Leftovers done: the idle chip, dashboards against the sidebar, the phone banner, "delivery programme", lessons saved, outside rolls at 2.5:1. Not seen: the review's OEE, purchase and proposal lines; the idle chip's final wording; the phone banner (its CSS rule was not found in the built stylesheet: unconfirmed) |
| D15, D17, D21 | mute; the semolina customer; holding the clock | done; not yet seen on screen. **D15:** every PA line is filed and captioned while muted; the voice neither loads nor speaks; muting mid-line stops the voice and keeps the caption for its reading time (at least 10 s, 80 ms a character); unmuting replays nothing. Supersedes D-061's clause "a muted plant builds no urgency"; the "React State Synchronization Patterns" section of `CLAUDE.md` now describes the old design. **D17:** sources read raw: 21 CFR 137.320 (semolina is ground durum), 137.250 and 137.275 (corn meal), Embrapa Documentos 59, ANVISA IN 351/2025 (Codex could not be fetched). The product shows as "Cornmeal" / "Fubá" and the customer as "Community Polenta Kitchen" in both languages (a proper name, per the glossary), through one function; the stored name is unchanged. The Chronicle's 22 strings are with 4c. **D21:** a pace button now ends only the player's own pause; any other hold refuses and is named. Two holds had no way out but a pace button and now have their own release ("Continue without the save"; "Resume the clock"). The agent's pace command can still override a hold. Left for the sweep: a restore that stalls without an error never ends its hold; closing the layout planner while paused leaves its hold on (Run releases it); the tick should release the SCADA hold itself when the mode returns to simulation |
| 3 mid gate | whole gate on the tree at 04:42 GMT (four lanes mid-edit) | running |
| 3b | 3.3, 3.8, the three exploits, restart-pending leftovers; 3.6 in part | done but for 3.6's display merge; not yet seen on screen. **Service takes game time** (`src/systems/unitService.ts`): a roller mill 45 game minutes offline, sifter and packer 30, silo 20, one part at the start, said on the button; restart is 75 game seconds; a unit saved mid-service restores and finishes. **Exploits closed:** a repaired unit returns just under its breakdown threshold, unserviced, with its service proposed; parts are ordered by a reorder rule, arrive with the next grain truck and are booked on a new Parts line (game prices, unsourced, quoted nowhere); a down unit keeps its last efficiency in the quality mean. **Grain has a price:** wheat 0.46 and corn 0.33 a kg, from USDA ERS tables updated 10 November 2026 (working in `src/simulation/grainPrice.ts`), booked at intake with stock carried at cost. **Proofs, ten shifts:** routine service 188.5 t, ten A, net 38,184; two mills down 240 minutes 159.8 t, AAAAAABACF, net 25,332 (it beat servicing before; now it loses on tonnes, grade and net); never servicing 158.5 t, AAAAAABBCF, quality under 95 sooner. No input: 47 orders on time, none late, ten A, parts never under 3, **net about 3,850 a shift (about 14,760 before)**: grain is 72.9% of revenue, every other cost line under 1.5%. Rate sweep: best net per tonne at 0.8 (201.7), but 0.8 to 1.2 are within about 1%. **Findings to act on:** (1) at line rates 1.6 and 2.0 the line jams: wheat and corn mix in one mill's input buffer and the packers fill with semolina nobody ordered, so the slider's top stalls the plant; not known whether it predates this work. (2) "Service now" won every comparison in every arm: "run on" is a dominated answer, and a "service at the quiet spell" option was built and left switched off because it never won. (3) The new Grain, Parts and Stock-held lines are booked but shown nowhere; the Chronicle's net ignores them; the replay store counts stock held as a cost; the energy dashboards do not apply the above-100% penalty. (4) One line added to `shiftReview.ts` (the dispatch lane's file) so net includes the new lines |
| 4a | 4.4, 4.7, 4.8, 4.9, 4.10, 4.11 | done but for 4.4's mitigations (passed to 4b); 454 of 465 Chronicle tests pass, the 11 failures in the quiz lane's two files, mid-edit. **4.4:** the engine values each answer (`choiceFundValue`); a deck test failed on exactly the six beaten recommendations (by 39 to 119 fund) and now passes after retuning two prices, moving two recommendations and giving "Reinvest" a cost; "Cover the roller floor" removed. **4.7:** a delegated treatment may exceed the 15% share; hand-overs follow the brief. **4.8, a judgement to tell Nell:** a seeded probe of 40 chronicles found a setting where desks reach 0 (D10's literal keep condition), but what they refused were lapses, not trades, so the desks were cut; saves holding desks load and drop them; the reserve at 100 or more is one long-night preparation. **4.9:** contractor traits act; the wet-year button says "dry"; on-time gains by tier so demanding buyers warm in about twelve programmes; the certifier reviews once a crop year. **4.10:** two rulings raise a member's standing objection, met by concession; a concession that cannot carry the vote is refused before the money is spent. **4.11:** the administrator is an offer; refusing costs the federation 10; the notice names what brought it; the ICA principle quoted from ica.coop. Accepting brings no benefit yet (to 4b). Also fixed: the long night's counter and the Portuguese tab strip |
| 4b | 4.2, 4.5, 4.6; the administrator's benefit; mitigation pricing; two stale lines | done; all 510 Chronicle tests pass (88 files); not yet seen on screen. **4.2:** a Length column on the charter, 27 or 63 shifts; everything scheduled is placed at floor(shift × 27/63) and each trial's window and tonnage shrink with it (Wet Harvest 4 to 7, Inspection 8 to 11, Bakers' Rush 12 to 15, Grid Winter 16 to 19, Great Programme 21 to 25, the long night 23, epilogue 27); old saves are 63 shifts; a 63-shift run is pinned unchanged by a digest of every close. **4.5:** each trial names what it tests on the floor and a failure names what broke it; Grid Winter is announced six shifts ahead with both levers. **4.6:** the wet year's penalty is 5 (was 6): with meters 95.5 on an unworn line, 94.5 without; the crop card prints the margin and, under the minimum, what restores it. Best stamp by crop year, unworn: typical, bountiful, dry 99.5; wet 94.5, 95.5 with meters, 99.5 dried; sprouted 90.5, 91.5 with meters, 97.5 blended. Accepting the administrator now has the federation pay upkeep for its four shifts; incidents are priced from their effects, and rush freight (65) and the relief lorry (35) retuned. **Rule changes to tell Nell:** wet penalty 5; relief 35; rush 65; the federation pays upkeep; Grid Winter's notice; the short form's windows and tonnages. Passed to 4c: the margin is read from the 99.5 ceiling though a serviced line stamps 97.6 to 99.2; Grid Winter's 0.08 cap cannot bind at the measured energy; forecast mitigations cost several times the damage they avoid; a short chronicle's failed trial can be quizzed with the full form's cause |
| 4c | the fund reads the real net; the Chronicle probe; 4.1; 4.3; fix-ups; D17; seasons; forfeits | done but for two gates; all 552 Chronicle tests pass (98 files); not yet seen on screen. The probe (`src/systems/__tests__/chronicleProbe.playtest.test.ts`) plays whole chronicles on the real plant: idle, attentive and skilled styles, 8 seeds, both lengths. **Gates:** an idle player ranks in the lowest two (met); gold is reached by the skilled player in 63 of 64 trial runs and by the idle one in none (met); the fund never locks (met; lowest balance 37); plans pay back within 25 shifts (wind 6 to 11, heat recovery 6 to 10, vibration 1 to 6; met); a buyer's fund ends under three times the dearest plan (short met; full: one run of eight about 48 over, being tuned out in 7c). **Not met:** an idle player's fund (they buy nothing, so it is their whole income: the assertion was wrong for that style); and "answering every decision adds at least 25 points": answering Chronicle events alone adds 17 to 18, because standing, the Inspection, trial gold and the long night need floor actions; answering events and acting on the floor adds 28 (short) and 37 (full). **Constants (rule changes to tell Nell):** the fund is now in the plant's own currency (`CURRENCY_TO_FUND` 1) and the reinvestment share is derived from measured net (0.25 before, about 0.0102 now); trial tonnage is 1.2 times 19,500 kg a shift over the shifts gold allows; Grid Winter's cap 0.08 to 0.008 a kg, so output per hour decides it; plans, mitigations and two event prices rescaled to the new unit (wind 400 to 60, heat recovery 280 to 45, vibration 200 to 20). A saved fund balance keeps its number and is read as currency. **4.3:** a fund source "Costs plans avoided" beside each plan's upkeep; a paired control on the real tick books exactly the energy wind and heat recovery save; the wear credit is unproven (the control booked no parts either way). Also: the margin card reads the line's own stamp and the grain being milled; the bench earns no know-how, standing or Inspection close; forfeits cost a customer what a late close does; seasons are recorded once each and read by a new epilogue section; D17's wording applied. Era gates and the rank ladder were not changed |
| 7c | 7.7 tempering; Chronicle close-out | done; 107 files, 643 Chronicle, proposal and harness tests pass on the final tree; not yet seen on screen. **7.7 (a choice made for Nell):** once a shift, under a charter, when the wheat the line will mill reads wet, a Tempering card offers "Temper as it comes" (flour carries the year's 5 points) or "Dry first, then temper" (no points, at the drying's energy, about 50 to 95 a shift, starting after the 2-hour rest). Figures are Kansas State MF-2353's only; a "longer rest" option was cut for want of a source; **no dry-year card was built, because the brief's premise was wrong: a dry year has no penalty today.** Wet year, ten shifts: never dry 0 of 16 strong-white orders, 15 forfeits, net 15,822; always dry 16 of 19, 2 forfeits, net 41,105; the partner's choice the same. **The ask rule says decide and tell: drying won 114 comparisons of 114**, so the partner dries and says so. The Chronicle's flat wet-year payment is gone; the wet-intake event keeps its id and answers, which now make the card's drying free or half price for three shifts; old saves that paid stay treated. Datalinks' tempering entry gained "At This Mill". Close-out: the probe's every-style fund assertion removed with its reason; the reinvested amount 38.8 and measured net 4,259 (share 0.91%); the short probe passes every gate but the 25-point one; `grainStamp.ts` imports the tick's helpers; only the player's own lab test earns; `docs/CHRONICLE.md` current. No charter: the harness is identical to the kilogram (209,500 kg, net 42,593.2). To watch: attentive players sit at 0.0079 a kg against Grid Winter's 0.008 cap, so drying in a wet Grid Winter would break it |
| D14 | the wider helper-text cut | done (16:20 GMT). About 440 strings found: about 172 cut, 107 trimmed to the state or refusal, 6 moved, 16 replaced, about 140 kept with reasons. About carries the one disclaimer; the PA voice credit stays. The loading screen's nine invented "principle" quotes are replaced by nine sourced milling facts, each with its publisher. AI narration cards no longer show (their Datalinks unlocks still happen). A catalogue test fails on a new hint-named key or more `title` tooltips. Seen in screenshots: both loading covers, Settings, SCADA, Safety, Overview, the guide card, the AI card. Not seen: the cooperative and Autonomy surfaces, the Inspector, the shift debrief, About. Found: `index.html`'s language script reads `navigator.languages`, against D-048 |
| **commit** | 16:25 GMT | the whole worktree committed on `claude/mechanics-review-20261112` (748 paths: 464 changed, 284 added, 2 deleted) and **rebased onto `origin/main` with no conflicts** (main had gained five commits: the pose-hold change and a Playwright pin). Not pushed |
| probe | the full-length Chronicle probe on the tree at 15:45 GMT | done: nine gates pass, four fail: (1) full length, Wet Harvest: the skilled player reaches gold in 3 of 8 seeds (the wet year is now real: drying, intake, forfeits); (2) full length, one buyer's fund ends at 1,481 against the 1,380 cap; (3) both lengths, attentive minus idle is 19 and 21 against 25. With the Chronicle final-tune lane |
| close | three lanes from 16:35 GMT | (a) closing sweep: three failing tests, scripts naming cut strings, helper text in the cooperative's simulation copy, four places the cut left less clear, AI reflections' unlocks, D-048 in `index.html`, a waiting service across a reload, format and lint, then every test folder; (b) the Chronicle's final tune against the four failing gates; (c) the decision-log entries (D-080 onward, all `[proposed]`), `CLAUDE.md`'s stale sections, and the evidence folder into the branch |
| 5a | 5.3, 5.4, 5.5, 5.9, 5.10 (the season's rules) | part done; all 111 workplace test files pass (681 tests); not seen on screen. **5.3** done with gaps: in a solo season the player is Packing and the store refuses the player's understand, vote and cover for other roles; Coordinator, Quality and Maintenance answer from their values; "(blocked)" labels gone; the camera goes to the refuser. Gaps: the player still makes the Coordinator's Thursday and Friday calls, starts Quality's inspection and casts the chair, sobras and handoff ballots. **5.5** done: read from the Câmara dos Deputados' published text of Lei 5.764/71 (planalto redirected to a home page), articles 4 VII, 28, 44 II and 89 quoted with the URL; sobras settle at the season's end, 10% to the Reserve Fund and 5% to FATES first, the rest to the members' chosen destination by minutes worked; a losing shift shrinks the pool. **5.4** partial: every pace is 1.0; cover and resequence change nothing the plant reads and now say so (resequence needs `planShipment`, cover a plant reader of role availability). **5.9** partial: the chair breaks 2 to 2 ties, the reserve carries over and pays purchases with a receipt, the two autonomy settings merged. **5.10** partial: the seed draws pressure order, the decliner and Monday's minute. Six far-side tests in files it did not own now fail |
| 5b | 5.1, 5.2, 5.8; the gaps in 5.3, 5.9, 5.10; far-side tests; resume at restart | done; 757 of 764 workplace tests pass, the seven failures in files other lanes were editing; not yet seen on screen. **5.1:** the panel shows the next step only; visible words 12 idle, 101 at a season's start, 117 at most (Portuguese 14, 113, 133), against 350 to 550 before; a first approval takes 7 clicks; tools, replay and exports sit behind one disclosure. Refusals render at the button they answer; the lab's three helper paragraphs are gone. **5.2:** a five-row table (Packing, Quality, Maintenance, Coordinator, the adviser) by Understands, Policy vote, Cover; only Packing's row is live; the others show their answer and one line of their own; no digits. **5.8:** "Cooperative season" / "Temporada cooperativa" everywhere; each charter title defined once; the chair is "Presidência" (the law's own word), the role stays "Coordenação". **5.3 whole:** each role makes its own calls and casts its own ballots; the store refuses the player casting for another. **5.9:** an adopted arrangement survives the experiment's close, a reload and later seasons; two handoff answers that did nothing are removed. **5.10:** a second season arriving by itself was proven through the store and passed first time (no defect). A paused season resumes only after RESTART LINE. **Rule changes to tell Nell:** Friday is always an installment in solo play (keeping the full order cannot be chosen); the unlinked season start is gone in solo play; changing the terms asks every check again. A native Portuguese reader is still owed (D20) |
| 6a | 6.1, 6.2, 6.7 | done but for a two-line patch in the first-person controller (passed to that lane). A driven forklift slows and stops for people with the autopilot's own constants, forward and in reverse; a near miss is logged once per approach. E at a station, lined up, picks or drops (the autopilot's own pick runs with the driver aboard); a pick with forks wrong or above a crawl is refused with an error line; a phone button does the same. With the west-walkway speed zone the seeded run has no near misses, without it some. The per-forklift Efficiency figure is gone. Stricter than planned: the speed refusal applies whether or not anyone is near |
| 6a | 6.3, 6.4, 6.8 | done, the floor drawing not yet seen in pixels. CLEAR and END DRILL leave every machine idle; RESTART LINE brings back what the stop idled and takes focus; the bell says the line is ready (source for the comment: Machinery Directive 2006/42/EC Annex I 1.2.4.3, quoted from EUR-Lex; no ISO claim made). The drill's record names each zone's result, any forklift that blocked it and the plant-clock time; routes and refuges draw on the floor while the Safety controls are open, red where a forklift stands (`EgressRouteFloor.tsx`; one import and one mount line added to `MillScene.tsx`). Weather buttons removed; a severe-rain incident holds the storm. Passed to the maintenance lane: two paths that could start a unit before RESTART LINE, the PA line "We're back in production", a route from the bell alert to Safety. Deliberate: no agent command restarts the line. Left: the season resumes at CLEAR while the line is still idle |
| 6a | 6.5, 6.6, 6.9, the phone ladder, the forklift E patch | done but for two things passed to the Phase 6 tail; not yet seen on screen. Walls, jambs and open door leaves stop walkers and the four egress routes walk clean; a driven forklift still passes through walls (one check to add in the forklift's world). Paces, sourced: in the hall 1.4 m/s walking and 2.7 with Shift, outside 2.7 and 5; the 128 m hall diagonal takes 91 s (47 with Shift). Residents answer E or a tap with a card; the windmill and henhouse work in first person and unlock a Datalinks note. The silo ladder's reason is the silo's reading at the top; a phone climbs it; the mini-map shows the player, exits and trucks; help lists R, Q, X. E in the cab asks for work. **The town hall ramp does not meet Approved Document M** (Vol 2 Table 1 and 1.26: a 4.8 m flight may rise about 0.32 m, these rise 0.4; width 1.3 m against 1.5): geometry unchanged by this lane, passed to the tail to fix |
| 6 tail | forklifts and walls; card labels; the windmill note; the drill's descriptor | done: a driven forklift stops at the hall's walls and passes the two service doors (a personnel door, 1.0 m, refuses its 1.2 m body); lane return from outside goes round the hall and in by a service door unaided (about 240 s from behind shipping). Card labels come from the register by id in both languages; the quiet room's booking times are off the person's card and painted on the room (relied on D-058: "a glazed quiet room ... booked 10:00-10:30 and 14:00-14:30"); the sign is not yet seen in pixels. The windmill note is true for both routes; the henhouse's facts are sourced to Defra's 2018 code of practice. The drill's agent descriptor says the line stays idle until RESTART LINE. Left: fence, hedges and staff-facility walls are still not solid to a forklift |
| 6 ramp | the town hall ramp to Approved Document M | **done and seen** (east and plan screenshots: two dark flights, light landings, white kerbs, rails both sides, the privet moved out). Two 6.8 m flights at 1:17 (Table 1 allows 1:16.8 at that going), 1.505 m clear, a 1.55 m mid landing, a 2.2 m head landing and a 1.25 m paved foot landing; 15.15 m in all; each limit quoted with clause and page in `DOC_M_RAMP`. Of 1.26's fourteen provisions, eleven are met, one is not needed, and slip resistance and friction are not modelled. The privet's side run moved 0.3 m and its back return was cut from 3.4 m to 0.94 m; three rail lamps moved; the lamp atlas was re-baked (asset version `14ffdb8f`). A new test pushes a 0.72 m wheelchair from the street to the door through the real walking checks. Left, outside the ramp: the portico's own door landing is 0.8 m deep (the hall model); there is no sign to the ramp from the square. History: | The tail read the document and parked it: today 1:12 over 4.8 m rising 0.4 m (about 0.32 allowed) and 1.3 m wide (1.5 required); a compliant layout is two 6.67 m flights at 1:16.7 with a 1.5 m landing, 14.83 m in all |
| 7a | 7.3, 7.4 | done, not yet seen on screen. **Quiz:** each round leads with questions from the player's own record (what followed a ruling, what an installed plan changed, why a trial failed); only a first attempt earns (saved `quizAttempted`; old saves count answered questions as attempted); options reorder by the seeded generator. "Reading a note in Datalinks counts once" was not reproduced: it already did; the one real gap (a note read before the Chronicle unlocked it) is closed. **SCADA:** during the network incident about a quarter of read-only tags read UNCERTAIN and hold their last value, the same subset for the same incident, clearing when it resolves; never in benchmarks. Alarm priority follows consequence: people keep CRITICAL and HIGH, plant drops to HIGH and MEDIUM, the rest to MEDIUM and LOW (before, every alarm was HIGH or CRITICAL). An uncertain reading can no longer raise an alarm (a held zero used to raise one on restart). Panel: filters in Portuguese, "1 tag", three subtitles cut. **To verify in the review pass:** a tripped mill whose temperature tag is held may not come back until the incident closes; the bell takes only HIGH and CRITICAL, so it now hears fewer alarms |
| 7a | 7.1, 7.2 | done, not yet seen on screen. Datalinks opens with a new category, "How Flour Is Milled": six entries in both languages (cleaning and tempering; break and reduction; purifiers; extraction rate and ash; what a baker needs; dust explosions), each printing its sources, each linked from a delivery stage and a cutaway. Sources read in the raw on 13 November and listed in `src/stores/millingSources.ts`: UK Flour Millers, the Wheat Marketing Center's testing-methods handbook, Kansas State MF-2353, the American Society of Baking, US patent 5,678,777, Scanlon and Dexter 1986, HSE's food-industry dust guidance, the US Chemical Safety Board's 2006 study, Defra's laying-hens code. Left out for want of a raw source: the 1.25:1 reduction differential, the purifier's history, HSE's concentration figure, the CSB casualty counts. Cutaway lessons now ask what the cutaway shows (which roll turns faster; where a deck sends its overs; how full the silo is, read live), with the answer's position seeded; the front roll turns 2.5 times as fast as the back. The shader-cache entry moved to the developer section |

**Tail list (small things lanes left, for the closing sweep before the review pass).**
A finished cutaway lesson is recorded for the session only (the inspection store is pinned as never saved): record it in the knowledge store. The rollers on the mill's outside view (`CompactMachines.tsx`) still turn at equal speed. Fences, hedges and staff-facility walls are not solid to a driven forklift. A tripped mill whose temperature tag is held during the network incident may not come back until it closes (unverified). The bell takes only HIGH and CRITICAL alarms and so hears fewer. D14's wider helper-text cut (reports 02, 03, 04, 06, 09, 10) and the loading quotes. The season resumes at CLEAR while the line waits for restart (with 5b). `CLAUDE.md` line 447 and its Chronicle and drill sections now describe old behaviour (for the merge). The guide's second "Why it matters" row: check it against D-012 on screen.
| 7b | 7.5 to 7.9 | wait for the plant lanes (3b) and the Chronicle lane (4b): they touch wear, the shift review and the treatment the tempering decision replaces |
| 2c | D11 rest and the bell key's handle | done, not yet seen on screen: the tracker widget, Overview, the phone sheet, Autonomy and the multi-objective dashboard show the open programme (tonnes shipped of committed, next due, late) and nothing when none is open; the agent projection gives `campaign.programme` in place of `production.productionTarget`; the Overview export's shape changed the same way. Left for the wave's tail: `productionTarget` and `DAILY_TARGET_BAGS` still sit in saved sessions (removal needs a `REMOVED_PHYSICAL_FIELDS` entry in `physicalSession.ts` and its pinned-field tests); `AlertSystem.tsx`'s dev sample alert; the tour's "today's target"; `StatusHUD` keeps its own copy of the rounding. `CLAUDE.md` line 447 ("the day's target") is stale, for the merge |
| 0.2b | lever arms on the harness: a mill down 60, 120, 240 min; line rate 0.6, 1.0, 1.2; routine service; the binding constraint | running |

**Order for Phase 3, set after the measurement (advisor review, 19:30 GMT).**
Line time looks free today (never repairing ships the same tonnes), so 3.3, 3.6
and 3.7 cannot be priced in lost tonnes until the lever arms say what binds.
(1) Whole gate to 0 failed on Phases 1 and 2, then a harness run at that
checkpoint as Phase 3's "before". (2) 3.0 alone, with defaults equal to today's
controller and the harness output required to be identical. The partner's
defaults must include accepting programmes and routine service, or a no-input
run stops delivering at shift 9 once 3.4 holds off-spec stock. The "other
answer would have cost" figure comes from the function that prices the button.
(3) 3.4 with 3.2. (4) 3.3, priced through what binds. (5) 3.1, 3.5 to 3.8, two
or three lanes at a time. The no-input invariant is pinned on the ten-shift
harness, not on `playableJourney`. Each lane that changes the truck tick, the
repair buttons or programme acceptance updates the harness.

### Which levers bind (item 0.2b, mid-wave tree, 12 November 20:15 GMT)

Same harness, ten shifts on arm (a)'s policy. Results in
`docs/reviews/mechanics-20261112/balance/plant-levers-wave2.json`.

| Lever | Shipped kg (of 179,500) | On time / late | Grade | Net over ten shifts |
|---|---|---|---|---|
| One mill down 60, 120, 240 game min mid-order | identical, to the kg | 44 / 0 | unchanged | -84, -174, -195 (the 90 an hour on an open work order) |
| Two of four mills down 240 min | identical | 44 / 0 | **better**: ten A (a repair's restart services the mill free) | **+57** |
| Line rate 0.6 | identical in total; 3 t moves from shift 2 to 3 | 44 / 0 | six A | -260 |
| Line rate 1.0, 1.2 | identical | 44 / 0 | eight A, nine A | +237, +501 |
| Maintain pressed on every wear prediction (9 presses) | identical | 44 / 0 | ten A, lowest quality 97.6 | +1,023 |

**The dock and the order book set the tonnes; nothing on the line does.** Packed
stock owed to a customer waits for a truck 92% of the game time; no truck ever
waits for product. The line is idle with everything owed already packed for
2,722 of 4,800 minutes. Trucks leave about six times a shift with 2.5 to 3.7 t,
each carrying only what the next order still needs.

So today: breaking two mills pays; a faster line is better on every measure and
worse on none; service is free (parts are restocked by every grain truck and no
money line charges for them) and always right. Quality is 99.5 less 0.2 per
point of average efficiency lost (`productPathQuality`, `UnifiedGameTick.ts:362`);
efficiency falls with wear (`calculateEfficiency`, `productionStore.ts:239`).

**What Phase 3 must therefore do before any card is priced:** make the line
matter. Either the order book presses on capacity (committed tonnes sized so
the packers are the limit for most of a shift at the default rate) or line time
gets a price of its own. Until then 3.3, 3.6 and 3.7 have nothing to charge.

### What would make the line matter (item 0.2c, mid-wave tree, 12 November 21:55 GMT)

Results in `docs/reviews/mechanics-20261112/balance/plant-demand-wave2.json`.
Arm (i) is every programme accepted with routine service; (ii) adds one mill
down 240 game minutes mid-order; (iii) adds one mill down 60 minutes in a
dispatch wait.

**The ceilings.** A truck carries 5,000 kg but loads only what the active order
still owes (`UnifiedGameTick.ts:1149-1170`), so loads average 3.0 t. About 5.9
trucks leave a shift whatever the demand, so the dock tops out near 29.5 t a
shift with full loads. Grain arrives at 15 t a delivery, about six a shift;
five 50 t silos never ran dry. In-process stock is about 52 t (mills 16,
sifters 18, packers 18), which is why arm (b) stopped at exactly 302 t: every
buffer full and no order to ship against.

| Setting | (i) shipped, ten shifts | (i) on time / late / short | Tightest margin, min | (ii) against (i) | (iii) equals (i) |
|---|---|---|---|---|---|
| as shipped | 179.5 t | 44 / 0 / 0 | 43.5 | identical | yes |
| orders ×1.5 | 245.0 t | 41 / 0 / 0 | 37.3 | identical | yes |
| orders ×2 | 225.0 t | 19 / 8 / 9 | -76 | identical | yes |
| orders ×3 | 249.5 t | 1 / 20 / 20 | -252 | identical | no |
| due windows ×0.75 | 179.5 t | 34 / 10 / 10 | -9.8 | identical | yes |
| due windows ×0.5 | 179.5 t | 1 / 43 / 43 | -115 | identical | yes |
| line rate 0.5 | 181.5 t | 44 / 0 / 0 | 43.5 | -2.5 t, one order unfinished | yes |
| line rate 0.4 | 174.0 t | 42 / 0 / 0 | 43.5 | -0.5 t | no |
| packer rate cut alone | 181.5 t | 44 / 0 / 0 | 43.5 | identical | yes |

**No order size and no due window makes a mill outage cost anything.** Even
with orders doubled and eight of them late, losing a mill for four hours changes
nothing, because 52 t of stock sits between the mills and the packers. Only a
line rate of 0.5 passes all four proofs, narrowly, and the player's own slider
undoes it. Sizing the order book up, my first proposal, is therefore wrong.

**Being measured now:** an outage of the packer on the active order (the unit
downstream of the buffers, about 93% utilised while an order is open), mid-order
and in the wait.

**Packers and sifters too (0.2d, 22:15 GMT).** Thirteen arms: the packer on the
active order down 30 to 240 minutes mid-order (on the tightest order and an
ordinary one) and in the wait; its sifter down; two of three packers down 120
minutes. Every arm matched arm (i) to the kilogram and every order finished at
the same game minute. A stopped packer drops out and the others split its work
by rated capacity (`materialFlowStore.ts:1170-1199`); one packer covers a rush.
**There is no line lever.** The trucks set tonnes and completion times.
Results: `balance/plant-packer-outage-wave2.json`.

### Phase 3 re-planned on what responds (proposed D22, 12 November 22:40 GMT)

**D22 (proposed; beyond D1 to D21, so it is listed first for Nell).** The dock
is the mill's constraint and stays so. Floor decisions are priced in what the
plant measurably responds to (truck slots, grade against the order's minimum,
commitment, and money once grain has a price), never in line tonnes. The rows
3.3, 3.6 and 3.7 above said "costs tonnes" and "kg lost": those working-ifs are
replaced here. Everything sits behind named constants so it can be turned back.

Facts this rests on (read from the worktree, file and line in the read-only
report of 22:35 GMT):

- **Money limits nothing in the plant.** No cost, grade or balance refuses
  anything; net feeds only the grade's `margin >= 0` test and the Chronicle's
  fund. All cost lines together are 4 to 6% of revenue. There is no grain,
  labour or parts cost. `CURRENCY_TO_FUND` assumes about 2,000 net a shift;
  the plant makes about 15,000.
- **Grade.** An F on shifts 9 and 10 came from `qualityFailureKg > 0` alone
  (`shiftReview.ts:236`). Any open work order at the close is a risk (B at
  best). The kg bar (4,000 a shift) never binds.
- **Quality is one plant-wide figure stamped at packing.** Servicing a unit
  lifts the stamp on all 52 t still in the buffers. A broken unit drops out of
  the mean, so a breakdown raises quality (`UnifiedGameTick.ts:359-372`).
- **A failing batch ships and is paid**, less 0.08 a kg. The lab passes
  anything at 70 or more and never reads the order's minimum. Every programme
  carries all three customers (95, 92, 90), so flour at 92 to 95 has an order
  it could fill.
- **Commitment.** One programme (11.5 t, 13.5 at night) is open at a time and
  nothing accepts one but the player's two buttons. Over-commitment is
  impossible; the dock could carry about 60% more than is ever asked of it.
- **Three exploits, confirmed in code:** a repair's restart services the unit
  free; parts restock with every grain truck and cost nothing; a faster line
  wears less and uses less energy per tonne.

| Item | Replaces | Change | Working if (on the ten-shift harness unless said) |
|---|---|---|---|
| 3.0a The seam | new | "Which order this truck loads, and how much" becomes a pure `planShipment` with today's rule as its default (`UnifiedGameTick.ts:1131-1218`), adding no module state; crediting honours the chosen order | Harness output identical to the kilogram and the minute. Always-fill and always-partial arms differ from the default |
| 3.0 The card | 3.0 | As planned: the partner's proposal, cost on each button, a default, a window on the game clock, then the default runs; the record prices the other answer with the same function that priced the button. The partner's defaults include accepting the next programme and routine service | An unanswered run equals arm (i) (accept and service): 44 of 44 on time, ten A. At least one proposal a shift where the other answer was better |
| 3.4 Dispatch by grade | 3.4 | A batch's stamp is read against the order's minimum at availability, loading and credit. Flour under an order's minimum is held for it and offered to an open order it does meet. The lab reads the order's minimum. Closes 1.9's three loose ends | With no service, shifts 9 and 10 ship no failing kg to the 95 order; the 92 order takes it; no order is paid for flour under its minimum |
| 3.2 The bench | 3.2 | As planned | As planned |
| 3.3 The maintenance window | 3.3 | Service takes the unit offline on the game clock (D7). A restart after a repair no longer services the unit. Parts cost money and are ordered, not handed out by every grain truck. A broken unit no longer lifts quality. The price of running on is grade: wear lowers the stamp, and under 3.4 that is held stock and a late order | Breaking two mills no longer beats servicing them. Never servicing costs at least one late 95 order by shift 10. Servicing in the wait and mid-order cost the same tonnes (the plant has the spare capacity, and the card says so) |
| 3.6 The mill setting | 3.6 | One rate. Wear and energy per tonne rise with rate above 100%, so the best rate is inside the range | A rate sweep whose best net per tonne is neither end of the slider |
| 3.7 Commitment | 3.7 | The partner may propose taking the next programme while one is open, with the lateness it risks on the button. The rush stays a choice of order | Taking a second programme early wins in a quiet shift and loses when the dock is already full (measured: orders at 1.5 times ship 245 t on time, at 2 times 225 t with eight late) |
| 3.8 Grain has a price | 3.8 | As planned, source-checked, and before the cards are tuned, because it sets the size of every margin | Grain is the largest cost line; `CURRENCY_TO_FUND` is re-derived in 4.1 |
| 3.1, 3.5 | same | As planned, as proposal types on 3.0 | As planned |

Order: 3.0a and 3.0 first (separate files), then 3.4 with 3.2, then 3.3, 3.6
and 3.8 in one lane (stores and cost loop), then 3.1, 3.5, 3.7 as proposal
types. Before any of it: the whole gate at 0 failed, a harness run on that
tree as the "before", and the Phase 1 and 2 surfaces seen on screen.

### The plant as measured (item 0.2, mid-wave tree, 12 November 19:20 GMT)

Ten 480-minute shifts at pace 30 through the real tick and stores, line rate
0.8, no renderer. Trucks, machine load, programme acceptance and repairs only
advance inside components, so the harness makes the same store calls they make
(`TruckBay.tsx:3242-3342`, `MachineSimulationController.tsx:211-230`,
`PlayableShift.tsx:1486-1492`, `PredictiveMaintenancePanel.tsx:412-470`).
Forklift, bus and safety holds on trucks are not modelled, so shipped tonnage
is an upper bound. The run was on the shared tree after wave 1a, not on
`ffe9e70e`. Controls: two runs identical; pace 60 gives the same packed,
shipped and revenue for shift 1 (milled +1.3%, energy -0.15%).

Arm (a), every programme accepted and every repair pressed:

| Shift | Milled t | Packed t | Shipped t | On time / late | Revenue | Energy | Net | Grade | Breakdowns | Min down |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 17.7 | 11.5 | 19.5 | 4 / 0 | 15,455 | 174 | 14,948 | A | 0 | 0 |
| 2 | 37.5 | 25.0 | 17.0 | 5 / 0 | 15,795 | 134 | 15,200 | A | 0 | 0 |
| 3 | 17.2 | 11.5 | 18.5 | 3 / 0 | 14,635 | 150 | 14,152 | A | 0 | 0 |
| 4 | 35.0 | 23.0 | 15.0 | 5 / 0 | 13,795 | 230 | 13,123 | A | 0 | 0 |
| 5 | 20.1 | 13.5 | 19.5 | 4 / 0 | 16,095 | 99 | 15,568 | A | 1 | 52 |
| 6 | 35.0 | 22.8 | 17.0 | 5 / 0 | 15,435 | 185 | 14,808 | A | 0 | 0 |
| 7 | 17.2 | 11.7 | 19.5 | 4 / 0 | 16,095 | 178 | 15,534 | A | 1 | 34 |
| 8 | 40.6 | 23.8 | 17.0 | 5 / 0 | 15,675 | 137 | 15,063 | A | 0 | 0 |
| 9 | 17.8 | 14.7 | 21.5 | 4 / 0 | 17,455 | 162 | 16,555 | F | 0 | 0 |
| 10 | 34.4 | 20.2 | 15.0 | 5 / 0 | 13,795 | 218 | 12,667 | F | 3 | 101 |

Arm (b), nothing accepted: shift 1 ships 8.0 t (net 4,655, grade A); shift 2
mills 11.0 t and packs nothing; shifts 3 to 10 make and ship nothing, are
ungraded, and lose 297 to 391 a shift. Arm (c), accepted but never repaired:
ships and earns exactly what (a) does over ten shifts, ends with four units
down and grade B.

What this changes:

1. **Throughput is about 18 t a shift (15 to 21.5), not the 3 to 5 t the
   Chronicle probe was fed.** Orders and the truck yard set the pace; packers
   are idle 66% of the time. Phase 4's re-tune (D3) cites this table.
2. **Finding 1 needs a qualifier.** "With no input every order ships on time"
   holds only once a programme is accepted. With none accepted the plant stops
   by shift 3 with 302 t of inventory. Accepting is the one input that matters.
3. **Off-spec flour pays in full, measured** (D6). Shift 9 shipped 5 t below
   spec, was graded F with no late order, and was the best-paid shift.
4. **Not repairing costs nothing for ten shifts** (D7, Phase 3's maintenance
   window): arm (c) equals arm (a) on tonnes and revenue.
5. **Without routine service quality drifts from 99.2 to 94.1 in nine shifts**
   and the grade falls from A to F at once. No arm pressed Maintain or ran a
   lab test.
6. **Energy is about 0.009 per kg shipped** (0.022 with automation) against the
   0.088 `docs/CHRONICLE.md` assumes; automation costs a flat 224 a shift even
   idle. Spare-parts stock never moves.

**For Nell, from wave 1a.** The keyboard-shortcuts module under `src/hooks/` was edited so the X key and the new Safety panel button share one function. It is product code and reversible.
