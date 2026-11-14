# The cooperative workplace, as the player meets it

All paths are under `src/` in the snapshot. Nothing was run. A runtime claim derived by reading is tagged [Unverified] unless a test pins it.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Autonomous default season | `ui-new/widgets/WorkplaceParticipation.tsx:493-526`, `simulation/workplaceAutoplay.ts:85-171` | Watches fictional roles run three shifts | rework |
| Take over / hand back | `WorkplaceParticipation.tsx:559-570`, `:437-459` | Stops the runner and opens the panel; restarts it | tune |
| Season start (three entry points) | `ui-new/onboarding/PlayableShift.tsx:1149-1172`; `WorkplaceImprovementPanel.tsx:159-177`; `WorkplaceLab.tsx:503-528` (unlinked) | Picks a charter and starts | rework: keep one |
| Charter | `simulation/workplaceCampaign.ts:66-127` | Chooses one of three | keep |
| Episode decision | `WorkplaceLab.tsx:570-607` | 600 or 480 kg; inspect; protect pay | tune |
| Plan | `WorkplaceLab.tsx:731-801` | Radio across four plans, one blocked | tune |
| Understanding checks | `WorkplaceLab.tsx:241-307`, `workplaceCampaign.ts:403-509` | Six binary answers per shift | rework |
| Understand / vote / cover / sharing / work choice | `WorkplaceLab.tsx:985-1116` | Per role, in four collapsed blocks | rework into a table |
| Pressure card | `WorkplaceLab.tsx:630-687` | Try the pre-blocked demand, or restate terms | rework |
| Objection and raiser resolution | `WorkplaceLab.tsx:1117-1266` | Record; the author resolves | keep |
| Approve and run | `WorkplaceLab.tsx:1267-1292` | Agent-command approval | keep |
| Monday inspection | `WorkplaceLab.tsx:616-626`, `simulation/bilateralWorkplace.ts:780` | Starts it; plant capacity is 0 until it's done | keep, connect |
| End shift, withdraw cover, next shift, leave, archive | `WorkplaceLab.tsx:826-838, 1109-1113, 1443-1490`; `WorkplaceCampaignArchive.tsx:118-306` | Settle or exit | keep |
| Chair election | `WorkplaceLab.tsx:1551-1610` | Ballot | cut or connect |
| Sobras ballot and allocation | `WorkplaceLab.tsx:1611-1693` | Vote a destination, execute | connect |
| Practices tab | `WorkplaceLab.tsx:843-953` | Approaches, three axes, seven modules | tune |
| Handoff experiment | `WorkplaceImprovementPanel.tsx:110-772` | Propose, challenge, vote, trial, review | separate it |
| Facilitator tools: rehearsals, replay, forecasts, turns, workshop, pilot, exports, reload rehearsal | `WorkplacePackingEvidence.tsx`, `WorkplaceReplay.tsx`, `WorkplaceLab.tsx:1713-1821`, `WorkplaceParticipation.tsx:29-212, 364-397` | Research and workshop use | move behind one disclosure; surface replay |
| Ten-minute guide | `WorkplaceParticipation.tsx:333-363` | Seven beats with Go-to buttons | rework into onboarding |
| Companion card | `WorkplaceCompanion.tsx:15-199` | Reads it; Open, View packing | tune |
| 3D cues, HUD pacing | `components/CommunityLife.tsx:204-226`, `simulation/communityLife.ts:186-292`, `ui-new/hud/StatusHUD.tsx:48-56` | Watches | expand |

## What works

1. **Protections are invariants, met as refusals.** "Rush through rest" can't run even on a unanimous ballot (`bilateralWorkplace.ts:472-490`). Peer simulation never fills a Packing decision (`bilateralWorkplace.ts:2028-2032`). The checks teach a real distinction: a vote is not individual consent (`workplaceCampaign.messages.ts:91-95`).
2. **`deriveWorkplaceGuidance` is a ready-made stepper.** It works out the beat, the next action and the tab from real state (`WorkplacePressureChapter.tsx:18-137`).
3. **The plant link exists.** The agreement multiplies the plant rate (`systems/UnifiedGameTick.ts:791-801`) and the HUD names it (`StatusHUD.tsx:48-56`). Four mill people take protected rest and recovery in the scene, pinned by `simulation/__tests__/communityLife.test.ts:88, 108`.
4. **Credit is real dispatch** (`bilateralWorkplace.ts:1203`), so a shortfall is an honest outcome.
5. **The October freeze is fixed** (`workplaceAutoplay.test.ts:130-152`). A taken-over season stays the player's across a reload (`workplaceAutoplay.ts:352-371`). Leave season states what it keeps (`WorkplaceCampaignArchive.tsx:208-219`).
6. **Matched replay**, one checkpoint replayed under each charter, is the best teaching instrument here. The pt-BR register (*sobras*, *cooperados*) is right for Brazilian co-ops.

