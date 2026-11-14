/**
 * The partner's proposals in words: an option's label, its price as it reads
 * on its button, a proposal's one-line reason and what it is about. Shared by
 * the AI panel's cards, the bell and the record (shiftReview.ts).
 */
import { createTranslator, formatFixed, formatGrouped, getLocale, type Locale } from '../i18n';
import { breakdownStoreMessages } from '../stores/breakdownStore.messages';
import { partnerProposalMessages as msg } from './partnerProposals.messages';
import {
  minutesToFailure,
  proposalReason,
  type OptionPrice,
  type PartName,
  type PartnerProposal,
  type ProposalDecider,
  type ProposalKind,
} from './partnerProposals';
import { customerDisplayName } from '../stores/customerNames';
import { floorProposalMessages as floor, FLOOR_OPTION_IDS } from './floorProposals.messages';
import { incidentDescription, incidentTitle } from '../stores/incidentText';
import {
  temperProposalMessages as temper,
  TEMPER_OPTION_LABEL_IDS,
} from './temperProposal.messages';

const OPTION_KEYS = {
  accept: 'optionAccept',
  hold: 'optionHold',
  service: 'optionService',
  quiet: 'optionQuiet',
  'run-on': 'optionRunOn',
  send: 'optionSend',
  take: 'optionTake',
  wait: 'optionWait',
  forfeit: 'optionForfeit',
  keep: 'optionKeep',
} as const;

const PART_KEYS: Record<PartName, keyof (typeof breakdownStoreMessages)['en']> = {
  bearings: 'partBearings',
  belts: 'partBelts',
  filters: 'partFilters',
  motors: 'partMotors',
  sensors: 'partSensors',
};

export function proposalOptionLabel(optionId: string, locale: Locale = getLocale()): string {
  const key = (OPTION_KEYS as Record<string, (typeof OPTION_KEYS)[keyof typeof OPTION_KEYS]>)[
    optionId
  ];
  if (key) return createTranslator(msg, locale)(key);
  // Temper answers (plan item 7.7).
  if ((TEMPER_OPTION_LABEL_IDS as readonly string[]).includes(optionId))
    return createTranslator(temper, locale)(optionId as (typeof TEMPER_OPTION_LABEL_IDS)[number]);
  // Intake and incident answers (plan items 3.1, 3.5).
  return (FLOOR_OPTION_IDS as readonly string[]).includes(optionId)
    ? createTranslator(floor, locale)(optionId as (typeof FLOOR_OPTION_IDS)[number])
    : optionId;
}

export function proposalKindLabel(kind: ProposalKind, locale: Locale = getLocale()): string {
  if (kind === 'intake') return createTranslator(floor, locale)('kindIntake');
  if (kind === 'incident') return createTranslator(floor, locale)('kindIncident');
  if (kind === 'temper') return createTranslator(temper, locale)('kindTemper');
  return createTranslator(
    msg,
    locale
  )(
    kind === 'programme'
      ? 'kindProgramme'
      : kind === 'dispatch'
        ? 'kindDispatch'
        : kind === 'commitment'
          ? 'kindCommitment'
          : kind === 'forfeit'
            ? 'kindForfeit'
            : 'kindService'
  );
}

/** A game-minute span as it reads: minutes under two hours, else hours. */
export function proposalDuration(minutes: number, locale: Locale = getLocale()): string {
  const t = createTranslator(msg, locale);
  const value = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return value < 120
    ? t('minutes', { minutes: formatFixed(Math.round(value), 0, locale) })
    : t('hours', { hours: formatFixed(value / 60, 1, locale) });
}

