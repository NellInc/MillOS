# Learning surfaces and the AI partner

Paths are under `src/` in the snapshot unless they say otherwise. Every runtime claim comes from reading the code and is `[Unverified]` unless a test is cited.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Datalinks reference | `components/ui-new/dock/Dock.tsx:346` (More menu) → `components/knowledge/Datalinks.tsx:104` | Browses and searches 11 player entries, 1 developer entry and up to 37 history notes | rework (content) |
| History notes | `chronicle/history.ts:12`, unlocked by `stores/chronicleStore.ts:184` | Reads a note when a Chronicle event fires; first read earns 2 know-how (`chronicle/engine.ts:215,2610`) | keep, connect |
| Chronicle quiz | `components/chronicle/NotesTab.tsx:162` | Plays 10 recall questions; first correct answer per question earns 1 know-how (`engine.ts:2622`) | rework |
| Learning note in onboarding | `components/knowledge/LearningNote.tsx:6`, `onboarding/deliveryJourney.ts:124-277` | Opens a "Why it matters" disclosure tied to the current delivery stage | keep, tune |
| Windmill cutaway | `components/ui-new/widgets/WindmillLearningCard.tsx:9` | Four stages and two questions on the windmill's power train | tune |
| Process inspection | `components/ui-new/widgets/ProcessInspectionCard.tsx:17` | "View inside" a mill, sifter, packer, silo or henhouse; two trivial questions each | rework |
| AI narration cards | `stores/aiNarrationStore.ts:39`, `hooks/useKnowledgeIntegration.ts:52` | Dismisses a welcome card, a library card and an after-one-hour card | cut or rewrite |
| Loading quotes | `stores/knowledgeStore.ts:162`, `components/LoadingScreen.tsx:280` | Reads slogans while the game loads | needs owner |
| Rules-layer decision cards | `utils/aiEngine.ts:454`, `components/AICommandCenter.tsx:426` | Accepts, defers once or rejects a card filed every 6 s (`aiEngine.ts:32`) | rework |
| Automatic alert reactions | `utils/aiEngine.ts:826-847` | Nothing: a safety card idles the machine 1.5 s after an alarm | needs owner |
| Decision evidence replay | `components/ui/DecisionReplay.tsx` | Inspects observations, assumptions, alternatives and confidence | tune |
| Strategic layer (LLM) | `utils/aiEngine.ts:1052`, `components/ui/StrategicPriorityCards.tsx` | Reads 1-3 priorities every 45 s; can't accept or reject them | connect |
| Lights-out on-device operator | `utils/onDeviceOperator.ts:295`, `components/ui/OnDeviceOperatorRecord.tsx` | Watches the local model acknowledge and mitigate incidents within a command budget | keep |
| Jev incident routing | `components/ui/JevAdvisoryPanel.tsx` | Types incident text and gets one of five queues back (needs a key or the local model) | keep |
| Agent cockpit | `components/ui-new/widgets/AgentCockpit.tsx:37` | Drafts, previews, approves and commits a typed command; reads the receipt and trace | keep, connect |
| Chronicle delegation | `chronicle/delegation.ts:11`, `engine.ts:2040` | Sets levels 0-3; the partner answers routine events, mitigates forecasts and starts installs | keep |
| Partner brief | `engine.ts:3381` | Picks how the partner weighs answers | keep |
| Reverse an initiative | `stores/chronicleStore.ts:117` (`reverse`) | Undoes a reversible partner initiative | keep |

## What works