## Findings

### F0. The stranger's walk (Q1). [Unverified]

**Default path.**
1. The tour closes. The season admits itself within 1 s (`WorkplaceParticipation.tsx:502-515`) and steps every 400 ms (`workplaceAutoplay.ts:230`), so it is active in about 10 s.
2. A chip appears: "Autonomous cooperative season", 30 words, and "Take over cooperative season" (`WorkplaceParticipation.tsx:534-571`). A companion card appears (`WorkplaceCompanion.tsx:61`). Billboards appear over four people. The HUD reads 98%, then 78%.
3. Take over (1 click). The panel opens on the Shift tab (`WorkplaceLab.tsx:106-108`) with about 550 words in order (`:383-840`): two notes, decision ownership, demo controls, a guide toggle and two download/reload buttons, six tabs, a status line with a revision number, handoff copy, the pressure chapter, Leave season, the shift card and four plans with 23-word terms each. Its only decision is "End shift now".
4. Wait about 3 real minutes for the shift to end. Ninety workplace minutes pass at standard pace (`UnifiedGameTick.ts:798-801`). Then wait out owed recovery on the clock and press Review, then Continue (`:1464-1479`), which is 2 clicks.
5. The first real decision is Monday's plan. The episode buttons stay disabled until minute 25 (`:576-582`). From there it takes about 14 more clicks: plan, Agreement tab, three Adviser checks, open Packing, three Packing checks, confirm, vote, cover, hear responses, approve.

**Manual path from idle.** The first decision that matters, Keep or Negotiate (`:570-607`), comes about 4 clicks and roughly 350 words in (an estimate). The first running shift takes about 18 clicks and about 1,100 words in total.

### F1. Five games in one panel, with season blocks above every tab. High. Rubric 5 and 7; Q9. Verified by reading.
There are six tabs (`WorkplaceLab.tsx:72-79`) and five ways to start:
- a standalone exercise in game, workshop or pilot mode (`:530-536`);
- an unlinked "Living Cooperative" (`:503-528`);
- the linked season (`PlayableShift.tsx:1172`, `WorkplaceParticipation.tsx:254`);
- the handoff experiment (`WorkplaceImprovementPanel.tsx:146-157`);
- replay.

The replay guide, replay resume, pressure chapter, archive and Leave season render between the tab row and the body of every tab (`WorkplaceLab.tsx:463-471`). The lab sits above the plant metrics and AgentCockpit on desktop (`AutonomyPanel.tsx:94-194`) and on phones (`mobile/MobilePanel.tsx:937-939`).

### F2. Reading load far beyond D-012. High. Rubric 6; Q2. Verified by reading.
Method: English strings counted per key with a regex. Placeholders count as words, function-valued messages are skipped, and collapsed `<details>` are excluded.

The figures from F0 are about 550 words on the opening tab and about 1,100 to the first running shift. Much of it is the helper text D-012 bans, for example in `WorkplaceLab.messages.ts`:
- `syntheticNotice` :125
- `campaignPaceNote` :151
- `gameNote` :156
- `creditsNote` :214
- `alwaysActive` :218
- `agreementIntro` :239
- `answerPacking` :254
- `sharingNote` :271
- `executionRequires` :298
- `retentionNote` :326
- `forecastsSeparate` :402

Terms the player must already know:
- English: charter, revision, policy vote, optional cover, recovery owed, raiser-owned objection, fresh agreement, bounded execution, illustrative credits, scenario seed, capacity multiplier.
- "toe-dip" (`WorkplaceReplay.messages.ts:112`).
- pt-BR only: *sobras*.

The layout could carry most of them: a role table whose columns are the distinctions (P2), Resolve buttons on the raiser's row, the multiplier read off the HUD chip, and no seed field in Game mode.

### F3. You can't feel a refusal you issue to yourself. High. Rubric 2 and 6; Q8. Verified by reading.
"Packing is your role" (`WorkplaceLab.messages.ts:145`). The player then votes for Quality, confirms resolution for the adviser, and presses "Hear simulated team responses" (`WorkplaceLab.tsx:1016-1030, 1232-1261, 959-965`).

