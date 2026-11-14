import type {
  WorkplaceAnswer,
  WorkplaceCampaign,
  WorkplaceCheckId,
  WorkplaceDecision,
  WorkplaceFinance,
  WorkplaceProfile,
  WorkplaceSeasonDraw,
  WorkplaceSobras,
  WorkplaceState,
  WorkplaceShiftRecord,
  WorkplaceMission,
  WorkplacePressureId,
  ObjectionKind,
  SurplusDestination,
  WorkplaceEvent,
  WorkplaceMondaySample,
} from '../types/workplace';
import { LOCALES, formatFixed, formatGrouped, translate } from '../i18n';
import { workplaceCampaignMessages as msg } from './workplaceCampaign.messages';
import { bilateralWorkplaceMessages } from './bilateralWorkplace.messages';
// Call-time only: bilateralWorkplace imports this module too.
import { coverConsentDecides } from './bilateralWorkplace';
import { customerDisplayName } from '../stores/customerNames';

/** English review-reason sentinels a campaign shift's pausing settle stores. */
export const RELOAD_PAUSE_DETAIL = bilateralWorkplaceMessages.en.evReloadSafety;
export const SAFETY_PAUSE_DETAIL = bilateralWorkplaceMessages.en.settleEmergencyPaused;
export const OBJECTION_PAUSE_DETAIL = bilateralWorkplaceMessages.en.settleObjectionPaused;

/**
 * What paused an unfinished campaign shift, or null if it ended. A reload, an
 * E-stop or drill, and an objection raised mid-shift pause it; a stop the
 * player chose or a changed mission ends it. So does sharing its sobras: a
 * paused shift refuses that, but an older save may hold one shared while
 * paused, and the wages of its resumed minutes would leave the share above the
 * surplus that restore accepts.
 */
export function campaignShiftPause(s: WorkplaceState): 'reload' | 'safety' | 'objection' | null {
  if (
    s.mode !== 'game' ||
    !s.campaign ||
    s.improvement ||
    s.phase !== 'review' ||
    s.minute >= s.durationMinutes ||
    s.distributionComplete
  )
    return null;
  return s.reviewReason === RELOAD_PAUSE_DETAIL
    ? 'reload'
    : s.reviewReason === SAFETY_PAUSE_DETAIL
      ? 'safety'
      : s.reviewReason === OBJECTION_PAUSE_DETAIL
        ? 'objection'
        : null;
}

/**
 * A campaign shift that a reload, an emergency stop or drill, or an objection
 * paused before its end can resume: none of them ends the work, so voice and
 * safety never cost the season its agreement. An objection's pause resumes
 * once its raiser has resolved it. A stop or a changed mission stands.
 * Each pause stores its English sentinel as reviewReason, and restore keeps
 * exactly those sentinels (any other reason is replaced with canonical text;
 * a live save holding the older emergency or objection sentence becomes its
 * sentinel). A deliberation reloaded before approval resumes too, and so does a
 * shift approved while the plant was paused and reloaded before its first
 * minute: nothing was worked or paid, re-approval reads its purchase against
 * improvementSpend (bought once) and counts the bounded adviser action only if
 * none was counted this shift.
 * Working if a reload mid-shift, before approval, or between approval and the
 * first minute, a drill, or a resolved objection no longer costs the season
 * its agreement.
 *
 * A handoff deliberation a reload interrupted resumes the same way: it is at
 * minute 0, unfunded and never activated, so resuming buys nothing twice and
 * records no cycle. Restore keeps only relationship events, so activation is
 * read from its bounded AI action (each handoff shift starts at zero); where
 * activation takes none, a minute-0 steady shift bought nothing to repeat.
 * Working if a reloaded second handoff shift deliberates again instead of
 * costing one of MAX_IMPROVEMENT_CYCLES.
 */