1. **Crop years make grain chemistry matter.** A wet year takes 6 quality points off wheat recipes, which fails strong white (95) and spares community flour (92). A sprouted year fails every wheat recipe until the grain is blended (`chronicle/cropYears.ts:4-11,52-71`). Switching recipe and paying to condition are both real answers.
2. **Dust and neglect cause fires.** A duct fire becomes more likely with each austerity shift and with an open dust-filter incident (`engine.ts:220-222,1882-1888`). The Washburn A and Albion notes fire on the same incidents (`history.ts:113,139`). This is the best pairing of play and text in the game.
3. **History notes fire at the moment they apply.** The ratchet note arrives when the federation raises the quota (`history.ts:326-331`). Rochdale and Mondragon arrive with the eras. The nomarchs note arrives on delegation, Cybersyn when the brief is set and Domesday with the first shift report. The notes are carefully written and mostly accurate (see the fact check).
4. **Bounded authority is real in two places.**
   - The on-device operator has a command budget it can't renew (`onDeviceOperator.ts:104-110`). It stands down for emergencies, drills, replays and manual control (`:121-135`), and records every outcome, including misroutes ("Acknowledged; belongs with X", `OnDeviceOperatorRecord.messages.ts:17`).
   - Chronicle delegation is capped at 15% of the fund per shift and keeps 3 shifts of upkeep before it installs anything. Know-how from the partner's decisions is halved (`delegation.ts:33-40`), and reversible initiatives can be undone.
5. **Onboarding ties each delivery stage to a Datalinks entry** (`deliveryJourney.ts:124-277`). The reference is one click from the play it explains.
6. **The agent cockpit's preview, approve, commit and receipt loop** (`AgentCockpit.tsx:186-226`) is the clearest model of supervised action anywhere in the game.

## Findings

**F1. Datalinks explains the simulator, not milling.** Severity high, rubric 6. Verified by reading.
- None of the 11 player entries covers how flour is made (`knowledgeStore.messages.ts:33-122`). They cover genealogy, alarms, maintenance, logistics, "Unified Digital Twin" and "Environment and Celestial Cycle".
- The celestial-cycle entry ends on "stable shader cache keys … allocation churn" (`:83`). It has no `audience: 'developer'` tag (`knowledgeStore.ts:217-223`), so it shows in the player guide under "World and Process Lineage".
- The welcome copy is a bilateral-alignment slogan (`Datalinks.messages.ts:20`).
- A curious adult who opens Datalinks before signing a charter learns how MillOS is built, not how a mill works.

**F2. The lab measures what the history notes teach, then hides it.** Severity high, rubric 6 and 8. Verified by grep.
- Every lot carries moisture, protein and falling number (`cropYears.ts:113-121`), and `qcReadingsForLots` computes the falling number (`:175`).
- `OverviewPanel.tsx:437-455` drops the falling number, and `QualityTestResult` has no field for it (`stores/qcLabStore.ts:24-38`).
- No component renders `moistureContent`, `proteinLevel`, `ashContent` or `particleSize`. Ash and particle size are constants (`cropYears.ts:186-187`).
- Yet the falling-number note tells the player that the falling number "is one of your laboratory's QC readings … Watch it" (`history.ts:156`). The player sees a grade, never a reading.

**F3. Accepting or rejecting a rules card teaches the wrong things about AI.** Severity high, rubric 3 and 6. Verified by reading.
- Accepting "Queue condition-based maintenance" (`aiEngine.messages.ts:16`) queues nothing. It only eases a tripped machine back to warning (`aiEngine.ts:559-574`).
- Accepting `prediction` or `coordination` does nothing.
- Accepting `optimization` always lowers the line rate by 2% (`:575-583`). That card is filed whenever nothing is wrong (`:494-496`), and no measured benefit follows it.
- "Confidence" rises when the player accepts and falls when they reject (`:601-606`), so it measures obedience, not accuracy.
- Evidence quality is hard-coded `good`, and the alternative defaults to "maintain" (`stores/productionStore.ts:465-545`).
- The "measured outcome" is a plant snapshot with no before value (`productionStore.ts:771-781`), so the player can never tell whether a piece of advice was right.
- The "CPU" and "MEM" tiles are made-up numbers derived from the card count (`aiEngine.ts:1301-1305`, shown at `AICommandCenter.tsx:286-297`).

**F4. In the live plant, trusting the AI too much or too little costs nothing.** Severity medium, rubric 3. Verified by reading.
- Rejecting a card is free. Accepting costs at most 2%.
- Safety reactions skip the player altogether: an alarm idles its machine automatically (`aiEngine.ts:845-846`).
- The strategic LLM's priorities are display-only. The decision is filed already `completed` (`:1130`), and nothing reads `strategic.priorities` except the two displays (`StrategicPriorityCards.tsx`, `StrategicOverlay3D.tsx`).
- The only place where trust has a price is the Chronicle: halved know-how and partner spending.

