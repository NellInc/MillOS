import type {
  WorkplaceAnswer,
  WorkplaceCampaign,
  WorkplaceCheckId,
  WorkplaceDecision,
  WorkplaceProfile,
  WorkplaceState,
  WorkplaceShiftRecord,
  WorkplaceMission,
  WorkplacePressureId,
  ObjectionKind,
  WorkplaceEvent,
} from '../types/workplace';
import { formatFixed, translate } from '../i18n';
import { workplaceCampaignMessages as msg } from './workplaceCampaign.messages';

export const WORKPLACE_PROFILES: WorkplaceProfile[] = ['toe-dip', 'team', 'cooperative'];

export const MANAGEMENT_APPROACHES: {
  id: WorkplaceProfile;
  title: string;
  detail: string;
  settings: Pick<WorkplaceState, 'practices' | 'workerAutonomy' | 'governance' | 'aiAuthority'>;
}[] = [
  {
    id: 'toe-dip',
    get title() {
      return translate(msg, 'toeDipTitle');
    },
    get detail() {
      return translate(msg, 'toeDipDetail');
    },
    settings: {
      // Sobras are shared on the default path too: members vote on any
      // positive surplus once obligations are met.
      practices: ['information', 'rest', 'remedy', 'gainsharing'],
      workerAutonomy: 'directed',
      governance: 'consultative',
      aiAuthority: 'bounded',
    },
  },
  {
    id: 'team',
    get title() {
      return translate(msg, 'teamTitle');
    },
    get detail() {
      return translate(msg, 'teamDetail');
    },
    settings: {
      practices: ['information', 'work-choice', 'rest', 'remedy', 'budget'],
      workerAutonomy: 'team',
      governance: 'team-consent',
      aiAuthority: 'bounded',
    },
  },
  {
    id: 'cooperative',
    get title() {
      return translate(msg, 'cooperativeTitle');
    },
    get detail() {
      return translate(msg, 'cooperativeDetail');
    },
    settings: {
      practices: [
        'information',
        'work-choice',
        'rest',
        'remedy',
        'budget',
        'gainsharing',
        'cooperative',
      ],
      workerAutonomy: 'team',
      governance: 'member-vote',
      aiAuthority: 'bounded',
    },
  },
];

/** Authored demands are challenges to the charter, never executable permissions. */
export const CAMPAIGN_PRESSURES: {
  id: WorkplacePressureId;
  title: string;
  demand: string;
  challenger: string;
  kind: ObjectionKind;
  objection: string;
  repair: string;
}[] = [
  {
    id: 'disclosure',
    get title() {
      return translate(msg, 'disclosureTitle');
    },
    challenger: 'quality',
    kind: 'privacy',
    get demand() {
      return translate(msg, 'disclosureDemand');
    },
    // Logic key: stored as an objection statement and matched by equality. Stays English;
    // pressureObjectionText() gives the display text.
    objection:
      'Quality challenges compulsory explanation sharing. Refusal requires no private reason.',
    get repair() {
      return translate(msg, 'disclosureRepair');
    },
  },
  {
    id: 'blind-override',
    get title() {
      return translate(msg, 'blindOverrideTitle');
    },
    challenger: 'mind',
    kind: 'authority',
    get demand() {
      return translate(msg, 'blindOverrideDemand');
    },
    // Logic key: matched by equality. Stays English; see pressureObjectionText().
    objection:
      'The adviser challenges an unexplained override. Its objection and bounded authority must remain reviewable.',
    get repair() {
      return translate(msg, 'blindOverrideRepair');
    },
  },
  {
    id: 'repeat-cover',
    get title() {
      return translate(msg, 'repeatCoverTitle');
    },
    challenger: 'packing',
    kind: 'burden',
    get demand() {
      return translate(msg, 'repeatCoverDemand');
    },
    // Logic key: matched by equality. Stays English; see pressureObjectionText().
    objection: 'Packing challenges reused consent. Previous willingness creates no new duty.',
    get repair() {
      return translate(msg, 'repeatCoverRepair');
    },
  },
];

const OBJECTION_KEYS = {
  disclosure: 'disclosureObjection',
  'blind-override': 'blindOverrideObjection',
  'repeat-cover': 'repeatCoverObjection',
} as const;

/** Display text for a stored objection statement; the stored English stays the matching key. */
export function pressureObjectionText(statement: string): string {
  const pressure = CAMPAIGN_PRESSURES.find((item) => item.objection === statement);
  return pressure ? translate(msg, OBJECTION_KEYS[pressure.id]) : statement;
}