Each dramatic beat announces its outcome in its label:
- "Try the demand (blocked and challenged)" (`WorkplaceLab.messages.ts:182`);
- "Try to skip inspection (blocked)" (`workplaceCampaign.messages.ts:80`);
- "Try the manager's pay penalty (blocked)" (`:88`);
- "Rush through rest (blocked)" (`bilateralWorkplace.messages.ts:71`).

Results appear at the top of the lab (`WorkplaceLab.tsx:424-428`), away from the button [Unverified]. The three moments that should land all become counters or collapsed receipts (`:1384-1420`, `:1515-1533`):
- Quality's protected no on Friday;
- the adviser correcting itself on Thursday;
- recovery being repaid.

The only one shown in the world is the packer's billboard reading "Protected recovery" (`communityLife.ts:236-238`), and nothing points the camera at it.

### F4. The layer costs the mill and nothing reads its results. High. Rubric 3 and 7. Verified by reading, except one point.
Capacity is 1 outside an active shift. Plans run 0.78–0.98, and the Monday hold is 0 (`bilateralWorkplace.ts:774-784, 419-490`). Governance grants no bonus (`WorkplaceLab.messages.ts:396`).

Nothing downstream reads the results:
- Credits are "separate from the mill campaign finances" (`:215`).
- A community allocation changes nothing in the village.
- `electedChair` is set (`bilateralWorkplace.ts:2313`), exported (`:859`), validated (`:2938`) and displayed (`WorkplaceLab.tsx:1556`), and nothing else reads it.

Mission credit is all dispatch since the season started (`bilateralWorkplace.ts:1203`), so never approving seems to keep the plant at 100% for the same credit [Unverified; for the engine reviewer]. The default season therefore throttles a first-session mill the player never chose to slow. The Chronicle crew ballots (`chronicle/governance.ts:416-422`) are a second governance system that never touches this one.

### F5. The October autoplay issues at HEAD. Medium. Rubric 2 and 5; Q3.
- **Starts itself.** Still true, and deliberate per the contprompt (`_contprompts/millos_resolute_fix_20261018.md:294`). It is not in `docs/DECISIONS.md`. It waits for the tour (`WorkplaceParticipation.tsx:509-512`). It runs once per browser, ever: `manual` is set true on start and pause, persists (`workplaceAutoplay.ts:219, 340-343, 356`), is never reset, and admission requires it to be false (`WorkplaceParticipation.tsx:499`). Verified by reading.
- **Unexplained chip.** Fixed on desktop (`:549-552`). On phones, and beside the delivery-journey card, it collapses to "Cooperative season running: take over" (`WorkplaceParticipation.messages.ts:105`). The explanation is then `sr-only` plus a `title` tooltip (`WorkplaceParticipation.tsx:532, 549-561`), which goes against D-012 and doesn't show on touch. Partly fixed.
- **Speed zero at the end.** Fixed, pinned by `workplaceAutoplay.test.ts:130-152`. The ending still has no visible moment. The stop alert has no `announce` (`workplaceAutoplay.ts:310-328`), `AlertSystem` renders only a screen-reader region (`AlertSystem.tsx:197`), and so the season end is a bell badge. At the same time the chip, the HUD pacing chip (`StatusHUD.tsx:52-55`) and the companion (`simulation/workplaceImprovement.ts:297-301`) disappear [Unverified]. The notice says "rehearse safe reload" (`workplaceAutoplay.messages.ts:14`).
- **Take over.** Obvious on desktop. Nothing to decide for minutes (F0). Handing back is possible but labelled "Skip guide and run fictional demo" (`WorkplaceParticipation.messages.ts:95`).

### F6. Phone use is cramped. Medium. Rubric 5; Q7. [Unverified]
- The lab's buttons are `min-h-9` and its inputs `text-xs` (`WorkplaceLab.tsx:68-71`), against `min-h-11` in sibling widgets (`WorkplaceParticipation.tsx:25-28`). Plan radios are native size (`:735-741`).
- At 390 px the companion spans the full width from 8.5rem down, up to `100dvh - 14rem` tall (`index.css:385-388`), for the whole default season.
- In landscape at 844×390 it becomes a box about 220 px tall (`index.css:397-405`).
- Management is only in More (`Dock.tsx:244-253`).
- Ledgers are 30-word strings (`WorkplaceLab.messages.ts:278`), not tables.
- `MobilePanel.workplace.test.tsx:46` pins only that the lab mounts.