**F5. The quiz tests recall and can be brute-forced.** Severity medium, rubric 3 and 6. Verified by reading.
- All 74 questions are stated in their note (`quiz.ts:1-4`).
- The options are always in the same order (`quiz.ts`). A wrong answer costs nothing (`engine.ts:2628`) and rounds can be replayed (`NotesTab.tsx:205`), so guessing until right collects all the know-how.
- Opening a note also pays 2 know-how whether or not it is read (`engine.ts:2610-2619`).

**F6. The process inspection cards are patronising.** Severity medium, rubric 6. Verified by reading.
- Questions like "What enters the rollers? Grain / Closed sacks" and "What do the sieves separate by? Sack colour / Particle size" (`ProcessInspectionCard.messages.ts:29-40,67-78`) teach nothing to an adult.
- They miss the real ideas: fluted break rolls against smooth reduction rolls, differential roll speed, the roll gap, and sieve stacks that send each stream to a different next passage.
- The windmill card is better, but its retry message gives the answer away (`WindmillLearningCard.messages.ts:16,24`).

**F7. Narration and loading quotes are mostly noise.** Severity low, rubric 6. Verified by reading.
- There are four narration cards (`aiNarrationStore.messages.ts:5-14`):
  - The welcome card lists subsystems.
  - The library card is a hint.
  - The one-hour card suggests reviewing "graphics performance".
  - `emergency-active` is never triggered (no caller, `aiNarrationStore.ts:68-74`).
- The nine loading quotes are invented slogans credited to "MillOS control principle" (`knowledgeStore.messages.ts:11-25`). Neither surface goes through the PA, so D-054 isn't engaged.
- Against D-012, these are taglines and tutorial captions. So are the Datalinks subtitle and welcome text (`Datalinks.tsx:287,510-513`), the AutonomyPanel subtitle and SCADA hint (`AutonomyPanel.tsx:102,191`) and the LearningNote's "Open Datalinks…" (`LearningNote.messages.ts:6`).

**F8. A player who never opens Datalinks loses almost nothing.** Severity low, rubric 7. Verified by reading.
- Nothing in Datalinks is unlocked by doing except history notes, which unlock through the Chronicle and can be read in its Notes tab.
- Reading a note in Datalinks earns no know-how and leaves the Chronicle's unread mark in place (`Datalinks.tsx:209-214` against `NotesTab.tsx:133-137`). The better path is outside Datalinks.

## Answers to the lead's questions

**1. Curriculum.**
- **Milling.**
  - Quern, millstones and the windmill power train: reading (`history.ts:18`, `WindmillLearningCard.messages.ts:9-26`). Accurate, though the gearing is simplified: it skips the great spur wheel and stone nut.
  - Gradual reduction and roller mills: reading (`history.ts:120`). Accurate.
  - Sifting by size: reading plus the inspection card (`history.ts:129`).
  - Tempering: reading (`history.ts:165`). Accurate.
  - Doing: the crop-year penalty and a flat 200-fund treatment (`cropYears.ts:197`).
- **Running a plant.**
  - Bottlenecks and buffers: doing through orders and line speed (`knowledgeStore.messages.ts:89-90`).
  - Predictive maintenance and lockout until a controlled restart: Datalinks (`:61`) plus the maintenance panel.
  - Alarm lifecycle: Datalinks (`:53`) plus SCADA.
  - Energy cost per kilogram: doing in Grid Winter, plus the three-day-week note (`history.ts:228`).
  - The line shaft as a single point of failure: reading plus the power-sag incident.
- **Food safety and quality.**
  - Batch hold, retest and scoped recall: doing (`OverviewPanel.tsx:415-470`) plus Datalinks (`:68`).
  - The falling number: reading, and computed but hidden (F2).
  - Safe storage moisture: reading. Adulteration and the public analyst, and the Assize of Bread: reading.
  - Ergot and cleaning: reading; the only doing is holding a contaminated lot.