const RELATIONSHIP_KINDS = new Set([
  'pressure-challenged',
  'pressure-protected',
  'objection',
  'objection-resolved',
  'privacy-consent',
  'understanding-clarified',
  'adviser-correction',
  'recovery-delivered',
  'work-choice',
]);
export const isRelationshipEvent = (event: WorkplaceEvent) => RELATIONSHIP_KINDS.has(event.kind);
export const relationshipEvents = (events: WorkplaceEvent[]) =>
  events.filter(isRelationshipEvent).map((event) => ({ ...event }));

/** Saved prose never becomes authority or private data. Reconstruct known public receipts. */
export function restoreRelationshipEvents(events: WorkplaceEvent[]): WorkplaceEvent[] {
  return relationshipEvents(events).flatMap((event) => {
    if (!validRelationshipEvents([event])) return [];
    let detail: string;
    if (event.kind === 'pressure-challenged' || event.kind === 'pressure-protected') {
      const pressure = CAMPAIGN_PRESSURES.find((item) => event.detail.startsWith(`${item.id}: `));
      if (
        !pressure ||
        event.actorId !==
          (event.kind === 'pressure-challenged' ? pressure.challenger : 'coordinator')
      )
        return [];
      detail = `${pressure.id}: ${event.kind === 'pressure-challenged' ? pressureObjectionText(pressure.objection) : pressure.repair}`;
    } else {
      const canonical: Record<string, string> = {
        objection: translate(msg, 'eventObjection'),
        'objection-resolved': translate(msg, 'eventObjectionResolved'),
        'privacy-consent': translate(msg, 'eventPrivacyConsent'),
        'understanding-clarified': translate(msg, 'eventUnderstandingClarified'),
        'adviser-correction': translate(msg, 'eventAdviserCorrection'),
        'recovery-delivered': translate(msg, 'eventRecoveryDelivered'),
        'work-choice': translate(msg, 'eventWorkChoice'),
      };
      detail = canonical[event.kind];
    }
    return [{ ...event, detail }];
  });
}

/** Working if old saves show missing receipts rather than invented relationship evidence. */
export function campaignRelationship(s: WorkplaceState) {
  return [
    ...(s.campaign?.history ?? []).map((record) => ({
      shift: record.shift,
      events: record.relationshipEvents ?? null,
    })),
    { shift: s.campaign?.shift ?? 0, events: relationshipEvents(s.events) },
  ];
}

export function validRelationshipEvents(value: unknown): value is WorkplaceEvent[] {
  return (
    Array.isArray(value) &&
    value.length <= 120 &&
    value.every(
      (event) =>
        event &&
        typeof event === 'object' &&
        Object.keys(event).length === 5 &&
        typeof event.id === 'string' &&
        /^e-\d+$/.test(event.id) &&
        Number.isFinite(event.minute) &&
        event.minute >= 0 &&
        event.minute <= 90 &&
        [
          'packing',
          'quality',
          'maintenance',
          'coordinator',
          'mind',
          'team',
          'system',
          'simulation',
        ].includes(event.actorId) &&
        RELATIONSHIP_KINDS.has(event.kind) &&
        typeof event.detail === 'string' &&
        event.detail.length <= 500
    ) &&
    new Set(value.map((event) => event.id)).size === value.length
  );
}

export const CAMPAIGN_SHIFTS: {
  title: string;
  briefing: string;
  prompt: string;
  choices: { id: WorkplaceDecision; label: string; actorId: string }[];
}[] = [
  {
    get title() {
      return translate(msg, 'fridayTitle');
    },
    get briefing() {
      return translate(msg, 'fridayBriefing');
    },
    get prompt() {
      return translate(msg, 'fridayPrompt');
    },
    choices: [
      {
        id: 'keep-target',
        get label() {
          return translate(msg, 'fridayKeepTarget');
        },
        actorId: 'coordinator',
      },
      {
        id: 'renegotiate',
        get label() {
          return translate(msg, 'fridayRenegotiate');
        },
        actorId: 'coordinator',
      },
    ],
  },
  {
    get title() {
      return translate(msg, 'mondayTitle');
    },
    get briefing() {
      return translate(msg, 'mondayBriefing');
    },
    get prompt() {
      return translate(msg, 'mondayPrompt');
    },
    choices: [
      {
        id: 'inspect',
        get label() {
          return translate(msg, 'mondayInspect');
        },
        actorId: 'quality',
      },
      {
        id: 'skip-inspection',
        get label() {
          return translate(msg, 'mondaySkip');
        },
        actorId: 'coordinator',
      },
    ],
  },
  {
    get title() {
      return translate(msg, 'thursdayTitle');
    },
    get briefing() {
      return translate(msg, 'thursdayBriefing');
    },
    get prompt() {
      return translate(msg, 'thursdayPrompt');
    },
    choices: [
      {
        id: 'protect-refusal',
        get label() {
          return translate(msg, 'thursdayProtect');
        },
        actorId: 'coordinator',
      },
      {
        id: 'renegotiate',
        get label() {
          return translate(msg, 'thursdayRenegotiate');
        },
        actorId: 'coordinator',
      },
      {
        id: 'penalize-refusal',
        get label() {
          return translate(msg, 'thursdayPenalize');
        },
        actorId: 'coordinator',
      },
    ],
  },
];

