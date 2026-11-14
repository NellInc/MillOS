# Chronicle parts two and three, and the Chronicle screens

All paths are relative to the snapshot root, and every file cited ships (`alive`).
- **Tags:** (Q1) to (Q11) are the lead's questions; R1 to R8 are the brief's rubric items.
- **Verification:** "Verified" means pinned by a test, or a fact about authored data. "[Unverified]" means runtime behaviour read from source.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Marks and the record | record.ts:51-189; NotesTab.tsx:68-96 | Choices leave marks, listed with who decided | keep |
| Echoes and variants ("Because…") | stewardDeck.ts:605-708; engine.ts:1440 | Reads text that names an earlier ruling | connect |
| Locked choice says its need | ChronicleEventHost.tsx:304 | Sees "needs …" on a disabled button | keep |
| Choices the record rules out | ChronicleEventHost.tsx:282-284 | Nothing: the option is absent | rework |
| Standby cover | stewardDeck.ts:27-86 (shift 3) | Places cover; gets permanent forecast relief | tune |
| Arbitration (4 cases), hand-over | stewardDeck.ts:91-346 | Rules four cases, or hands the rest to the partner | keep |
| Debts and recurrences | stewardDeck.ts:351-457 | Meets a precedent, a promise or a recurrence | keep |
| Errands | stewardDeck.ts:462-592 | Pays now for long-night preparation | tune |
| Valley meeting | stewardDeck.ts:597-713 (shift 33) | Answers a grievance the record computed | keep |
| Cleaning log, suspension, audit | stewardDeck.ts:718-819 | Reports, re-cleans, backdates or leaves the gap | tune |
| Bigger offers | stewardDeck.ts:824-959 | Trades fund for relationships or modifiers | keep |
| Four organisations | stakeholders.ts; PartnersTab.tsx:66-86 | Warms or cools them; tiers have effects | connect |
| Certifier standing | certifier.ts; engine.ts:745-750 | Raises it with QC passes and rulings; it gates eras | tune |
| Desks of attention | desks.ts | Spends council, works and trade points | cut or rework |
| Long night | longNight.ts; engine.ts:1845-1876 | Holds one front; the other holds on preparation | rework |
| Character and epilogue | record.ts:326-364; epilogue.ts | Reads slides chosen from the record | keep |
| Policy ladders | governance.ts:83-160; PolicyTab.tsx:117-167 | Proposes one step on one of four ladders | rework |
| Crew and assembly | governance.ts:214-487; engine.ts:3198-3377 | Proposes; members vote by rule; pays needs | rework |
| Standing conditions | governance.ts:502-663 | Reads effect, way out and progress | keep |
| Red lines | governance.ts:677-710; engine.ts:3110-3157 | Moves off within 3 shifts or loses 15 | tune |
| Partner's brief | governance.ts:716-947 | Picks the delegate's rule set | connect |
| Return and ratchet | engine.ts:2874-2946; ReturnsTab.tsx | Dispatches against a quota that never falls | keep |
| Co-op reserve | engine.ts:848-876, 3448-3472 | Deposits or autofills; covers upkeep only | rework |
| Administrator | engine.ts:3054-3100 | Endures 4 locked shifts | tune (framing) |
| Eight tabs, overview, dialog | ChroniclePanel.tsx:18-27; ChronicleEventHost.tsx | Reads status; answers prompts | rework |

## What works

1. **Debts and recurrences close the loop.** The pasta letter names the promise (stewardDeck.ts:388), the second sack shortfall cites "arbitration day" (:429), and the precedent firm cites the haulier (:354). Breaking a promise costs more than refusing it would have (steward.test.ts:369).
2. **Every button carries its price and effect** (describe.ts), which complies with D-012.
3. **The sack audit pays later:** a counted supplier opens a free answer when a delivery slips (eventDeck.ts:349-357).
4. **Each condition prints its way out and its progress** (PolicyTab.tsx:169-211).
5. **A passive run still tells a story:** the Ledger Mill.

## Findings

