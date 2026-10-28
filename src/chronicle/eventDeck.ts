/**
 * The Mill Chronicle event deck: twenty authored events in the manner of
 * Predynastic Egypt's random events (PE `random_*.txt`, `tribe_*.txt`).
 * See docs/CHRONICLE.md, section 7.
 *
 * Integrity: no effect here creates flour, grain, shipments, orders or revenue.
 * Effects are limited to the ChronicleEventEffect vocabulary (fund, know-how,
 * short modifiers, relationships, real incidents, crop treatment, inspection
 * close). Personnel stay anonymous; nothing scores a person or the workforce.
 *
 * Every event's default choice carries no cost and is what "Think it over"
 * lapses into, so the bad outcome of a negative event sits on its default.
 */
import { defineMessages, translate } from '../i18n';
import { eventDeckMessages } from './eventDeck.messages';
import { STEWARD_DECK } from './stewardDeck';
import { stewardDeckMessages } from './stewardDeck.messages';
import type { ChronicleEventDefinition, ChronicleEventEffect } from './types';

const eventPresentationMessages = defineMessages({
  en: { ...eventDeckMessages.en, ...stewardDeckMessages.en },
  'pt-BR': { ...eventDeckMessages['pt-BR'], ...stewardDeckMessages['pt-BR'] },
});

