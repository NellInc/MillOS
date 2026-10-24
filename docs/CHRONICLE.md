# The Mill Chronicle

A long-arc campaign layer for MillOS, borrowed from Clarus Victoria's
*Predynastic Egypt* (2016-2019) and *Egypt: Old Kingdom* (2018). Both games were
read from their shipped data (Predynastic's Lua event scripts and JSON tables;
Old Kingdom's JSON configs and string tables) rather than from memory. Source
file names are cited below as `PE:` and `OK:`.

The Chronicle sits **above** the existing operations campaign. It never moves
material, never credits a shipment, never writes an order's shipped mass, and
never edits a QC result after the fact. It reads the evidence the campaign has
already recorded and answers with bounded modifiers, a fund, decisions and
history. Every number it shows can be traced to a source.

## Design lens

The player this was built for has 109 Predynastic saves across 2017, 2021 and
2026, always on the four starting options the game marks "Recommended for
beginners", and chose every "Historical choice" setting in Old Kingdom. So the
Chronicle leads with Predynastic's rhythm and legibility (few numbers, every
number explained, crises warned in advance, costs on the button, history
everywhere) and takes individual mechanics from Old Kingdom.

## Fit rules (what every borrow had to pass)

| Constraint in MillOS | Consequence for the Chronicle |
|---|---|
| Continuous time; the end of a run window (shift) is the only turn-like beat | The Chronicle's "turn" is a closed shift report. Durations are counted in shifts |
| Evidence-only crediting, mass conservation, cosmetic cues never invent goods | The fund is derived from the recorded shift contribution; nothing creates kg, revenue or orders |
| Anonymous personnel, synthetic roles only, no trust/wellbeing score | Nothing scores people. Contractors are firms; customers are organisations |
| Determinism (no `Math.random` in the campaign store; reproducible captures) | All chance runs through a seeded generator keyed by (seed, stream, shift index) |
| "Season" already means the three-shift workplace campaign | Harvest variation is called the **crop year** |
| Workplace replay and improvement trials own the clock | The Chronicle observes nothing while either is active |
| Benchmarks and captures must stay stable | The Chronicle is inert until the player signs a charter |
| No taglines or helper text | Costs and effects are the button labels; explanations live in Datalinks |

## The beat

* **Turn** = one closed `ShiftCampaignReport` (8 game hours).
* **Crop year** = 9 shifts (3 game days).
* **Chronicle length** = 7 crop years (63 shifts, 21 game days, about 2.8 real
  hours at standard pace). Afterwards the mill continues as an endless sandbox
  (PE: `general_gameover_end` "Inspect the city").

## Currencies

Predynastic spends *culture* on discoveries and *authority* on hard decisions.
The Chronicle keeps two currencies and drops authority: a "mandate" meter would
be a trust score of the workforce.

| Currency | Earned from (each is a ledger source) | Spent on |
|---|---|---|
| **Co-op fund** | Reinvestment share (25%) of each closed shift's recorded net contribution; loyalty premium from warm customers; event outcomes | Plant upkeep, forecast mitigations, event choices, improvement installs, contractor retainers |
| **Know-how** | Shift grade (A 6, B 4, C 3, D 2, F 1); each passed QC test; first read of a history note; first correct quiz answer; trial and challenge medals | Improvement plans (the discovery tree) |

The fund ledger and the plant economics both render as source breakdowns
(PE: `source_types.txt` — every resource lists cells, population, events,
trading, technologies, consumption).

## Systems

### 1. Site charter (start options) — PE `bonuses.txt`, OK `game_params.txt`

Five columns, three choices each. Each choice is tagged *Beginner*,
*Historical* or *Hard*; harder choices add to the final score.

| Column | Beginner | Historical (+1) | Hard (+2, Fortune +3) |
|---|---|---|---|
| Grain supply | Cooperative growers: steady crop years | Open market: wider variation | Marginal harvests: poorer years |
| Plant condition | Recently overhauled: wear x0.85 | Working plant: wear x1.0 | Tired machinery: wear x1.25 |
| Customers | Loyal locals: start warm | Mixed book: start neutral | Demanding buyers: start cool |
| Fortune | Kind: good events more often, never two bad in a row | Even | Hard: bad events more often |
| Chronicle mode | Historical campaign (trials and events) | No trials (events only, +0) | Sandbox (no events or trials, +0) |

