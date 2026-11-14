# Cooperative workplace: the rule system

All paths are under `src/` in the snapshot. "BW" is `simulation/bilateralWorkplace.ts`, "WC" is `simulation/workplaceCampaign.ts`, "WI" is `simulation/workplaceImprovement.ts` and "WA" is `simulation/workplaceAutoplay.ts`. Every module reviewed is `alive` in the reachability listing.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Charter | WC:66-127, BW:1595 | Picks Coordinator-led (toe-dip), Team agreement or Member governance. | rework |
| Configure terms | BW:1869-1930 | Toggles practices, autonomy, governance and AI authority; every consent expires. | tune |
| Plan choice | BW:419-490 | Steady 0.78, resequence 0.9 for 40 credits, cover (0.98 for 10 minutes, then 0.78), rush (blocked). | rework |
| Checks, understand, ballot, cover consent | WC:403-515, BW:1727-1986 | Three fixed-answer checks per role, then confirmation, a vote and separate cover consent. | rework |
| Authored peers | BW:2024-2068 | Fills every role except Packing and always approves. | rework |
| Pressure cards | WC:130-190, BW:1803 | Protect, or accept (raises an objection that loops back to protect). | rework |
| Episode decisions | WC:307-401, BW:1767 | Friday keep or renegotiate; Monday inspect; Thursday protect or renegotiate. | rework |
| Objection | BW:2069-2115 | Any role or the adviser raises one; only the raiser resolves it. | tune |
| Activate, withdraw, stop, tick | BW:2116-2300 | 90-minute shift: wages, rest from minute 75, cover pay, recovery. | keep |
| Chair election | BW:2301-2318 | 3 of 4 ballots elect a chair, who has no powers. | cut or connect |
| Sobras vote and distribution | BW:2319-2378 | 3 of 4 ballots send the whole surplus to members, reserve or community. | rework |
| Season flow | BW:1550-1706, `stores/workplaceStore.ts:550-623` | Next shift, leave, archive, resume after reload. | keep |
| Customer commitment | `stores/workplaceStore.ts:106-131`, BW:1168-1206 | Passive: credits fresh, quality-clean dispatch of the real order. | keep |
| Handoff experiment | BW:1230-1594, WI:14-41 | Propose briefing (8) or buffer (32), challenge, trial, review. Up to 8 cycles. | connect |
| Handoff episodes | WI:45-144 | Four responses to three scenarios; narration only. | rework or cut |
| Grounded adviser | `simulation/workplaceAdvice.ts:324-448` | Passive: simulates a copy of real material flow, abstains on missing facts. | keep, extend |
| Autonomous season | WA:85-171, `components/ui-new/widgets/WorkplaceParticipation.tsx:490-517` | Starts itself after the tour; pause or take over. | tune |
| Separate turns | `stores/workplaceStore.ts:315-340` | Hot-seat, one role per turn. | keep |
| Matched replay | `stores/workplaceReplayStore.ts:244-385` | Reruns a plant checkpoint under different charters. | keep |
| Pilot export | BW:973-1078 | Planning-only draft. | keep |

### The rules, as a player needs them