**F1. The long night is scored on preparation the player cannot see until it is too late (Q5).** R2, R5. High. Code verified; player view [Unverified].
- **When the rules appear:** what counts, and the threshold of 2, appear only in `LongNightCard`, which renders after the telegraph at shift 52 (ChronicleOverview.tsx:310-312; engine.ts:1518-1539).
- **What counts, and nobody says so:** the errands come at shifts 3, 17, 26 and 36. Warm organisations and four plans also count (longNight.ts:37-52), and the Plans tab never says so.
- **The decision itself:** at 52 the errands are past, so the telegraph is a reveal. The shift-54 choice is solved by its own button: "the intake will hold (2 of 2 prepared)" (ChronicleEventHost.tsx:289-302).
- **Hidden stakes:** the buttons do not show what is at risk. A fallen floor raises `power_sag` (critical, production x0.45); a fallen intake raises `severe_rain` (x0.9) (operationsCampaignStore.ts:707-722, 779-794).
- **Losing:** it is legible and recoverable: an owned incident with a world marker (OperationalWorldSignals.tsx:86-91), and an epilogue slide.

**F2. Consequences arrive without their cause (Q1, Q4).** R2. High. Code verified; player view [Unverified].
- **Dropped in the dialog:** the dialog shows an echo's text but drops its "Because…" line, and drops the variant `because` too (ChronicleEventHost.tsx:279, 287). Both reach only the Notes log.
- **No numbers afterwards:** result notices carry prose and no deltas (engine.ts:1626-1632).
- **No history or thresholds:** the Partners tab shows value and tier but no history; the 34 and 67 thresholds are printed nowhere.
- **Relief vanishes:** forecast relief from cover, organisations and policies folds into one percentage (engine.ts:1147-1160).

| Mark | Read by | Does the link reach the player? |
|---|---|---|
| cover-intake | storm relief; intake preparation; meeting `speak`; meeting echo; epilogue | Partly. The telegraph card names it; the relief is invisible |
| grower-terminated | meeting echo; epilogue | Yes: "ruined by hail and then claimed against" |
| haulier-terminated | quarry-haul option **hidden**; haulier-breakdown and second-haulier events removed (eventDeck.ts:436; stewardDeck.ts:920); meeting variant; epilogue | Mostly no. Three of four readers are absences; the player later pays 90 for quarry lorries without learning why |
| owed-pasta | debt letter 12 shifts later | Yes, explicit |
| sacks-kept | recurrence after 10 shifts | Yes |
| sacks-audited | free spare bales in a **drawn** part-one event; epilogue | Yes, but only if that event is drawn |

**F3. Desks of attention never bind (Q3).** R1, R3. Medium. Data verified.
- Only steward events and policy changes cost desk points (engine.ts:3160-3163). No part-one event does.
- Over 63 shifts the council desk faces about nine steward costs plus one per policy change; works faces five, trade two.
- Each desk refills 1 per close and its room grows to 4 (desks.ts:16-21). The only possible squeeze is council during arbitration, for a player who is also proposing policy.
- The player gives up nothing, yet the overview spends six numbers on the desks.

**F4. Ladder ends hide what they set off, so the middle wins by default (Q7).** R2, R3, R7. Medium-high. Code verified.
- **What the rung button omits:** it shows only effect text (PolicyTab.tsx:150-162). The red line appears only after adoption (engine.ts:3247), as do condition onsets (worn rolls after 4 shifts; thin stocks on Lean). There is no vote preview, and probing is free because the cost is charged only on adoption (engine.ts:3205-3208).
- **Per ladder:**
  - **Maintenance:** a fair trade.
  - **Intake, "Any lot":** costs 15 with the growers, which leaves it nearly dead.
  - **Stock, "Lean":** crosses the village's red line and risks thin stocks.
  - **Order book, "Contract":** the one end that is plausibly good.
- **An island:** no event, errand or long-night source reads any ladder.

**F5. The assembly is a lock with one key, and the key is money (Q6).** R3. Medium. Verified (governance.test.ts:141-205, 252-276).
- **The full vote function is printed on each crew card** (PolicyTab.tsx:247-266), so every vote is predictable.
- **Only one lever:** the player can fund a need. Votes cast from a preference or a temperament cannot be moved.
- **Money can buy nothing:** a concession can be paid and the vote still tie. The test pins this, and the record then says a need was met.
- **Recurring needs are bought once:** "fund a roll-setting shift each week" is paid a single time (governance.ts:226-227).
- **An island:** the crew is absent from the events, the rulings and the plant. A player who never proposes never meets them.