/** An option's price as its button shows it: money, parts, kilograms, minutes, a grade risk. */
export function formatProposalPrice(price: OptionPrice, locale: Locale = getLocale()): string {
  const t = createTranslator(msg, locale);
  const part = createTranslator(breakdownStoreMessages, locale);
  const pieces: string[] = [];
  // A priced net (the early programme) carries its charges: shown once, as net.
  const netted = price.net !== undefined;
  if (price.currency > 0 && !netted)
    pieces.push(
      t('money', {
        amount: formatGrouped(Math.round(price.currency), { maximumFractionDigits: 0 }, locale),
      })
    );
  // An answer that cannot run as things stand says why, first.
  if (price.held === 'no-part') pieces.push(t('heldNoPart'));
  for (const name of Object.keys(PART_KEYS) as PartName[]) {
    const count = price.parts[name];
    if (count && count > 0)
      pieces.push(t('part', { count: formatFixed(count, 0, locale), part: part(PART_KEYS[name]) }));
  }
  if (price.kg > 0)
    pieces.push(t('kg', { kg: formatGrouped(Math.round(price.kg), undefined, locale) }));
  if (price.lateOrders !== undefined) {
    // Orders at risk (inside the forecast's margin) with no late minutes read as at risk.
    const time = proposalDuration(price.minutes ?? 0, locale);
    const count = formatFixed(price.lateOrders, 0, locale);
    const late = (price.minutes ?? 0) >= 0.5;
    pieces.push(
      price.lateOrders <= 0
        ? t('noneLate')
        : price.lateOrders === 1
          ? late
            ? t('lateOne', { time })
            : t('riskOne')
          : late
            ? t('lateMany', { count, time })
            : t('riskMany', { count })
    );
  } else if (price.minutes !== null && price.minutes > 0)
    pieces.push(proposalDuration(price.minutes, locale));
  if (price.offlineMinutes !== undefined && price.offlineMinutes > 0)
    pieces.push(t('offline', { time: proposalDuration(price.offlineMinutes, locale) }));
  if (price.waitMinutes !== undefined && price.waitMinutes > 0)
    pieces.push(t('waitFor', { time: proposalDuration(price.waitMinutes, locale) }));
  if (price.truckDelay && price.truckDelay.chance > 0 && price.truckDelay.minutes > 0)
    pieces.push(
      t('truckDelay', {
        chance: formatFixed(price.truckDelay.chance * 100, 0, locale),
        time: proposalDuration(price.truckDelay.minutes, locale),
      })
    );
  // The minimums it misses name the orders it would fail; an older price says "below spec".
  if (price.belowMinimums && price.belowMinimums.length > 0)
    pieces.push(
      t('belowMinimums', {
        minimums: price.belowMinimums.map((minimum) => formatFixed(minimum, 0, locale)).join(', '),
      })
    );
  else if (price.gradeRisk) pieces.push(t('belowSpec'));
  // A late delivery counts against the shift's grade: none for an A, one for a B, two for a C.
  if (price.lateDeliveries !== undefined && price.lateDeliveries > 0)
    pieces.push(
      t('gradeAtBest', {
        grade: price.lateDeliveries === 1 ? 'B' : price.lateDeliveries === 2 ? 'C' : 'D',
      })
    );
  if (netted) {
    const value = Math.round(price.net ?? 0);
    const money = t('money', {
      amount: formatGrouped(Math.abs(value), { maximumFractionDigits: 0 }, locale),
    });
    pieces.push(t('net', { amount: value > 0 ? `+${money}` : value < 0 ? `−${money}` : money }));
  }
  return pieces.length > 0 ? pieces.join(' · ') : t('nothing');
}

