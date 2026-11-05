/**
 * Pass 15 of the Chronicle polish: each test reproduces a defect a player met.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { DEFAULT_CHARTER } from '../charter';
import { DELEGATION_LEVELS, getDelegationLevels } from '../delegation';
import {
  closeShift,
  createInitialState,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { localizedEpilogue } from '../epilogue';
import { EVENT_DECK } from '../eventDeck';
import { FUND_SOURCE_LABELS, KNOW_HOW_SOURCE_LABELS, localizedSourceLabels } from '../ledger';
import { GOVERNANCE_MARKS } from '../governance';
import { localizedMarkLabel, markLabel, MARKS } from '../record';
import { initialStakeholders } from '../stakeholders';
import { localizedNotice } from '../presentation';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass15-report-${minute}`,
      grade: 'B',
      endedAtMinute: minute,
      metrics: {
        revenue: 2000,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 3000,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

afterEach(() => setLocale('en'));

describe('Delegation grants in Brazilian Portuguese', () => {
  it('translates every level the Partners tab lists, not just the unchanged ones', () => {
    setLocale('pt-BR');
    const local = getDelegationLevels();
    for (const raw of DELEGATION_LEVELS) {
      const translated = local.find((level) => level.level === raw.level)!;
      expect(translated.grants, `level ${raw.level}`).not.toBe(raw.grants);
    }
  });
});

describe('The Ledger tab in Brazilian Portuguese', () => {
  it('names every fund and know-how source in the current language', () => {
    setLocale('pt-BR');
    const fund = localizedSourceLabels(FUND_SOURCE_LABELS);
    const knowHow = localizedSourceLabels(KNOW_HOW_SOURCE_LABELS);
    const untranslated = [
      ...Object.entries(fund).filter(([key, label]) => label === FUND_SOURCE_LABELS[key as never]),
      ...Object.entries(knowHow).filter(
        ([key, label]) => label === KNOW_HOW_SOURCE_LABELS[key as never]
      ),
    ].map(([key]) => key);
    expect(untranslated).toEqual([]);
  });
});

describe('The record in the Notes tab', () => {
  it('names the valley rebate as the fund payment it was, not an opened reserve', () => {
    // The choice reads "Pay the valley a rebate" and is paid from the fund.
    expect(localizedMarkLabel('reserve-opened')).toBe(markLabel('reserve-opened'));
    expect(localizedMarkLabel('reserve-opened')).not.toMatch(/reserve/i);
  });

  it('names every entry in Brazilian Portuguese, the part-three outcomes included', () => {
    setLocale('pt-BR');
    const untranslated = [...Object.keys(MARKS), ...GOVERNANCE_MARKS].filter(
      (id) => localizedMarkLabel(id) === markLabel(id)
    );
    expect(untranslated).toEqual([]);
  });
});

describe('The epilogue in Brazilian Portuguese', () => {
  it('translates the slide for Valley Haulage served its notice', () => {
    setLocale('pt-BR');
    const entries = localizedEpilogue({
      marks: {
        'haulier-suspended': {
          id: 'haulier-suspended',
          shift: 7,
          eventId: 'evt-court-haulier',
          choiceId: 'suspend',
          actor: 'player',
        },
      },
      improvements: [],
      readNotes: [],
      customers: [],
      stakeholders: initialStakeholders(),
      certifier: { score: 500, suspended: false },
    });
    const haulier = entries.find((entry) => entry.id === 'haulier')!;
    expect(haulier.text).toContain('Valley Haulage cumpriu');
  });
});

describe('A decision left to lapse, read in Brazilian Portuguese', () => {
  it('names the lapsed decision in the current language in the chronicle log', () => {
    // The off-peak tariff appears; nothing answers it, and it lapses.
    let state: ChronicleState = signCharter(
      createInitialState(),
      DEFAULT_CHARTER,
      11,
      baseline
    ).state;
    state = {
      ...state,
      shift: 3,
      pendingEvents: [
        {
          instanceId: 'event-90',
          eventId: 'evt-off-peak-tariff',
          appearedShift: 1,
          lapsesShift: 4,
        },
      ],
    };
    state = closeShift(state, evidence(), EVENT_DECK).state;
    const lapsed = state.notices.find((notice) => notice.relatedId === 'event-90')!;
    expect(lapsed).toBeDefined();
    setLocale('pt-BR');
    const local = localizedNotice(lapsed);
    expect(local.title).not.toBe(lapsed.title);
    expect(local.title).toContain('tarifa');
  });
});