**F6. Lapsed defaults cascade into the administrator, and its notice gives no cause (Q2, Q4).** R2, R4. Medium. [Unverified] arithmetic.
- **The cascade:** a lapsed arbitration and a closed meeting take the haulier 50→25→17, the village 50→35→25 and the growers 50→40→32 (stewardDeck.ts:140-142, 203-204, 289-292, 699-703). That is three cool organisations, which brings the administrator (engine.ts:3060-3062) unless drawn events warmed the growers.
- **No cause given:** the notice gives a count, not the rulings behind it (engine.ts:3096).
- **The brief cannot help:** hand-overs always take the defaults (engine.ts:1656), so a "Good neighbour" partner still ends the hail farm's contract.

**F7. Choice quality (Q2).** R3. Medium. Data verified.
- **Defensible two or more ways:** standby cover; short-weighted lots; granary; precedent; pasta debt; hired sifter; wholesaler; second haulier; cleaning log (report or re-clean).
- **One plainly right:**
  - haulier case: suspend;
  - sack case: audit, net -10 and +0.10 standing, plus a later free option;
  - sacks again: claim;
  - valley meeting: speak or principles when open;
  - cleaning log at standing 6: invoices;
  - culvert when drainage is installed: the free works crew.
- **Dead options:** "Cover the roller floor" has the same effect as the free partner option (stewardDeck.ts:47-54 vs 75-82). "Change supplier now" and "Terminate the haulage contract" have no upside. "Backdate" is a labelled trap.
- **Defaults are rarely best,** so decisions bite. The exceptions are "Stay with Valley Haulage" and the long-night default, which guards the critical front.

**F8. No single "what needs me now"; the overview is dense (Q9).** R2, R5. Medium. Layout [Unverified].
- **Tabs:** eight, not nine, in a 4×2 grid (ChroniclePanel.tsx:18-27). The charter screen precedes them.
- **Numbers:** the fixed header holds 14 (ChronicleOverview.tsx:124-189). Mid-game the total is roughly 35-45.
- **Decisions are buried:** "Awaiting a decision" sits below the fire, shortfall, training, incidents, trial, long-night and crop sections (:335).
- **Split across tabs:** countdowns, open proposals and conditions live on the Policy tab behind a badge. Organisations drifting toward cool appear nowhere.
- **The Notes tab holds four things:** the record, an 80-entry log, history notes and the quiz.
- **I would remove** the desks, the duplicated standing and the crop-year index, and move the next-era list to Plans.
- **Phone:** in portrait the dialog is capped at `100dvh - 28rem` (ChronicleEventHost.tsx:346). At 375×667 that is about 219 px for a body of about 9 lines plus five long buttons. It scrolls, so it is not broken. The lead should take a real capture.

**F9. The certifier is fair, warned and recoverable, but its cliff is reachable only through the trap (Q4).** R4. Low-medium. Verified (steward.test.ts:449-511, 753-802).
- **Suspension:** only the backdate button suspends the mill, and that button says so.
- **The audit:** it comes after 3 shifts and costs 150 fund, 4 know-how and a council point; it can be deferred every 4 shifts.
- **Recovery:** reinstatement gives 4.00, below the 5.00 start. Getting back to 6 for the federated era takes about 25 fresh QC passes.
- **No history:** standing creeps by +0.08 per QC pass and -0.25 per failed shift, with no history shown.

**F10. The reserve is weakly dominated (Q7).** R3. Low-medium. Code verified.
It pays only upkeep, which the fund pays anyway (engine.ts:848-876). Whatever is left at the close earns nothing but an epilogue line.

**F11. The return and the ratchet are honest and teach a true thing (Q7, Q11).** R6. Low. Verified (governance.test.ts:603-674).
Nothing projects that today's pace becomes next year's floor, so the dilemma is felt only after the first raise.

**F12. No part-two or part-three decision appears in the 3D plant.** R2. Medium. Verified by grep: no component outside `components/chronicle` reads marks or policies.

**F13. Pacing (rubric 5).** R5. Medium. Data verified.
- **The schedule:** scheduled beats at shifts 3, 6-9, 17, 26, 33 and 36, then nothing scheduled until 52-54, and nothing after 54. Shifts 37-51 carry only drawn events and follow-ups.
- **Real minutes:** I did not establish how long a shift takes in real time.