export function shiftResumable(s: WorkplaceState): boolean {
  const i = s.improvement;
  if (i)
    return (
      s.mode !== 'pilot' &&
      s.phase === 'review' &&
      s.reviewReason === RELOAD_PAUSE_DETAIL &&
      s.minute === 0 &&
      !i.funded &&
      !i.verdict &&
      s.aiActions === 0
    );
  const pause = campaignShiftPause(s);
  return (
    pause !== null && (pause !== 'objection' || s.objections.every((o) => o.status !== 'open'))
  );
}

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

/**
 * 5.10: what a season's seed draws. The order the three pressures arrive in,
 * which authored cover-qualified member will not cover this season (the
 * other covers until it has covered ten season minutes), and the minute of
 * Monday's disputed sample. A season begun before draws existed keeps the
 * fixed order it was saved with. All chance is a hash of the seed; nothing is
 * rolled. Working if two seasons from two seeds differ and a reload keeps the draw.
 */
export const LEGACY_SEASON_DRAW: Readonly<WorkplaceSeasonDraw> = Object.freeze({
  pressures: ['disclosure', 'blind-override', 'repeat-cover'] as WorkplacePressureId[],
  decliner: 'coordinator' as const,
  mondayMinute: 25,
});
const MONDAY_EARLIEST = 20;
const MONDAY_LATEST = 40;
/** An integer hash of a seed and a salt (a fixed avalanche mix). */
function seedHash(seed: number, salt: number): number {
  let x = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
export function seasonDraw(seed: number): WorkplaceSeasonDraw {
  const pressures = [...LEGACY_SEASON_DRAW.pressures];
  for (let i = pressures.length - 1; i > 0; i--) {
    const j = seedHash(seed, 11 + i) % (i + 1);
    [pressures[i], pressures[j]] = [pressures[j], pressures[i]];
  }
  // "Yesterday's volunteer again?" needs a yesterday: never the first shift.
  if (pressures[0] === 'repeat-cover') [pressures[0], pressures[1]] = [pressures[1], pressures[0]];
  return {
    pressures,
    decliner: seedHash(seed, 101) % 2 === 0 ? 'coordinator' : 'maintenance',
    mondayMinute: MONDAY_EARLIEST + (seedHash(seed, 202) % (MONDAY_LATEST - MONDAY_EARLIEST + 1)),
  };
}
/** The draw a season runs on: its own, or the fixed one a pre-draw save keeps. */
export const campaignDraw = (c: WorkplaceCampaign | null | undefined): WorkplaceSeasonDraw =>
  c?.draw ?? LEGACY_SEASON_DRAW;
/** Exactly the draw this season's first seed gives, so a save cannot pick its own. */
export function validSeasonDraw(value: unknown, seasonSeed: number): value is WorkplaceSeasonDraw {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(value) === JSON.stringify(seasonDraw(seasonSeed))
  );
}
/** The pressure the current shift of a season meets. */
export function campaignPressure(s: WorkplaceState) {
  if (!s.campaign) return undefined;
  const id = campaignDraw(s.campaign).pressures[s.campaign.shift];
  return CAMPAIGN_PRESSURES.find((item) => item.id === id);
}
/** The minute Monday's disputed sample holds the line. */
export const mondayMinute = (s: Pick<WorkplaceState, 'campaign'>) =>
  campaignDraw(s.campaign).mondayMinute;

/**
 * 5.7: whether Monday's sample holds the line at shift minute `time`. A season
 * that reads the bench holds only from the minute a real batch of its order
 * was found awaiting its test (`mondaySample`), never earlier than Monday's
 * minute, and until the bench has read it. One that has not read the bench
 * (a save from before, an engine-only caller) keeps the scripted minute.
 * Working if Monday holds only with a pending sample.
 */
export function mondayHolds(
  s: Pick<WorkplaceState, 'campaign' | 'minute'>,
  time: number = s.minute
): boolean {
  const c = s.campaign;
  if (c?.shift !== 1 || c.inspectionComplete) return false;
  if (c.mondaySample === undefined) return time >= mondayMinute(s);
  return c.mondaySample !== null && time >= c.mondaySample.heldAtMinute;
}