- **Industrial safety.**
  - Dust explosion: reading plus the fire mechanic (good).
  - Egress verification: doing (Safety panel).
  - Fail-safe stop: narration.
- **Logistics.** Bulk handling (`history.ts:147`), legible forklift intent (`knowledgeStore.messages.ts:76`), and truck and dock choreography by doing.
- **Cooperative governance.**
  - Rochdale, the 1995 ICA principles, indivisible reserves and one member one vote: reading tied to assembly votes and the reserve (`history.ts:249,339`).
  - The ratchet, OGAS and Cybersyn: reading tied to quota and returns.
  - Accurate, apart from the items in question 3.
- **Working with an AI.**
  - Bounded delegation (nomarchs note, delegation levels), a brief decided in advance (Cybersyn), legible evidence (Datalinks `autonomous-evidence`), the operator's grant budget, and preview, approve and commit.
  - What the plant's own decision cards teach contradicts this (F3).

**2. Gaps.**
- **Missing altogether:**
  - Wheat cleaning (screens, aspirators, de-stoners, gravity tables, colour sorters).
  - Tempering targets and rest time.
  - Break, sizing and reduction passages.
  - Purifiers.
  - Extraction rate against ash. Only "85 per cent extraction" is named, at `history.ts:219`, and ash is a constant.
  - What protein and falling number mean to a baker.
  - Lockout and tag-out as a person's procedure.
  - Overall equipment effectiveness. Availability, performance and quality exist as metrics (`productionStore.ts:397-402`) but are never multiplied or named.
- **Only named:** dust explosions (no fuel, oxygen, ignition, dispersion and confinement model), hazard analysis and critical control points (never named), alarm priority (named in `knowledgeStore.messages.ts:53`, never taught).
- **Teachable by existing mechanics:**
  - Falling number and protein, through the QC readout and the recipe thresholds.
  - Tempering, through the wet and dry crop years.
  - Extraction and ash, as a recipe dial using the existing ash field.
  - Overall equipment effectiveness, from the three existing metrics.
  - Hazard analysis and critical control points, through the hold/retest/recall flow, where the moisture and contamination checks are already the control points.
  - Dust housekeeping, through austerity and the duct fire.