- **Who.** Four fictional roles: Packing, Quality, Maintenance and Coordinator (BW:578-606). Only Packing and Maintenance may cover, because cover needs Packing or Pallet-checks qualification (BW:771). The **adviser** ("mind") answers checks, can object and is corrected on Thursday. It has no ballot.
- **Charters.** **Coordinator-led**: consultative governance, so every role must cast a ballot but nobody needs to approve (BW:748-754, pinned by `bilateralWorkplace.test.ts:141-149`). Practices are information, rest, remedy and gainsharing, with no budget and no work choice. **Team agreement**: unanimous yes, budget, no gainsharing (WC:97-102). **Member governance**: 3 of 4 yes, all practices, chair election. All three charters force bounded AI authority. Advice-only can never activate a Game plan (BW:724).
- **What is proposed.** One plan per shift. Every term change wipes every check, ballot and consent (`invalidate`, BW:1098-1114).
- **What an objection does.** It blocks activation until its raiser resolves it (BW:738). During a shift it ends the shift at once (BW:2089). It blocks the next shift, leaving, archiving and the surplus vote (BW:1643, :2342).
- **Override.** The blind-override pressure card cannot be carried out. Accepting it only files the adviser's objection (BW:1828-1846).
- **Pay and repayment.** Wages are 0.3 credits per role per game minute, reserved in full at activation (BW:685). Cover pays 0.8 per minute for up to 10 minutes and adds 10 minutes of owed recovery, delivered only in plant time (BW:1120-1140, :2276-2292). The cover volunteer is the consenting member with the least past cover (BW:2149-2155). Withdrawal keeps what has been earned.
- **Surplus.** After a shift, if revenue minus costs, wages, compensation and purchases is positive, nothing is owed and no objection is open, three of four members choose one destination for all of it (BW:2319-2378). It is equal shares, every shift.
- **Handoff experiment.** A worker-authored arrangement is trialled for one paid shift with the plant clock held while it is decided (WI:282-290). The verdict follows the charter's threshold, or the coordinator's ballot under consultative governance (WI:250-260). Adopting makes the same arrangement free next cycle (WI:211-219).

## What works

1. **The engine reads real dispatch, not a toy counter.** A linked season credits only fresh, quality-clean receipts of the real order from the current material session. A changed session, a cancellation or a quality failure blocks credit and settles the shift (BW:1172-1206; `workplaceMission.test.ts:122-153`). Delivery cannot be gamed.
2. **Obligations have teeth.** Owed recovery, an open objection or an unpaid reserve blocks the next shift, leaving, archiving, the surplus vote and closing a handoff (BW:1642-1643, :1699-1700, :2339-2342; `workplaceStore.archive.test.ts:93`). Volunteering is remembered, and the next offer goes to whoever carries the least (BW:2149-2155; WC:775-788).
3. **People in the plant show the agreement.** Four mapped residents show protected rest, voluntary cover, recovery or a paid briefing, and pose for it (`simulation/communityLife.ts:168-249`, `:275-292`). This is the best existing way to make consequences felt without a number.
4. **The grounded adviser.** It forward-simulates a copy of the real material flow at two step sizes, checks conservation and abstains rather than guessing (`workplaceAdvice.ts:324-431`).
5. **Matched replay** is a real counterfactual lab: the same plant checkpoint is replayed under different charters with seeded randomness (`stores/workplaceReplayStore.ts:244-306`; `workplaceReplayRuntime.ts:58-89`). Its learning review names the confounds (`workplaceFairness.ts:222-269`).
6. **Honest exits now exist.** You can leave a season, end an exercise, cancel a handoff before funding, close a handoff, and resume after a reload.

## Findings

**F1. Every legal governance outcome slows the plant. None makes it better. (high, Verified by code; effect on shipments [Unverified])**
`workplaceCapacity` is 1.0 unless a shift is active (BW:775). Every legal plan is below 1.0: steady 0.78, resequence 0.9, and cover 0.98 for 10 minutes then 0.78 (BW:428-469). The handoff buffer at 1.02 is the only exception (WI:38). The multiplier scales the real line (`systems/UnifiedGameTick.ts:794-801`). The autonomous season starts by itself after the tour, so by default the plant runs at about 78% for three shifts, then returns to 100%.

The player learns that the cooperative costs output and that not governing is fastest, the reverse of the project's intent. The October play-test found the line idle for about 100 game minutes after each order (`_contprompts/millos_resolute_fix_20261018.md:258-259`). Packing pace is therefore probably not the binding constraint, and the plan may change no shipment at all. [Inference]
Rubric 3 and 6.

**F2. Most decisions are free, dominated or have nothing that reads them. (high, Verified)**