/** 5.7: Monday read the bench all shift and no sample of its order came: nothing to inspect. */
export const mondayHadNoSample = (r: {
  mondaySample?: WorkplaceMondaySample;
  inspectionComplete: boolean;
}) => r.mondaySample === null && !r.inspectionComplete;

/** 5.7: a saved Monday sample, as the engine writes it. */
export function validMondaySample(value: unknown): value is WorkplaceMondaySample {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).sort().join(',') === 'batchId,heldAtMinute' &&
    typeof v.batchId === 'string' &&
    v.batchId.length > 0 &&
    v.batchId.length <= 200 &&
    typeof v.heldAtMinute === 'number' &&
    Number.isFinite(v.heldAtMinute) &&
    v.heldAtMinute >= 0 &&
    v.heldAtMinute <= 90
  );
}

/**
 * 5.4: the minutes at the start of a shift that one authored role is away (a
 * late handover), and its plant work waits for it unless cover is agreed.
 * Bounded: an absence is minutes, never a shift.
 */
export const ABSENCE_MINUTES = 10;
/** The roles whose plant work the plant reads: Quality's bench, Maintenance's service. */
export type CrewRole = 'quality' | 'maintenance';

/**
 * 5.4 (D4): an absence is a pressure of the season, never a tax on every
 * shift. It comes on one shift only: the one the season's draw gives the
 * repeat-cover pressure ("Yesterday's volunteer again?"), when cover is what
 * the shift is about. Who is away follows the drawn decliner: when
 * Maintenance is the one that will not cover, it is Maintenance that is away
 * (and its service waits); otherwise it is Quality (and its bench waits), and
 * Maintenance can cover. A season with no draw (begun before draws) has no
 * absence. Nothing is rolled or saved. On every other shift nothing waits and
 * the plant behaves as with no season.
 * Working if a season with no absence drawn never holds the bench or a service.
 */
export function shiftAbsentee(
  s: Pick<WorkplaceState, 'campaign' | 'mode' | 'improvement'>
): CrewRole | null {
  const c = s.campaign;
  if (s.mode !== 'game' || !c?.draw || s.improvement) return null;
  if (c.draw.pressures[c.shift] !== 'repeat-cover') return null;
  return c.draw.decliner === 'maintenance' ? 'maintenance' : 'quality';
}

/**
 * Review 2: Quality's release and its lab tests stay with a member qualified
 * for them, as Quality's boundary says. Qualification is a member's eligible
 * tasks (the authored list, which D-074's sign-offs would widen), never its
 * role id. Maintenance's services take any eligible volunteer, as before.
 */
export const QUALITY_RELEASE_TASK = 'Quality release';
export function qualifiedToCover(
  member: Pick<WorkplaceState['members'][number], 'eligibleTasks'>,
  away: CrewRole | null
): boolean {
  return away !== 'quality' || member.eligibleTasks.includes(QUALITY_RELEASE_TASK);
}

/**
 * 5.4: agreed cover is in force: another member does the absent role's work.
 * An unqualified volunteer's cover never releases Quality's work (review 2):
 * the bench waits for Quality, and the plan's effect line says why.
 * Working if Maintenance's cover leaves the bench waiting while Quality is away.
 */
export function absenceCovered(s: WorkplaceState): boolean {
  const away = shiftAbsentee(s);
  const cover = s.members.find((m) => m.id === s.activeCoverMemberId);
  return (
    s.planId === 'cover' &&
    !!cover &&
    cover.id !== away &&
    cover.coverConsent === true &&
    s.coverRemainingMinutes > 0 &&
    qualifiedToCover(cover, away)
  );
}

/**
 * 5.4: whether `role`'s plant work waits now: the role is away at the start
 * of an active season shift and no agreed cover does its work. A shift that
 * is not active (deliberating, paused, reviewed) asks nothing of the plant,
 * so a waiting test or service always starts when the absence ends.
 * Working if a waiting test starts under cover and once the absence ends.
 */