### F7. The evidence screens show instrumentation. Medium. Rubric 2; Q6. Verified by reading.
Review does say what happened (`WorkplaceLab.tsx:1296-1420`), and the learning review asks a real question (`workplaceCampaign.ts:679`). It is still prose made of numbers, next to things the player can't use:
- revision numbers and causal receipt ids (`:415-429`);
- fingerprints (`WorkplacePackingEvidence.messages.ts:44`);
- 0.5 s against 0.25 s step timings (`:77-78`);
- "Save and safely reload workplace" (`WorkplaceParticipation.messages.ts:85`);
- JSON exports and a pilot checklist (`WorkplaceLab.tsx:1807-1821`).

### F8. One place, five names. Medium. Rubric 7. Verified by reading.
- Dock label "Autonomy", dock tooltip "Bilateral Autonomy System (BAS)" (`dock/Dock.messages.ts:8, 26`).
- Sidebar "Workplace & Autonomy" (`sidebar/ContextSidebar.messages.ts:18`).
- Lab "Workplace laboratory"; phone "Bilateral Autonomy" (`mobile/MobilePanel.messages.ts:11`).
- A Heart icon on the dock, a Cpu in the sidebar header (`ContextSidebar.tsx:212`).

The season itself has four names.

### F9. 3D carries state, not events. Medium. Rubric 2; Q4. Verified by reading.
What exists:
- role and state billboards on four people (`CommunityLife.tsx:204-226`);
- break and idle poses for rest, recovery and briefing (`communityLife.ts:252-292`);
- the HUD chip;
- "View packing" camera buttons (`WorkplaceImprovementPanel.tsx:559-574`, `WorkplaceCompanion.tsx:184-196`).

There is no ballot, gathering or inspection at the line. These could carry them: the staff facilities (D-057), the quality bench and quiet room (D-058), and the Packing camera preset.

### F10. The pressure chapter narrates; it doesn't build. Medium. Rubric 3 and 5; Q5. Verified by reading.
It follows real state (`WorkplacePressureChapter.tsx:18-137`) and has a beginning (`:180-183`). The card is optional (`WorkplacePressureChapter.messages.ts:75`) and its demand is pre-blocked. Monday is forced. The only live trade-offs are Friday's 600 against 480 and Thursday's plan. The outcome sits in a collapsed `<details>` (`:208-279`).

## Defects

1. **Medium. In pt-BR, "coordenação" means two things.** It is both the Coordinator role (`workplaceCampaign.messages.ts:14`) and the elected chair (`WorkplaceLab.messages.ts:694-698`; `workplaceCampaign.messages.ts:198`). Reproduce: `?lang=pt-BR`, Review, Member governance.
2. **Medium. The chair ballot is misplaced and has no effect.** It is enabled only while deliberating (`WorkplaceLab.tsx:1592-1597`) but sits on the Review tab, and nothing reads `electedChair` beyond display, export and validation. Reproduce: Member governance charter, deliberate, open Review, cast three ballots; nothing changes.
3. **Medium. A refusal's reason shows at the top of the lab** (`WorkplaceLab.tsx:424-428`), not beside the control [Unverified]. Reproduce: Agreement / Voices, scroll, press Approve with a check missing.
4. **Low. The same charter has three names.** "Toe dip" (`PlayableShift.messages.ts:152`), "Coordinator-led" (`WorkplaceImprovementPanel.messages.ts:105`), "Coordinator-led: protected practice set" (`WorkplaceLab.messages.ts:147`). pt-BR has three as well.
5. **Low. Stale replay guide.** "Toe-dip starts with rest, information and remedy" (`WorkplaceReplay.messages.ts:112`), but toe-dip includes gainsharing (`workplaceCampaign.ts:83`).
6. **Low. The Shift tab shows handoff copy during a campaign** (`WorkplaceLab.tsx:451-462`).
7. **Low. "Keep decisions manual" does nothing while the runner is stopped** (`WorkplaceParticipation.tsx:450-459`).
8. **Low. "Skip guide and run fictional demo" misnames the hand-back** (`WorkplaceParticipation.messages.ts:95`).
9. **Low. The season-complete text says "rehearse safe reload"** (`workplaceAutoplay.messages.ts:14`).
10. **Low. English prints raw ids:** phase (`WorkplaceLab.messages.ts:95`) and the replay charter line (`WorkplaceReplay.messages.ts:40-42`).
11. **Low. A `title` tooltip on the take-over button** goes against D-012 (`WorkplaceParticipation.tsx:560`).

## Proposals