| Decision | Options | What it costs or gains | Verdict |
|---|---|---|---|
| Pressure card | Protect, accept | Accepting files an objection that can be closed only after protecting (BW:2102-2110). | Protect always |
| Friday or Thursday | Keep, renegotiate | Renegotiating cuts the season's delivery target to 80% (BW:1785-1792). The real order is unchanged, so it is a free easier pass. | Renegotiate is dominant; autoplay always takes it (WA:114-118) |
| Monday | Inspect, skip | Skip is refused (BW:1774). The only stake is timing: the line sits at 0 from minute 25 until Quality acts, then for 5 more minutes (BW:780, :1779). | Only one choice, with a timing stake |
| Thursday | Penalise refusal | Refused (BW:1773). | Dead |
| Plan | Steady, resequence, cover | Forecast net credits are `kg*0.3 - 108 - cost` (BW:884-905). Resequence beats steady by at most 0.3 × 38.4 − 40 < 0, and cover by at most 4.8 − 8 < 0, for every seed. | Steady strictly dominates on money |
| Chair | Any role | Only displayed (`components/ui-new/widgets/WorkplaceLab.tsx:1556`). | Dead |
| Task choice | Qualified tasks | Changes a billboard label only (`communityLife.ts:217-233`). | Cosmetic |
| Autonomy | Individual, team | Same effect: only "directed" gates task choice (BW:2013). | Dead distinction |
| Surplus | Members, reserve, community | Members adds to a pay figure; community subtracts cash; reserve changes nothing but a flag (BW:2361-2370). Nothing downstream reads any of them. | Ledger only |
| Handoff episode | 4 responses | "Without changing physical or financial facts" (WI:110). | Narration |
| Handoff challenge | Forecast, cost, qualification | Recorded, and consent is renewed (BW:1327-1329). | Ritual |

The real stakes are the Monday response time, cash running out (F5), and objections or safety stops ending a shift (F3). Rubric 3.

**F3. Raising an objection or stopping for safety mid-shift forfeits the season for good. (high, Verified by code; end-to-end label [Unverified])**
`campaignAgreementHonoured` needs every shift to have reached minute 90 with 15 rest minutes per role (WC:590-609). An active shift is settled early by:
- an objection (BW:2089);
- any emergency, including the egress drill, which sets `emergencyActive` (`stores/gameSimulationStore.ts:730`; BW:2244);
- Stop, or a changed mission.

Only a reload settle can resume (WC:54-61), and `workplaceAutoplay.pass4.test.tsx:97-120` pins that the season simply moves on after an E-stop. A player who uses the voice the game teaches, or who runs the safety drill, can never finish with "agreement honoured". Rubric 4 and 6.

**F4. The player is every member, so governance never meets resistance. (high, Verified)**
In solo play the player casts every role's ballot. The authored peers approve any non-rush plan (BW:2045) and cover as `willingToCover` says (BW:2046), so the thresholds never bind. Team consent requiring unanimity only matters if the player votes "no" on someone's behalf. Only separate turns, with several humans at one device, gives governance a counterparty. Rubric 3.

**F5. The two ledgers are on different scales. Money binds only when nothing ships. (medium, [Inference] from constants)**
- **Scale.** The co-op ledger opens with 400 credits, pays 108 credits of wages per shift and earns 0.3 net per kg (BW:494-496, :640-652). A linked order is thousands of kilograms: the October play-test saw a 5,000 kg trip on a 6,000 kg order, and the plant packs about 9 t per game hour (`_contprompts/millos_resolute_fix_20261018.md:255`, `:291`). One departure during an active shift adds roughly 1,500 credits, after which no budget or wage line matters.
- **How money binds.** With no dispatch, two resequence shifts take cash from 400 to 252 to 104. The third shift then cannot fund even steady (108), so readiness refuses every plan (BW:764-768) and the only way out is Leave. That is the one way to fail on money.
- **Timing.** Revenue is booked only while a shift is active; dispatch during deliberation counts towards delivery but earns nothing (by design: `workplaceMission.test.ts:122`). Each shift's surplus therefore depends on truck timing.

The ledger runs beside the plant's own economics; the replay keeps them apart as `plantRevenue` and `workplaceWages` (`stores/workplaceReplayStore.ts:214-220`).