export function crewAway(s: WorkplaceState, role: CrewRole): boolean {
  if (s.phase !== 'active' || s.minute >= ABSENCE_MINUTES) return false;
  if (shiftAbsentee(s) === role) return !absenceCovered(s);
  // Review 2: cover costs the volunteer its own task for those minutes: a
  // crew role covering another's work leaves its own waiting until the
  // absence ends (Maintenance at Quality's bench: its services wait).
  return absenceCovered(s) && s.activeCoverMemberId === role;
}

/** 5.4: game minutes until `role` is back at work: 0 when it is not away now. */
export const crewAwayMinutes = (s: WorkplaceState, role: CrewRole): number =>
  crewAway(s, role) ? ABSENCE_MINUTES - s.minute : 0;

/**
 * 5.3: an authored role's refusal, in its own terms. Each is a fixed sentence,
 * kept in the record and shown in the language active now. No number about a
 * person: a refusal says what the member values, never a tally of them.
 */
export const AUTHORED_REFUSAL_KEYS = [
  'refuseCoordinatorWages',
  'refuseQualityInspection',
  'declineCoverDone',
  'declineCoverDoneCoordinator',
  'declineCoverMaintenance',
  'declineCoverCoordinator',
] as const;
export type AuthoredRefusalKey = (typeof AUTHORED_REFUSAL_KEYS)[number];

const OBJECTION_KEYS = {
  disclosure: 'disclosureObjection',
  'blind-override': 'blindOverrideObjection',
  'repeat-cover': 'repeatCoverObjection',
} as const;

const OBJECTION_KINDS: ObjectionKind[] = ['rest', 'burden', 'privacy', 'authority'];

/**
 * Display text for a stored objection statement; the stored English stays the
 * matching key. A boundary objection is stored in the language active when it
 * was raised (a reload regenerates it), so it is shown in the language active
 * now. Working if switching language rewrites an open objection's statement.
 */