const BASE_DECK: ChronicleEventDefinition[] = [
  // -------------------------------------------------------------------------
  // Positive
  // -------------------------------------------------------------------------
  {
    id: 'evt-generous-crop-year',
    title: 'A generous crop year',
    text: 'The growers have more wheat than their stores will hold, and the weighbridge queue runs back to the lane. Their cooperative offers a price discount on the crop-year contract if the mill commits early. The saving can stay in the fund or be passed on.',
    polarity: 'positive',
    weight: 2,
    routine: true,
    requires: { cropKinds: ['bountiful'] },
    choices: [
      {
        id: 'bank',
        label: 'Bank the grower discount',
        effect: {
          fund: 100,
          relationship: { customer: 'growers', delta: 4 },
          result: 'The early contract is signed and the discount goes into the co-op fund.',
        },
        aiRecommended: true,
      },
      {
        id: 'pass-on',
        label: 'Pass it on to School Meals',
        effect: {
          relationship: { customer: 'school', delta: 12 },
          result: 'The saving is passed on as a lower price to County School Meals, who notice.',
        },
      },
    ],
    defaultChoiceId: 'bank',
    lapseShifts: 2,
  },
  {
    id: 'evt-millwrights-workshop',
    title: 'The travelling millwrights',
    text: 'A millwrights’ guild touring the district offers a workshop on roll fluting and gap setting. They need the roller floor for a morning and a contribution towards their travel. Their notes alone are free.',
    polarity: 'positive',
    weight: 2,
    routine: true,
    choices: [
      {
        id: 'host',
        label: 'Host the workshop',
        cost: { fund: 60 },
        effect: {
          knowHow: 5,
          modifier: { label: 'Fresh roll settings', wear: 0.94, shifts: 4 },
          result:
            'The guild resets the roll gaps with the crew and leaves a marked-up setting sheet.',
        },
        aiRecommended: true,
      },
      {
        id: 'notes',
        label: 'Take their notes only',
        effect: {
          knowHow: 2,
          result: 'The guild leaves a copy of its notes and moves on to the next mill.',
        },
      },
    ],
    defaultChoiceId: 'notes',
    lapseShifts: 2,
  },
  {
    id: 'evt-off-peak-tariff',
    title: 'An off-peak tariff trial',
    text: 'The distribution network is trialling a cheaper overnight tariff for small industrial sites. Joining is free; a load-shift timer on the cleaning-house motors would let the mill take full advantage. The trial window is short.',
    polarity: 'positive',
    weight: 2,
    routine: true,
    requires: { minShift: 3 },
    choices: [
      {
        id: 'timer',
        label: 'Fit a load-shift timer',
        cost: { fund: 80 },
        effect: {
          modifier: { label: 'Off-peak running', energy: 0.94, shifts: 6 },
          result: 'The timer moves cleaning and conditioning loads into the cheap overnight band.',
        },
        aiRecommended: true,
      },
      {
        id: 'join',
        label: 'Join the trial as we are',
        effect: {
          modifier: { label: 'Off-peak tariff', energy: 0.97, shifts: 3 },
          result:
            'The mill joins the trial and picks up whatever overnight load already falls in the band.',
        },
      },
    ],
    defaultChoiceId: 'join',
    lapseShifts: 3,
  },
  {
    id: 'evt-bakers-proving-test',
    title: 'A good proving test',
    text: 'Riverside Bakers’ Cooperative ran a proving test on the last strong white and the loaves stood tall. Its buyer rings to say so and asks whether the bakers might see the mill. A tour costs a morning’s attention and a modest outlay.',
    polarity: 'positive',
    weight: 2,
    routine: true,
    requires: { deliveredTo: 'riverside', minShift: 2 },
    choices: [
      {
        id: 'tour',
        label: 'Invite them for a tour',
        cost: { fund: 40 },
        effect: {
          relationship: { customer: 'riverside', delta: 12 },
          knowHow: 2,
          result:
            'The bakers walk the roller floor and leave with a better sense of what the mill can do.',
        },
        aiRecommended: true,
      },
      {
        id: 'letter',
        label: 'Thank them by letter',
        effect: {
          relationship: { customer: 'riverside', delta: 5 },
          result: 'A short letter of thanks goes back to Riverside with the next delivery note.',
        },
      },
    ],
    defaultChoiceId: 'letter',
    lapseShifts: 2,
  },
  {
    id: 'evt-village-work-party',
    title: 'The village work party',
    text: 'The village harvest committee offers a weekend work party to clear the yard drains and the culvert by the millstream. They ask only that the mill feeds them. With the drains clear, a heavy storm is less likely to stop the yard.',
    polarity: 'positive',
    weight: 2,
    routine: true,
    choices: [
      {
        id: 'accept',
        label: 'Accept and provide lunch',
        cost: { fund: 40 },
        effect: {
          modifier: { label: 'Drains cleared', forecastChance: -0.1, shifts: 6 },
          relationship: { customer: 'village', delta: 8 },
          result: 'The drains and culvert run clear, and the committee goes home well fed.',
        },
        aiRecommended: true,
      },
      {
        id: 'decline',
        label: 'Thank them and decline',
        effect: {
          result:
            'The committee is thanked and the drains are left for the next maintenance round.',
        },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 2,
  },
  {
    id: 'evt-federation-grant',
    title: 'A modernisation grant',
    text: 'The regional federation of cooperatives has a small modernisation grant for member mills that file a full energy and yield return. The return takes careful work from the records. A short return still qualifies for part of the grant.',
    polarity: 'positive',
    weight: 1,
    routine: true,
    requires: { minEra: 'cooperative' },
    choices: [
      {
        id: 'full',
        label: 'File the full return',
        cost: { knowHow: 3 },
        effect: {
          fund: 150,
          relationship: { customer: 'federation', delta: 6 },
          result: 'The federation accepts the full return and pays the whole grant into the fund.',
        },
        aiRecommended: true,
      },
      {
        id: 'short',
        label: 'File a short return',
        effect: {
          fund: 50,
          result: 'The short return is accepted and part of the grant is paid.',
        },
      },
    ],
    defaultChoiceId: 'short',
    lapseShifts: 3,
  },
  {
    id: 'evt-college-test-milling',
    title: 'Test milling for the college',
    text: 'The agricultural college is trialling new wheat varieties and asks the mill to run its sample lots through the laboratory mill and the main line. The work slows the line for a shift or two. The results come back with the college’s analysis attached.',
    polarity: 'positive',
    weight: 1,
    routine: true,
    requires: { minShift: 9 },
    choices: [
      {
        id: 'run',
        label: 'Run the test milling',
        effect: {
          knowHow: 6,
          modifier: { label: 'Variety trials', production: 0.97, shifts: 2 },
          result: 'The samples run through the line and the college shares its full analysis.',
        },
        aiRecommended: true,
      },
      {
        id: 'lab',
        label: 'Share laboratory data only',
        effect: {
          knowHow: 2,
          result: 'The laboratory mill runs the samples and the readings go to the college.',
        },
      },
    ],
    defaultChoiceId: 'lab',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // Negative
  // -------------------------------------------------------------------------
  {
    id: 'evt-wet-intake',
    title: 'Wet grain at the intake',
    text: 'The moisture meter at the intake reads well above safe storage, load after load. Damp wheat bridges in the bins and mills soft and sticky. A mobile dryer can be hired, or the wet lots blended down with drier stored grain.',
    polarity: 'negative',
    weight: 3,
    routine: true,
    requires: { cropKinds: ['wet'] },
    choices: [
      {
        id: 'dryer',
        label: 'Hire a mobile dryer',
        cost: { fund: 160 },
        effect: {
          treatCrop: true,
          result:
            'The dryer brings the intake down to storage moisture and the wet-year penalty lifts.',
        },
        aiRecommended: true,
      },
      {
        id: 'blend',
        label: 'Blend with stored grain',
        cost: { fund: 90 },
        effect: {
          treatCrop: true,
          modifier: { label: 'Blending runs', production: 0.95, shifts: 3 },
          result:
            'The wet lots are blended down with drier stored grain; the extra handling slows the line.',
        },
      },
      {
        id: 'mill-on',
        label: 'Mill it as it comes',
        effect: {
          modifier: { label: 'Damp stock', wear: 1.08, shifts: 3 },
          result: 'The wet grain goes through untreated and the sifters blind more often.',
        },
      },
    ],
    defaultChoiceId: 'mill-on',
    lapseShifts: 2,
  },
  {
    id: 'evt-low-falling-number',
    title: 'Low falling numbers',
    text: 'The laboratory’s falling-number test is coming back short: some of the harvest sprouted in the ear before it was cut. Bread from this grain bakes with a sticky crumb. Blending with sound stored grain restores it, at a cost.',
    polarity: 'negative',
    weight: 3,
    routine: true,
    requires: { cropKinds: ['sprouted', 'wet'] },
    choices: [
      {
        id: 'blend',
        label: 'Blend with sound grain',
        cost: { fund: 120 },
        effect: {
          treatCrop: true,
          result:
            'Sound stored grain is blended in and the falling number is back within the bakers’ range.',
        },
        aiRecommended: true,
      },
      {
        id: 'discount',
        label: 'Ask the growers for a discount',
        effect: {
          fund: 60,
          modifier: { label: 'Sprouted grain', qualityPenalty: 1, shifts: 3 },
          relationship: { customer: 'growers', delta: -6 },
          result: 'The growers accept a discount on the affected lots, which go through unblended.',
        },
      },
      {
        id: 'mill-on',
        label: 'Mill it unblended',
        effect: {
          relationship: { customer: 'riverside', delta: -8 },
          result: 'The bakers at Riverside notice the crumb and say so.',
        },
      },
    ],
    defaultChoiceId: 'mill-on',
    lapseShifts: 2,
  },
  {
    id: 'evt-sack-delivery-slips',
    title: 'The sack delivery slips',
    text: 'The paper-sack supplier rings to say this week’s delivery is stuck behind a breakdown at their works. The packers have enough for part of a shift. A rush freight surcharge would bring the delivery forward.',
    polarity: 'negative',
    weight: 2,
    routine: true,
    choices: [
      {
        id: 'counted',
        label: 'Ask the counted supplier for spare bales',
        requires: { marks: { all: ['sacks-audited'] } },
        effect: {
          result:
            'The supplier whose count the mill checked sends spare bales from its own store at no charge.',
        },
      },
      {
        id: 'rush',
        label: 'Pay the rush freight',
        cost: { fund: 70 },
        effect: {
          result:
            'The scheduled delivery arrives on time by rush freight and the packers do not stop.',
        },
        aiRecommended: true,
      },
      {
        id: 'wait',
        label: 'Wait for the delivery',
        effect: {
          incident: 'packaging_shortage',
          result: 'The packers run short before the delivery arrives.',
        },
      },
    ],
    defaultChoiceId: 'wait',
    lapseShifts: 2,
  },
  {
    id: 'evt-lot-notification',
    title: 'A grower lot notification',
    text: 'A grower calls: a neighbouring field was sprayed on a windy day and one of their recent lots may have caught drift. Their own laboratory will take days. A rapid test at the county laboratory would settle it before the formal hold procedure begins.',
    polarity: 'negative',
    weight: 1,
    routine: true,
    requires: { minShift: 4 },
    choices: [
      {
        id: 'test',
        label: 'Pay for a rapid test',
        cost: { fund: 90 },
        effect: {
          knowHow: 2,
          standing: 5,
          relationship: { customer: 'growers', delta: 3 },
          result:
            'The rapid test comes back clear and the lot is released with a traceability record.',
        },
        aiRecommended: true,
      },
      {
        id: 'hold',
        label: 'Hold the lot and call the lab',
        effect: {
          incident: 'supplier_contamination',
          standing: 5,
          result:
            'The lot is placed under formal hold and dispatch waits on the traceability review.',
        },
      },
      {
        // The lapse is a cost, not a dispatch-blocking incident: letting the
        // decision run out should never stop the plant on its own.
        id: 'mill-on',
        label: 'Mill it while the grower’s laboratory works',
        effect: {
          standing: -10,
          modifier: { label: 'Unconfirmed lot', qualityPenalty: 2, shifts: 3 },
          result:
            'The lot is milled while the grower’s laboratory works, and the county notes that a notified lot went through untested.',
        },
      },
    ],
    defaultChoiceId: 'mill-on',
    lapseShifts: 2,
  },
  {
    id: 'evt-haulier-breakdown',
    title: 'The haulier breaks down',
    // Valley Haulage is the haulier here; once it is gone, so is its lorry.
    text: 'Valley Haulage’s lorry for the afternoon collection has broken down on the bypass. Its workshop expects it back tomorrow. A relief lorry can be hired from the next town.',
    polarity: 'negative',
    weight: 2,
    routine: true,
    requires: { marks: { none: ['haulier-terminated', 'haulier-replaced'] } },
    choices: [
      {
        id: 'relief',
        label: 'Hire a relief lorry',
        cost: { fund: 80 },
        effect: {
          result: 'The relief lorry makes the collection on time.',
        },
        aiRecommended: true,
      },
      {
        id: 'wait',
        label: 'Wait for the repair',
        effect: {
          incident: 'delayed_truck',
          relationship: { customer: 'haulier', delta: 4 },
          result:
            'The collection slips and finished goods back up at the loading bay. The haulier remembers the patience.',
        },
      },
    ],
    defaultChoiceId: 'wait',
    lapseShifts: 2,
  },
  {
    id: 'evt-dull-roll-flutes',
    title: 'Dull roll flutes',
    text: 'The break rolls on R.M. 101 are drawing more current and the release is falling: the flutes have dulled. Sending both pairs away for refluting is the full answer. The worst pair can go first.',
    polarity: 'negative',
    weight: 2,
    routine: true,
    requires: { minShift: 6 },
    choices: [
      {
        id: 'both',
        label: 'Reflute both pairs',
        cost: { fund: 150 },
        effect: {
          modifier: { label: 'Sharp rolls', wear: 0.9, production: 1.03, shifts: 6 },
          result: 'Both pairs come back sharp and the break release recovers.',
        },
      },
      {
        id: 'worst',
        label: 'Reflute the worst pair',
        cost: { fund: 80 },
        effect: {
          modifier: { label: 'Refluted pair', wear: 0.96, shifts: 4 },
          result: 'The worst pair is refluted and the motor current settles.',
        },
        aiRecommended: true,
      },
      {
        id: 'run-on',
        label: 'Run them another week',
        effect: {
          modifier: { label: 'Dull flutes', wear: 1.1, energy: 1.06, shifts: 4 },
          result: 'The dull rolls stay in and draw more power for less release.',
        },
      },
    ],
    defaultChoiceId: 'run-on',
    lapseShifts: 3,
  },
  {
    id: 'evt-school-specks',
    title: 'Specks in the school flour',
    text: 'County School Meals reports dark specks in a delivery of community flour. It is bran, harmless, but the kitchens have asked questions. They want to know what the mill will do about it.',
    polarity: 'negative',
    weight: 2,
    routine: true,
    requires: { deliveredTo: 'school', minShift: 3 },
    choices: [
      {
        id: 'visit',
        label: 'Send the QC records',
        cost: { knowHow: 2 },
        effect: {
          relationship: { customer: 'school', delta: 6 },
          standing: 5,
          result: 'The QC records and sieve analysis go to the kitchens, who are reassured.',
        },
        aiRecommended: true,
      },
      {
        id: 'tighten',
        label: 'Tighten the sifter covers',
        effect: {
          relationship: { customer: 'school', delta: 3 },
          modifier: { label: 'Finer sifting', production: 0.97, shifts: 3 },
          result: 'The sifter covers are changed to a closer mesh, at some cost to throughput.',
        },
      },
      {
        id: 'file',
        label: 'File the complaint',
        effect: {
          relationship: { customer: 'school', delta: -10 },
          result: 'The complaint is filed without an answer, and School Meals notices.',
        },
      },
    ],
    defaultChoiceId: 'file',
    lapseShifts: 2,
  },
  {
    id: 'evt-pest-sign',
    title: 'Pest signs in the bran store',
    text: 'The weekly pest walk finds gnawed sacks and droppings in the bran store. The store is next to the packing line. The contracted pest-control firm can proof the building this week.',
    polarity: 'negative',
    weight: 2,
    routine: true,
    choices: [
      {
        id: 'firm',
        label: 'Call in the pest firm',
        cost: { fund: 70 },
        effect: {
          knowHow: 1,
          result: 'The firm proofs the store and the gaps under the doors are sealed.',
        },
        aiRecommended: true,
      },
      {
        id: 'in-house',
        label: 'Seal the store in-house',
        effect: {
          modifier: { label: 'Store proofing', production: 0.97, shifts: 2 },
          result: 'The crew seals the store between runs and the line slows while it is done.',
        },
      },
      {
        id: 'note',
        label: 'Note it for the next visit',
        effect: {
          modifier: { label: 'Pest risk', qualityPenalty: 2, shifts: 3 },
          result: 'The signs are noted and the store waits for the next scheduled visit.',
        },
      },
    ],
    defaultChoiceId: 'note',
    lapseShifts: 2,
  },

  // -------------------------------------------------------------------------
  // Neutral (dilemmas)
  // -------------------------------------------------------------------------
  {
    id: 'evt-inspector-visit',
    title: 'The food-safety inspector',
    text: 'A food-safety inspector from the county arrives unannounced and asks for the traceability records, the cleaning schedule and a walk of the packing hall. The visit is open until the inspector signs off. How the mill meets it shapes what the report says.',
    polarity: 'neutral',
    weight: 2,
    routine: false,
    requires: { minShift: 6 },
    onAppear: { inspection: true },
    choices: [
      {
        id: 'records',
        label: 'Walk them through the records',
        cost: { knowHow: 2 },
        effect: {
          closeInspection: true,
          relationship: { customer: 'all', delta: 4 },
          standing: 15,
          result:
            'The inspector follows a lot from intake to dispatch and signs off with no actions.',
        },
        aiRecommended: true,
      },
      {
        id: 'deep-clean',
        label: 'Deep-clean before the walk',
        cost: { fund: 100 },
        effect: {
          closeInspection: true,
          relationship: { customer: 'all', delta: 6 },
          standing: 20,
          modifier: { label: 'Deep clean', production: 0.96, shifts: 2 },
          result: 'The packing hall is deep-cleaned before the walk and the report is a clean one.',
        },
      },
      {
        id: 'as-is',
        label: 'Let the visit run its course',
        effect: {
          closeInspection: true,
          standing: -10,
          modifier: { label: 'Inspection actions', qualityPenalty: 1, shifts: 3 },
          result: 'The inspector signs off with a short list of actions to close.',
        },
      },
    ],
    defaultChoiceId: 'as-is',
    lapseShifts: 2,
  },
  {
    id: 'evt-two-buyers-one-slot',
    title: 'Two buyers, one slot',
    text: 'Riverside Bakers’ Cooperative and Community Pasta Works both want the early collection slot at the loading bay for the coming week. The bakers want strong white for a festival weekend; the pasta works wants semolina before a menu change. Each asks the mill to put them first.',
    polarity: 'neutral',
    weight: 2,
    routine: false,
    requires: { customerTier: 'warm' },
    choices: [
      {
        id: 'bakers',
        label: 'Put the bakers first',
        effect: {
          relationship: { customer: 'riverside', delta: 10 },
          modifier: { label: 'Strong-wheat conditioning', energy: 1.04, shifts: 3 },
          result:
            'The bakers get the early slot; the longer strong-wheat conditioning draws more power.',
        },
      },
      {
        id: 'pasta',
        label: 'Put the pasta works first',
        effect: {
          relationship: { customer: 'pasta', delta: 10 },
          modifier: { label: 'Durum on the rolls', wear: 1.06, shifts: 3 },
          result: 'The pasta works gets the early slot; the hard durum is heavier on the rolls.',
        },
      },
      {
        id: 'rota',
        label: 'Keep the booking order',
        effect: {
          result: 'The slot goes by the booking order and neither buyer is put first.',
        },
        aiRecommended: true,
      },
    ],
    defaultChoiceId: 'rota',
    lapseShifts: 2,
  },
  {
    id: 'evt-growers-weighbridge',
    title: 'Hill farms and valley farms',
    text: 'The valley growers and the hill growers are arguing over who goes first at the weighbridge in the harvest rush. The valley farms offer a haulage discount for priority. The hill farms offer the data from their variety trials.',
    polarity: 'neutral',
    weight: 2,
    routine: false,
    requires: { minShift: 4 },
    choices: [
      {
        id: 'valley',
        label: 'Give the valley farms priority',
        effect: {
          fund: 60,
          modifier: { label: 'Valley priority', forecastChance: 0.05, shifts: 3 },
          result:
            'The valley farms go first and the haulage discount is paid; the hill lorries queue on the lane.',
        },
      },
      {
        id: 'hill',
        label: 'Give the hill farms priority',
        effect: {
          knowHow: 4,
          modifier: { label: 'Hill priority', production: 0.97, shifts: 2 },
          result:
            'The hill farms go first and share their trial data; the bigger valley loads wait.',
        },
      },
      {
        id: 'first-come',
        label: 'Keep first come, first served',
        effect: {
          result:
            'The weighbridge stays first come, first served, and both groups grumble equally.',
        },
        aiRecommended: true,
      },
    ],
    defaultChoiceId: 'first-come',
    lapseShifts: 2,
  },
  {
    id: 'evt-members-meeting',
    title: 'The members’ meeting',
    text: 'The cooperative’s members meet to settle a motion: raise the share of each shift’s contribution held for reinvestment, or hold it down and keep prices low for the mill’s customers. Both sides have a fair case. The chair can also table the motion.',
    polarity: 'neutral',
    weight: 1,
    routine: false,
    requires: { minEra: 'cooperative' },
    choices: [
      {
        id: 'reinvest',
        label: 'Raise the reinvestment share',
        effect: {
          relationship: { customer: 'federation', delta: 4 },
          modifier: { label: 'Members’ reinvestment motion', reinvestment: 0.05, shifts: 6 },
          result: 'The motion carries and more of each shift’s contribution goes to the fund.',
        },
      },
      {
        id: 'prices',
        label: 'Keep prices low',
        effect: {
          relationship: { customer: 'all', delta: 6 },
          modifier: { label: 'Members’ price motion', reinvestment: -0.03, shifts: 6 },
          result: 'The members hold prices down; customers notice and the fund grows more slowly.',
        },
      },
      {
        id: 'table',
        label: 'Table the motion',
        effect: {
          result: 'The motion is tabled until the next meeting.',
        },
        aiRecommended: true,
      },
    ],
    defaultChoiceId: 'table',
    lapseShifts: 3,
  },
  {
    id: 'evt-demand-response',
    title: 'A demand-response call',
    text: 'The grid operator is short of capacity on a cold evening and offers a payment to sites that shed load at the peak. Shedding means slowing the line for a while. Declining costs nothing.',
    polarity: 'neutral',
    weight: 2,
    routine: false,
    requires: { minShift: 5 },
    choices: [
      {
        id: 'shed',
        label: 'Shed load at the peak',
        effect: {
          fund: 80,
          modifier: { label: 'Load shedding', production: 0.94, energy: 0.96, shifts: 2 },
          result: 'The mill slows at the peak and the operator’s payment goes into the fund.',
        },
        aiRecommended: true,
      },
      {
        id: 'decline',
        label: 'Decline the call',
        effect: {
          result: 'The mill runs on through the peak at its normal rate.',
        },
      },
    ],
    defaultChoiceId: 'decline',
    lapseShifts: 2,
  },
];

/** Part one's twenty events, then part two's (docs/CHRONICLE.md, systems 16-24). */
export const EVENT_DECK: ChronicleEventDefinition[] = [...BASE_DECK, ...STEWARD_DECK];

/**
 * Presentation-only copies, resolved in the current interface language.
 * Engine commands and persisted records keep using the raw English EVENT_DECK.
 */
export function getEventDeck(): ChronicleEventDefinition[] {
  const copy = (path: string): string =>
    translate(eventPresentationMessages, path as keyof typeof eventPresentationMessages.en);
  const effect = (value: ChronicleEventEffect, path: string): ChronicleEventEffect => ({
    ...value,
    result: copy(`${path}.result`),
    ...(value.modifier && {
      modifier: { ...value.modifier, label: copy(`${path}.modifier.label`) },
    }),
  });
  return EVENT_DECK.map((event) => ({
    ...event,
    title: copy(`${event.id}.title`),
    text: copy(`${event.id}.text`),
    choices: event.choices.map((choice) => {
      const path = `${event.id}.choices.${choice.id}`;
      return {
        ...choice,
        label: copy(`${path}.label`),
        effect: effect(choice.effect, `${path}.effect`),
        ...(choice.variants && {
          variants: choice.variants.map((variant, index) => ({
            ...variant,
            because: copy(`${path}.variants.${index}.because`),
            effect: effect(variant.effect, `${path}.variants.${index}.effect`),
          })),
        }),
      };
    }),
    ...(event.echoes && {
      echoes: event.echoes.map((echo, index) => ({
        ...echo,
        text: copy(`${event.id}.echoes.${index}.text`),
        because: copy(`${event.id}.echoes.${index}.because`),
      })),
    }),
  }));
}

/** Translate only recognized authored event copy; custom or historical receipts stay intact. */
export function localizedEventText(eventId: string, text: string): string {
  const entry = Object.entries(eventPresentationMessages.en).find(
    ([key, english]) => key.startsWith(`${eventId}.`) && english === text
  );
  return entry
    ? translate(eventPresentationMessages, entry[0] as keyof typeof eventPresentationMessages.en)
    : text;
}