**F6. Q3: the engine reads the plant and writes back to it, but only narrowly.**
It reads linked-order shipments, manifests, quality failure and material session (`stores/workplaceStore.ts:690-718`), plus E-stop and drill state (`systems/UnifiedGameTick.ts:1354-1357`). It does not read breakdowns, QC holds, costs or docks; Monday's "disputed sample" fires at minute 25 whatever the lab holds (BW:780). It writes the line-pace multiplier, the handoff clock hold (`stores/workplaceStore.ts:774-784`) and four residents' poses. It writes no staffing and no plant money. Season outcomes are an island: nothing outside the workplace widgets reads `completedCampaigns` or `campaignOutcomes`. Rubric 7.

**F7. Q4: there is a way to do worse, but only as a label.**
- **Ways to fail:** delivery `shortfall` or `blocked`, agreement `incomplete` (WC:654-664), cash exhaustion (F5), and a stuck season after mission evidence goes bad (WA:110).
- **Doing better:** "complete" requires delivery and agreement both met (WC:665). It unlocks nothing and changes nothing.
- **Governing well:** with no productivity bonus, the only lever that improves plant output is the buffer arrangement (1.02). It sits in the manual handoff loop, and an adopted arrangement does not outlive `closeImprovement`, which returns a fresh idle workplace (BW:1591-1593).

**F8. Q5: both October problems are fixed, with gaps.**
- **Leaving a season.** `leaveCampaign` has no mission restriction (BW:1685-1706). The mission-evidence stop names "Leave this season" (`workplaceAutoplay.messages.ts:13`). Leaving is refused while a shift runs, at the final review (archive it instead), with debts or open objections, and during a replay. The tests leave unlinked seasons only (`workplaceStore.archive.test.ts:25-55`, `:147-208`), so leaving a *linked* season is [Unverified at runtime].
- **Surplus.** Coordinator-led now includes gainsharing (WC:81-83), and autoplay demonstrates sobras (`workplaceAutoplay.test.ts:204-245`). Team agreement still omits it (WC:98). `configure` works only during deliberation (BW:1870), so a Team player cannot share a surplus once a shift has earned one.

**F9. Q6: the autonomous season.**
- **Start:** Coordinator-led, once the tour closes, an order is open and the player has not taken over (`WorkplaceParticipation.tsx:493-513`).
- **Play:** protects each boundary, renegotiates Friday, protects Thursday, chooses cover, answers every check correctly, approves, inspects at minute 25, votes sobras to members (WA:106-169).
- **End:** the clock no longer stops (`pause()`, WA:337-346; `workplaceAutoplay.test.ts:130-159`). A bell alert says "Automatic three-shift season complete. Read the individual receipts and rehearse safe reload", without mentioning Archive or a next season.
- **After:** `manual: true` persists (WA:356), so no season auto-starts again and the final review sits unarchived. [Unverified at runtime]

**F10. Q7: replays barely vary. (medium, Verified)**
A new season adds 1 to the seed (`stores/workplaceStore.ts:580`), and the seed feeds only the teaching forecast's supply term (BW:886; WI:229). The roles, preferences, the three pressures and their day order, the check answers and the authored votes are identical every season, and autoplay makes identical choices. Only the plant varies: the order, truck timing and faults. The matched replay can vary only through the plan, because charters share forecasts by design (BW:954-971).

**F11. Q8: teaching against real practice. (medium; real-world claims [Unverified], to be source-checked before any copy)**
- **Sobras.** Brazilian law (Lei 5.764/71, art. 28) takes statutory funds first (at least 10% to the Reserve Fund, 5% to FATES). Refunds are pro rata to each member's operations, and losses are netted over the year. Mondragon credits most returns to members' capital accounts. The game sends all of it to one destination, splits it equally and pays it every shift (BW:2345-2366). A practitioner would call all three wrong.
- **Gainsharing.** Scanlon, Rucker and Improshare plans pay a formula share of gains against a baseline; nobody votes. The id `gainsharing` is really profit-sharing by vote, though the visible title "Shared surplus" is accurate (`bilateralWorkplace.messages.ts:56`). The handoff experiment fairly models Scanlon production committees and kaizen or PDCA.
- **Consent decision-making.** In sociocracy, consent means no paramount objection, not unanimous yes; `team-consent` is unanimity (BW:750-751). Raiser-owned resolution of objections is close to the real practice.
- **Right to refuse.** The real right (ILO C155 art. 13; OSHA) covers imminent danger. Here it means declining optional extra duty. Refusing unsafe work is not modelled.
- **Accurate:** overtime equalisation (cover goes to the least-burdened volunteer), time off in lieu, consultation that hears without binding, one member one vote with no ballot for capital (ICA principle 2), community allocation (principle 7), and a collective vote plus separate individual consent.
- **Odd.** The pt-BR Coordinator-led copy calls employees "cooperados" (`workplaceCampaign.messages.ts:192`).