export function pressureObjectionText(statement: string): string {
  const pressure = CAMPAIGN_PRESSURES.find((item) => item.objection === statement);
  if (pressure) return translate(msg, OBJECTION_KEYS[pressure.id]);
  for (const kind of OBJECTION_KINDS)
    if (
      LOCALES.some(
        (locale) => bilateralWorkplaceMessages[locale].objectionStatement({ kind }) === statement
      )
    )
      return translate(bilateralWorkplaceMessages, 'objectionStatement', { kind });
  return statement;
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
  // 5.3: a member's no, kept with the season so it can be recounted.
  'authored-refusal',
  // Review 2: how the surplus settled and which need was met or outvoted,
  // kept with the season (archived or left) as the record of it.
  'surplus-basis',
  'surplus-need',
  'surplus-left',
]);
/** Review 2: the fixed sentences a surplus record may hold, by catalogue key. */
const SURPLUS_RECORD_KEYS = [
  'evSurplusChair',
  'evSurplusDefault',
  'evSurplusCharter',
  'evSurplusLeft',
  'needQualityMet',
  'needQualityOutvoted',
  'needMaintenanceMet',
  'needMaintenanceOutvoted',
  'needCoordinatorMet',
  'needCoordinatorOutvoted',
] as const;
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
    } else if (event.kind === 'authored-refusal') {
      // Only a refusal sentence this catalogue wrote, in either language.
      const key = AUTHORED_REFUSAL_KEYS.find((k) =>
        LOCALES.some((locale) => bilateralWorkplaceMessages[locale][k] === event.detail)
      );
      if (!key) return [];
      detail = translate(bilateralWorkplaceMessages, key);
    } else if (
      event.kind === 'surplus-basis' ||
      event.kind === 'surplus-need' ||
      event.kind === 'surplus-left'
    ) {
      const key = SURPLUS_RECORD_KEYS.find((k) =>
        LOCALES.some((locale) => bilateralWorkplaceMessages[locale][k] === event.detail)
      );
      if (!key) return [];
      detail = translate(bilateralWorkplaceMessages, key);
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
          // Review 2: the members' surplus records.
          'members',
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
    ...(s.campaign!.mondaySample !== undefined
      ? { mondaySample: structuredClone(s.campaign!.mondaySample) }
      : {}),
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
    // 5.7: a Monday whose bench never held a sample of the order had nothing to inspect.
    (s.campaign.history[1].inspectionComplete || mondayHadNoSample(s.campaign.history[1])) &&
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
/**
 * A linked order's credit read against the figure a player can compare it to:
 * a renegotiated installment until credit passes it, then the full order. The
 * agreed deferral stays the agreed figure. Working if credited kg never
 * exceeds its denominator short of the full order ("6000 / 4800" never shows).
 */
export function missionDelivery(
  m: Pick<WorkplaceMission, 'creditedKg' | 'targetKg' | 'originalTargetKg'>
) {
  const installment = m.creditedKg <= m.targetKg + 1e-6;
  return {
    deliveredKg: m.creditedKg,
    targetKg: installment ? m.targetKg : m.originalTargetKg,
    /** True while the denominator is a renegotiated installment, not the order. */
    installment: installment && m.targetKg < m.originalTargetKg - 1e-6,
    deferredKg: Math.max(0, m.originalTargetKg - m.targetKg),
  };
}

/** Kilograms in delivery copy: fixed digits, grouped in every language ("6,000" / "6.000"). */
export const formatKg = (kg: number, digits = 0) =>
  formatGrouped(kg, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function campaignOutcomes(s: WorkplaceState) {
  const history = s.campaign?.history ?? [];
  const mission = s.campaign?.mission;
  // A final shift a reload, a safety stop or an objection paused has not
  // ended: it can resume with fresh consent (an objection's once resolved), so
  // neither its delivery nor its agreement is final yet.
  const ended = s.phase === 'review' && s.campaign?.shift === 2 && !campaignShiftPause(s);
  const deliveredKg = mission?.creditedKg ?? history.reduce((n, h) => n + h.shippedKg, s.shippedKg);
  const targetKg = mission?.targetKg ?? history.reduce((n, h) => n + h.targetKg, s.targetKg);
  const evidenceCurrent = !mission || mission.evidence === 'current';
  const deliveryMet = evidenceCurrent && deliveredKg + 1e-6 >= targetKg;
  const agreementMet = campaignAgreementHonoured(s);
  const accounts = [...history.map((h) => h.finance), s.finance];
  const originalTargetKg = mission?.originalTargetKg ?? 600 * (history.length + 1);
  const remainingKg = Math.max(0, originalTargetKg - deliveredKg);
  const shown = mission
    ? missionDelivery(mission)
    : { targetKg, deferredKg: Math.max(0, originalTargetKg - targetKg) };
  return {
    delivery: {
      status: !evidenceCurrent ? 'blocked' : deliveryMet ? 'met' : ended ? 'shortfall' : 'pending',
      deliveredKg,
      targetKg: shown.targetKg,
      deferredKg: shown.deferredKg,
      remainingKg: remainingKg <= 1e-6 ? 0 : remainingKg,
      customer: mission?.customer ?? translate(msg, 'teachingCustomer'),
    },
    agreement: {
      status: agreementMet ? 'honoured' : ended ? 'incomplete' : 'pending',
    },
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

/**
 * 5.5 (D18): sobras as Lei 5.764/71 has them. Read on 13 November 2026 from
 * the Câmara dos Deputados' text of the law (planalto.gov.br/ccivil_03/leis/
 * l5764.htm redirected to the gov.br home page from here):
 * https://www2.camara.leg.br/legin/fed/lei/1970-1979/lei-5764-16-dezembro-1971-357788-normaatualizada-pl.html
 *
 * Art. 4º, VII: "retorno das sobras líquidas do exercício, proporcionalmente
 *   às operações realizadas pelo associado, salvo deliberação em contrário da
 *   Assembléia Geral;"
 * Art. 28: "As cooperativas são obrigadas a constituir: I - Fundo de Reserva
 *   destinado a reparar perdas e atender ao desenvolvimento de suas
 *   atividades, constituído com 10% (dez por cento), pelo menos, das sobras
 *   líquidas do exercício; II - Fundo de Assistência Técnica, Educacional e
 *   Social, destinado a prestação de assistência aos associados, seus
 *   familiares e, quando previsto nos estatutos, aos empregados da
 *   cooperativa, constituído de 5% (cinco por cento), pelo menos, das sobras
 *   líquidas apuradas no exercício." § 1º: "Além dos previstos neste artigo,
 *   a Assembléia Geral poderá criar outros fundos, inclusive rotativos, com
 *   recursos destinados a fins específicos fixando o modo de formação,
 *   aplicação e liquidação."
 * Art. 44: the Assembléia Geral Ordinária, held yearly after the exercício,
 *   decides "II - destinação das sobras apuradas ou rateio das perdas
 *   decorrentes da insuficiência das contribuições para cobertura das despesas
 *   da sociedade, deduzindo-se, no primeiro caso as parcelas para os Fundos
 *   Obrigatórios;"
 * Art. 89: "Os prejuízos verificados no decorrer do exercício serão cobertos
 *   com recursos provenientes do Fundo de Reserva e, se insuficiente este,
 *   mediante rateio, entre os associados, na razão direta dos serviços
 *   usufruídos, ressalvada a opção prevista no parágrafo único do artigo 80."
 *
 * Here the season is the exercício. Its net result, after wages, cover pay,
 * purchases and every losing shift, is the pool, and nothing is shared before
 * its last shift ends. The Reserve Fund (10%) and FATES (5%) come first, at
 * the law's minimum. The members' ballot sends the rest to members in
 * proportion to the minutes each worked in the season, cover included (a
 * worker member's operations with the co-op are its work); or keeps it in the
 * reserve; or sends it to the community as a fund the assembly creates (art.
 * 28 § 1º). A losing season shares nothing, and its loss comes off the reserve
 * brought forward first (art. 89). A purchase the reserve paid for is the
 * reserve's, not the season's (art. 28 I: "desenvolvimento de suas atividades").
 * Shares are amounts of the pool, never a ranking of people.
 */
export const RESERVE_FUND_SHARE = 0.1;
export const FATES_SHARE = 0.05;

const shiftNet = (f: WorkplaceFinance) =>
  f.operatingRevenue -
  f.operatingCost -
  f.wagesPaid -
  f.compensationPaid -
  f.improvementSpend -
  // A share an older build paid out shift by shift has already left the pool.
  f.distributed -
  f.communityAllocation;

/** The current shift's finance as it was before its sobras were settled. */
function unsettledFinance(s: WorkplaceState): WorkplaceFinance {
  const o = s.sobras;
  if (!o) return s.finance;
  return {
    ...s.finance,
    cash: s.finance.cash + (o.destination === 'reserve' ? 0 : o.remainder),
    distributed: s.finance.distributed - (o.destination === 'members' ? o.remainder : 0),
    communityAllocation:
      s.finance.communityAllocation - (o.destination === 'community' ? o.remainder : 0),
  };
}

function seasonAccounts(s: WorkplaceState) {
  const finances = [...(s.campaign?.history ?? []).map((h) => h.finance), unsettledFinance(s)];
  const brought = s.campaign?.reserveBrought ?? 0;
  const spent = finances.reduce((n, f) => n + f.improvementSpend, 0);
  const fromReserve = Math.min(brought, spent);
  // What the reserve paid for is not the season's expense.
  const net = finances.reduce((n, f) => n + shiftNet(f), 0) + fromReserve;
  return { brought, fromReserve, net, cash: unsettledFinance(s).cash };
}

/** The season's sobras before they are settled: its net result, never below zero. */
export function seasonSobrasPool(s: WorkplaceState): number {
  if (s.sobras) return s.sobras.pool;
  const { net, cash } = seasonAccounts(s);
  return Math.max(0, Math.min(cash, net));
}

/** Minutes each member worked in the season, its cover included. A fact about work, not a rating. */
export function seasonMinutesWorked(s: WorkplaceState): Record<string, number> {
  const past = s.campaign?.history ?? [];
  return Object.fromEntries(
    s.members.map((m) => [
      m.id,
      past.reduce(
        (n, h) => n + h.minute + (h.members.find((p) => p.id === m.id)?.extraMinutes ?? 0),
        s.minute + m.extraMinutes
      ),
    ])
  );
}

/** How the season's sobras divide under a destination, computed from the books. */
export function sobrasSettlement(
  s: WorkplaceState,
  destination: SurplusDestination
): WorkplaceSobras {
  const pool = Math.max(0, Math.min(seasonAccounts(s).cash, seasonAccounts(s).net));
  const reserve = pool * RESERVE_FUND_SHARE;
  const fates = pool * FATES_SHARE;
  const remainder = pool - reserve - fates;
  const minutes = seasonMinutesWorked(s);
  const total = Object.values(minutes).reduce((n, v) => n + v, 0);
  return {
    pool,
    reserve,
    fates,
    destination,
    remainder,
    shares: Object.fromEntries(
      s.members.map((m) => [
        m.id,
        destination === 'members' && total > 0 ? (remainder * minutes[m.id]) / total : 0,
      ])
    ),
  };
}

/** Sobras settle once the season (a standalone exercise: its one shift) has ended. */
export function seasonEnded(s: WorkplaceState): boolean {
  if (s.phase !== 'review') return false;
  if (!s.campaign) return true;
  return s.campaign.shift === 2 && !campaignShiftPause(s);
}

/**
 * The Reserve Fund the next season opens with: what was brought forward, less
 * what it bought and any loss it covered (art. 89), plus this season's reserve
 * and, if the members kept it, the remainder. FATES is assistance, not capital.
 */
export function seasonReserveCarried(s: WorkplaceState): number {
  const o = s.sobras;
  return reserveLeft(s) + (o ? o.reserve + (o.destination === 'reserve' ? o.remainder : 0) : 0);
}

/** What is left of the reserve brought forward, after what it bought and any loss it covered. */
export function reserveLeft(s: WorkplaceState): number {
  const { brought, fromReserve, net } = seasonAccounts(s);
  return Math.max(0, brought - fromReserve - Math.max(0, -net));
}

/**
 * Review 2: whether any shift of the season lost money on its own work:
 * revenue below material costs, wages and cover pay (a purchase is not a loss).
 */
export function seasonHadOperatingLoss(s: WorkplaceState): boolean {
  const finances = [...(s.campaign?.history ?? []).map((h) => h.finance), s.finance];
  return finances.some(
    (f) => f.operatingRevenue - f.operatingCost - f.wagesPaid - f.compensationPaid < -1e-8
  );
}

/**
 * 5.9: the elected chair's one power. Under member governance, when every
 * member has voted and two choices tie two to two, the chair's ballot carries.
 * Working if a 2-2 review or sobras ballot with a chair has an outcome.
 */
export function chairBreaksTie<T extends string>(
  s: Pick<WorkplaceState, 'governance' | 'electedChair' | 'members'>,
  ballots: Readonly<Record<string, T>>
): T | null {
  const chair = s.electedChair;
  if (s.governance !== 'member-vote' || !chair || s.members.some((m) => !ballots[m.id]))
    return null;
  const count = (choice: T) => s.members.filter((m) => ballots[m.id] === choice).length;
  const choice = ballots[chair];
  const rival = s.members.map((m) => ballots[m.id]).find((v) => v !== choice);
  return choice && rival && count(choice) === 2 && count(rival) === 2 ? choice : null;
}

/** How much of a purchase now the reserve brought forward still covers. */
export function reserveFunds(s: WorkplaceState, purchase: number): number {
  const { brought, fromReserve } = seasonAccounts(s);
  return Math.max(0, Math.min(purchase, brought - fromReserve));
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
  const monday =
    campaign.shift === 1
      ? campaign
      : campaign.shift === 2
        ? campaign.history.find((shift) => shift.shift === 1)
        : undefined;
  // 5.7: a Monday with no sample of the order on the bench had nothing to inspect.
  const noSample = !!monday && mondayHadNoSample(monday);
  const inspection = noSample ? undefined : monday?.inspectionComplete;
  const evidence = [
    campaign.mission
      ? translate(msg, 'reviewDelivery', {
          delivered: formatKg(outcome.delivery.deliveredKg, 1),
          evidence: campaign.mission.evidence,
          remaining: formatKg(outcome.delivery.remainingKg, 1),
        })
      : translate(msg, 'reviewTeaching', {
          delivered: formatKg(outcome.delivery.deliveredKg, 1),
          target: formatKg(outcome.delivery.targetKg, 1),
        }),
    translate(msg, 'reviewRecovery', {
      recovered: formatFixed(recovered, 1),
      owed: formatFixed(owed, 1),
    }),
  ];
  if (outcome.delivery.deferredKg > 0)
    evidence.push(
      translate(msg, 'reviewDeferred', { deferred: formatKg(outcome.delivery.deferredKg, 1) })
    );
  if (noSample) evidence.push(translate(msg, 'reviewNoSample'));
  else if (inspection !== undefined)
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
            remaining: formatKg(Math.max(0, mission.originalTargetKg - mission.creditedKg)),
            customer: customerDisplayName(mission.customer),
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
        : mondayHadNoSample(last)
          ? translate(msg, 'storyNoSample')
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
  // Packing's reused-consent challenge, whichever day the season's draw put it on.
  const repeatCover = CAMPAIGN_PRESSURES.find((item) => item.id === 'repeat-cover')!;
  const challenge = s.objections.find((item) => item.statement === repeatCover.objection);
  const protectedTerms = s.events.some(
    (event) => event.kind === 'pressure-protected' && event.detail.startsWith('repeat-cover: ')
  );
  const correction = s.events.some((event) => event.kind === 'adviser-correction');
  const yesNo = (value: boolean | null) => (value === null ? 'pending' : value ? 'yes' : 'no');
  // Packing is asked about cover only while its answer can still decide it.
  const coverAsked = s.planId === 'cover' && coverConsentDecides(s, 'packing');
  const next =
    challenge?.status === 'open'
      ? protectedTerms
        ? translate(msg, 'nextPackingReviews')
        : translate(msg, 'nextRestate')
      : s.phase === 'review'
        ? // A pause (reload, safety stop, objection resolved) resumes rather
          // than being compared as done.
          translate(
            msg,
            !shiftResumable(s)
              ? 'nextReview'
              : campaignShiftPause(s) === 'reload'
                ? 'nextResume'
                : 'nextResumeAfterStop'
          )
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
                  : coverAsked && packing.coverConsent === null
                    ? translate(msg, 'nextCoverPending')
                    : coverAsked && packing.coverConsent === false
                      ? translate(msg, 'nextCoverDeclined')
                      : translate(msg, 'nextReviewRoles');
  return {
    next,
    correction,
    protectedTerms,
    challenge: challenge?.status ?? (protectedTerms ? 'prevented' : 'not raised'),
    understanding: packing.understood ? 'confirmed' : 'pending',
    policy: yesNo(packing.ballot),
    // Beside `next`: a consent that can no longer decide the cover is not pending.
    cover:
      s.planId !== 'cover'
        ? 'not offered'
        : coverAsked
          ? yesNo(packing.coverConsent)
          : 'not needed',
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
