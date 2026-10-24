/**
 * The record (docs/CHRONICLE.md, system 16): decisions that come due.
 *
 * After Awakening's court, where executing Danella puts four soldiers in the
 * later riot and letting Ser Derren keep his land puts him on the wall at the
 * siege. A mark is what a choice leaves behind; events, choices, outcomes,
 * the long night and the epilogue read it. Every mark here must have a reader
 * (`steward.test.ts` fails on a mark that is set and never read, and on an
 * epilogue slide that play never reaches), because a
 * consequence the player cannot trace is a defect, not depth.
 */
import { relationshipTier } from './customers';
import { improvementById } from './plans';
import { stakeholderName, stakeholderPhrase } from './stakeholders';
import { CUSTOMERS } from './customers';
import { HISTORY_NOTES } from './history';
import { standingOf } from './certifier';
import type {
  CertifierState,
  ChronicleCondition,
  CustomerRelationship,
  DecisionMark,
  ForecastKind,
  FrontId,
  ImprovementProgress,
  Leaning,
  MarkCondition,
  MarkId,
  PartyId,
  StakeholderId,
  StakeholderRelationship,
} from './types';

export interface MarkDefinition {
  /** How the record lists it. */
  label: string;
  leaning?: Leaning;
  /** Preparation for the long night: the front and its weight. */
  prepares?: { front: FrontId; weight: number }[];
  /** Permanent forecast relief while the mark stands (points as fractions). */
  forecastRelief?: Partial<Record<ForecastKind, number>>;
}

export const MARKS: Record<MarkId, MarkDefinition> = {
  // Where the standby cover goes (Defending the Land)
  'cover-intake': {
    label: 'Placed the standby cover at the intake',
    leaning: 'growers',
    prepares: [{ front: 'intake', weight: 1 }],
    forecastRelief: { severe_rain: 0.08 },
  },
  'cover-floor': {
    label: 'Placed the standby cover on the roller floor',
    prepares: [{ front: 'floor', weight: 1 }],
    forecastRelief: { power_sag: 0.08, dust_filter_pressure: 0.08 },
  },
  'cover-yard': {
    label: 'Placed the standby cover in the dispatch yard',
    leaning: 'customers',
    forecastRelief: { delayed_truck: 0.08 },
  },
  'cover-thin': {
    label: 'Spread the standby cover across the whole site',
    prepares: [
      { front: 'intake', weight: 0.5 },
      { front: 'floor', weight: 0.5 },
    ],
    forecastRelief: {
      severe_rain: 0.04,
      power_sag: 0.04,
      dust_filter_pressure: 0.04,
      delayed_truck: 0.04,
    },
  },

  // Arbitration day (A Day in Court)
  'grower-terminated': {
    label: 'Ended the hail-struck farm’s contract and claimed the shortfall',
    leaning: 'ledger',
  },
  'grower-docked': { label: 'Docked the shortfall from the hail-struck farm’s payment' },
  'grower-advanced': {
    label: 'Advanced the hail-struck farm next year’s contract',
    leaning: 'growers',
  },
  'haulier-terminated': {
    label: 'Ended Valley Haulage’s contract for the abandoned run',
    leaning: 'ledger',
  },
  'haulier-suspended': {
    label: 'Put Valley Haulage on a crop year’s notice',
    leaning: 'standards',
  },
  'haulier-sheltered': {
    label: 'Let Valley Haulage work from the mill yard',
    leaning: 'valley',
  },
  'granary-pasta': {
    label: 'Gave the old granary to the pasta works',
    leaning: 'customers',
  },
  'granary-village': {
    label: 'Confirmed the old granary for the village bakery',
    leaning: 'valley',
  },
  'granary-kept': { label: 'Kept the old granary for the mill', leaning: 'ledger' },
  'owed-pasta': { label: 'Promised the pasta works compensation for the granary' },
  'promise-kept': {
    label: 'Kept the promise to the pasta works',
    leaning: 'customers',
  },
  'promise-broken': {
    label: 'Broke the promise to the pasta works',
    leaning: 'ledger',
  },
  'sacks-blacklisted': { label: 'Dropped the sack supplier without proof' },
  'sacks-kept': { label: 'Kept buying from the sack supplier without counting' },
  'sacks-audited': {
    label: 'Counted the sack deliveries at the gate',
    leaning: 'standards',
  },
  'precedent-kept': {
    label: 'Gave the pest-control firm the haulier’s terms',
    leaning: 'valley',
  },
  'precedent-refused': {
    label: 'Held the pest-control firm to its contract',
    leaning: 'standards',
  },

  // Errands that pay only at the climax
  'culvert-rebuilt': {
    label: 'Rebuilt the culvert under the yard',
    prepares: [{ front: 'intake', weight: 1 }],
  },
  'switchgear-surveyed': {
    label: 'Surveyed the roller-floor switchgear',
    prepares: [{ front: 'floor', weight: 1 }],
  },
  'stone-bought': { label: 'Bought quarry stone for a flood wall' },
  'flood-wall-built': {
    label: 'Built a flood wall round the grain stores',
    prepares: [{ front: 'intake', weight: 1 }],
  },

  // The valley meeting (The Peasant Revolution)
  'meeting-heard': { label: 'Answered the valley meeting from the record', leaning: 'valley' },
  'reserve-opened': { label: 'Opened the reserve for the valley', leaning: 'valley' },
  'meeting-dismissed': { label: 'Closed the valley meeting unanswered', leaning: 'ledger' },

  // The certifier
  'log-reported': { label: 'Reported the gap in the cleaning log', leaning: 'standards' },
  'log-recleaned': { label: 'Re-cleaned the sifting floor and logged it' },
  'log-backdated': { label: 'Backdated the cleaning log', leaning: 'ledger' },
  reinstated: { label: 'Passed the reinstatement audit', leaning: 'standards' },

  // Bigger offers
  'wholesaler-first': { label: 'Gave the city wholesaler first call', leaning: 'ledger' },
  'coop-terms': { label: 'Offered the wholesaler cooperative terms', leaning: 'customers' },
  'haulier-replaced': { label: 'Replaced the haulier with a larger firm', leaning: 'ledger' },
  'haulage-shared': { label: 'Shared the collections between two hauliers' },
  'hire-sifter-large': { label: 'Hired the large mobile sifter' },

  // The long night (set by the engine)
  'held-intake': { label: 'The intake held on the long night' },
  'held-floor': { label: 'The roller floor held on the long night' },
  'fell-intake': { label: 'The intake fell on the long night' },
  'fell-floor': { label: 'The roller floor fell on the long night' },
};