Training mode is offered after the first failed trial or challenge (PE
`start_training`): fund costs -25%, forecast chance -25%, final score -2.

### 2. Eras of the mill — PE `social_*.txt`

| Era | Requires | Bonus |
|---|---|---|
| Village mill | start | none |
| Cooperative mill | 3 improvements, 40 know-how earned | reinvestment +5% |
| District mill | 6 improvements, 90 know-how earned, 1 trial passed | wear x0.97 |
| Regional mill | 9 improvements, 160 know-how earned, 2 trials passed, standing 4 | energy x0.97 |
| Federated cooperative | 12 improvements, 240 know-how earned, 3 trials passed, standing 6 | reinvestment +5%, production x1.02 |

Era changes unlock history notes and further improvement columns.

### 3. Improvement plans (the discovery tree) — PE `technologies.txt`, OK `improvements.txt` (Cost / Rent / Bonus)

Each plan costs know-how to *plan*, fund to *install*, takes shifts to install
and charges **upkeep** every shift (Old Kingdom's *Rent*). Effects feed the
Chronicle effect (production, energy, wear, quality) or the forecast chances.

### 4. Contractors with paired traits — OK `architect_features.txt`

Three firms are offered each crop year. Each has one strength and one weakness
from different groups; magnitudes are rolled inside the Old Kingdom ranges.

| Group | Strength | Weakness | Applies to |
|---|---|---|---|
| Cost | Thrifty: install cost -10..30% | Wasteful: +5..15% | install fee |
| Effect | Diligent: effect +10..30% | Neglectful: -5..15% | improvement effect |
| Risk | Careful: snag chance -20..60% | Reckless: +10..30% | completion snag |
| Speed | Expeditious: shifts -10..30% | Passive: +5..15% | install duration |

Without a contractor the in-house crew installs at baseline cost and +50%
duration.

### 5. Crop years — PE `history_sahara_depletion`, `random_fertile_year`, `random_drought`

Every receiving lot is stamped with crop attributes (moisture %, protein %,
falling number) drawn from the current crop year. The QC laboratory's
measurements come from the lots under test instead of fixed constants, and a
poor year takes quality points off wheat recipes until the grain is treated.
The numbers are set against the recipe thresholds (strong white 95, community
flour 92, corn semolina 90; a released grade A reads 100):

| Crop year | Wheat penalty | Consequence | Response |
|---|---|---|---|
| Wet | 6 | strong white fails (94); community flour and semolina pass | switch recipe, a wet-year event (90-160), condition in place (200), dryer plan, moisture meters (-1) |
| Sprouted | 9 (2 treated) | every wheat recipe fails (91) | a blending event (120), blend in place (200), blending-bins plan, or mill corn |

Lots without crop attributes (no signed charter) read exactly as before. The
first crop year is always ordinary. In a historical chronicle the second year is
always wet, because it is the Wet Harvest trial; that overrides the "steady
crop years" promise of Cooperative growers for that one year.

### 6. Forecasts with paid mitigation — OK `random_waterflood_ptah`

A forecast names an existing incident kind, its probability and the shift it is
due. One button reduces the probability at a fund cost ("Construct dams: -X,
chance -Y%"). When due, a seeded roll raises the real incident through
`triggerIncident`, with its real effects. Forecasts wait while a recovery
challenge is active. Kinds: `severe_rain`, `power_sag`, `dust_filter_pressure`,
`delayed_truck`.

### 7. Authored events with the price on the button — PE `random_*.txt`, `tribe_*.txt`

About twenty events. Each has a polarity, preconditions, choices with costs
(locked when unaffordable) and effects with a "N shifts" chip. Every
event carries **Think it over** (PE `events_think`): it waits as an icon until
answered or until it lapses to its default. Selection is seeded with two
Predynastic rules: never the same event twice in a row (`last_random_event`)
and, on Kind fortune, never two negative events in a row
(`was_negative_event`). The previously unwired `triggerCrisis` is used for the
dust-duct fire (below). The food-safety inspector event is Chronicle
bookkeeping only: a crisis, even a low-severity one, puts the whole interface
into its safety state, which is wrong while the player is thinking it over. Incidents an event or forecast raises are owned by
the Chronicle: once acknowledged and mitigated through the operations card,
**Restore controls** resolves them (and clears the storm a severe-rain incident
brought), so a forecast never leaves the shift grade capped at D.

### 8. Upkeep shortfall and austerity — OK `lack_of_production`

When the fund cannot pay upkeep the player chooses between **Conserve
resources** (upkeep halved; production x0.92; wear x1.2; fire risk rises each
shift) and **Forced maintenance** (the shortfall is paid in know-how, 1 per 25
fund). Austerity can also be chosen voluntarily.

### 9. Dust-duct fire — OK `task_fire`

Under austerity a seeded roll can start a smouldering fire in the extraction
ducting through `triggerCrisis('fire', 'high')`: the existing fail-safe stops
production and forklifts. Nobody is hurt and nobody evacuates; the drill policy
stands. **Suppress and clean** (fund cost) schedules `resolveCrisis` after 45
game minutes.

### 10. Customer relationships — PE `tutorial_tribe_action` (friendly trade +20%)

Each customer has a relationship from 0 to 100 (Cool below 34, Warm from 67).
On-time fulfilment raises it, late commitments and quality failures lower it.
Warm customers pay a loyalty premium into the fund (4% of their recorded
revenue), and relationships weight which events appear.

### 11. Trials — PE `trial_*.txt`, OK `trial_*_prepare`

Telegraphed two shifts ahead with the conditions they will test. Each runs a
fixed number of shifts, reads only recorded evidence, has a mid-trial pressure
beat at half time, and ends Gold, Silver or Bronze by shifts to spare (PE
`trial_sanctuary.txt` lines 18-21: gold with 7+ of 10 turns spare, silver with
4+). A bronze result states what silver would have needed. Each trial opens
with a historical note and closes with what really happened.

| Trial | Goal (recorded evidence) | Shifts | Gold / Silver spare |
|---|---|---|---|
| The Wet Harvest | Dispatch 6,000 kg with no quality failure during a wet crop year | 4 | 2 / 1 |
| The Inspection | Three consecutive shift closes with a passed QC test, no quality failure and no unresolved high-severity incident | 4 | 1 / 0 |
| The Bakers' Rush | Dispatch 12,000 kg | 6 | 2 / 1 |
| Grid Winter | Dispatch 8,000 kg at an energy cost of at most 0.08 per kg | 5 | 2 / 1 |
| The Great Programme | Dispatch 20,000 kg with no quality failure | 9 | 3 / 1 |

### 12. Recovery challenge medals

The existing recovery challenges keep their pass/fail record and gain a medal
by simulated minutes to spare: Gold with 180+ of the 360-minute window left,
Silver with 90+, otherwise Bronze (`challengeMedal` in `chronicle/trials.ts`).

### 13. Delegation — OK `decentralization`

Old Kingdom's decentralization grants spontaneous provincial initiatives
("free improvement chance", "free expedition chance"). Here the player
delegates bounded authority to the AI partner in four steps:

| Level | The AI partner may |
|---|---|
| 0 Advise | recommend only |
| 1 Routine | answer routine events with their recommended choice |
| 2 Forecasts | also fund forecast mitigations within 15% of the fund per shift, fund duct-fire suppression, and restore mitigated Chronicle incidents |
| 3 Plans | also start the cheapest affordable improvement install |

Every initiative is logged with its reason and can be reversed while it is
still reversible (a mitigation before its forecast is due; an install before it
completes, refunded in full). The trade-off is learning, not punishment:
know-how from decisions the AI partner made is halved. The policy is
deterministic and local; no language model is consulted.

### 14. History notes and quiz — PE `history_*.txt`, OK `history_en_US`, `ui_quiz`

Milling-history entries join Datalinks under *World and Process Lineage*,
locked until a live event triggers them (first wet crop year, first dust
incident, each era). The notes feed in the Chronicle workspace lists them as
they arrive. The quiz draws ten questions from unlocked notes and scores in
sacks; the first correct answer to each question earns know-how.

### 15. Final score and rank — PE `general_scores_rank*`

Score = trial medals (Gold 3, Silver 2, Bronze 1) + challenge medals + era
reached + shift grades + charter difficulty, minus training mode. Ranks run
from "a sack-carrier" to "the spirit of the millstream". Part two adds the
certifier's standing (up to 4) and the long night (3), raising the maximum from
53 to 60; every rank threshold was multiplied by 60/53 and rounded, so a rank
still means the same share of a perfect chronicle.

## Part two: the steward's decisions

A second set of borrows, from three games whose hard choices pay out in
resources and in who stands with you later: *Castles II: Siege and Conquest*
(Interplay, 1992), *Neverwinter Nights 2* (Obsidian, 2006; Crossroad Keep) and
*Dragon Age: Origins — Awakening* (BioWare, 2010; Vigil's Keep). Sources are
cited as `C2:` (the reverse-engineered save format on ModdingWiki, and
contemporary reviews), `NWN2:` (NWN2 Wiki "Crossroad Keep", "Keep time";
GameBanshee's keep walkthrough) and `DAA:` (Dragon Age Wiki "A Day In Court",
"The Peasant Revolution", "Defending the Land", "Epilogue (Awakening)";
GameBanshee's Awakening walkthrough). Castles II's plot texts are not
sourced; only its mechanics are.

### What made those decisions bite

A ruling is paid for in one place and comes due in another. In Awakening,
executing the deserter Danella puts four of your own soldiers in the later riot
(`DAA:` The Peasant Revolution); letting Ser Derren keep his land puts him on
the wall at the siege (`DAA:` A Day In Court); the cheap granite errand decides
whether the keep you did not defend survives (`DAA:` Epilogue). Part one's
events had no memory: every effect was immediate or a timed modifier, so no
later event could know what was chosen. Part two gives the Chronicle that
memory and builds the rest on it.

GameBanshee calls most of Awakening's court choices inconsequential; the wiki
records the web. Both are right: the consequences existed and could not be
seen. NWN2's keep is worse: its tax collectors return no gold and its tithe
bonus reads a variable from the wrong scope (`NWN2:` Bugs). A consequence the
player cannot trace is a defect here, the same way an inert term reads as
exactly 1.000. So every mark is listed in the record, every echo says what
caused it, and a test fails on any mark that is set and never read.

### Refused on principle

Every loyalty meter in these games scores people: Castles II's happiness, the
Greycloaks' morale and civility, peasant unrest, soldiers' resentment. The fit
rules forbid a trust or wellbeing score of the workforce, so loyalty here is
institutional only: customers, a growers' cooperative, a haulier, the village
committee and a certifier, all organisations. Rulings on named individuals
(Alec, Danella, Ser Temmerly, Torio Claven) become rulings on firms and
accounts. Coercive options (hostages, "you will all die") have no analogue.

| Game element | MillOS form |
|---|---|
| Alec stole the crown's grain to feed his family (hang / flog / conscript) | A hail-struck grower short-weighted a delivery (terminate and claim / dock the payment / advance next year's contract) |
| Danella deserted to save her family (execute / imprison / let her bring them) | The haulier abandoned a run because its own depot flooded (terminate / suspend / let it work from the mill yard) |
| Lady Liza and Ser Derren claim the same land (either / compensate / take it) | The pasta works and the village committee claim the old granary (either / promise compensation / take it for the mill) |
| Ser Temmerly suspected of murder, no proof (execute / imprison / release) | A sack supplier suspected of short-counting, no proof (blacklist / keep buying / pay for an audit) |
| Peasants riot over safety, food or tyranny | The valley meeting: the grievance is computed from the record |

### 16. The record: decisions that come due — `DAA:` A Day In Court, The Peasant Revolution

A choice can leave a **mark** (`effect.marks`). Marks are kept with the shift,
the event, the choice and who decided (player, AI partner, or the Chronicle
when a decision lapsed). Later content reads them in four ways:

| Reader | Form | Example |
|---|---|---|
| Event eligibility | `requires.marks` `{ all, none }` | The debt comes due only if it was incurred |
| Choice availability | `choice.requires` (marks, an installed plan, a read note, a stakeholder tier, certifier standing) | Answering the valley meeting from the record needs the growers or the village warm, or the intake covered |
| Outcome | `choice.variants` (first matching condition replaces the effect) | Closing the valley meeting also costs the haulier's goodwill if its contract was ended at arbitration |
| Text | `event.echoes` (first matching condition replaces the body) | The meeting's grievance names the ruling that caused it |

An echo or variant that fires adds "Because …" to the notice, naming the
earlier decision. A choice that will leave a mark carries a bookmark icon on
its button. What a mark does at once is on the button too (preparation for the
long night, standing forecast relief); what it leads to later is not, but the
record lists every mark the moment it is made, with who decided.
`effect.clearMarks` removes marks (a repaid debt). A choice the record has ruled
out, such as asking a haulier the mill has dropped, is not offered at all.

Delegation leaves marks too. A choice can hand the ruling to the AI partner
(`choice.delegates`): its marks are attributed to the partner, and the
epilogue says how many of the record's decisions the partner made. As with Seneschal Varel, the partner's rulings are the conventional
ones (terminate, honour the old promise, keep buying), and handing over the
first case of a session hands over the rest (`effect.resolveChain`, `DAA:` "If
you have Varel 'take over from here' the quest ends").

### 17. Scheduled events and chains — `NWN2:` Keep time special missions

Some events are not drawn: `scheduled.shift` places them, so the long arc
always happens. A choice can schedule a follow-up (`effect.followUp`
`{ eventId, afterShifts }`), which is how a debt comes back, how a two-step
errand completes, and how a session of cases runs one per shift. Follow-ups
wait while a recovery challenge is active, like every lapse. The closing shift
places nothing, so a follow-up is due by shift 62 at the latest.

| Shift | Event | Borrowed from |
|---|---|---|
| 3 | Where the standby cover goes (allocation) | `DAA:` Defending the Land |
| 6-9 | Arbitration day: four cases, one a shift | `DAA:` A Day In Court |
| 17 | The culvert mason (errand) | `DAA:` Cost of Doing Business |
| 26 | The switchgear survey (errand) | `DAA:` Elemental Requirements |
| 33 | The valley meeting (grievance from the record) | `DAA:` The Peasant Revolution |
| 36, then follow-up | Quarry stone for a flood wall, then securing the haul | `DAA:` What Is Built Endures |
| 52 telegraph, 54 decision | The long night (climax) | `DAA:` choosing Amaranthine or Vigil's Keep |

### 18. Organisations who want opposite things — `DAA:` Eddelbrek and Esmerelle; `NWN2:` Dobson

`effect.relationship` takes one delta or a list, so one ruling can warm one
party and cool another. Four organisations join the three customers, each 0 to
100 with the same tiers (cool below 34, warm from 67):

| Organisation | Warm, it shows up | Cool, it holds back |
|---|---|---|
| Growers' cooperative | crop treatment costs 25% less | crop treatment costs 25% more |
| Haulier | road-works forecasts -10 points | road-works forecasts +10 points |
| Village committee | storm forecasts -10 points | none |
| Regional federation | reinvestment +3% | none |

Loyalty as who shows up rather than as a meter is Awakening's lesson: Derren on
the wall, four soldiers in the mob. Warm organisations also count as
preparation for the long night.

### 19. Scarce allocation with a deferred payoff — `DAA:` Defending the Land

At shift 3 the district's one standby service firm can cover the intake, the
roller floor or the dispatch yard; spreading it across all three halves each;
leaving it to the AI partner puts it on the roller floor (Garevel keeps his
troops in the city). The cover is a mark, so its payoff is deferred and
permanent: forecast relief on the covered area's hazard for the rest of the
chronicle, preparation for the long night, and the valley meeting's grievance.

| Cover | Forecast relief (points) |
|---|---|
| Intake | storm 8 |
| Roller floor | grid strain 8, dust load 8 |
| Dispatch yard | road works 8 |
| Spread thin | 4 on each |

### 20. Errands that pay only at the climax — `DAA:` Cost of Doing Business, What Is Built Endures, Elemental Requirements

Three cheap scheduled offers whose only effect is preparation, shown on the
button ("prepares the intake and grain stores for the long night"): the culvert mason (intake), the switchgear survey (roller floor) and
the flood wall (intake, two steps: buy the stone, then secure the haul, which
needs the haulier not cool, as Voldrik needs soldiers for the quarry). An
installed drainage works lets its own crew rebuild the culvert for nothing.

### 21. The long night — `DAA:` the choice of Amaranthine or Vigil's Keep

Telegraphed at shift 52 with each front's preparation listed; decided at 54. A
storm and a grid failure arrive the same night and the mill can hold only one
front with its own hands. The front not chosen holds on its preparation alone:

| Front | Preparation that counts (two or more hold it) |
|---|---|
| Intake (storm) | intake cover; culvert rebuilt; flood wall built; drainage works or grain dryer installed; village committee warm; growers warm |
| Roller floor (grid) | roller-floor cover; switchgear surveyed; standby generator or vibration monitoring installed; federation warm; haulier warm (spares arrive) |

Spread-thin cover counts as half on both fronts. A front that falls raises its
real incident (`severe_rain` or `power_sag`), owned and recoverable like any
Chronicle incident. The default, if the moment lapses, is the AI partner's:
hold the roller floor. Holding the other front as well scores 3. Each button
says whether the other front will hold, from the same function that resolves
it.

### 22. Knowledge that opens a better option — `DAA:` Dark Wolf (pay 50 for the names); `NWN2:` Appraise; Coercion

Choices can require an installed plan, a read history note, an organisation's
tier, certifier standing or an earlier mark. A locked choice shows what it
needs on its button. Each kind is in use:

| Needs | Opens |
|---|---|
| Drainage works installed | the culvert rebuilt by the works crew, free |
| "The Rochdale Pioneers" read | speaking to the cooperative principles at the valley meeting, free |
| Standing 6 | the county accepting the contractor's invoices for the blank cleaning log |
| The sack deliveries counted | spare bales from the counted supplier when the sack delivery slips |

The last is the Dark Wolf's bargain: paying for a counted delivery at
arbitration buys nothing at once except a credit, and opens a free answer
later. The compensation promise is not a free lunch: Awakening lets Derren stay loyal even
when the persuasion fails; here the promise is a debt that comes due twelve
shifts later, and breaking it costs more than refusing would have.

### 23. The certifier's standing — `C2:` Pope relations 1-9, fractional plot nudges, excommunication

The county food-standards office holds the mill's standing, 1 to 9 (start 5).
Like Castles II's plot variables it moves in hundredths (`effect.standing`): a
passed QC test +8, a shift with a quality failure -25, and event choices. 100
hundredths make a point. Standing gates the last two eras (regional needs 4,
federated 6) and adds the standing above 5 to the score (up to 4; nothing while
suspended).

Backdating a cleaning log is Castles II's beheaded emissary: it **suspends**
the mill (standing 1, every customer -10, no era advance). Rule 4 holds:
suspension schedules a reinstatement audit, and an unanswered audit
reschedules itself, so there is always a way back while the chronicle runs.
The cleaning log is not offered after shift 56 or once it has been backdated,
so an audit can always follow before the close.

### 24. Desks of attention, the mill's character, and the epilogue — `C2:` administrative, military and political points; `NWN2:` Warden or Dreadlord of the Keep; `DAA:` epilogue slides

**Desks.** Castles II gives each noble separate administrative, military and
political points, a limited number of concurrent tasks, and points that grow
with use (`C2:` "Progress toward next Adm point"). The Chronicle has three
desks: **works**, **trade** and **council**. Each starts with room for 2,
refills by 1 at every shift close, and gains a point of room for every 4 spent
(up to 4). Some event choices cost a desk point as well as fund, shown on the
button. Defaults never cost one.

**Character.** Marks carry a leaning (growers, customers, the ledger,
standards, the valley). At the end the dominant leaning names the mill: the
Growers' Mill, the Bakers' Mill, the Ledger Mill, the Mill of Record, the
Valley's Mill, or the Steady Mill when none leads by two. It names the
institution, never a person.

**Epilogue.** When the chronicle completes, slides describe what became of the
valley's organisations, chosen from the record, the organisations' tiers, the
certifier's standing and the long night. Awakening's slides are driven the
same way (`DAA:` Epilogue: "Alec ... conscripted" becomes Ser Alec the
Valiant). Each section shows its first matching slide, so order is a claim
about which outcome matters most; a test plays 300 seeded chronicles and fails
if any slide is never shown, because a slide that a more common mark always
shadows reads its mark in name only. If the AI partner made any of the record's
decisions, the epilogue says how many.

## Architecture

```
src/chronicle/
  types.ts         all Chronicle types
  rng.ts           seeded generator keyed by (seed, stream, index)
  charter.ts       start options, modifiers, score points
  plans.ts         eras, requirements and the improvement plan tree
  contractors.ts   trait table, candidate generation
  cropYears.ts     crop year table, lot stamping, QC readings, quality penalty
  forecasts.ts     forecast table, mitigation, resolution
  eventDeck.ts     part one's twenty authored events (selection rules are in engine.ts)
  stewardDeck.ts   part two's scheduled, chained and drawn events
  record.ts        the mark registry, conditions, the mill's character
  stakeholders.ts  the four organisations and what each does at its tier
  certifier.ts     County Food Standards standing, suspension, reinstatement
  desks.ts         works, trade and council desks of attention
  longNight.ts     the two fronts and their preparation
  epilogue.ts      epilogue sections and slides, chosen from the record
  customers.ts     relationship tiers and updates
  trials.ts        trial table, telegraph, evaluation, trial and challenge medals
  delegation.ts    delegation levels and the AI partner policy
  ledger.ts        fund and economics source breakdowns
  history.ts       history notes (Datalinks entries) and their triggers
  quiz.ts          question pool and scoring
  scoring.ts       final score and rank
  effects.ts       combines every active modifier into one ChronicleEffect
  engine.ts        pure shift-close reducer
src/stores/chronicleStore.ts      persisted store wrapping the engine
src/components/chronicle/         workspace, event dialog, charter screen
```

Integration points in existing code (each a small, guarded edit):

| File | Change |
|---|---|
| `systems/UnifiedGameTick.ts` | multiply production speed, wear and energy by the Chronicle effect; add its quality penalty; stamp crop attributes on receiving; call `chronicle.observe()` after the campaign tick |
| `stores/materialFlowStore.ts` | optional `crop` on `SourceLot` and on `receiveGrainDelivery` details |
| `components/ui-new/panels/OverviewPanel.tsx` | QC readings from the lots under test |
| `stores/knowledgeStore.ts` | history entries locked until unlocked; unlocked set persists |
| `components/knowledge/Datalinks.tsx` | locked history entries stay hidden |
| `components/ui-new/dock/Dock.tsx`, `sidebar/ContextSidebar.tsx`, `mobile/MobilePanel.tsx` | the Chronicle workspace |
| `components/ui-new/GameInterface.tsx` | mount the event dialog host |

## Measured tuning (2026-10-24)

Measured in the running app at standard pace (180x): shifts alternate between
no truck and one truckload, about 2,500 kg a shift on average, and a shipping
shift nets about +2,000 to +2,400 with an energy cost near 0.088 per kg. From
that:

* `CURRENCY_TO_FUND` is 0.18, so a good shift reinvests about 100 fund units.
* Only surplus is reinvested. A loss-making shift reinvests nothing: a fund
  that went negative with every losing shift locked every decision (found in a
  stress run at 60x, where the fund reached -3,333 and a duct fire could not be
  paid for). A fire can also always be cleaned by hand, free, in 120 minutes.
* Grid Winter's cap is 0.08 per kg (reachable with energy plans; 0.06 was not).
* The Great Programme asks for no quality failure rather than an average grade,
  because a shift with no truck is graded F by the operations campaign.

At 6x and above, real-time trucks cannot keep up, so the plant ships little and
accrues late penalties. That is pre-existing campaign behaviour; the Chronicle
is tuned for standard pace.

## Known simplifications

* The growers' tier changes the price of treating a crop directly (the
  Overview button), not the authored prices on event choices such as hiring a
  mobile dryer. Those stay on their buttons as written.
* The long night counts preparation at the moment it is decided. A plan that
  finishes installing on the same shift counts; one still installing does not.
* A chronicle saved before part two loads with neutral organisations, standing
  5 and full desks, and passes over scheduled events whose shift has gone.
* Letting the grower lot notification lapse mills the lot untested (quality -2
  for 3 shifts, standing -0.10) rather than raising the critical, dispatch-blocking
  supplier-contamination incident; the formal hold is its own choice and says
  so on its button. A test keeps any lapse from raising that incident.
* On short screens (500 px high or less, which is every landscape phone) the
  decision dialog takes nearly the full height, widens, and lays its choices in
  two columns; the width breakpoint alone left a 166 px box on an 844 x 390
  phone with every choice below the fold.
* A facility stop comes before the business. While the plant is stopped, the
  dialog opens unasked only for the duct fire; other decisions wait in the
  workspace, and one the player opens from there still appears. Shifts keep
  closing on the clock, so a decision can lapse to its default during a long
  stop; defaults cost nothing. A forklift-only hold leaves the mill running and
  suppresses nothing. During either stop the dialog sits below the emergency
  banner, and the overlay's guidance
  strip stands aside while any Chronicle dialog is on screen
  (`chronicleStore.dialogOpen`, not persisted), because on a landscape phone
  the banner covered the title and the strip covered **Think it over**.
* Nothing new is drawn or placed on the closing shift, decisions still open
  when the chronicle closes are dropped rather than left to answer, and the
  closing shift raises no incident (no forecast is due on it, and a lapsing
  default's incident is not raised), because the chronicle has just released
  everything it owns.

* The crop-year penalty follows the crop year, not the grain in the silos:
  when the year turns, last year's stamped lots still mill under the new
  year's penalty. QC readings do use the lots actually tested.
* The Chronicle's energy multiplier scales the energy the campaign records,
  so it also scales the fuel-oil draw derived from it. Less energy used means
  less fuel burnt, so this is treated as consistent rather than a leak.
* Replays and improvement trials are not history. While one runs, and once as
  it ends, the Chronicle re-baselines on the campaign's reports, QC tests,
  challenge runs and order mass instead of crediting them. QC tests are keyed
  by id and time, because a rewind reuses ids.

## Verification

* Unit tests for every pure module, including seeded determinism, the two
  selection rules, medals, crop readings, effect composition, ledger sums,
  delegation policy and scoring.
* Part two (`__tests__/steward.test.ts`): no mark is set without a reader
  beyond its leaning, every follow-up and chain names a real event, every
  default is free and needs nothing, chains rule each case once, echoes and
  variants fire from the record, the certifier's cliff always has a way back,
  the long night holds or falls by preparation, and whole chronicles run to
  their epilogue with every decision lapsing and with every decision answered.
* A store test loads a chronicle saved before part two.
* A store test that drives a sequence of real shift reports through
  `observe()`.
* The whole gate: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run format:check`, `npm run build`, `npm run validate:reachability`,
  `npm run validate:community`.
* Screenshots of the workspace, the charter, an event dialog and a trial in the
  running app.