/** What a proposal is about: the programme's number, or the unit's name. */
export function proposalSubject(proposal: PartnerProposal, locale: Locale = getLocale()): string {
  if (proposal.kind === 'intake') return createTranslator(floor, locale)('subjectIntake');
  if (proposal.kind === 'temper') return createTranslator(temper, locale)('subjectTemper');
  if (proposal.kind === 'incident') {
    const facts = (proposal as PartnerProposal<'incident'>).facts;
    return incidentTitle({ kind: facts.incidentKind, title: facts.incidentKind }, locale);
  }
  if (proposal.kind === 'programme')
    return createTranslator(msg, locale)('subjectProgramme', {
      number: formatFixed(
        (proposal as PartnerProposal<'programme'>).facts.programmeNumber,
        0,
        locale
      ),
    });
  if (proposal.kind === 'forfeit')
    return createTranslator(msg, locale)('subjectForfeit', {
      customer: customerDisplayName((proposal as PartnerProposal<'forfeit'>).facts.customer),
    });
  if (proposal.kind === 'commitment')
    return createTranslator(msg, locale)('subjectCommitment', {
      number: formatFixed(
        (proposal as PartnerProposal<'commitment'>).facts.programmeNumber,
        0,
        locale
      ),
    });
  if (proposal.kind === 'dispatch')
    return createTranslator(msg, locale)('subjectDispatch', {
      customer: customerDisplayName((proposal as PartnerProposal<'dispatch'>).facts.customer),
    });
  return (proposal as PartnerProposal<'service'>).facts.machineName;
}

/** The partner's reason, one line. */
export function proposalReasonText(
  proposal: PartnerProposal,
  locale: Locale = getLocale()
): string {
  const t = createTranslator(msg, locale);
  if (proposal.kind === 'intake') {
    const facts = (proposal as PartnerProposal<'intake'>).facts;
    return createTranslator(floor, locale)('reasonIntake', {
      fallingNumber: formatFixed(facts.fallingNumberS, 0, locale),
      moisture: formatFixed(facts.moisturePct, 1, locale),
      protein: formatFixed(facts.proteinPct, 1, locale),
    });
  }
  if (proposal.kind === 'temper') {
    const facts = (proposal as PartnerProposal<'temper'>).facts;
    return createTranslator(temper, locale)('reasonTemper', {
      moisture: formatFixed(facts.moisturePct, 1, locale),
    });
  }
  if (proposal.kind === 'incident') {
    const facts = (proposal as PartnerProposal<'incident'>).facts;
    return incidentDescription({ kind: facts.incidentKind, description: '' }, locale);
  }
  if (proposal.kind === 'programme') {
    const facts = (proposal as PartnerProposal<'programme'>).facts;
    const reason = proposalReason('programme', facts);
    return t(reason.key as 'reasonProgramme', {
      number: formatFixed(facts.programmeNumber, 0, locale),
      kg: formatGrouped(Math.round(facts.committedKg), undefined, locale),
    });
  }
  if (proposal.kind === 'forfeit') {
    const facts = (proposal as PartnerProposal<'forfeit'>).facts;
    return t('reasonForfeit', {
      customer: customerDisplayName(facts.customer),
      minimum: formatFixed(facts.minimum, 0, locale),
      best: formatFixed(facts.best, 1, locale),
    });
  }
  if (proposal.kind === 'commitment') {
    const facts = (proposal as PartnerProposal<'commitment'>).facts;
    return t('reasonCommitment', {
      number: formatFixed(facts.programmeNumber, 0, locale),
      kg: formatGrouped(Math.round(facts.committedKg), undefined, locale),
    });
  }
  if (proposal.kind === 'dispatch') {
    const facts = (proposal as PartnerProposal<'dispatch'>).facts;
    return t('reasonDispatch', {
      kg: formatGrouped(Math.round(facts.heldKg), undefined, locale),
      customer: customerDisplayName(facts.customer),
      minimum: formatFixed(facts.minimumQuality, 0, locale),
    });
  }
  const facts = (proposal as PartnerProposal<'service'>).facts;
  const toFailure = minutesToFailure(facts);
  return t(proposalReason('service', facts).key as 'reasonService', {
    machine: facts.machineName,
    time: proposalDuration(toFailure ?? 0, locale),
  });
}

export function proposalDeciderText(decider: ProposalDecider, locale: Locale = getLocale()) {
  const t = createTranslator(msg, locale);
  return t(
    decider === 'partner'
      ? 'deciderPartner'
      : decider === 'agent'
        ? 'deciderAgent'
        : 'deciderOperator'
  );
}
