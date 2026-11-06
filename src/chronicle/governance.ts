/**
 * Part three: standing orders (docs/CHRONICLE.md, systems 25-32), after
 * Kremlingames' Crisis in the Kremlin (CiK), Ostalgie (OST) and Mao's Legacy
 * (ML), read from their shipped data.
 *
 * Part one's decisions arrive and are answered; part two's are remembered.
 * What the three games add is the setting you leave in place and come back to:
 * a policy ladder whose step moves thresholds (ML `Doctr_en`, `old_modify_opis_en`:
 * corruption starts below a living standard of 30 under "Bird's cage", 40
 * under "Mixed", 50 under "Minimum regulation"), conditions that print their
 * own way out ("To deactivate: Own tech. industry"), warnings with a countdown
 * (ML `other_text_en`: "In {0} months China will be excluded"), the minister
 * whose views predict their actions (CiK), the plan and its return (CiK
 * "Five-years plan", "Forgery in plans"), and the reserve (CiK "ON/OFF
 * Autofill reserve").
 *
 * The crew is the one departure from the games: their ministers and factions
 * are scored for loyalty; here members are anonymous roles whose values predict
 * their votes, and nothing about them is a number.
 *
 * Everything here is data and pure functions; engine.ts performs them.
 */
import { formatFixed, translate } from '../i18n';
import { SHIFTS_PER_CROP_YEAR } from './cropYears';
import { AI_MITIGATION_THRESHOLD } from './delegation';
import {
  briefMessages,
  conditionMessages,
  crewMessages,
  ladderMessages,
  redLineMessages,
  rungMessages,
  temperamentMessages,
} from './governance.messages';
import { chronicleChance } from './rng';
import type {
  BriefId,
  Charter,
  CrewBallot,
  CrewMember,
  CrewObjection,
  CrewRoleId,
  ForecastKind,
  GovernanceState,
  ImprovementDefinition,
  GovernanceStreaks,
  Leaning,
  MarkId,
  ModifierValues,
  Policies,
  PolicyLadder,
  PolicyProposal,
  PolicyRung,
  RelationshipDelta,
  StakeholderId,
  StandingCondition,
  StandingConditionId,
} from './types';

// ---------------------------------------------------------------------------
// 25. Policy ladders (CiK doctrines; ML `Doctr_en`)
// ---------------------------------------------------------------------------

export interface PolicyRungDefinition {
  label: string;
  effect: ModifierValues;
  /** Signed forecast points (0.05 = five points more likely). */
  forecast?: Partial<Record<ForecastKind, number>>;
  /** Relationship changes at each crop year's turn while the step holds. */
  yearly?: RelationshipDelta[];
  /** An installed plan the step needs. */
  requiresPlan?: string;
  /** The effect, as its button says it. */
  effectText: string;
}

export interface PolicyLadderDefinition {
  id: PolicyLadder;
  label: string;
  rungs: [PolicyRungDefinition, PolicyRungDefinition, PolicyRungDefinition];
}

