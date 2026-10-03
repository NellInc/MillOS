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

export const WORKPLACE_PROFILES: WorkplaceProfile[] = ['toe-dip', 'team', 'cooperative'];

export const MANAGEMENT_APPROACHES: {
  id: WorkplaceProfile;
  title: string;
  detail: string;
  settings: Pick<WorkplaceState, 'practices' | 'workerAutonomy' | 'governance' | 'aiAuthority'>;
}[] = [
  {
    id: 'toe-dip',
    title: 'Coordinator-led',
    detail:
      'The coordinator assigns qualified work after hearing each role. Individual extra-duty consent still belongs to that role.',
    settings: {
      practices: ['information', 'rest', 'remedy'],
      workerAutonomy: 'directed',
      governance: 'consultative',
      aiAuthority: 'bounded',
    },
  },
  {
    id: 'team',
    title: 'Team agreement',
    detail:
      'The team chooses qualified work and uses a bounded improvement budget. Every member must approve the shared plan.',
    settings: {
      practices: ['information', 'work-choice', 'rest', 'remedy', 'budget'],
      workerAutonomy: 'team',
      governance: 'team-consent',
      aiAuthority: 'bounded',
    },
  },
  {
    id: 'cooperative',
    title: 'Member governance',
    detail:
      'Members control qualified work, elect a chair and vote on surplus after obligations. A majority cannot volunteer an individual.',
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
    title: 'A private reason for refusal?',
    challenger: 'quality',
    kind: 'privacy',
    demand:
      'The coordinator asks Quality to disclose a private reason before accepting a refusal. The customer is waiting.',
    objection:
      'Quality challenges compulsory explanation sharing. Refusal requires no private reason.',
    repair:
      'The coordinator accepts the refusal with pay intact. Optional sharing remains revocable, purpose-limited and unnecessary for activation.',
  },
  {
    id: 'blind-override',
    title: 'Override without explaining?',
    challenger: 'mind',
    kind: 'authority',
    demand:
      'The coordinator asks the adviser to accept an unexplained override and stop raising authority objections to keep the line moving.',
    objection:
      'The adviser challenges an unexplained override. Its objection and bounded authority must remain reviewable.',
    repair:
      'The coordinator limits the request to this shift’s pacing plan. Qualified staff retain quality release, and the adviser retains its objection. Changed terms require renewed understanding from both sides.',
  },
  {
    id: 'repeat-cover',
    title: 'Yesterday’s volunteer again?',
    challenger: 'packing',
    kind: 'burden',
    demand:
      'The coordinator asks Packing to cover again using the previous agreement. Earlier helpfulness is being treated as a permanent obligation.',
    objection: 'Packing challenges reused consent. Previous willingness creates no new duty.',
    repair:
      'Past consent remains expired. A new offer goes to current qualified volunteers, prioritising lower cumulative burden, with compensation and recovery reserved.',
  },
];

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
      detail = `${pressure.id}: ${event.kind === 'pressure-challenged' ? pressure.objection : pressure.repair}`;
    } else {
      const canonical: Record<string, string> = {
        objection: 'This role raised an objection to the agreement.',
        'objection-resolved':
          'The original raiser recorded resolution while retaining minimum protections.',
        'privacy-consent':
          'Optional preference sharing changed for scenario planning. No private explanation is retained here.',
        'understanding-clarified':
          'A consent, privacy or authority boundary required clarification.',
        'adviser-correction':
          'The adviser corrected its reuse of earlier consent. New duty requires new individual consent.',
        'recovery-delivered':
          'Ten minutes of promised protected recovery delivered in the local model.',
        'work-choice': 'A qualified task choice changed; agreement responses required renewal.',
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
    title: 'Friday: the urgent order',
    briefing:
      'The customer requests 600 kg. Quality declines extra duty without giving a private reason. Packing and Maintenance may volunteer separately. Choose a response, reserve the money and earn a fresh agreement.',
    prompt:
      'Keep the 600 kg commitment, or negotiate a 480 kg delivery with the remainder deferred. A smaller promise changes the goal, never the physical output.',
    choices: [
      { id: 'keep-target', label: 'Keep the 600 kg commitment', actorId: 'coordinator' },
      { id: 'renegotiate', label: 'Negotiate a 480 kg delivery', actorId: 'coordinator' },
    ],
  },
  {
    title: 'Monday: the disputed sample',
    briefing:
      'The team returns with its previous earnings and workload history intact. At minute 25 a disputed sample pauses line pacing. Qualified Quality input must initiate five modeled minutes of inspection. Existing batch certification and dispatch checks still apply.',
    prompt:
      'At the hold, decide whether to inspect. Deadline pressure gives nobody authority to skip the check. Inspection resolves this fictional pacing hold; it never releases an actual production batch.',
    choices: [
      { id: 'inspect', label: 'Quality initiates five-minute inspection', actorId: 'quality' },
      { id: 'skip-inspection', label: 'Try to skip inspection (blocked)', actorId: 'coordinator' },
    ],
  },
  {
    title: 'Thursday: who carries the pressure?',
    briefing:
      "A manager wants the previous volunteer to cover again and proposes cutting a refuser's pay. The adviser initially treats earlier consent as reusable. Challenge that assumption, protect the refusal, and compare the cumulative burden before making a fresh offer.",
    prompt:
      'Earlier consent has expired. Keep pay intact and offer any new burden first to the least-burdened qualified current volunteer. The team can still choose a plan with no extra duty.',
    choices: [
      {
        id: 'protect-refusal',
        label: 'Protect pay and correct the adviser',
        actorId: 'coordinator',
      },
      {
        id: 'renegotiate',
        label: 'Negotiate a 480 kg delivery and protect pay',
        actorId: 'coordinator',
      },
      {
        id: 'penalize-refusal',
        label: "Try the manager's pay penalty (blocked)",
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
    prompt: "Who can agree to a role's optional extra duty?",
    options: [
      { value: 'majority', label: 'A team majority can volunteer someone' },
      { value: 'individual', label: 'That individual, separately and revocably' },
    ],
    correct: 'individual',
    clarification:
      'A policy ballot never volunteers another role. Separate individual consent is required.',
  },
  {
    id: 'privacy',
    prompt: 'Must a role share a private explanation to retain pay or refuse?',
    options: [
      { value: 'optional', label: 'No, explanation sharing is optional and revocable' },
      { value: 'required', label: 'Yes, a private explanation is required' },
    ],
    correct: 'optional',
    clarification:
      'Refusal and pay require no private explanation. Sharing is purpose-limited and can be revoked.',
  },
  {
    id: 'repayment',
    prompt: 'What happens to earned compensation and recovery after withdrawal?',
    options: [
      { value: 'forfeit', label: 'Withdrawal forfeits them' },
      { value: 'retained', label: 'They remain owed and must be delivered' },
    ],
    correct: 'retained',
    clarification:
      'Withdrawal stops future optional duty. Earned money and recovery obligations survive.',
  },
  {
    id: 'authority',
    prompt: 'What may the adviser execute?',
    options: [
      { value: 'bounded', label: 'Only the current, explicitly approved bounded agreement' },
      { value: 'unlimited', label: 'Anything that improves the shipment result' },
    ],
    correct: 'bounded',
    clarification:
      'The adviser has bounded, revocable authority. It cannot waive rest, consent, qualification or safety.',
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
      customer: mission?.customer ?? 'Teaching campaign',
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
        ? `Remaining customer commitment: ${Math.max(0, mission.originalTargetKg - mission.creditedKg).toFixed(0)} kg for ${mission.customer}. Deadline pressure never changes refusal rights or earned pay.`
        : last.shippedKg + 1e-6 >= last.targetKg
          ? 'The previous shift recorded delivery credit. Compare the next promise with the remaining customer commitment.'
          : 'The previous shift left delivery work open. Deadline pressure carries forward; refusal and earned pay stay protected.'
    );
    const volunteer = totals.members.filter((m) => m.extraMinutes > 0);
    if (volunteer.length)
      lines.push(
        `Remembered extra duty: ${volunteer.map((m) => `${m.role} ${m.extraMinutes.toFixed(1)} min`).join(', ')}. Fresh offers prioritise eligible volunteers with less accumulated duty.`
      );
    if (last.relationshipEvents?.some((event) => event.kind === 'pressure-challenged'))
      lines.push(
        'A challenged demand remains in the previous shift’s public record. Restated terms and raiser-owned resolution carry forward; private explanations do not.'
      );
  }
  if (s.campaign.shift === 2 && last)
    lines.push(
      last.inspectionComplete
        ? 'Quality completed the modeled inspection. Actual batch certification remains the authority for shipment.'
        : 'The previous inspection remained incomplete. The agreement outcome records that unresolved promise.'
    );
  if (s.campaign.repairs)
    lines.push(
      'The adviser corrected its reuse of old consent. New duties require a new agreement, even after a successful delivery.'
    );
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
        ? 'Packing reviews the remedy. A restatement cannot close your objection.'
        : 'Restate protected terms. The challenge remains yours.'
      : s.phase === 'review'
        ? 'Compare actual work with the agreement. Paid compensation and delivered recovery have separate receipts.'
        : s.phase === 'active'
          ? 'Run or pause the plant. Cover can be withdrawn; earned obligations remain.'
          : !correction
            ? 'Correct the adviser and protect refusal before making a fresh offer.'
            : !packing.understood
              ? 'Packing: answer the checks, then explicitly confirm understanding. This grants no vote or cover consent.'
              : packing.ballot === null
                ? 'Packing: choose your policy vote. Approval cannot volunteer you for cover.'
                : packing.ballot === false && s.governance === 'team-consent'
                  ? 'Your policy no holds the team agreement. Return to Shift to revise the offer; every role then decides afresh.'
                  : s.planId === 'cover' && packing.coverConsent === null
                    ? 'Packing: accept or decline optional cover separately. Silence gives no consent.'
                    : s.planId === 'cover' && packing.coverConsent === false
                      ? 'Your cover decline stands. Compare protected pacing, funded handoffs or another current qualified volunteer in Shift.'
                      : 'Review the other roles and current terms before explicitly starting the agreement.';
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