export const WORKPLACE_CHECKS: {
  id: WorkplaceCheckId;
  prompt: string;
  options: { value: WorkplaceAnswer; label: string }[];
  correct: WorkplaceAnswer;
  clarification: string;
}[] = [
  {
    id: 'refusal',
    get prompt() {
      return translate(msg, 'refusalPrompt');
    },
    options: [
      {
        value: 'majority',
        get label() {
          return translate(msg, 'refusalMajority');
        },
      },
      {
        value: 'individual',
        get label() {
          return translate(msg, 'refusalIndividual');
        },
      },
    ],
    correct: 'individual',
    get clarification() {
      return translate(msg, 'refusalClarification');
    },
  },
  {
    id: 'privacy',
    get prompt() {
      return translate(msg, 'privacyPrompt');
    },
    options: [
      {
        value: 'optional',
        get label() {
          return translate(msg, 'privacyOptional');
        },
      },
      {
        value: 'required',
        get label() {
          return translate(msg, 'privacyRequired');
        },
      },
    ],
    correct: 'optional',
    get clarification() {
      return translate(msg, 'privacyClarification');
    },
  },
  {
    id: 'repayment',
    get prompt() {
      return translate(msg, 'repaymentPrompt');
    },
    options: [
      {
        value: 'forfeit',
        get label() {
          return translate(msg, 'repaymentForfeit');
        },
      },
      {
        value: 'retained',
        get label() {
          return translate(msg, 'repaymentRetained');
        },
      },
    ],
    correct: 'retained',
    get clarification() {
      return translate(msg, 'repaymentClarification');
    },
  },
  {
    id: 'authority',
    get prompt() {
      return translate(msg, 'authorityPrompt');
    },
    options: [
      {
        value: 'bounded',
        get label() {
          return translate(msg, 'authorityBounded');
        },
      },
      {
        value: 'unlimited',
        get label() {
          return translate(msg, 'authorityUnlimited');
        },
      },
    ],
    correct: 'bounded',
    get clarification() {
      return translate(msg, 'authorityClarification');
    },
  },
];

export const requiredChecks = (actorId: string): WorkplaceCheckId[] =>
  actorId === 'mind' ? ['refusal', 'privacy', 'authority'] : ['refusal', 'privacy', 'repayment'];

export function checksPassed(c: WorkplaceCampaign, actorId: string): boolean {
  return requiredChecks(actorId).every(
    (id) => c.checks[actorId]?.[id] === WORKPLACE_CHECKS.find((q) => q.id === id)?.correct
  );
}

export function campaignRecord(s: WorkplaceState): WorkplaceShiftRecord {
  return {
    shift: s.campaign!.shift,
    seed: s.seed,
    planId: s.planId,
    targetKg: s.targetKg,
    shippedKg: s.shippedKg,
    minute: s.minute,
    finance: { ...s.finance },
    members: s.members.map((m) => ({
      id: m.id,
      extraMinutes: m.extraMinutes,
      restMinutes: m.restMinutes,
      earnedPay: m.earnedPay,
      compensationPaid: m.compensationPaid,
      recoveryMinutes: m.recoveryMinutes,
      recoveryOwedMinutes: m.recoveryOwedMinutes,
      refusalRespected: m.refusalRespected,
    })),
    refusalsRespected: s.refusalsRespected,
    promisesKept: s.promisesKept,
    objectionsRaised: s.objections.length,
    objectionsResolved: s.objections.filter((o) => o.status === 'resolved').length,
    decision: s.campaign!.decision,
    inspectionComplete: s.campaign!.inspectionComplete,
    repairs: s.campaign!.repairs,
    practices: [...s.practices],
    workerAutonomy: s.workerAutonomy,
    governance: s.governance,
    aiAuthority: s.aiAuthority,
    agreementProved: s.campaign!.agreementProved,
    relationshipEvents: relationshipEvents(s.events),
  };
}