**F14. The writing (Q10).** R6. Low.
- **What I read:** all 19 steward events in both languages, the ladders in both languages, and half the crew copy in pt-BR.
- **Best lines:**
  - "its own depot was flooding and the lorries were needed to move stock to high ground"
  - "Hail flattened the farm's wheat in June and its account is behind."
  - "The survey finds two loose busbar joints and a tired contactor, all put right."
  - "Nothing else will change until the water comes."
  - pt-BR "Corretiva / Preventiva / Preditiva", the trade's own words.
- **Weakest:**
  - "The plant-hire firm moves on."
  - "The auditors agree to come back."
  - pt-BR "aviso de rescisão de uma safra", which reads as termination, not probation.
- **Labels never name a cost; the effect text does.** Two defaults show no effect text, so their cost is invisible:
  - "Keep buying and say nothing", which schedules the recurrence;
  - "Leave the culvert as it is", which gives up a preparation.

**F15. What it teaches (Q11).** R6. Medium.
- **True:** proportionate contract remedies; promises as debts; precedent; verify before blacklisting; falsified records are worse than reported gaps; the ratchet effect (Berliner, Weitzman); indivisible reserves and one member, one vote (ICA 1995); condition-based maintenance needs monitoring.
- **Misleading:**
  - The administrator locks a member co-op's policies. That contradicts the game's own Mondragon note, "Federation let each co-operative stay self-governing" (history.ts:254-258), and the ICA's fourth principle, autonomy and independence.
  - Concessions read as vote-buying, and they price recurring commitments as one-off payments.
  - The certifier reacts to every internal QC test. Real auditors read records periodically.

**F16. The epilogue reflects the run (Q8).** R2. Low.
- Two runs read differently: 16 sections, plus the mill's character and the partner's share (epilogue.ts:343-381).
- Part-three slides need engagement with the assembly, quotas or red lines.
- Part one is absent.

## Defects

1. **High, rare: a move to Lean stock can be impossible to reverse, which makes a red line and "Thin stocks" permanent (rule 4).** [Unverified]
   - **The crew:** yard hand profile 0 (eager, prefers Lean), roll fitter 0, intake grader 0, lab 0, packing 1, head miller 1.
   - **The vote:** Stock 1→0 carries 2 to 1. Stock 0→1 then ties 1 to 1: the yard hand votes against from preference, and no concession applies (governance.ts:450-455; engine.ts:3311-3329).
   - **Result:** the village's countdown runs out, and "Thin stocks" can never clear (governance.ts:525-531).
   - **Exposure:** at least 1 crew in 64. More arise when a need was paid on the way in, because an unpaid, outvoted need would later vote for the move back (governance.ts:438-444). The lead should enumerate all 64.
   - **Repro:** a seed with that crew; propose Stock→Lean, then Stock→Working buffer.
2. **Medium: a concession can buy nothing.** The money is spent and `crew-concession` recorded while the vote ties (governance.test.ts:252-276). The epilogue can then say "Every need the assembly's changes touched was met another way". [Unverified] The administrator also discards an open proposal's paid concessions without a refund (engine.ts:3076).
3. **Medium: the dialog drops `because`** (F2). Repro: terminate the hail farm, then open the valley meeting.
4. **Low: "Cover the roller floor" is dominated** (F7).
5. **Low: stale documentation.** CHRONICLE.md:654, DECISIONS.md D-009 (line 82) and engine.ts:2956 all say Chronicle copy is English only; the shipped pt-BR contradicts them.
6. **Low: "Answer from the mill's record" ends "goes home satisfied"** even when the echo is the terminated hail farm and only `cover-intake` opened the choice (stewardDeck.ts:632-650).
7. **Low, [Unverified]: the phone dialog leaves about 219 px** (F8).

## Proposals