/** Marks the engine sets itself rather than an authored effect. */
export const ENGINE_MARKS: readonly MarkId[] = [
  'held-intake',
  'held-floor',
  'fell-intake',
  'fell-floor',
];

export function markLabel(id: MarkId): string {
  return MARKS[id]?.label ?? id;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** The slice of Chronicle state a condition reads. ChronicleState satisfies it. */
export interface RecordContext {
  marks: Record<MarkId, DecisionMark>;
  improvements: readonly ImprovementProgress[];
  readNotes: readonly string[];
  customers: readonly CustomerRelationship[];
  stakeholders: readonly StakeholderRelationship[];
  certifier: CertifierState;
}

export function hasMark(context: Pick<RecordContext, 'marks'>, id: MarkId): boolean {
  return Object.prototype.hasOwnProperty.call(context.marks, id);
}

export function marksMet(context: Pick<RecordContext, 'marks'>, condition: MarkCondition): boolean {
  if (condition.all && !condition.all.every((id) => hasMark(context, id))) return false;
  if (condition.any && !condition.any.some((id) => hasMark(context, id))) return false;
  if (condition.none && condition.none.some((id) => hasMark(context, id))) return false;
  return true;
}

export function partyValue(context: RecordContext, id: PartyId): number {
  return (
    context.customers.find((c) => c.id === id)?.value ??
    context.stakeholders.find((s) => s.id === id)?.value ??
    50
  );
}

export function conditionMet(context: RecordContext, condition: ChronicleCondition): boolean {
  if (condition.marks && !marksMet(context, condition.marks)) return false;
  if (
    condition.plan &&
    !context.improvements.some((p) => p.id === condition.plan && p.phase === 'installed')
  )
    return false;
  if (condition.note && !context.readNotes.includes(condition.note)) return false;
  if (condition.party) {
    const tier = relationshipTier(partyValue(context, condition.party.id));
    if (condition.party.tier && tier !== condition.party.tier) return false;
    if (condition.party.notTier && tier === condition.party.notTier) return false;
  }
  if (condition.minStanding !== undefined && standingOf(context.certifier) < condition.minStanding)
    return false;
  if (condition.suspended !== undefined && context.certifier.suspended !== condition.suspended)
    return false;
  if (condition.anyOf && !condition.anyOf.some((option) => conditionMet(context, option)))
    return false;
  return true;
}

export function partyName(id: PartyId): string {
  return (
    CUSTOMERS.find((c) => c.id === id)?.name ??
    (['growers', 'haulier', 'village', 'federation'].includes(id)
      ? stakeholderName(id as StakeholderId)
      : id)
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** A party as it reads mid-sentence: customers by name, organisations with their article. */
export function partyPhrase(id: PartyId): string {
  return CUSTOMERS.some((c) => c.id === id)
    ? partyName(id)
    : stakeholderPhrase(id as StakeholderId);
}

/** What a locked choice needs, for its button. */
export function conditionText(condition: ChronicleCondition): string {
  const parts: string[] = [];
  if (condition.marks?.all)
    parts.push(...condition.marks.all.map((id) => lowerFirst(markLabel(id))));
  if (condition.marks?.any)
    parts.push(condition.marks.any.map((id) => lowerFirst(markLabel(id))).join(' or '));
  if (condition.marks?.none)
    parts.push(...condition.marks.none.map((id) => `not: ${markLabel(id).toLowerCase()}`));
  if (condition.plan) parts.push(`${improvementById(condition.plan)?.label ?? condition.plan}`);
  if (condition.note)
    parts.push(
      `read “${HISTORY_NOTES.find((note) => note.id === condition.note)?.title ?? condition.note}”`
    );
  if (condition.party) {
    const name = partyPhrase(condition.party.id);
    if (condition.party.tier) parts.push(`${name} ${condition.party.tier}`);
    if (condition.party.notTier) parts.push(`${name} not ${condition.party.notTier}`);
  }
  if (condition.minStanding !== undefined) parts.push(`standing ${condition.minStanding}`);
  if (condition.suspended !== undefined)
    parts.push(condition.suspended ? 'approval suspended' : 'approval in force');
  if (condition.anyOf) parts.push(condition.anyOf.map(conditionText).join(' or '));
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Standing relief and the mill's character
// ---------------------------------------------------------------------------

export function markForecastRelief(
  context: Pick<RecordContext, 'marks'>,
  kind: ForecastKind
): number {
  let relief = 0;
  for (const id of Object.keys(context.marks)) relief += MARKS[id]?.forecastRelief?.[kind] ?? 0;
  return relief;
}

export const CHARACTERS: Record<Leaning | 'steady', string> = {
  growers: 'the Growers’ Mill',
  customers: 'the Bakers’ Mill',
  ledger: 'the Ledger Mill',
  standards: 'the Mill of Record',
  valley: 'the Valley’s Mill',
  steady: 'the Steady Mill',
};

/** How far the leading leaning must lead the next for it to name the mill. */
export const CHARACTER_LEAD = 2;

export function leaningCounts(context: Pick<RecordContext, 'marks'>): Record<Leaning, number> {
  const counts: Record<Leaning, number> = {
    growers: 0,
    customers: 0,
    ledger: 0,
    standards: 0,
    valley: 0,
  };
  for (const id of Object.keys(context.marks)) {
    const leaning = MARKS[id]?.leaning;
    if (leaning) counts[leaning] += 1;
  }
  return counts;
}

/** The mill's character from the record: NWN2's Warden or Dreadlord, for an institution. */
export function millCharacter(context: Pick<RecordContext, 'marks'>): {
  leaning: Leaning | 'steady';
  title: string;
} {
  const ranked = Object.entries(leaningCounts(context)).sort((a, b) => b[1] - a[1]) as Array<
    [Leaning, number]
  >;
  const [top, second] = ranked;
  if (top[1] - second[1] >= CHARACTER_LEAD) return { leaning: top[0], title: CHARACTERS[top[0]] };
  return { leaning: 'steady', title: CHARACTERS.steady };
}

/** The record as a list, oldest first. */
export function recordEntries(context: Pick<RecordContext, 'marks'>): DecisionMark[] {
  return Object.values(context.marks).sort((a, b) => a.shift - b.shift);
}
