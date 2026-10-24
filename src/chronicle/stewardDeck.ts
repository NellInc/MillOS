/**
 * Part two of the event deck: the steward's decisions (docs/CHRONICLE.md,
 * systems 16-24), borrowed from Castles II, Neverwinter Nights 2's Crossroad
 * Keep and Dragon Age: Origins - Awakening's Vigil's Keep.
 *
 * The rules of part one hold: nothing here creates flour, grain, shipments,
 * orders or revenue; every default choice is free and needs nothing; parties
 * are organisations, and nothing scores a person or the workforce. Where the
 * games judged individuals, these cases judge firms and accounts.
 */
import { LONG_NIGHT_EVENT_ID, LONG_NIGHT_SHIFT } from './longNight';
import type { ChronicleEventDefinition } from './types';

export const COURT_EVENT_IDS = [
  'evt-court-short-weight',
  'evt-court-haulier',
  'evt-court-granary',
  'evt-court-sacks',
] as const;

const [, COURT_HAULIER, COURT_GRANARY, COURT_SACKS] = COURT_EVENT_IDS;

export const STEWARD_DECK: ChronicleEventDefinition[] = [
  // -------------------------------------------------------------------------
  // Where the standby cover goes (Awakening: Defending the Land)
  // -------------------------------------------------------------------------
  {
    id: 'evt-standby-cover',
    title: 'Where the standby cover goes',
    text: 'The district has one standby service firm, and its contract lets the mill name where its fitters wait during a breakdown: the intake and grain stores, the roller floor or the dispatch yard. Spread across all three, the fitters wait nowhere for long. The AI partner would put them on the roller floor.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: 3 },
    choices: [
      {
        id: 'intake',
        label: 'Cover the intake and grain stores',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['cover-intake'],
          relationship: { customer: 'growers', delta: 6 },
          result: 'The fitters base themselves at the intake, where the growers’ lorries tip.',
        },
      },
      {
        id: 'floor',
        label: 'Cover the roller floor',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['cover-floor'],
          result: 'The fitters base themselves on the roller floor beside the switch room.',
        },
      },
      {
        id: 'yard',
        label: 'Cover the dispatch yard',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['cover-yard'],
          relationship: { customer: 'haulier', delta: 6 },
          result: 'The fitters base themselves in the dispatch yard, where the haulier loads.',
        },
      },
      {
        id: 'thin',
        label: 'Spread the cover across the site',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['cover-thin'],
          result: 'The fitters move between all three areas and wait nowhere for long.',
        },
      },
      {
        id: 'partner',
        label: 'Leave it to the AI partner',
        delegates: true,
        effect: {
          marks: ['cover-floor'],
          result: 'The AI partner puts the standby cover on the roller floor.',
        },
      },
    ],
    defaultChoiceId: 'partner',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // Arbitration day (Awakening: A Day in Court)
  // -------------------------------------------------------------------------
  {
    id: 'evt-court-short-weight',
    title: 'The short-weighted lots',
    text: 'The contract committee sits as arbitrator on the supply contracts this week, one case a shift. First: a hill farm delivered three lots short of their ticketed weight. Hail flattened the farm’s wheat in June and its account is behind. The contract allows termination and a claim for the shortfall.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: 6 },
    choices: [
      {
        id: 'terminate',
        label: 'Terminate the contract and claim the shortfall',
        cost: { attention: { council: 1 } },
        effect: {
          fund: 40,
          marks: ['grower-terminated'],
          relationship: { customer: 'growers', delta: -10 },
          followUp: { eventId: COURT_HAULIER, afterShifts: 1 },
          result: 'The contract is ended and the shortfall claimed. The hill farms take note.',
        },
      },
      {
        id: 'dock',
        label: 'Dock the shortfall from the payment',
        cost: { attention: { council: 1 } },
        effect: {
          fund: 20,
          marks: ['grower-docked'],
          followUp: { eventId: COURT_HAULIER, afterShifts: 1 },
          result: 'The shortfall comes off the next payment and the contract stands.',
        },
      },
      {
        id: 'advance',
        label: 'Advance next year’s contract instead',
        cost: { fund: 50, attention: { council: 1 } },
        effect: {
          marks: ['grower-advanced'],
          relationship: { customer: 'growers', delta: 12 },
          followUp: { eventId: COURT_HAULIER, afterShifts: 1 },
          result: 'The farm gets next year’s contract early, against its seed bill.',
        },
      },
      {
        id: 'partner',
        label: 'Hand the day to the AI partner',
        delegates: true,
        effect: {
          fund: 40,
          marks: ['grower-terminated'],
          relationship: { customer: 'growers', delta: -10 },
          resolveChain: [COURT_HAULIER, COURT_GRANARY, COURT_SACKS],
          result: 'The AI partner applies the contract as written and rules the remaining cases.',
        },
      },
    ],
    defaultChoiceId: 'partner',
    lapseShifts: 2,
  },
  {
    id: COURT_HAULIER,
    title: 'The abandoned run',
    text: 'Next at arbitration: Valley Haulage abandoned an afternoon run halfway: its own depot was flooding and the lorries were needed to move stock to high ground. The contract treats an abandoned run as a breach. The haulier asks to keep the contract.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    chained: true,
    choices: [
      {
        id: 'terminate',
        label: 'Terminate the haulage contract',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['haulier-terminated'],
          relationship: { customer: 'haulier', delta: -25 },
          followUp: { eventId: COURT_GRANARY, afterShifts: 1 },
          result:
            'The contract is ended. The haulier finishes the week and takes its lorries away.',
        },
      },
      {
        id: 'suspend',
        label: 'Put Valley Haulage on a crop year’s notice',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['haulier-suspended'],
          relationship: { customer: 'haulier', delta: -4 },
          standing: 10,
          followUp: { eventId: COURT_GRANARY, afterShifts: 1 },
          result:
            'Valley Haulage keeps the contract on a crop year’s notice. The county sees the notice as fair.',
        },
      },
      {
        id: 'shelter',
        label: 'Let Valley Haulage work from the mill yard while its depot dries',
        cost: { fund: 30, attention: { council: 1 } },
        effect: {
          marks: ['haulier-sheltered'],
          relationship: { customer: 'haulier', delta: 15 },
          followUp: [
            { eventId: COURT_GRANARY, afterShifts: 1 },
            { eventId: 'evt-precedent', afterShifts: 8 },
          ],
          result: 'Valley Haulage parks in the mill yard until its depot is dry.',
        },
      },
      {
        id: 'partner',
        label: 'Hand the rest of the day to the AI partner',
        delegates: true,
        effect: {
          marks: ['haulier-terminated'],
          relationship: { customer: 'haulier', delta: -25 },
          resolveChain: [COURT_GRANARY, COURT_SACKS],
          result: 'The AI partner ends the haulage contract and rules the remaining cases.',
        },
      },
    ],
    defaultChoiceId: 'partner',
    lapseShifts: 2,
  },
  {
    id: COURT_GRANARY,
    title: 'The old granary',
    text: 'Next at arbitration: the old granary across the lane is claimed twice. The previous manager promised it to Community Pasta Works for semolina storage; the village committee has used it for three years to keep its community bakery’s flour and wants that confirmed. The deeds are the mill’s.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    chained: true,
    choices: [
      {
        id: 'pasta',
        label: 'Honour the promise to the pasta works',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['granary-pasta'],
          relationship: [
            { customer: 'pasta', delta: 10 },
            { customer: 'village', delta: -15 },
          ],
          followUp: { eventId: COURT_SACKS, afterShifts: 1 },
          result: 'The pasta works takes the granary; the village bakery moves its flour out.',
        },
      },
      {
        id: 'village',
        label: 'Confirm the village bakery',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['granary-village'],
          relationship: [
            { customer: 'village', delta: 15 },
            { customer: 'pasta', delta: -10 },
          ],
          followUp: { eventId: COURT_SACKS, afterShifts: 1 },
          result: 'The village bakery keeps the granary. The pasta works is not pleased.',
        },
      },
      {
        id: 'compensate',
        label: 'Confirm the village and promise the pasta works compensation',
        cost: { knowHow: 3, attention: { council: 1 } },
        effect: {
          marks: ['granary-village', 'owed-pasta'],
          relationship: [
            { customer: 'village', delta: 15 },
            { customer: 'pasta', delta: -2 },
          ],
          followUp: [
            { eventId: COURT_SACKS, afterShifts: 1 },
            { eventId: 'evt-debt-pasta', afterShifts: 12 },
          ],
          result:
            'The village keeps the granary and the pasta works accepts a promise of storage later.',
        },
      },
      {
        id: 'keep',
        label: 'Keep the granary for the mill',
        cost: { attention: { council: 1 } },
        effect: {
          fund: 100,
          marks: ['granary-kept'],
          relationship: [
            { customer: 'pasta', delta: -10 },
            { customer: 'village', delta: -15 },
          ],
          followUp: { eventId: COURT_SACKS, afterShifts: 1 },
          result: 'The mill lets the granary to a seed merchant and banks the rent.',
        },
      },
      {
        id: 'partner',
        label: 'Hand the rest of the day to the AI partner',
        delegates: true,
        effect: {
          marks: ['granary-pasta'],
          relationship: [
            { customer: 'pasta', delta: 10 },
            { customer: 'village', delta: -15 },
          ],
          resolveChain: [COURT_SACKS],
          result: 'The AI partner honours the old promise and rules the last case.',
        },
      },
    ],
    defaultChoiceId: 'partner',
    lapseShifts: 2,
  },
  {
    id: COURT_SACKS,
    title: 'The short-counted bales',
    text: 'Last at arbitration: the packing line suspects the paper-sack supplier of short-counting: the last three bales each came up a few sacks light. Nobody has counted a bale in front of the supplier. Their price is the best in the district.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    chained: true,
    choices: [
      {
        id: 'blacklist',
        label: 'Change supplier now',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['sacks-blacklisted'],
          standing: -15,
          modifier: { label: 'New sack supplier', production: 0.98, shifts: 2 },
          result:
            'The supplier is dropped on suspicion. The county notes the mill acted without a count.',
        },
      },
      {
        id: 'audit',
        label: 'Pay for a counted delivery',
        cost: { fund: 40, attention: { council: 1 } },
        effect: {
          fund: 30,
          marks: ['sacks-audited'],
          standing: 10,
          result:
            'Each bale is counted at the gate and comes up three sacks short. The supplier credits the account and fixes its counter.',
        },
      },
      {
        id: 'keep',
        label: 'Keep buying and say nothing',
        effect: {
          marks: ['sacks-kept'],
          followUp: { eventId: 'evt-sacks-short-again', afterShifts: 10 },
          result: 'The supplier stays and nothing is counted.',
        },
      },
    ],
    defaultChoiceId: 'keep',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // Rulings that come due
  // -------------------------------------------------------------------------
  {
    id: 'evt-precedent',
    title: 'Another firm asks for the same terms',
    text: 'The pest-control firm missed its visit because its van was flooded, and points out that Valley Haulage was allowed to work from the mill yard after abandoning a run. It asks for the same understanding.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    chained: true,
    requires: { marks: { all: ['haulier-sheltered'] } },
    choices: [
      {
        id: 'grant',
        label: 'Grant the same understanding',
        effect: {
          marks: ['precedent-kept'],
          modifier: { label: 'Missed pest visit', qualityPenalty: 1, shifts: 2 },
          result: 'The visit is rebooked for next week and the bran store waits.',
        },
      },
      {
        id: 'refuse',
        label: 'Hold this firm to its contract',
        cost: { attention: { council: 1 } },
        effect: {
          marks: ['precedent-refused'],
          relationship: { customer: 'haulier', delta: -5 },
          result:
            'The firm sends a relief van the same day. The haulier hears the mill has two rules.',
        },
      },
    ],
    defaultChoiceId: 'grant',
    lapseShifts: 2,
  },
  {
    id: 'evt-debt-pasta',
    title: 'The pasta works asks what was promised',
    text: 'Community Pasta Works writes to ask for the storage it was promised when the old granary went to the village bakery. The east bin would do. Its buyer copies the federation.',
    polarity: 'negative',
    weight: 1,
    routine: false,
    chained: true,
    requires: { marks: { all: ['owed-pasta'] } },
    choices: [
      {
        id: 'pay',
        label: 'Lease the pasta works the east bin as promised',
        cost: { fund: 90 },
        effect: {
          clearMarks: ['owed-pasta'],
          marks: ['promise-kept'],
          relationship: [
            { customer: 'pasta', delta: 12 },
            { customer: 'federation', delta: 4 },
          ],
          result: 'The east bin is cleaned out and leased to the pasta works.',
        },
      },
      {
        id: 'refuse',
        label: 'Say the mill cannot spare it',
        effect: {
          clearMarks: ['owed-pasta'],
          marks: ['promise-broken'],
          relationship: [
            { customer: 'pasta', delta: -20 },
            { customer: 'federation', delta: -8 },
          ],
          result: 'The promise is broken. The pasta works says so to the federation.',
        },
      },
    ],
    defaultChoiceId: 'refuse',
    lapseShifts: 3,
  },
  {
    id: 'evt-sacks-short-again',
    title: 'The bales come up short again',
    text: 'The packers count a bale by hand for the first time since arbitration day, and it is four sacks short. The supplier has been short-counting for weeks.',
    polarity: 'negative',
    weight: 1,
    routine: false,
    chained: true,
    requires: { marks: { all: ['sacks-kept'] } },
    choices: [
      {
        id: 'claim',
        label: 'Count every bale and claim the shortfall',
        cost: { attention: { council: 1 } },
        effect: {
          fund: 20,
          marks: ['sacks-audited'],
          result: 'Every bale is counted at the gate and the shortfall is credited.',
        },
      },
      {
        id: 'let-go',
        label: 'Let it go',
        effect: {
          incident: 'packaging_shortage',
          result: 'The packers run short of sacks before the next delivery.',
        },
      },
    ],
    defaultChoiceId: 'let-go',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // Errands that pay only at the long night
  // -------------------------------------------------------------------------
  {
    id: 'evt-culvert-mason',
    title: 'The culvert mason',
    text: 'The stonemason who rebuilt the bridge at the ford looks at the culvert under the yard and says it would not carry a long storm. Rebuilding it now is cheap. Nothing else will change until the water comes.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: 17 },
    choices: [
      {
        id: 'works-crew',
        label: 'Have the drainage works crew rebuild it',
        requires: { plan: 'drainage-works' },
        effect: {
          marks: ['culvert-rebuilt'],
          result: 'The crew that laid the drainage works rebuilds the culvert between jobs.',
        },
      },
      {
        id: 'rebuild',
        label: 'Rebuild the culvert',
        cost: { fund: 50, attention: { works: 1 } },
        effect: {
          marks: ['culvert-rebuilt'],
          result: 'The culvert is rebuilt in dressed stone with twice the old bore.',
        },
      },
      {
        id: 'decline',
        label: 'Leave the culvert as it is',
        effect: { result: 'The mason is thanked and the culvert is left as it is.' },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 3,
  },
  {
    id: 'evt-switchgear-survey',
    title: 'The switchgear survey',
    text: 'The electrical contractor offers to survey the roller-floor switchgear while the line is down for cleaning. They expect to find nothing urgent. A grid failure would find whatever they miss.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: 26 },
    choices: [
      {
        id: 'survey',
        label: 'Commission the survey',
        cost: { fund: 40, attention: { works: 1 } },
        effect: {
          marks: ['switchgear-surveyed'],
          result: 'The survey finds two loose busbar joints and a tired contactor, all put right.',
        },
      },
      {
        id: 'decline',
        label: 'Decline the survey',
        effect: { result: 'The survey is put off to the next shutdown.' },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 3,
  },
  {
    id: 'evt-quarry-stone',
    title: 'Stone for a flood wall',
    text: 'The quarry up the valley has dressed stone left over from the reservoir works, enough for a low flood wall round the grain stores. The stone is cheap. Hauling it needs twelve runs on the quarry road.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: 36 },
    choices: [
      {
        id: 'buy',
        label: 'Buy the stone',
        cost: { fund: 60, attention: { works: 1 } },
        effect: {
          marks: ['stone-bought'],
          followUp: { eventId: 'evt-quarry-haul', afterShifts: 2 },
          result: 'The stone is bought and waits at the quarry for haulage.',
        },
      },
      {
        id: 'decline',
        label: 'Leave the stone at the quarry',
        effect: { result: 'The stone goes to another buyer.' },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 2,
  },
  {
    id: 'evt-quarry-haul',
    title: 'Hauling the quarry stone',
    text: 'The stone for the flood wall is waiting at the quarry. Twelve runs on the quarry road will bring it down. A haulier that trusts the mill will make them between collections.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    chained: true,
    requires: { marks: { all: ['stone-bought'] } },
    choices: [
      {
        id: 'haulier',
        label: 'Ask Valley Haulage to make the runs',
        requires: {
          party: { id: 'haulier', notTier: 'cool' },
          marks: { none: ['haulier-terminated', 'haulier-replaced'] },
        },
        effect: {
          marks: ['flood-wall-built'],
          result: 'Valley Haulage brings the stone down between collections and the wall goes up.',
        },
      },
      {
        id: 'hire',
        label: 'Hire quarry lorries',
        cost: { fund: 90 },
        effect: {
          marks: ['flood-wall-built'],
          result: 'Hired quarry lorries bring the stone down and the wall goes up.',
        },
      },
      {
        id: 'leave',
        label: 'Leave the stone where it is',
        effect: { result: 'The stone stays at the quarry.' },
      },
    ],
    defaultChoiceId: 'leave',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // The valley meeting (Awakening: The Peasant Revolution)
  // -------------------------------------------------------------------------
  {
    id: 'evt-valley-meeting',
    title: 'The valley meeting',
    text: 'The village holds its annual meeting with the mill. The questions are about the harvest, the granary and the roads, and they are polite.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: 33 },
    echoes: [
      {
        when: { suspended: true },
        because: 'Because the mill’s food-standards approval is suspended',
        text: 'The village hall is full. The suspension is in the newspaper, and the meeting wants to know whether the flour in the school kitchens is safe.',
      },
      {
        when: {
          marks: { all: ['grower-terminated'] },
          party: { id: 'growers', notTier: 'warm' },
        },
        because: 'Because the hail-struck farm’s contract was ended at arbitration',
        text: 'The hill growers have come down to the meeting. One of their farms was ruined by hail and then claimed against, and they want to know whether the mill stands with its growers.',
      },
      {
        when: { marks: { any: ['granary-kept', 'granary-pasta'] } },
        because: 'Because the old granary was taken from the village bakery',
        text: 'The village committee speaks first. Its bakery has lost the old granary and is keeping flour in a barn, and it asks what the mill gives the village it stands in.',
      },
      {
        when: { marks: { any: ['cover-floor', 'cover-yard'] } },
        because: 'Because the standby cover was placed away from the intake',
        text: 'The growers ask about the storm season. The intake has no standby cover, and they want to know who will be there when the bins flood.',
      },
    ],
    choices: [
      {
        id: 'speak',
        label: 'Answer from the mill’s record',
        cost: { attention: { council: 1 } },
        requires: {
          anyOf: [
            { party: { id: 'growers', tier: 'warm' } },
            { party: { id: 'village', tier: 'warm' } },
            { marks: { any: ['cover-intake'] } },
          ],
        },
        effect: {
          marks: ['meeting-heard'],
          standing: 10,
          relationship: [
            { customer: 'village', delta: 8 },
            { customer: 'growers', delta: 8 },
          ],
          result: 'The meeting hears the record read out and goes home satisfied.',
        },
      },
      {
        id: 'principles',
        label: 'Speak to the Rochdale principles',
        requires: { note: 'history-rochdale' },
        effect: {
          marks: ['meeting-heard'],
          relationship: [
            { customer: 'village', delta: 6 },
            { customer: 'growers', delta: 6 },
          ],
          result:
            'The meeting hears how a cooperative answers to its members, and agrees to meet again.',
        },
      },
      {
        id: 'reserve',
        label: 'Open the reserve for a valley rebate',
        cost: { fund: 120 },
        effect: {
          marks: ['reserve-opened'],
          relationship: [
            { customer: 'village', delta: 10 },
            { customer: 'growers', delta: 6 },
            { customer: 'school', delta: 4 },
          ],
          result: 'The mill pays a rebate from its reserve, and the meeting closes in good order.',
        },
      },
      {
        id: 'close',
        label: 'Close the meeting',
        effect: {
          marks: ['meeting-dismissed'],
          relationship: [
            { customer: 'village', delta: -10 },
            { customer: 'growers', delta: -8 },
          ],
          result: 'The meeting is closed with the questions unanswered.',
        },
        variants: [
          {
            when: { marks: { any: ['haulier-terminated'] } },
            because: 'Because Valley Haulage’s contract was ended at arbitration',
            effect: {
              marks: ['meeting-dismissed'],
              relationship: [
                { customer: 'village', delta: -10 },
                { customer: 'growers', delta: -8 },
                { customer: 'haulier', delta: -8 },
              ],
              result:
                'The meeting is closed unanswered, and the haulier’s drivers speak against the mill on the way out.',
            },
          },
        ],
      },
    ],
    defaultChoiceId: 'close',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // The certifier (Castles II: the Pope)
  // -------------------------------------------------------------------------
  {
    id: 'evt-cleaning-log',
    title: 'A gap in the cleaning log',
    text: 'The night cleaning log for the sifting floor has a blank week: the cleaning was done, but the sheets were never signed. County Food Standards reads the log at every audit.',
    polarity: 'negative',
    weight: 2,
    routine: false,
    requires: { minShift: 12, maxShift: 56, marks: { none: ['log-backdated'] } },
    choices: [
      {
        id: 'invoices',
        label: 'Ask the county to accept the contractor’s invoices',
        requires: { minStanding: 6 },
        effect: {
          marks: ['log-reported'],
          result:
            'On the mill’s record, the county accepts the cleaning contractor’s invoices for the blank week.',
        },
      },
      {
        id: 'report',
        label: 'Sign it as found and report the gap',
        cost: { knowHow: 2 },
        effect: {
          marks: ['log-reported'],
          standing: -5,
          result:
            'The gap is reported with the contractor’s invoices attached. The county notes it.',
        },
      },
      {
        id: 'reclean',
        label: 'Re-clean the floor and log it now',
        cost: { fund: 60, attention: { works: 1 } },
        effect: {
          marks: ['log-recleaned'],
          standing: 5,
          modifier: { label: 'Re-cleaning the sifting floor', production: 0.97, shifts: 2 },
          result: 'The sifting floor is cleaned again and the log is complete from today.',
        },
      },
      {
        id: 'backdate',
        label: 'Backdate the missing sheets',
        effect: {
          marks: ['log-backdated'],
          suspend: true,
          result:
            'The auditor compares the sheet dates with the cleaning contractor’s invoices. The mill’s approval is suspended.',
        },
      },
      {
        id: 'leave',
        label: 'Leave it for the audit',
        effect: {
          standing: -20,
          result: 'The auditor finds the blank week and writes it up.',
        },
      },
    ],
    defaultChoiceId: 'leave',
    lapseShifts: 2,
  },
  {
    id: 'evt-reinstatement-audit',
    title: 'The reinstatement audit',
    text: 'County Food Standards will reinstate the mill’s approval after a full audit: every record opened, every lot traced, every cleaning sheet checked against its invoice.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    chained: true,
    requires: { marks: { all: ['log-backdated'] } },
    choices: [
      {
        id: 'open',
        label: 'Open every record to the auditors',
        cost: { fund: 150, knowHow: 4, attention: { council: 1 } },
        effect: {
          reinstate: true,
          marks: ['reinstated'],
          result: 'The audit runs for two days and the approval is reinstated.',
        },
      },
      {
        id: 'wait',
        label: 'Ask for more time',
        effect: {
          followUp: { eventId: 'evt-reinstatement-audit', afterShifts: 4 },
          result: 'The auditors agree to come back.',
        },
      },
    ],
    defaultChoiceId: 'wait',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // Bigger offers (NWN2: Ziffer's volunteers, Raven's allies, the costers)
  // -------------------------------------------------------------------------
  {
    id: 'evt-hire-sifter',
    title: 'A mobile sifter for hire',
    text: 'A plant-hire firm offers a mobile sifter for the busy weeks. Its large unit has twice the throughput and a coarser screen; its small unit is certified for flour and slower.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    requires: { minShift: 8 },
    choices: [
      {
        id: 'large',
        label: 'Hire the large unit',
        cost: { fund: 50 },
        effect: {
          marks: ['hire-sifter-large'],
          modifier: {
            label: 'Large mobile sifter',
            production: 1.05,
            qualityPenalty: 1,
            shifts: 4,
          },
          result: 'The large sifter arrives on a low-loader and the line runs faster and coarser.',
        },
      },
      {
        id: 'small',
        label: 'Hire the certified unit',
        cost: { fund: 50, attention: { works: 1 } },
        effect: {
          modifier: { label: 'Certified mobile sifter', production: 1.02, shifts: 4 },
          result: 'The certified sifter is fitted and the line runs a little faster.',
        },
      },
      {
        id: 'decline',
        label: 'Decline the hire',
        effect: { result: 'The plant-hire firm moves on.' },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 2,
  },
  {
    id: 'evt-premium-buyer',
    title: 'A city wholesaler’s premium',
    text: 'A city wholesaler offers a premium for first call on the mill’s strong white through the next crop year. Its buyers pay well and on time. Riverside Bakers’ Cooperative and County School Meals would wait behind it.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    requires: { minShift: 15 },
    choices: [
      {
        id: 'accept',
        label: 'Give the wholesaler first call',
        effect: {
          marks: ['wholesaler-first'],
          modifier: { label: 'Wholesaler premium', reinvestment: 0.06, shifts: 9 },
          relationship: [
            { customer: 'riverside', delta: -12 },
            { customer: 'school', delta: -8 },
          ],
          result: 'The wholesaler takes first call. The bakers and the school kitchens wait.',
        },
      },
      {
        id: 'coop',
        label: 'Offer cooperative terms instead',
        cost: { attention: { trade: 1 } },
        effect: {
          marks: ['coop-terms'],
          modifier: { label: 'Cooperative terms', reinvestment: 0.02, shifts: 6 },
          relationship: [
            { customer: 'riverside', delta: 4 },
            { customer: 'federation', delta: 6 },
          ],
          result: 'The wholesaler buys on the cooperative’s terms, behind the regular customers.',
        },
      },
      {
        id: 'decline',
        label: 'Decline the premium',
        effect: { result: 'The wholesaler looks elsewhere.' },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 2,
  },
  {
    id: 'evt-second-haulier',
    title: 'A larger haulier calls',
    text: 'A larger haulage firm offers to take the mill’s collections at a lower rate, with more lorries and less attention to any one customer. Valley Haulage hears about it the same day.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    requires: { minShift: 20, marks: { none: ['haulier-terminated', 'haulier-replaced'] } },
    choices: [
      {
        id: 'switch',
        label: 'Move the collections to the larger firm',
        cost: { attention: { trade: 1 } },
        effect: {
          fund: 60,
          marks: ['haulier-replaced'],
          relationship: { customer: 'haulier', delta: -25 },
          modifier: { label: 'Larger haulier', forecastChance: 0.05, shifts: 6 },
          result: 'The larger firm takes the collections. Its lorries come when they come.',
        },
      },
      {
        id: 'share',
        label: 'Share the collections between them',
        cost: { attention: { trade: 1 } },
        effect: {
          fund: 25,
          marks: ['haulage-shared'],
          relationship: { customer: 'haulier', delta: -6 },
          result: 'The collections are split between the two firms.',
        },
      },
      {
        id: 'stay',
        label: 'Stay with Valley Haulage',
        effect: {
          relationship: { customer: 'haulier', delta: 5 },
          result: 'The mill stays with Valley Haulage, which notices.',
        },
      },
    ],
    defaultChoiceId: 'stay',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // The long night (Awakening: Amaranthine or Vigil's Keep)
  // -------------------------------------------------------------------------
  {
    id: LONG_NIGHT_EVENT_ID,
    title: 'The long night',
    text: 'A storm front and a grid emergency arrive on the same night. The mill can put its own hands on one front. The other will have to hold on what was built for it.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    scheduled: { shift: LONG_NIGHT_SHIFT },
    choices: [
      {
        id: 'intake',
        label: 'Hold the intake and grain stores',
        effect: {
          holdFront: 'intake',
          result: 'The mill puts its own hands on the intake through the storm.',
        },
      },
      {
        id: 'floor',
        label: 'Hold the roller floor',
        effect: {
          holdFront: 'floor',
          result: 'The mill puts its own hands on the roller floor through the grid emergency.',
        },
      },
      {
        id: 'partner',
        label: 'Leave it to the AI partner',
        delegates: true,
        effect: {
          holdFront: 'floor',
          result: 'The AI partner holds the roller floor.',
        },
      },
    ],
    defaultChoiceId: 'partner',
    lapseShifts: 2,
  },
];