1. **Show the long night from shift 3.**
   - **Change:** render `LongNightCard` from the first offer of a preparing mark (ChronicleOverview.tsx:310-312), and hide it in sandbox, which has no long night. Add "prepares … for the long night" to the four plans' effect text. Put each front's incident and multiplier on the shift-54 buttons (ChronicleEventHost.tsx:294-302).
   - **Why:** the climax becomes a plan, not a verdict.
   - **How we'd know:** a test that the card renders at shift 3; a play-tester names two intake sources by shift 20.
   - **Old contract:** nothing persisted; new keys in both catalogues.
   - **Size and owner:** S, safe.
2. **Carry the cause.**
   - **Change:** print the echo's `because` above the dialog body and the variant's on its button. Append the deltas to result notices. Give each organisation row its last three changes, derived from `eventHistory` and the deck.
   - **Why:** consequences read as consequences.
   - **How we'd know:** steward.test asserts the notice contains "growers -10".
   - **Old contract:** presentation.ts translates notices by exact English match (:514-563). New templates are needed, and old saves must still translate.
   - **Size and owner:** S-M, safe.
3. **Never trap a policy.**
   - **Change:** a move that heeds a running red line, or clears a standing condition, carries on a tie.
   - **Why:** restores rule 4.
   - **How we'd know:** a test over all 64 crews that every red-line rung and every condition-raising rung can be left.
   - **Old contract:** it changes `governance.test.ts:183` ("a tie does not carry") for these moves only; nothing persisted.
   - **Size and owner:** S. Fixes D1; tell the owner.
4. **Print what a rung sets off on its button:** the red line and its countdown, any condition onset, and the projected tally from `assemblyBallots` (PolicyTab.tsx:150-162).
   - **Why:** turns a gotcha into a choice. It is effect text, not helper text.
   - **How we'd know:** PolicyTab.test asserts the red line on "Lean".
   - **Old contract:** new strings in both catalogues.
   - **Size and owner:** S, safe.
5. **One "Needs you" list at the top of the Overview:** fire, shortfall, events, countdowns, open proposal, owned incidents, and organisations within 5 of cool. Move the desks and the next-era list down.
   - **Why:** a single answer to "what needs me".
   - **How we'd know:** under 15 numbers above the fold; a test that a countdown shows on the Overview.
   - **Old contract:** ChronicleOverview gameplay tests that pin section order.
   - **Size and owner:** S-M, safe.
6. **Join the crew to the record.** A ruling that cuts against a member's value raises a standing objection: the intake grader on the hail-farm termination, the lab technician on a backdated log. It is met through the existing concession.
   - **Why:** people with reasons, not a lock, and parts two and three joined.
   - **Constraints:** no number (D-008). New readers satisfy steward.test.ts:194.
   - **Old contract:** `objections` is already persisted.
   - **Size and owner:** M, needs the owner.
7. **Desks: bind or cut.**
   - **Bind:** paid part-one options cost a desk point, and refill slows to 1 per 2 closes.
   - **Why:** attention should cost something, or not be shown.
   - **How we'd know:** a seeded run where a desk hits 0 at least once.
   - **Old contract:** `desks` is persisted; it needs a migration and a fixture.
   - **Size and owner:** M, needs the owner.
8. **Hand-overs follow the brief, among free answers.** For example, Good neighbour docks rather than terminates.
   - **Why:** the brief means what it says.
   - **How we'd know:** a new test per brief.
   - **Old contract:** steward.test.ts:314, 655-661 and 828-836 assume the conventional hand-over; CHRONICLE.md:606.
   - **Size and owner:** S, needs the owner.

## Needs the owner

1. **The administrator contradicts cooperative autonomy and the Mondragon note.** Recommend recasting it as federation support that the assembly can accept or refuse at a relationship cost, keeping the ratchet.
2. **Desks: bind or cut (proposal 7).** Recommend cut unless they bind.
3. **Brief-led hand-overs (proposal 8).** Recommend yes.
4. **Record-linked crew objections (proposal 6).** Recommend yes.
5. **Let the reserve count as one long-night preparation at a balance of 100 or more.** Recommend yes; it creates no goods (D-007).
6. **D-009 is stale.** It needs a superseding entry.

## Not reviewed

- Part one and the economy.
- The length of a shift in real minutes.
- presentation.ts beyond the notice paths cited.
- The epilogue, record and half of the crew pt-BR catalogues.
- PlansTab and LedgerTab beyond a skim; the quiz.
- The 2 and 20 October contprompts.
- No runtime, phone or 3D captures.