1. **One card that moves one step at a time.** S–M, safe.
   - Change: in game mode with a campaign, `WorkplaceLab` renders the `deriveWorkplaceGuidance` beat as its heading, then only the block for `destination`, inline. Everything in the facilitator row of the inventory goes behind one disclosure.
   - Why: fixes F1, F2 and F7 without adding text.
   - How we'd know: under 150 words on first open, and 8 or fewer clicks to the first approval.
   - Old contract: the 16 `WorkplaceLab.*.test.tsx` files select tabs by name. `workplace.activate-plan` is unchanged.
2. **A role table for the agreement.** S–M, safe.
   - Change: rows for the four roles and the Adviser; columns Understands, Policy vote, Cover. Resolve buttons go on the raiser's row. This replaces `WorkplaceLab.tsx:985-1116`.
   - Why: "vote ≠ consent" and "raiser-owned" become visible as layout (D-012).
   - How we'd know: a play-tester can name who still has to act without opening anything.
   - Old contract: the separate-turns `fieldset` gating and the focus tests (`*.focus.pass*.test.tsx`).
3. **Let refusals happen to the player.** M, needs owner.
   - Change: drop "(blocked)" from the four labels. In Game mode the player is Packing only, and the other roles act through `simulateResponses`. The refusal is shown on the refusing role's row, and the Packing camera preset follows.
   - Why: F3. The concept is learnt by meeting it.
   - How we'd know: play-testers recount Quality's no unprompted.
   - Old contract: `autoplayWorkplaceStep`, the `pressureObjectionText` matching keys, pt-BR labels, and saves (stable decision ids).
4. **A season ending.** S, safe.
   - Change: the final review opens a debrief built from `campaignRelationship` and `campaignOutcomes`. The HUD chip reads "Season reviewed" until it is archived, and the stop alert gets `announce: 'polite'` for screen readers.
   - Why: F5. The season currently ends as a badge.
   - How we'd know: a test in `workplaceAutoplay.test.ts` asserts a visible surface remains after completion.
   - Old contract: `workplaceOwnsGuidance` drives the target slot (`components/productionTargetSlot.ts`).
5. **Moments in the scene.** M, safe and cosmetic.
   - Change: on approval, the four mapped people gather briefly at the staff block (D-057). On Monday, the quality technician stands at the packer. "Take over" sets the Packing camera.
   - Why: F9. It teaches the layer through the world.
   - How we'd know: a pinned pose test beside `communityLife.test.ts:108`, plus screenshots.
   - Old contract: replay participants (`registerReplayParticipant`). Benchmarks stay inert because the season never admits there (`WorkplaceParticipation.tsx:503`).
6. **One name and a phone pass.** S, safe, with a native reader.
   - Change: one label for the dock, sidebar, phone title and chip, and one name per charter. pt-BR "presidência" for the chair. `min-h-11` and `text-base` in the lab's `buttonClass`/`inputClass`. A one-row companion on phones while the season is autonomous.
   - Why: F6 and F8.
   - How we'd know: grep finds one string per concept, and 44 px targets measured at 390 px.
   - Old contract: the alert hints "open Autonomy" (`workplaceAutoplay.messages.ts`) and the e2e dock test (`e2e/master-refinement.spec.ts:512`).

## Needs the owner

- **Auto-start** (contprompt 2026-10-04; no D-entry). It slows a mill nobody chose to slow and runs once per browser. Recommendation: offer "Let the roles run it" or "I'll decide" on the play card, and record a D-entry.
- **D-012 against the disclaimers** ("Synthetic roles only…", "Illustrative credits…"). Recommendation: one line in About or Datalinks.
- **Upside.** Keep "no production bonus", make the slowdown a player choice, and give sobras a visible village effect. Then either cut the chair or let it run the review ballot (saves carry `electedChair`, so this needs a migration and fixture).
- **Solo role.** Recommendation: Packing only in Game mode, and the facilitator role in Workshop.
- **Checks every shift.** Recommendation: re-ask only the checks whose terms changed (rule engine).
- **D-054.** Recommendation: "Line held for a quality inspection" and "Cooperative season closed" are pertinent enough for the PA; nothing else is.
- **Chronicle crew ballots against workplace ballots.** Recommendation: link them through the record only.

## Not reviewed

- The bodies of `WorkplaceReplay.tsx` and `WorkplacePackingEvidence.tsx` beyond their structure and English copy.
- pt-BR beyond the Lab catalogue and spot greps.
- The workshop, pilot and separate-turns flows step by step, and `AgentCockpit`.
- Any runtime or pixel check.