export const POLICY_LADDERS: readonly PolicyLadderDefinition[] = [
  {
    id: 'maintenance',
    label: 'Maintenance',
    rungs: [
      {
        label: 'Run to failure',
        effect: { upkeep: 0.85, wear: 1.06 },
        forecast: { power_sag: 0.05, dust_filter_pressure: 0.05 },
        effectText: 'upkeep x0.85, wear x1.06, grid strain and dust load +5 points',
      },
      { label: 'Scheduled', effect: {}, effectText: 'no change' },
      {
        label: 'Condition-based',
        effect: { upkeep: 1.1, wear: 0.92 },
        forecast: { dust_filter_pressure: -0.05, power_sag: -0.03 },
        requiresPlan: 'vibration-monitoring',
        effectText: 'upkeep x1.1, wear x0.92, dust load -5 points, grid strain -3 points',
      },
    ],
  },
  {
    id: 'intake',
    label: 'Intake',
    rungs: [
      {
        label: 'Any lot',
        effect: { production: 1.03, qualityPenalty: 1 },
        effectText: 'production x1.03, quality -1',
      },
      { label: 'Graded at the gate', effect: {}, effectText: 'no change' },
      {
        label: 'Contracted growers only',
        effect: { production: 0.97, qualityPenalty: -1 },
        yearly: [{ customer: 'growers', delta: 6 }],
        effectText: 'production x0.97, quality +1, growers +6 each crop year',
      },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    rungs: [
      {
        label: 'Lean',
        effect: { upkeep: 0.9 },
        forecast: { delayed_truck: 0.08 },
        effectText: 'upkeep x0.9, road works +8 points',
      },
      { label: 'Working buffer', effect: {}, effectText: 'no change' },
      {
        label: 'Strategic reserve',
        effect: { upkeep: 1.12 },
        forecast: { delayed_truck: -0.08, severe_rain: -0.04 },
        effectText: 'upkeep x1.12, road works -8 points, storm front -4 points',
      },
    ],
  },
  {
    id: 'orders',
    label: 'Order book',
    rungs: [
      {
        label: 'Spot',
        effect: { reinvestment: 0.03 },
        yearly: [{ customer: 'all', delta: -4 }],
        effectText: 'reinvestment +3%, customers -4 each crop year',
      },
      { label: 'Mixed', effect: {}, effectText: 'no change' },
      {
        label: 'Contract',
        effect: { reinvestment: -0.02 },
        yearly: [{ customer: 'all', delta: 4 }],
        effectText: 'reinvestment -2%, customers +4 each crop year',
      },
    ],
  },
];

export const POLICY_LADDER_IDS: readonly PolicyLadder[] = POLICY_LADDERS.map((l) => l.id);

export function ladderById(id: PolicyLadder): PolicyLadderDefinition {
  return POLICY_LADDERS.find((ladder) => ladder.id === id) ?? POLICY_LADDERS[0];
}

export function rungOf(ladder: PolicyLadder, rung: PolicyRung): PolicyRungDefinition {
  return ladderById(ladder).rungs[rung];
}

export const MIDDLE_POLICIES: Readonly<Policies> = Object.freeze({
  maintenance: 1,
  intake: 1,
  stock: 1,
  orders: 1,
});

/** Shifts a ladder stays where it was put before it can move again. */
export const POLICY_LOCK_SHIFTS = 3;
/** Putting a change to the assembly (CiK: "15 more points to change a doctrine"). */
export const POLICY_KNOW_HOW = 4;
export const POLICY_COUNCIL = 1;

export function policyValues(policies: Policies): ModifierValues[] {
  return POLICY_LADDERS.map((ladder) => ladder.rungs[policies[ladder.id]].effect);
}

/** Signed forecast points the standing policies add (negative is relief). */
export function policyForecastShift(policies: Policies, kind: ForecastKind): number {
  return POLICY_LADDERS.reduce(
    (sum, ladder) => sum + (ladder.rungs[policies[ladder.id]].forecast?.[kind] ?? 0),
    0
  );
}

export function policyYearly(policies: Policies): RelationshipDelta[] {
  return POLICY_LADDERS.flatMap((ladder) => ladder.rungs[policies[ladder.id]].yearly ?? []);
}

export function shiftsUntilUnlocked(gov: GovernanceState, ladder: PolicyLadder, shift: number) {
  const changed = gov.changedShift[ladder];
  return changed === null ? 0 : Math.max(0, changed + POLICY_LOCK_SHIFTS - shift);
}

// ---------------------------------------------------------------------------
// 26. The crew and the members' assembly
// ---------------------------------------------------------------------------

/**
 * Two profiles per role; the charter's seed picks one, so each chronicle has
 * its own crew. Roles only: no names, no portraits, no score.
 */
export const CREW_PROFILES: Record<CrewRoleId, readonly [CrewMember, CrewMember]> = {
  'head-miller': [
    {
      id: 'head-miller',
      role: 'Head miller',
      temperament: 'cautious',
      value: 'a mill that runs the same every day',
      prefers: { ladder: 'orders', rung: 2 },
      need: {
        text: 'time to set the rolls properly',
        ladder: 'maintenance',
        rung: 0,
        concession: 'fund a roll-setting shift each week',
        fund: 40,
      },
    },
    {
      id: 'head-miller',
      role: 'Head miller',
      temperament: 'even',
      value: 'flour the bakers can trust',
      prefers: { ladder: 'intake', rung: 2 },
      need: {
        text: 'grain that can be vouched for',
        ladder: 'intake',
        rung: 0,
        concession: 'pay for a second intake test',
        fund: 35,
      },
    },
  ],
  'roll-fitter': [
    {
      id: 'roll-fitter',
      role: 'Roll fitter',
      temperament: 'eager',
      value: 'doing a job once, properly',
      prefers: { ladder: 'maintenance', rung: 2 },
      need: {
        text: 'spares to fix things before they break',
        ladder: 'maintenance',
        rung: 0,
        concession: 'stock a spares shelf',
        fund: 45,
      },
    },
    {
      id: 'roll-fitter',
      role: 'Roll fitter',
      temperament: 'even',
      value: 'machines that last',
      prefers: { ladder: 'maintenance', rung: 1 },
      need: {
        text: 'parts on the shelf',
        ladder: 'stock',
        rung: 0,
        concession: 'keep a float of spare parts',
        fund: 35,
      },
    },
  ],
  'intake-grader': [
    {
      id: 'intake-grader',
      role: 'Intake grader',
      temperament: 'cautious',
      value: 'fair dealing with the growers',
      prefers: { ladder: 'intake', rung: 1 },
      need: {
        text: 'a grading standard the growers know in advance',
        ladder: 'intake',
        rung: 0,
        concession: 'publish the grading card',
        fund: 25,
      },
    },
    {
      id: 'intake-grader',
      role: 'Intake grader',
      temperament: 'eager',
      value: 'the growers’ cooperative',
      prefers: { ladder: 'intake', rung: 2 },
      need: {
        text: 'contracts the growers can plan a season around',
        ladder: 'orders',
        rung: 0,
        concession: 'underwrite the growers’ forward price',
        fund: 50,
      },
    },
  ],
  lab: [
    {
      id: 'lab',
      role: 'Lab technician',
      temperament: 'even',
      value: 'results on the record',
      prefers: { ladder: 'intake', rung: 2 },
      need: {
        text: 'time to test every lot',
        ladder: 'intake',
        rung: 0,
        concession: 'set up a second lab bench',
        fund: 40,
      },
    },
    {
      id: 'lab',
      role: 'Lab technician',
      temperament: 'cautious',
      value: 'clean records',
      prefers: { ladder: 'maintenance', rung: 2 },
      need: {
        text: 'a logged maintenance history',
        ladder: 'maintenance',
        rung: 0,
        concession: 'pay a clerk to keep the maintenance log',
        fund: 30,
      },
    },
  ],
  packing: [
    {
      id: 'packing',
      role: 'Packing lead',
      temperament: 'eager',
      value: 'the customers’ orders out on time',
      prefers: { ladder: 'stock', rung: 2 },
      need: {
        text: 'packed stock to cover a late lorry',
        ladder: 'stock',
        rung: 0,
        concession: 'rent overflow pallet space',
        fund: 35,
      },
    },
    {
      id: 'packing',
      role: 'Packing lead',
      temperament: 'even',
      value: 'shifts that can be planned',
      prefers: { ladder: 'orders', rung: 2 },
      need: {
        text: 'a packing rota that holds for the week',
        ladder: 'orders',
        rung: 0,
        concession: 'fix the packing rota a week ahead',
        fund: 25,
      },
    },
  ],
  yard: [
    {
      id: 'yard',
      role: 'Yard hand',
      temperament: 'eager',
      value: 'a yard that keeps moving',
      prefers: { ladder: 'stock', rung: 0 },
      need: {
        text: 'room to turn a forklift',
        ladder: 'stock',
        rung: 2,
        concession: 'mark out a second turning lane',
        fund: 30,
      },
    },
    {
      id: 'yard',
      role: 'Yard hand',
      temperament: 'cautious',
      value: 'the valley’s small buyers',
      prefers: { ladder: 'orders', rung: 1 },
      need: {
        text: 'work for the valley’s small buyers',
        ladder: 'orders',
        rung: 2,
        concession: 'keep a counter open for small buyers',
        fund: 25,
      },
    },
  ],
};

export const CREW_ROLE_IDS: readonly CrewRoleId[] = [
  'head-miller',
  'roll-fitter',
  'intake-grader',
  'lab',
  'packing',
  'yard',
];

export function crewForSeed(seed: number): CrewMember[] {
  return CREW_ROLE_IDS.map(
    (id) => CREW_PROFILES[id][chronicleChance(seed, `crew:${id}`, 0) < 0.5 ? 0 : 1]
  );
}

/** Each temperament as the crew card reads it: a name, then the rule it follows. */
export const TEMPERAMENTS: Record<CrewMember['temperament'], { label: string; rule: string }> = {
  cautious: {
    label: 'Cautious',
    rule: 'votes against a move to either end of a ladder that does not touch them',
  },
  eager: { label: 'Eager', rule: 'votes for a change that does not touch them' },
  even: { label: 'Even-handed', rule: 'abstains on a change that does not touch them' },
};

/** How one member votes on a proposal. Their values decide it; nothing is rolled. */
export function crewBallot(
  member: CrewMember,
  proposal: Pick<PolicyProposal, 'ladder' | 'from' | 'to' | 'concessions'>,
  objections: readonly CrewObjection[]
): CrewBallot {
  const at = (reason: string, vote: CrewBallot['vote']): CrewBallot => ({
    memberId: member.id,
    vote,
    reason,
  });
  if (member.need.ladder === proposal.ladder && member.need.rung === proposal.to) {
    return proposal.concessions.includes(member.id)
      ? at(`their need for ${member.need.text} is met another way`, 'abstain')
      : at(`it cuts against their need for ${member.need.text}`, 'against');
  }
  const standing = objections.find((objection) => objection.memberId === member.id);
  // The objection's step is the ladder's current one, so any move on it lifts it.
  if (standing && standing.ladder === proposal.ladder && proposal.to !== standing.rung)
    return at(
      `it lifts their objection on ${ladderById(standing.ladder).label.toLowerCase()}`,
      'for'
    );
  if (standing)
    return at(
      `their objection on ${ladderById(standing.ladder).label.toLowerCase()} still stands`,
      'against'
    );
  if (member.prefers.ladder === proposal.ladder) {
    const before = Math.abs(member.prefers.rung - proposal.from);
    const after = Math.abs(member.prefers.rung - proposal.to);
    if (after < before) return at(`it moves toward what they value: ${member.value}`, 'for');
    if (after > before) return at(`it moves away from what they value: ${member.value}`, 'against');
  }
  if (member.temperament === 'eager') return at('they back a change that leaves them be', 'for');
  if (member.temperament === 'cautious' && proposal.to !== 1)
    return at('they distrust a move to either end', 'against');
  return at('it does not touch them', 'abstain');
}

export function assemblyBallots(
  gov: Pick<GovernanceState, 'crew' | 'objections'>,
  proposal: Pick<PolicyProposal, 'ladder' | 'from' | 'to' | 'concessions'>
): CrewBallot[] {
  return gov.crew.map((member) => crewBallot(member, proposal, gov.objections));
}

export function assemblyCount(ballots: readonly CrewBallot[]) {
  const count = (vote: CrewBallot['vote']) => ballots.filter((b) => b.vote === vote).length;
  const votes = { for: count('for'), against: count('against'), abstain: count('abstain') };
  // One member, one vote; abstentions are not counted and a tie does not carry.
  return { ...votes, carried: votes.for > votes.against };
}

/** Members a proposal's step outvotes on a need: their objection will stand. */
export function outvotedNeeds(
  crew: readonly CrewMember[],
  ladder: PolicyLadder,
  rung: PolicyRung,
  concessions: readonly CrewRoleId[]
): CrewMember[] {
  return crew.filter(
    (member) =>
      member.need.ladder === ladder && member.need.rung === rung && !concessions.includes(member.id)
  );
}

// ---------------------------------------------------------------------------
// 27. Standing conditions with their way out (ML `old_modify_opis_en`)
// ---------------------------------------------------------------------------

export interface StandingConditionDefinition {
  id: StandingConditionId;
  label: string;
  effect: ModifierValues;
  effectText: string;
  /** "To clear:" as the card prints it. */
  clearText: string;
}

export const STANDING_CONDITIONS: Record<StandingConditionId, StandingConditionDefinition> = {
  'tired-machinery': {
    id: 'tired-machinery',
    label: 'Tired machinery',
    // The charter's wear applies while this stands; renewing the plant lifts it.
    effect: {},
    effectText: 'wear x1.25',
    clearText: 'three improvements installed',
  },
  'deferred-maintenance': {
    id: 'deferred-maintenance',
    label: 'Deferred maintenance',
    effect: { productionCeiling: 0.94 },
    effectText: 'production cannot rise above x0.94',
    clearText: 'three shifts out of austerity',
  },
  'worn-rolls': {
    id: 'worn-rolls',
    label: 'Worn roll surfaces',
    effect: { wear: 1.08, qualityPenalty: 1 },
    effectText: 'wear x1.08, quality -1',
    clearText: 'the roll regrinding shop installed, or four shifts off run-to-failure',
  },
  'thin-stocks': {
    id: 'thin-stocks',
    label: 'Thin stocks',
    effect: { productionCeiling: 0.97 },
    effectText: 'production cannot rise above x0.97',
    clearText: 'two shifts on a working buffer or a strategic reserve',
  },
  'behind-plan': {
    id: 'behind-plan',
    label: 'Behind the plan',
    effect: { reinvestment: -0.03 },
    effectText: 'reinvestment -3%',
    clearText: 'meet the next crop year’s quota',
  },
  administration: {
    id: 'administration',
    label: 'Under the federation’s administrator',
    effect: { upkeep: 1.1 },
    effectText: 'upkeep x1.1, policies locked, the AI partner acts at Forecasts or above',
    clearText: 'the administrator leaves after four shifts',
  },
};

/** Onsets and exits, in shifts. */
export const DEFERRED_MAINTENANCE_AFTER = 2;
export const DEFERRED_MAINTENANCE_CLEARS = 3;
export const WORN_ROLLS_AFTER = 4;
export const WORN_ROLLS_CLEARS = 4;
export const THIN_STOCKS_CLEARS = 2;
export const RENEWAL_INSTALLS = 3;

export function conditionValues(conditions: readonly StandingCondition[]): ModifierValues[] {
  return conditions.map((condition) => STANDING_CONDITIONS[condition.id]?.effect ?? {});
}

export interface ConditionContext {
  shift: number;
  conditions: readonly StandingCondition[];
  streaks: GovernanceStreaks;
  policies: Policies;
  austerity: { active: boolean; shifts: number };
  installed: readonly string[];
  /** A road-works forecast struck at this close. */
  delayedTruckStruck: boolean;
  machineryRenewed: boolean;
}

export interface ConditionAssessment {
  conditions: StandingCondition[];
  streaks: GovernanceStreaks;
  raised: StandingConditionId[];
  cleared: StandingConditionId[];
  machineryRenewed: boolean;
}

/**
 * One shift close's reading of the conditions the plant itself raises and
 * clears. The plan and the administrator raise and clear their own (`behind-plan`,
 * `administration`); this leaves them as they are.
 */
export function assessConditions(context: ConditionContext): ConditionAssessment {
  const streaks: GovernanceStreaks = {
    outOfAusterity: context.austerity.active ? 0 : context.streaks.outOfAusterity + 1,
    runToFailure: context.policies.maintenance === 0 ? context.streaks.runToFailure + 1 : 0,
    offRunToFailure: context.policies.maintenance === 0 ? 0 : context.streaks.offRunToFailure + 1,
    stockedUp: context.policies.stock === 0 ? 0 : context.streaks.stockedUp + 1,
  };
  const has = (id: StandingConditionId) => context.conditions.some((c) => c.id === id);
  const raised: StandingConditionId[] = [];
  const cleared: StandingConditionId[] = [];
  let machineryRenewed = context.machineryRenewed;

  if (has('tired-machinery') && context.installed.length >= RENEWAL_INSTALLS) {
    cleared.push('tired-machinery');
    machineryRenewed = true;
  }
  if (has('deferred-maintenance')) {
    if (streaks.outOfAusterity >= DEFERRED_MAINTENANCE_CLEARS) cleared.push('deferred-maintenance');
  } else if (context.austerity.active && context.austerity.shifts >= DEFERRED_MAINTENANCE_AFTER) {
    raised.push('deferred-maintenance');
  }
  if (has('worn-rolls')) {
    if (
      context.installed.includes('roll-regrinding-shop') ||
      streaks.offRunToFailure >= WORN_ROLLS_CLEARS
    )
      cleared.push('worn-rolls');
  } else if (
    streaks.runToFailure >= WORN_ROLLS_AFTER &&
    !context.installed.includes('roll-regrinding-shop')
  ) {
    raised.push('worn-rolls');
  }
  if (has('thin-stocks')) {
    if (streaks.stockedUp >= THIN_STOCKS_CLEARS) cleared.push('thin-stocks');
  } else if (context.policies.stock === 0 && context.delayedTruckStruck) {
    raised.push('thin-stocks');
  }

  const conditions = [
    ...context.conditions.filter((c) => !cleared.includes(c.id)),
    ...raised.map((id) => ({ id, sinceShift: context.shift })),
  ];
  return { conditions, streaks, raised, cleared, machineryRenewed };
}

/** How far a condition is toward its way out, for its card ("2 of 3"). */
export function conditionProgress(
  gov: Pick<GovernanceState, 'streaks' | 'administration'>,
  id: StandingConditionId,
  installedCount: number,
  shift: number
): { done: number; of: number } | null {
  switch (id) {
    case 'tired-machinery':
      return { done: Math.min(installedCount, RENEWAL_INSTALLS), of: RENEWAL_INSTALLS };
    case 'deferred-maintenance':
      return {
        done: Math.min(gov.streaks.outOfAusterity, DEFERRED_MAINTENANCE_CLEARS),
        of: DEFERRED_MAINTENANCE_CLEARS,
      };
    case 'worn-rolls':
      return {
        done: Math.min(gov.streaks.offRunToFailure, WORN_ROLLS_CLEARS),
        of: WORN_ROLLS_CLEARS,
      };
    case 'thin-stocks':
      return { done: Math.min(gov.streaks.stockedUp, THIN_STOCKS_CLEARS), of: THIN_STOCKS_CLEARS };
    case 'administration':
      return gov.administration
        ? {
            done: ADMINISTRATION_SHIFTS - Math.max(0, gov.administration.untilShift - shift),
            of: ADMINISTRATION_SHIFTS,
          }
        : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 28. Red lines and countdowns (ML `other_text_en`)
// ---------------------------------------------------------------------------

export interface RedLine {
  party: StakeholderId;
  ladder: PolicyLadder;
  rung: PolicyRung;
  reason: string;
  mark: MarkId;
}

export const RED_LINES: readonly RedLine[] = [
  {
    party: 'growers',
    ladder: 'intake',
    rung: 0,
    reason: 'buying any lot undercuts the cooperative’s price agreement',
    mark: 'growers-broke-off',
  },
  {
    party: 'village',
    ladder: 'stock',
    rung: 0,
    reason: 'the village bakery relies on the mill’s winter buffer',
    mark: 'village-broke-off',
  },
  {
    party: 'federation',
    ladder: 'orders',
    rung: 0,
    reason: 'federation contracts depend on members’ contracted supply',
    mark: 'federation-broke-off',
  },
];

export const COUNTDOWN_SHIFTS = 3;
export const BREAK_OFF_DELTA = -15;

export function redLineKey(line: Pick<RedLine, 'party' | 'ladder' | 'rung'>): string {
  return `${line.party}:${line.ladder}:${line.rung}`;
}

export function redLinesCrossed(policies: Policies): RedLine[] {
  return RED_LINES.filter((line) => policies[line.ladder] === line.rung);
}

// ---------------------------------------------------------------------------
// 29. The partner's brief (CiK: "views ... help to predict their actions")
// ---------------------------------------------------------------------------

export const BRIEFS: ReadonlyArray<{ id: BriefId; label: string; rule: string }> = [
  {
    id: 'conventional',
    label: 'Conventional',
    rule: 'takes the recommended answer, mitigates any forecast from 40%, installs the cheapest plan first',
  },
  {
    id: 'standards',
    label: 'Standards first',
    rule: 'favours the certifier’s standing and the record, mitigates dust load from 25%, installs quality and dust plans first',
  },
  {
    id: 'thrift',
    label: 'Thrift',
    rule: 'keeps the most in the fund, mitigates only from 55%, installs plans that cut running costs first',
  },
  {
    id: 'neighbour',
    label: 'Good neighbour',
    rule: 'favours the growers, the village and the haulier, mitigates storms and road works from 25%, installs drainage and haulage plans first',
  },
];

export function briefLabel(id: BriefId): string {
  return BRIEFS.find((brief) => brief.id === id)?.label ?? id;
}

/**
 * Presentation copies in the current interface language. The engine, the
 * record and persisted reasons keep reading the English BRIEFS.
 */
export function getBriefs(): Array<{ id: BriefId; label: string; rule: string }> {
  return BRIEFS.map((brief) => {
    const messages = briefMessages(brief);
    return { ...brief, label: translate(messages, 'label'), rule: translate(messages, 'rule') };
  });
}

// ---------------------------------------------------------------------------
// Presentation copies (rule 7): the engine, the record and saved state keep
// reading the English definitions above; the tabs read these.
// ---------------------------------------------------------------------------

/** The English text's numbers, in order, as `{n0}`, `{n1}` ... for the reader. */
function numberParams(english: string): Record<string, string> {
  return Object.fromEntries(
    (english.match(/\d+(?:\.\d+)?/g) ?? []).map((number, index) => [
      `n${index}`,
      formatFixed(Number(number), number.includes('.') ? number.split('.')[1].length : 0),
    ])
  );
}

export function getPolicyLadders(): PolicyLadderDefinition[] {
  return POLICY_LADDERS.map((ladder) => ({
    ...ladder,
    label: translate(ladderMessages(ladder), 'label'),
    rungs: ladder.rungs.map((rung, index) => {
      const messages = rungMessages(ladder.id, index, rung);
      return {
        ...rung,
        label: translate(messages, 'label'),
        effectText: translate(messages, 'effectText', numberParams(rung.effectText)),
      };
    }) as PolicyLadderDefinition['rungs'],
  }));
}

export function getLadder(id: PolicyLadder): PolicyLadderDefinition {
  const ladders = getPolicyLadders();
  return ladders.find((ladder) => ladder.id === id) ?? ladders[0];
}

export function getRung(ladder: PolicyLadder, rung: PolicyRung): PolicyRungDefinition {
  return getLadder(ladder).rungs[rung];
}

export function getStandingConditions(): Record<StandingConditionId, StandingConditionDefinition> {
  return Object.fromEntries(
    Object.values(STANDING_CONDITIONS).map((condition) => {
      const messages = conditionMessages(condition);
      return [
        condition.id,
        {
          ...condition,
          label: translate(messages, 'label'),
          effectText: translate(messages, 'effectText', numberParams(condition.effectText)),
          clearText: translate(messages, 'clearText', numberParams(condition.clearText)),
        },
      ];
    })
  ) as Record<StandingConditionId, StandingConditionDefinition>;
}

export function getTemperaments(): typeof TEMPERAMENTS {
  return Object.fromEntries(
    Object.entries(TEMPERAMENTS).map(([id, temperament]) => {
      const messages = temperamentMessages(id as CrewMember['temperament'], temperament);
      return [id, { label: translate(messages, 'label'), rule: translate(messages, 'rule') }];
    })
  ) as typeof TEMPERAMENTS;
}

/**
 * Which of its role's two profiles a crew member saved in state is, by its
 * text. Null for a member that matches neither (edited, or from another build):
 * that one is shown as stored.
 */
export function crewProfileOf(member: CrewMember): 0 | 1 | null {
  const index = (CREW_PROFILES[member.id] ?? []).findIndex(
    (profile) =>
      profile.role === member.role &&
      profile.value === member.value &&
      profile.need.text === member.need.text &&
      profile.need.concession === member.need.concession
  );
  return index === 0 || index === 1 ? index : null;
}

/** A saved crew member in the current interface language; the record keeps its English. */
export function localizedCrewMember(member: CrewMember): CrewMember {
  const profile = crewProfileOf(member);
  if (profile === null) return member;
  const messages = crewMessages(member.id, profile, {
    role: member.role,
    value: member.value,
    need: member.need.text,
    concession: member.need.concession,
  });
  return {
    ...member,
    role: translate(messages, 'role'),
    value: translate(messages, 'value'),
    need: {
      ...member.need,
      text: translate(messages, 'need'),
      concession: translate(messages, 'concession'),
    },
  };
}

export function getRedLines(): RedLine[] {
  return RED_LINES.map((line) => ({
    ...line,
    reason: translate(redLineMessages(redLineKey(line), line), 'reason'),
  }));
}

/** What one answer offers, as the briefs weigh it. */
export interface BriefWeighing {
  fundNet: number;
  knowHowCost: number;
  standing: number;
  neighbourly: number;
  leanings: readonly Leaning[];
}

/**
 * A brief's score for an answer; higher is preferred. An answer the brief has
 * no view of scores 0, so it still beats one the brief counts against: a
 * standards-first partner never takes the answer that costs standing because
 * the others were neutral. The conventional brief scores nothing, and the
 * caller lets the conventional answer win every tie.
 */
export function briefScore(brief: BriefId, weighing: BriefWeighing): number | null {
  const count = (leaning: Leaning) => weighing.leanings.filter((l) => l === leaning).length;
  switch (brief) {
    case 'thrift':
      return weighing.fundNet - weighing.knowHowCost * 10;
    case 'standards':
      return weighing.standing + count('standards') * 20;
    case 'neighbour':
      return weighing.neighbourly + (count('valley') + count('growers')) * 5;
    default:
      return null;
  }
}

/**
 * The forecast chance at or above which the partner pays to mitigate, under
 * its brief. In the authored deck the recommended answers to routine events
 * already favour standards, so a brief that only weighed answers would change
 * nothing for "Standards first" (measured: 0 of 15 routine events). Its values
 * show here and in installs instead: what it guards early, and what it builds.
 */
export function briefMitigationThreshold(brief: BriefId, kind: ForecastKind): number {
  switch (brief) {
    case 'standards':
      return kind === 'dust_filter_pressure' ? 0.25 : AI_MITIGATION_THRESHOLD;
    case 'neighbour':
      return kind === 'severe_rain' || kind === 'delayed_truck' ? 0.25 : AI_MITIGATION_THRESHOLD;
    case 'thrift':
      return 0.55;
    default:
      return AI_MITIGATION_THRESHOLD;
  }
}

/** A plan's running cost over a crop year, install included. */
function yearCost(plan: ImprovementDefinition): number {
  return plan.installCost + plan.upkeep * SHIFTS_PER_CROP_YEAR;
}

/** Whether a plan serves what the brief values. */
export function briefServes(brief: BriefId, plan: ImprovementDefinition): boolean {
  switch (brief) {
    case 'standards':
      return (
        (plan.effect.qualityPenalty ?? 0) < 0 ||
        (plan.cropRelief?.length ?? 0) > 0 ||
        (plan.forecastRelief?.dust_filter_pressure ?? 0) > 0
      );
    case 'neighbour':
      return (
        (plan.forecastRelief?.severe_rain ?? 0) > 0 || (plan.forecastRelief?.delayed_truck ?? 0) > 0
      );
    case 'thrift':
      return (plan.effect.energy ?? 1) < 1 || (plan.effect.upkeep ?? 1) < 1;
    default:
      return false;
  }
}

/**
 * The order the partner installs plans in at delegation level 3: lowest first.
 * Conventional takes the cheapest install; a brief takes the plans that serve
 * it first, then the cheapest (thrift: the cheapest over a crop year).
 */
export function briefInstallRank(brief: BriefId, plan: ImprovementDefinition): number {
  const cost = brief === 'thrift' ? yearCost(plan) : plan.installCost;
  return (briefServes(brief, plan) ? 0 : 100_000) + cost;
}

// ---------------------------------------------------------------------------
// 30. The crop-year return and the ratchet (CiK "Five-years plan")
// ---------------------------------------------------------------------------

/** The first quota is this share of the first year's recorded dispatch. */
export const FIRST_QUOTA_SHARE = 0.9;
/** Paid into the fund by the federation for a quota met. */
export const FEDERATION_PREMIUM = 60;
export const QUOTA_RELATIONSHIP = 6;

/** Down to the hundred, so a quota set from a dispatch never asks for more than it. */
export function roundQuota(kg: number): number {
  return Math.max(0, Math.floor(kg / 100) * 100);
}

/**
 * The ratchet: the next quota is never below this one, and a year that beat it
 * becomes the new floor, never above what that year dispatched. The first year
 * sets no quota; it sets the baseline.
 */
export function nextQuota(quota: number | null, dispatchedKg: number): number {
  if (quota === null) return roundQuota(dispatchedKg * FIRST_QUOTA_SHARE);
  return Math.max(quota, roundQuota(dispatchedKg));
}

// ---------------------------------------------------------------------------
// 31. The co-op reserve (CiK gold reserve)
// ---------------------------------------------------------------------------

/** Share of each shift's reinvestment autofill moves into the reserve. */
export const RESERVE_AUTOFILL_SHARE = 0.1;
export const RESERVE_DEPOSIT = 25;

// ---------------------------------------------------------------------------
// 32. The federation's administrator (CiK "KGB PLOT", made recoverable)
// ---------------------------------------------------------------------------

export const ADMINISTRATION_SHIFTS = 4;
/** Cool organisations that bring the administrator. */
export const ADMINISTRATION_COOL_ORGANISATIONS = 3;
/** Quotas missed in a row that bring the administrator. */
export const ADMINISTRATION_MISSED_QUOTAS = 2;

// ---------------------------------------------------------------------------
// The record's part-three marks, all set by the engine
// ---------------------------------------------------------------------------

export const GOVERNANCE_MARKS: readonly MarkId[] = [
  'crew-overruled',
  'crew-concession',
  'growers-broke-off',
  'village-broke-off',
  'federation-broke-off',
  'quota-raised',
  'quota-missed',
  'administered',
  'reserve-drawn',
  'reserve-kept',
];

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export function emptyTally(year: number, knowHowStart = 0): GovernanceState['tally'] {
  return {
    year,
    shifts: 0,
    dispatchedKg: 0,
    qualityFailureKg: 0,
    energyCost: 0,
    gradePoints: [],
    fundReinvested: 0,
    knowHowStart,
  };
}

export function createGovernance(charter: Pick<Charter, 'seed' | 'plant'> | null): GovernanceState {
  return {
    policies: { ...MIDDLE_POLICIES },
    changedShift: { maintenance: null, intake: null, stock: null, orders: null },
    streaks: { outOfAusterity: 0, runToFailure: 0, offRunToFailure: 0, stockedUp: 0 },
    crew: charter ? crewForSeed(charter.seed) : [],
    proposal: null,
    objections: [],
    conditions: charter?.plant === 'tired' ? [{ id: 'tired-machinery', sinceShift: 0 }] : [],
    countdowns: [],
    brokenOff: [],
    brief: 'conventional',
    tally: emptyTally(0),
    returns: [],
    quotaKg: null,
    missedInRow: 0,
    reserve: { balance: 0, autofill: false, drawn: 0 },
    administration: null,
    machineryRenewed: false,
  };
}