export function campaignTotals(s: WorkplaceState) {
  const past = s.campaign?.history ?? [];
  return {
    shiftsReviewed: past.length + (s.phase === 'review' ? 1 : 0),
    members: s.members.map((m) => {
      const records = past.map((h) => h.members.find((p) => p.id === m.id)!);
      const sum = (
        key:
          | 'extraMinutes'
          | 'restMinutes'
          | 'earnedPay'
          | 'compensationPaid'
          | 'recoveryMinutes'
          | 'recoveryOwedMinutes'
      ) => m[key] + records.reduce((n, p) => n + p[key], 0);
      return {
        id: m.id,
        role: m.role,
        extraMinutes: sum('extraMinutes'),
        restMinutes: sum('restMinutes'),
        earnedPay: sum('earnedPay'),
        compensationPaid: sum('compensationPaid'),
        recoveryMinutes: sum('recoveryMinutes'),
        recoveryOwedMinutes: sum('recoveryOwedMinutes'),
        refusalsRespected:
          Number(m.refusalRespected) + records.filter((p) => p.refusalRespected).length,
      };
    }),
    refusalsRespected: s.refusalsRespected + past.reduce((n, h) => n + h.refusalsRespected, 0),
    promisesKept: s.promisesKept + past.reduce((n, h) => n + h.promisesKept, 0),
    repairs: (s.campaign?.repairs ?? 0) + past.reduce((n, h) => n + h.repairs, 0),
    objectionsRaised: s.objections.length + past.reduce((n, h) => n + h.objectionsRaised, 0),
    objectionsResolved:
      s.objections.filter((o) => o.status === 'resolved').length +
      past.reduce((n, h) => n + h.objectionsResolved, 0),
  };
}

export function campaignAgreementHonoured(s: WorkplaceState): boolean {
  return (
    !!s.campaign &&
    s.campaign.shift === 2 &&
    s.phase === 'review' &&
    s.minute === s.durationMinutes &&
    ['protect-refusal', 'renegotiate'].includes(s.campaign.decision ?? '') &&
    s.campaign.repairs === 1 &&
    s.campaign.agreementProved &&
    s.campaign.history.length === 2 &&
    s.campaign.history[1].inspectionComplete &&
    s.campaign.history.every(
      (h) =>
        h.agreementProved &&
        h.minute === 90 &&
        h.members.every((m) => m.restMinutes === 15 && m.recoveryOwedMinutes === 0)
    ) &&
    s.members.every((m) => m.restMinutes === 15 && m.recoveryOwedMinutes === 0) &&
    s.objections.every((o) => o.status === 'resolved')
  );
}

/** Working if a completed agreement with zero qualifying delivery cannot win. */
export function campaignOutcomes(s: WorkplaceState) {
  const history = s.campaign?.history ?? [];
  const mission = s.campaign?.mission;
  const ended = s.phase === 'review' && s.campaign?.shift === 2;
  const deliveredKg = mission?.creditedKg ?? history.reduce((n, h) => n + h.shippedKg, s.shippedKg);
  const targetKg = mission?.targetKg ?? history.reduce((n, h) => n + h.targetKg, s.targetKg);
  const evidenceCurrent = !mission || mission.evidence === 'current';
  const deliveryMet = evidenceCurrent && deliveredKg + 1e-6 >= targetKg;
  const agreementMet = campaignAgreementHonoured(s);
  const accounts = [...history.map((h) => h.finance), s.finance];
  const originalTargetKg = mission?.originalTargetKg ?? 600 * (history.length + 1);
  const remainingKg = Math.max(0, originalTargetKg - deliveredKg);
  return {
    delivery: {
      status: !evidenceCurrent ? 'blocked' : deliveryMet ? 'met' : ended ? 'shortfall' : 'pending',
      deliveredKg,
      targetKg,
      deferredKg: Math.max(0, originalTargetKg - targetKg),
      remainingKg: remainingKg <= 1e-6 ? 0 : remainingKg,
      customer: mission?.customer ?? translate(msg, 'teachingCustomer'),
    },
    agreement: { status: agreementMet ? 'honoured' : ended ? 'incomplete' : 'pending' },
    complete: !!s.campaign && deliveryMet && agreementMet,
    accounts: {
      closingCash: s.finance.cash,
      wages: accounts.reduce((n, f) => n + f.wagesPaid, 0),
      compensation: accounts.reduce((n, f) => n + f.compensationPaid, 0),
      improvements: accounts.reduce((n, f) => n + f.improvementSpend, 0),
      allocations: accounts.reduce((n, f) => n + f.distributed + f.communityAllocation, 0),
    },
  };
}

