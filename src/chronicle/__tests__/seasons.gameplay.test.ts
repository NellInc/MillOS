import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  fundOf,
  knowHowOf,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { epilogue, localizedEpilogue, SEASON_EPILOGUE_SECTIONS } from '../epilogue';
import { copy } from '../epilogue.messages';
import { conditionMet } from '../record';
import { setLocale } from '../../i18n';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import {
  useOperationsCampaignStore,
  type ShiftCampaignReport,
} from '../../stores/operationsCampaignStore';
import { createWorkplace, transitionWorkplace } from '../../simulation/bilateralWorkplace';
import type { CooperativeSeasonFact } from '../types';

// Item 5.10: a cooperative season finished on the floor enters the Chronicle's
// record, once, by its id. Facts only: it moves no fund, know-how or goods.

const KEPT: CooperativeSeasonFact = {
  seasonId: 'season-1',
  profile: 'cooperative',
  delivery: 'met',
  agreement: 'honoured',
  sobrasDestination: 'members',
};
const SHORT: CooperativeSeasonFact = {
  seasonId: 'season-2',
  profile: 'team',
  delivery: 'shortfall',
  agreement: 'incomplete',
  sobrasDestination: null,
};

let sequence = 0;
function evidence(seasons?: CooperativeSeasonFact[]): ShiftCloseEvidence {
  sequence += 1;
  return {
    report: {
      id: `season-report-${sequence}`,
      grade: 'A',
      endedAtMinute: sequence * 480,
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
    ...(seasons ? { cooperativeSeasons: seasons } : {}),
  };
}

function signed(seasonIds: string[] = []): ChronicleState {
  return signCharter(createInitialState(), DEFAULT_CHARTER, 5, {
    reportId: null,
    qcTestIds: [],
    challengeIds: [],
    orders: [],
    seasonIds,
  }).state;
}

/** The same closes with and without seasons, so the one difference is the record. */
function closeEach(seasonsPerClose: (CooperativeSeasonFact[] | undefined)[], start = signed()) {
  let state = start;
  for (const seasons of seasonsPerClose) state = closeShift(state, evidence(seasons), []).state;
  return state;
}

describe('cooperative seasons in the record', () => {
  it('evidence saved before the field records nothing', () => {
    const state = closeEach([undefined, undefined]);
    expect(state.cooperativeSeasons).toBeUndefined();
    expect(state.marks['season-kept']).toBeUndefined();
    expect(state.marks['season-short']).toBeUndefined();
  });

  it('records a season once though every later close still carries it', () => {
    const state = closeEach([[KEPT], [KEPT], [KEPT, SHORT], [KEPT, SHORT]]);
    expect(state.cooperativeSeasons?.map((s) => [s.seasonId, s.shift])).toEqual([
      ['season-1', 1],
      ['season-2', 3],
    ]);
    expect(state.marks['season-kept']?.choiceId).toBe('season-1');
    expect(state.marks['season-short']?.choiceId).toBe('season-2');
    expect(state.marks['season-kept']?.actor).toBe('chronicle');
  });

  it('a season archived before the charter belongs to no chronicle', () => {
    const state = closeEach([[KEPT], [KEPT, SHORT]], signed(['season-1']));
    expect(state.cooperativeSeasons?.map((s) => s.seasonId)).toEqual(['season-2']);
    expect(state.marks['season-kept']).toBeUndefined();
  });

  it('moves no fund and no know-how', () => {
    const without = closeEach([undefined, undefined, undefined]);
    const withSeasons = closeEach([[KEPT], [KEPT, SHORT], [KEPT, SHORT]]);
    expect(fundOf(withSeasons)).toBe(fundOf(without));
    expect(knowHowOf(withSeasons)).toBe(knowHowOf(without));
  });

  it('drops a fact without a season’s shape', () => {
    const malformed = [
      { ...KEPT, seasonId: '' },
      { ...KEPT, seasonId: 'x', delivery: 'lots' },
    ] as unknown as CooperativeSeasonFact[];
    expect(closeEach([malformed]).cooperativeSeasons).toBeUndefined();
  });

  it('the epilogue reads each outcome, in both languages', () => {
    const cases = [[[KEPT]], [[KEPT, SHORT]], [[SHORT]]];
    cases.forEach((closes, index) => {
      const state = closeEach(closes);
      const section = SEASON_EPILOGUE_SECTIONS[0];
      expect(section.slides.findIndex((slide) => conditionMet(state, slide.when))).toBe(index);
      setLocale('en');
      expect(epilogue(state).find((entry) => entry.id === 'seasons')?.text).toBe(
        section.slides[index].text
      );
      setLocale('pt-BR');
      const local = localizedEpilogue(state).find((entry) => entry.id === 'seasons');
      expect(local?.text).not.toBe(section.slides[index].text);
      expect(copy(section.title)).not.toBe(section.title);
      setLocale('en');
    });
    // A season is not a decision: the partner's count of decisions ignores it.
    const state = closeEach([[KEPT, SHORT]]);
    expect(epilogue(state).some((entry) => entry.id === 'partner')).toBe(false);
  });

  it('the store reads archived seasons into the close, and records each once through observe', () => {
    const season = (seed: number, revision: number) => {
      const started = transitionWorkplace(createWorkplace('game', seed), {
        type: 'startCampaign',
        args: ['cooperative', seed],
      }).state;
      return { ...started, revision };
    };
    const report = (n: number): ShiftCampaignReport => ({
      id: `season-store-report-${n}`,
      shiftKey: `day-1-${n}`,
      shiftLabel: 'Morning',
      startedAtMinute: 0,
      endedAtMinute: 100_000 + n * 480,
      metrics: evidence().report.metrics as ShiftCampaignReport['metrics'],
      completedOrderIds: [],
      openRisks: [],
      grade: 'A',
      summary: '',
    });
    const close = (n: number) => {
      useOperationsCampaignStore.setState((s) => ({ reports: [...s.reports, report(n)] }));
      useChronicleStore.getState().observe(false);
    };
    useOperationsCampaignStore.getState().resetCampaign();
    // One season archived before the charter, from the shift card's default seed.
    useWorkplaceStore.setState({ completedCampaigns: [season(1, 4)] });
    useChronicleStore.setState({ chronicle: createInitialState() });
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 13);
    close(1);
    expect(useChronicleStore.getState().chronicle.cooperativeSeasons).toBeUndefined();
    // A later season with the same seed is a different season.
    useWorkplaceStore.setState((s) => ({
      completedCampaigns: [...s.completedCampaigns, season(1, 9)],
    }));
    close(2);
    close(3);
    const recorded = useChronicleStore.getState().chronicle.cooperativeSeasons ?? [];
    expect(recorded.map((s) => s.seasonId)).toEqual(['season-1-9']);
    expect(recorded[0]).toMatchObject({ profile: 'cooperative', sobrasDestination: null });
    useWorkplaceStore.setState({ completedCampaigns: [] });
  });

  it('a save without the fields restores and keeps recording; a malformed one is filtered', () => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 9);
    const chronicle = useChronicleStore.getState().chronicle;
    const merge = useChronicleStore.persist.getOptions().merge!;
    const load = (extra: Record<string, unknown>) =>
      (
        merge(
          JSON.parse(JSON.stringify({ chronicle: { ...chronicle, ...extra } })),
          useChronicleStore.getState()
        ) as ReturnType<typeof useChronicleStore.getState>
      ).chronicle;
    const old = load({});
    expect(old.cooperativeSeasons).toBeUndefined();
    expect(old.seasonsBeforeCharter).toBeUndefined();
    expect(closeShift(old, evidence([KEPT]), []).state.cooperativeSeasons).toHaveLength(1);
    const filtered = load({
      cooperativeSeasons: [{ ...KEPT, shift: 2 }, { ...SHORT, shift: 'x' }, 'junk'],
      seasonsBeforeCharter: ['season-9', 4],
    });
    expect(filtered.cooperativeSeasons).toEqual([{ ...KEPT, shift: 2 }]);
    expect(filtered.seasonsBeforeCharter).toEqual(['season-9']);
  });
});