**F12. Q9: the best existing levers for making consequences to people felt.**
Residents' rest, cover, recovery and briefing poses (`communityLife.ts:186-292`); recovery as a blocking debt; the remembered-duty story line (WC:775-788); the Monday hold, visible in the HUD rate (`components/ui-new/hud/StatusHUD.tsx:48-55`); and the Chronicle crew's "values predict votes" design (`chronicle/governance.ts:17-19`) as the template for F4.

## Defects

1. **Voice and safety forfeit the season** (F3). Severity high. WC:590-609, BW:2089, BW:2244.
   - Reproduce: start a season, activate, run the egress drill mid-shift, finish the season. The agreement reads "incomplete".
2. **Team agreement cannot share sobras** for a shift it has worked (F8). Severity medium. WC:98, BW:1870, BW:2324.
   - Reproduce: start Team agreement, ship during the shift, open the review. The surplus vote is refused and `configure` is refused.
3. **The finished autonomous season leaves the layer inert** (F9). Severity medium, [Unverified at runtime]. WA:337-346, WA:356; `workplaceAutoplay.messages.ts:15`.
   - Reproduce: let autoplay finish, reload. No new season starts, and the alert does not mention Archive.
4. **The chair has no powers.** Severity low. BW:2301-2318; `WorkplaceLab.tsx:1556`.
5. **The reserve destination is a no-op** apart from `distributionComplete`. Severity low. BW:2361-2370.
6. **Individual and team autonomy are identical in effect.** Severity low. BW:2013.
7. **Advice-only AI authority can never activate a Game plan**, so humans cannot run a shift without delegating to the AI. Severity low. BW:724; `bilateralWorkplace.test.ts:154-157`.

## Proposals