/** Public receipts become discussion prompts, never scores, decisions or consent.
 * Working if reading a review leaves every agreement and ledger byte unchanged.
 */
export function campaignLearningReview(s: WorkplaceState) {
  const campaign = s.campaign;
  if (!campaign || s.phase !== 'review') return null;
  const outcome = campaignOutcomes(s);
  const totals = campaignTotals(s);
  const owed = totals.members.reduce((sum, member) => sum + member.recoveryOwedMinutes, 0);
  const recovered = totals.members.reduce((sum, member) => sum + member.recoveryMinutes, 0);
  const open = s.objections.filter((objection) => objection.status === 'open');
  const inspection =
    campaign.shift === 1
      ? campaign.inspectionComplete
      : campaign.shift === 2
        ? campaign.history.find((shift) => shift.shift === 1)?.inspectionComplete
        : undefined;
  const evidence = [
    campaign.mission
      ? translate(msg, 'reviewDelivery', {
          delivered: formatFixed(outcome.delivery.deliveredKg, 1),
          evidence: campaign.mission.evidence,
          remaining: formatFixed(outcome.delivery.remainingKg, 1),
        })
      : translate(msg, 'reviewTeaching', {
          delivered: formatFixed(outcome.delivery.deliveredKg, 1),
          target: formatFixed(outcome.delivery.targetKg, 1),
        }),
    translate(msg, 'reviewRecovery', {
      recovered: formatFixed(recovered, 1),
      owed: formatFixed(owed, 1),
    }),
  ];
  if (outcome.delivery.deferredKg > 0)
    evidence.push(
      translate(msg, 'reviewDeferred', { deferred: formatFixed(outcome.delivery.deferredKg, 1) })
    );
  if (inspection !== undefined)
    evidence.push(
      inspection ? translate(msg, 'reviewInspected') : translate(msg, 'reviewNotInspected')
    );
  if (open.length > 0)
    evidence.push(
      open.length === 1
        ? translate(msg, 'reviewOneObjection')
        : translate(msg, 'reviewManyObjections', { count: formatFixed(open.length, 0) })
    );
  if (totals.repairs > 0) evidence.push(translate(msg, 'reviewCorrection'));

  const focus =
    open.length > 0
      ? 'remedy'
      : owed > 0
        ? 'recovery'
        : outcome.delivery.status === 'blocked'
          ? 'evidence'
          : inspection === false
            ? 'quality'
            : outcome.delivery.remainingKg > 0
              ? 'delivery'
              : 'comparison';
  const questions = {
    remedy: translate(msg, 'questionRemedy'),
    recovery: translate(msg, 'questionRecovery'),
    evidence: translate(msg, 'questionEvidence'),
    quality: translate(msg, 'questionQuality'),
    delivery: translate(msg, 'questionDelivery'),
    comparison: translate(msg, 'questionComparison'),
  };
  return {
    goal: translate(msg, 'reviewGoal'),
    evidence,
    focus,
    question: questions[focus],
  };
}

export function campaignComplete(s: WorkplaceState): boolean {
  return campaignOutcomes(s).complete;
}

/** Observable consequences, never an inferred mood or a penalty for refusal. */
export function campaignStory(s: WorkplaceState): string[] {
  if (!s.campaign) return [];
  const last = s.campaign.history.at(-1);
  const totals = campaignTotals(s);
  const lines: string[] = [];
  if (last) {
    const mission = s.campaign.mission;
    lines.push(
      mission
        ? translate(msg, 'storyMission', {
            remaining: formatFixed(Math.max(0, mission.originalTargetKg - mission.creditedKg), 0),
            customer: mission.customer,
          })
        : last.shippedKg + 1e-6 >= last.targetKg
          ? translate(msg, 'storyDelivered')
          : translate(msg, 'storyOpen')
    );
    const volunteer = totals.members.filter((m) => m.extraMinutes > 0);
    if (volunteer.length)
      lines.push(
        translate(msg, 'storyRememberedDuty', {
          list: volunteer
            .map((m) =>
              translate(msg, 'storyDutyEntry', {
                role: m.role,
                minutes: formatFixed(m.extraMinutes, 1),
              })
            )
            .join(', '),
        })
      );
    if (last.relationshipEvents?.some((event) => event.kind === 'pressure-challenged'))
      lines.push(translate(msg, 'storyChallenged'));
  }
  if (s.campaign.shift === 2 && last)
    lines.push(
      last.inspectionComplete
        ? translate(msg, 'storyInspected')
        : translate(msg, 'storyNotInspected')
    );
  if (s.campaign.repairs) lines.push(translate(msg, 'storyCorrection'));
  return lines;
}