**3. Fact check.** I checked 34 facts against my own knowledge and searched the doubtful ones.
- **Correct:**
  - The Washburn A explosion (2 May 1878, 14 plus 4 dead) and the Albion Mills (1786; fire on 2 March 1791; first steam-powered commercial flour mill in the UK, [Wikipedia](https://en.wikipedia.org/wiki/Albion_Mills,_Southwark)).
  - Domesday (1086, about 5,600 to over 6,000 mills), Weedley in 1185, Vitruvius, and Barbegal's 16 wheels.
  - Brindley and the Bridgewater Canal (1761), and Smeaton's Copley Medal (1759).
  - Evans's patent (1790, the third US patent) and *The Young Mill-Wright* (1795, 15 editions).
  - Dart's elevator, in service in 1843.
  - The falling number: Hagberg and Perten at the Swedish Institute for the Crafts and Industries, published 1960 (AACC 56-81).
  - AHDB's 65% equilibrium relative humidity and 14.5% moisture ([AHDB](https://ahdb.org.uk/knowledge-library/how-the-grain-store-environment-affects-pest-fungi-insects-and-mites-levels)).
  - Dudley's dryer: the Science Museum dates it 1929 in its title and 1930 in its description, so "around 1929" holds.
  - The Assize of Bread: amended in 1822 and 1836, repealed in 1863.
  - Bread rationing from 21 July 1946 to July 1948. The three-day week from 1 January to 7 March 1974.
  - The Corn Laws: 80 shillings, 1828, 1838, 1846.
  - Rochdale: 21 December 1844, ICA principles in 1937, 1966 and 1995.
  - Mondragón's Ulgor foundation stone, 14 April 1956 ([Mondragon](https://www.mondragon-corporation.com/en/history/)).
  - Woodbridge tide mill, 1170 to 1957. The Roda nilometer, AD 861. Heit el-Ghurab's bakeries, 1991.
  - The Met's figure: painted limestone, later Dynasty 5, probably Giza ([Met 1979.403](https://www.metmuseum.org/art/collection/search/543905)).
  - Berliner (1957), Birman (1978) and Weitzman (1980). The ICA 1995 quotations. Chorleywood (1961, 80% of UK bread). Ergot and St Anthony's fire.
- **Wrong, doubtful or unsourced:**
  - *Buffalo had ten elevators "by the late 1840s"* (`history.ts:147`). Sources give about ten within fifteen years of 1843, so the mid-1850s, and half a dozen within a decade ([Wikipedia, Joseph Dart](https://en.wikipedia.org/wiki/Joseph_Dart)). Change to "by the mid-1850s".
  - *Glushkov warned that planning would occupy "nearly the entire adult population" by the mid-1980s* (`history.ts:312`). The sourced figure is that the planning bureaucracy would grow almost fortyfold by 1980 ([Wikipedia, OGAS](https://en.wikipedia.org/wiki/OGAS)). "November 1962 … to Kosygin" is unsourced in the encyclopaedia; Peters' *How Not to Network a Nation* should be cited if that is the source.
  - *Textile Bag Manufacturers Association booklet in "1933"* (`history.ts:285`). The dated copy is February 1937 ([U. Alabama, Dirt Poor](https://dirtpoor.as.ua.edu/?p=523)). Change to "in the 1930s".
  - *Cybersyn's operations room "not finished until late December 1972"; "about two thousand telexes a day"; "two hundred trucks … against forty thousand"* (`history.ts:321`). The sources give a prototype in 1972 and working components by January 1973 ([Cabinet, Medina](https://cabinetmagazine.org/issues/46/medina.php)). Wikipedia gives about 200 trucks and no 40,000. These need a page citation from Medina's *Cybernetic Revolutionaries* or a softer wording.
  - *Haggenmacher "born in Winterthur"* (`history.ts:129`). Unconfirmed: the Hagley Museum calls him Austrian, born 1835. His Swiss plansifter patent (CH 149) was filed in 1889. The 1887 date is supported by the Ingenium museum.
  - *Ganz "bought Wegmann's patent"* (`history.ts:120`). Partly supported: Mechwart's US patent 251124 cites a Hungarian patent granted to Wegmann in 1876 "obtained in my behalf".
  - *"The falling number is one of your laboratory's QC readings"* (`history.ts:156`). False about the game (F2).
  - The pt-BR flour-sacks article adds a sentence the English lacks (`history.messages.ts:215`).

**4. Quiz.**
- **Pure recall:** Domesday's year (`quiz.ts:126`), what Heit el-Ghurab means (`:56`), what the Met figure is made of (`:36`), and "which tool begins the story" (`:693`).
- **Closer to understanding**, though each still restates its note: why 1879 prices stayed low (`:388`), why the combine forced drying (`:363`), and when a tide mill grinds (`:521`).
- **Tying questions to play:** build questions from the player's own record. For example: "Your wet-year lots read 15.6% moisture: which answer protects strong white?", "The duct fire on shift 31 followed which neglect?", or "Your quota rose 8%: under the ratchet, what did a Soviet manager do?". Score them on the first attempt only, and shuffle the options with the charter seed.

**5. Datalinks.**
- **How to get there:** the dock's More menu, then Datalinks (`Dock.tsx:346`), or the LearningNote text.
- **Unlocked by doing:** only the history notes, through Chronicle events. Unlock toasts are switched off (`config/featureFlags.ts:43`), so a note arrives silently, marked only by the NEW badge.
- **Skipping it:** loses nothing that the Chronicle Notes tab doesn't give in a better form (F8).

**6. Learning by doing.**
- **Teaches well:**
  1. Crop year to recipe choice.
  2. Austerity and dust to duct fire.
  3. Quota raised to the ratchet note.
  4. Batch hold, retest and recall scoped by genealogy.
  5. Delegation level against halved know-how.
- **Text beside play that ignores it:**
  1. The falling number: computed, never shown.
  2. Tempering: reduced to a flat payment.
  3. Gradual reduction: the plant has one "mill" stage.
  4. Ergot and cleaning: there is no cleaning house.
  5. National Flour extraction: ash is constant, so extraction never moves.

**7. The AI partner: verbs.**
- **Read** cards every 6 s, strategic priorities every 45 s, and evidence in the replay. The cost is attention.
- **Accept, defer or reject** rules cards (`AICommandCenter.tsx:492-526`). A deferral returns after 1 plant hour and lapses 2 hours later (`aiEngine.ts:1214-1216`). The effects are as in F3, and none can be undone.
- **Set autonomy:**
  - Chronicle levels 0-3 and the brief.
  - Lights-out, on by default (`stores/aiConfigStore.ts:345`), which only acts once the WebGPU model is ready.
  - The agent cockpit, for the player's own commands.
- **Reverse:** reversible Chronicle initiatives only. Partner answers to events are irreversible (`engine.ts:2077`).
- **Ask:** the Jev panel classifies typed text into five queues. It costs the player's API balance, or nothing on-device. There is no free-form question.
- **Wrong advice:** visible only in the on-device operator's misroutes.
- **With no key and no WebGPU:** what remains is the heuristic rules cards, automatic alarm reactions, the deterministic Chronicle partner and the agent cockpit. The strategic tab sits on "waiting", and Jev and lights-out are off.

**8. What it teaches about overseeing an AI.**
- In the Chronicle: bounded authority, an audit trail with reasons, reversibility, and the idea that delegating costs your own learning. That is good.
- In the plant: the cards teach that "confidence" means agreement, that evidence quality is always "good" and that outcomes are never compared. Over-trust and under-trust cost nothing there (F3, F4).

**9. Narration and quotes.** Noise more than knowledge (F7). The PA is not involved, so D-054 holds. The on-device operator's PA lines are incident notices, which D-054 allows.

## Defects

1. **The falling-number note promises a reading the lab never shows.** `history.ts:156`; `OverviewPanel.tsx:437-455`; `qcLabStore.ts:24-38`. Repro: sign a charter, run a QC test, look for a falling number anywhere. Medium.
2. **The QC readings are recorded but never rendered.** Ash and particle size are constant (`cropYears.ts:186-187`). Repro: grep the components for `moistureContent`; the only hit is the producer. Medium.
3. **The maintenance card's action text is false.** "Queue condition-based maintenance" opens no work order (`aiEngine.ts:559-574`). Repro: accept a maintenance card on a machine in warning; no work order appears. Medium.
4. **Confidence tracks the acceptance rate** (`aiEngine.ts:601-606`). Repro: reject ten optimization cards and watch confidence fall. Medium.
5. **The CPU and MEM tiles are invented** (`aiEngine.ts:1301-1305`). Low.
6. **The quiz can be brute-forced:** fixed option order, no penalty (`engine.ts:2628`). Low.
7. **Reading a note in Datalinks pays no know-how and doesn't clear the Chronicle unread mark** (`Datalinks.tsx:209-214`). Low.
8. **`environment-cycle` (shader cache keys) appears in the player guide** (`knowledgeStore.ts:217-223`). Low.
9. **The `emergency-active` narration has no caller, and the `stability-*` triggers have no entries** (`aiNarrationStore.ts:13-16,68-74`). Low.
10. **Evidence quality and alternatives are hard-coded** (`productionStore.ts:470-545`). Low.
11. **pt-BR and English history copy diverge** (`history.messages.ts:215`). Low.
12. **Four history facts need correction** (question 3). Low.

## Proposals

1. **Show the lab's readings.**
   - Change: add `fallingNumber?: number` to `QualityTestResult` and pass it at `OverviewPanel.tsx:455`. Show moisture, protein and falling number on each QC result and receiving lot, beside the recipe thresholds.
   - Why: it makes F2's notes true and the crop year readable.
   - Measure: a test that a sprouted-year test result renders a falling number below 250.
   - Old contract: the persisted `testHistory` (optional field, so old saves load; add a fixture), `runtimeProjection.ts:185`, SCADA tags and both catalogues.
   - Size S. Safe.
2. **Make rules cards honest.**
   - Change:
     - Accepting maintenance opens a work order, or the text says what accepting does.
     - Drop the acceptance-driven confidence adjustment, or label it "your acceptance rate".
     - Record a before value and measure the target machine 1 plant hour later, so the replay shows whether the advice helped.
     - Delete the CPU and MEM tiles.
   - Why: it teaches calibrated oversight instead of obedience.
   - Measure: an engine test that confidence doesn't move on reject. Play-testers can then tell a good card from a bad one.
   - Old contract: the agent `decision.respond` command (`runtimeCommandHandlers.ts:390`), persisted `aiDecisions` and `aiEngine.messages.ts`.
   - Size M. Safe.
3. **Add a milling section to Datalinks.**
   - Change: six source-checked entries in both languages on cleaning and tempering, break and reduction, purifiers, extraction and ash, flour specifications for bakers, and dust explosions. Link each from the LearningNote at the stage it explains. Move `environment-cycle` to the developer section.
   - Why: it closes the largest teaching gap.
   - Measure: a test that every `deliveryJourney` stage links a milling entry.
   - Old contract: `knowledgeStore` ids in saved `unlockedEntries` (additive, so safe).
   - Size M. Safe.
4. **Correct the four facts** in `history.ts` and `history.messages.ts` (Buffalo, OGAS, the sacks booklet, Cybersyn) and align the pt-BR sacks article. Size S. Safe.
5. **Build a quiz from the record.**
   - Change: templated questions over the player's own crop readings, incidents and quota. Seeded option shuffle. Know-how only for a first-attempt correct answer.
   - Why: tests understanding and ties history to play.
   - Measure: a seeded test that options permute and a second attempt earns nothing.
   - Old contract: `quizAnswered` and `quizBest` in saves, and `CHRONICLE.md` §14.
   - Size M. Needs the owner.
6. **Read once, count once.** Route Datalinks note reads through `chronicleStore.readNote`. Size S. Safe.
7. **Make tempering a decision.**
   - Change: in wet and dry years, the player sets a temper target and rest time. Too little cuts quality; too much costs throughput and risks mould. This replaces the flat 200-fund treatment (`cropYears.ts:197`).
   - Size L. Needs the owner.
8. **Give trust a price in the plant.** Score each answered card against what happened in the next plant hour (breakdown or not), and show the player's own record of accepts and rejects that turned out right. Size M. Needs the owner.
9. **D-012 sweep:** the Datalinks subtitle and welcome, the AutonomyPanel subtitle and hint, the Jev intro and the LearningNote pointer. Keep the consent and billing text. Size S. Safe.

## Needs the owner

- **Loading quotes and narration cards against D-012.** Recommend cutting the narration cards except a factual emergency line, and replacing the quotes with sourced one-line facts from the history notes, or cutting them.
- **Automatic safety reactions.** They idle machines with no consent, which models autonomy without oversight. Recommend making them a delegation level the player grants, with the default unchanged for benchmarks.
- **Quiz redesign** (proposal 5) changes a `CHRONICLE.md` mechanic.
- **Should the plant model break and reduction passages?** Recommend the inspection cutaways first. A process model is L.
- **D-009 is stale.** It says Chronicle copy is English only, but the history notes and quiz have pt-BR.

## Not reviewed

- `aiAccommodation.ts` beyond its messages.
- The VCL debug and diff panels in the Strategic tab, and whether they belong in player view.
- The AgentCockpit capability list.
- Whether `aiRecommended` event choices are ever wrong (`eventDeck.ts`).
- The cloud and ChatGPT clients.
- The mobile equivalents (`MobilePanel.tsx`).
- `GLOSSARY.md`, which is translator vocabulary rather than player-facing.
- Whether `control_network_degraded` actually makes SCADA stale, as its note says.
- The pt-BR history copy, beyond spot checks.