1. **Let the authored roles vote from their own stated values in solo play.**
   - **Change:** `simulateResponses` (BW:2024-2068) reads each role's preference (BW:507-528) and public record. Maintenance declines cover after 10 season minutes (`campaignTotals`); Coordinator votes no on resequence if cash after reservations falls below one shift's wages; Quality votes no while an inspection is open. Values, never scores (the Chronicle crew's pattern).
   - **Why:** charters genuinely differ, and governance gets stakes with no productivity bonus.
   - **How we'd know:** a test where one plan activates under member-vote and is refused under team-consent; a play-tester meets a "no".
   - **Old contract:** autoplay's all-approve path (WA:126-140); `workplaceCampaign.test.ts:499`; `workplaceConsent.test.ts`; agent capability `workplace.activate-plan`.
   - **Size and owner:** M. Needs the owner.
2. **Stop penalising voice and safety.**
   - **Change:** a shift settled by an emergency, or by an objection since resolved, resumes like a reload (WC:42-62); restore keeps those reasons (BW:2965-2970).
   - **How we'd know:** extend `workplaceAutoplay.pass4.test.tsx:97` to assert "honoured" after a drill and resume.
   - **Old contract:** saves with the emergency `reviewReason`; the rest-minute check (BW:2848).
   - **Size and owner:** S. Safe.
3. **Ground the plan forecast in the real plant.**
   - **Change:** replace the seed-hash supply (BW:884-905) with `runPackingRehearsals` (`workplaceAdvice.ts:439-448`), adding resequence and cover to `ARRANGEMENTS` (`workplaceAdvice.ts:33-37`).
   - **Why:** where trucks bind, the adviser can say pacing will not change dispatch; that teaches bottlenecks through play.
   - **How we'd know:** forecasts follow plant state, and a test pins shipped kg within the adviser's bounds.
   - **Old contract:** pilot export (BW:1027); `bilateralWorkplace.test.ts:438-443`; frozen advice fingerprints.
   - **Size and owner:** M. Safe.
4. **Tie Monday's disputed sample to a real QC hold.**
   - **Change:** hold when a real batch of the linked order awaits a test (`stores/qcLabStore.ts`), not at minute 25 (BW:780, :810-814); inspecting runs the real lab test.
   - **Why:** the one real stake (response time) becomes a plant event.
   - **How we'd know:** a test where Monday holds only with a pending sample.
   - **Old contract:** restore's `inspectionUntilMinute` bounds (BW:2716-2722).
   - **Size and owner:** M. Safe.
5. **Make sobras behave like sobras.**
   - **Change:** statutory reserve share first; proportional split of the rest; pro rata to minutes worked, cover included; allocated at season end, net of losses; the community share visible in the village (`communityLife.ts:293-305`). Source-check Lei 5.764/71 first.
   - **How we'd know:** a test that a losing shift shrinks the pool; a play-tester sees the community share.
   - **Old contract:** new `WorkplaceFinance` fields need a migration and fixture (`stores/workplaceStore.ts:724-743`); ledger identity (BW:2908-2934); `workplaceAutoplay.test.ts:204`.
   - **Size and owner:** M. Needs the owner.
6. **Rebase pacing so the cooperative is not a slowdown.**
   - **Change:** steady becomes 1.0, which already includes rest; cover and resequence relieve the real bottleneck (dock loading, changeover).
   - **How we'd know:** the HUD rate is unchanged under steady.
   - **Old contract:** restore validators; tests pinning 0.78 (`workplaceCampaign.test.ts:611`).
   - **Size and owner:** M. Needs the owner.
7. **Give the dead choices a reader, or cut them.**
   - **Change:** the chair breaks review ties; reserve visibly funds the next purchase; merge the two autonomy settings; allow advice-only shifts.
   - **Size and owner:** S. Advice-only needs the owner.
8. **Vary seasons through the seed.**
   - **Change:** draw the pressure order, which member declines, and the Monday minute from the seeded generator.
   - **Old contract:** `CAMPAIGN_PRESSURES[shift]` indexing (BW:1805; WA:111); the order needs storing, with a migration.
   - **Size and owner:** M. Safe.
9. **Say what comes next when autoplay finishes.**
   - **Change:** the `seasonComplete` copy names Archive and starting a new season, in both languages.
   - **Size and owner:** S. Safe.

## Needs the owner

1. **The auto-started season slows the plant by default** (F1). The auto-start is Nell's 4 October direction (`_contprompts/millos_owned_decisions_20261004.md:46`, `:60`), not a DECISIONS.md entry. I recommend keeping the auto-start and adopting proposal 6.
2. **Blocked choices** (rush, pay penalty, skip inspection, accept the demand). Keep them blocked, but make protecting a boundary carry a real planning cost. For example, Quality's refusal means less cover, so renegotiating or buying resequence becomes a real trade-off.
3. **Should the solo player hold every member's vote?** I recommend that solo play be the Coordinator, with the other roles authored by their values (proposal 1).
4. **Two cooperative models.** The Chronicle part three crew (`chronicle/governance.ts`) and this workplace model the same thing separately. Should season outcomes feed the Chronicle record?
5. **The buffer arrangement's 1.02 pace** is the only governance-layer path above baseline. Is it compatible with the no-bonus ruling?

## Not reviewed

- How the screens feel (another reviewer).
- The workshop and pilot modes beyond their reducers.
- `WorkplacePackingEvidence` predictions (`workplaceAdvice.ts:551-631`).
- The restore validators, in full.
- Agent capabilities beyond `workplace.activate-plan`.
- The quality of the pt-BR cooperative vocabulary.
- Whether plan pacing actually changes shipments at runtime. F1 and F5 are inferences from the October ledger and the constants; a paired run (steady against no agreement, same checkpoint, via the matched replay) would settle it.