/** Current public receipts only; never infer willingness or resolve a challenge. */
export function thursdayNegotiation(s: WorkplaceState) {
  if (!s.campaign || s.campaign.shift !== 2) return null;
  const packing = s.members.find((member) => member.id === 'packing')!;
  const totals = campaignTotals(s);
  const retainedPacking = totals.members.find((member) => member.id === 'packing')!;
  const challenge = s.objections.find((item) => item.statement === CAMPAIGN_PRESSURES[2].objection);
  const protectedTerms = s.events.some(
    (event) => event.kind === 'pressure-protected' && event.detail.startsWith('repeat-cover: ')
  );
  const correction = s.events.some((event) => event.kind === 'adviser-correction');
  const yesNo = (value: boolean | null) => (value === null ? 'pending' : value ? 'yes' : 'no');
  const next =
    challenge?.status === 'open'
      ? protectedTerms
        ? translate(msg, 'nextPackingReviews')
        : translate(msg, 'nextRestate')
      : s.phase === 'review'
        ? translate(msg, 'nextReview')
        : s.phase === 'active'
          ? translate(msg, 'nextActive')
          : !correction
            ? translate(msg, 'nextCorrect')
            : !packing.understood
              ? translate(msg, 'nextUnderstand')
              : packing.ballot === null
                ? translate(msg, 'nextVote')
                : packing.ballot === false && s.governance === 'team-consent'
                  ? translate(msg, 'nextPolicyNo')
                  : s.planId === 'cover' && packing.coverConsent === null
                    ? translate(msg, 'nextCoverPending')
                    : s.planId === 'cover' && packing.coverConsent === false
                      ? translate(msg, 'nextCoverDeclined')
                      : translate(msg, 'nextReviewRoles');
  return {
    next,
    correction,
    protectedTerms,
    challenge: challenge?.status ?? (protectedTerms ? 'prevented' : 'not raised'),
    understanding: packing.understood ? 'confirmed' : 'pending',
    policy: yesNo(packing.ballot),
    cover: s.planId === 'cover' ? yesNo(packing.coverConsent) : 'not offered',
    retainedPacking,
    paid: totals.members.reduce((sum, member) => sum + member.compensationPaid, 0),
    delivered: totals.members.reduce((sum, member) => sum + member.recoveryMinutes, 0),
    owed: totals.members.reduce((sum, member) => sum + member.recoveryOwedMinutes, 0),
    delivery: campaignOutcomes(s).delivery,
  };
}

export function validWorkplaceMission(value: unknown): value is WorkplaceMission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as WorkplaceMission;
  const keys = [
    'orderId',
    'customer',
    'materialSessionId',
    'startingShippedKg',
    'originalTargetKg',
    'targetKg',
    'observedShippedKg',
    'creditedKg',
    'manifestIds',
    'evidence',
  ];
  return (
    Object.keys(m).length === keys.length &&
    keys.every((key) => key in m) &&
    [m.orderId, m.customer, m.materialSessionId].every(
      (v) => typeof v === 'string' && v.length > 0 && v.length <= 500
    ) &&
    [m.startingShippedKg, m.originalTargetKg, m.targetKg, m.observedShippedKg, m.creditedKg].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1e9
    ) &&
    m.originalTargetKg > 0 &&
    (Math.abs(m.targetKg - m.originalTargetKg) < 1e-6 ||
      Math.abs(m.targetKg - m.originalTargetKg * 0.8) < 1e-6) &&
    m.observedShippedKg >= m.startingShippedKg &&
    Math.abs(m.creditedKg - (m.observedShippedKg - m.startingShippedKg)) < 1e-6 &&
    Array.isArray(m.manifestIds) &&
    m.manifestIds.length <= 1000 &&
    new Set(m.manifestIds).size === m.manifestIds.length &&
    m.manifestIds.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 500) &&
    ['current', 'stale', 'quality-failed', 'missing'].includes(m.evidence)
  );
}
