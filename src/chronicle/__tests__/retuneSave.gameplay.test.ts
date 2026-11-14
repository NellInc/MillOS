/**
 * Item 4.1's re-tune, from the side of a chronicle saved before it: the fund
 * balance is kept as the number it was (now read in the plant's currency), a
 * trial in its window keeps its progress and is judged on the goal as it now
 * stands, the fields added since (plan savings, forfeits, seasons) are absent
 * and read as none, and the chronicle plays to its end. Its saved notices and
 * initiative lines in the old wording are still recognised (rule 7).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  fundOf,
  signCharter,
  type ChronicleState,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { localizedInitiative, localizedNotice } from '../presentation';
import { LEGACY_BRIEFINGS, TRIALS } from '../trials';
import { pinEvidence } from './chronicleRun';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const wet = TRIALS.find((trial) => trial.id === 'wet_harvest')!;

/** A chronicle as a build before the re-tune saved it, mid-way through the Wet Harvest. */
function savedBeforeRetune(): Record<string, unknown> {
  let state: ChronicleState = signCharter(
    createInitialState(),
    DEFAULT_CHARTER,
    41,
    baseline
  ).state;
  for (let i = 0; i < wet.startShift + 2; i++)
    state = closeShift(state, pinEvidence(41, i, 3000), EVENT_DECK).state;
  const saved = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  for (const key of ['planSavings', 'orderForfeited', 'cooperativeSeasons', 'seasonsBeforeCharter'])
    delete saved[key];
  saved.ledger = {
    ...(saved.ledger as Record<string, unknown>),
    fund: { ...(state.ledger.fund as Record<string, number>), reinvestment: 2_340 },
  };
  saved.trials = state.trials.map((trial) =>
    trial.id === 'wet_harvest' ? { ...trial, dispatchedKg: 6_100, shiftsUsed: 2 } : trial
  );
  saved.notices = [
    ...state.notices,
    {
      id: 'notice-old-1',
      shift: wet.startShift - 2,
      kind: 'trial',
      title: 'The Wet Harvest begins in 2 shifts',
      body: `${LEGACY_BRIEFINGS.wet_harvest![0]} ${wet.floor}`,
      relatedId: 'wet_harvest',
    },
  ];
  return saved;
}

describe('a chronicle saved before the re-tune', () => {
  afterEach(() => setLocale('en'));

  it('restores with its fund as it was, and plays to the end', () => {
    useOperationsCampaignStore.getState().resetCampaign();
    const saved = savedBeforeRetune();
    const merge = useChronicleStore.persist.getOptions().merge!;
    let state = (
      merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
        typeof useChronicleStore.getState
      >
    ).chronicle;
    expect(state.planSavings).toBeUndefined();
    expect(state.orderForfeited).toBeUndefined();
    const before = fundOf(state);
    expect(state.ledger.fund.reinvestment).toBe(2_340);
    const wetBefore = state.trials.find((t) => t.id === 'wet_harvest')!;
    expect(wetBefore.phase).toBe('active');
    expect(wetBefore.dispatchedKg).toBe(6_100);
    for (let i = state.shift; i < 70 && state.status === 'active'; i++)
      state = closeShift(state, pinEvidence(41, i, 3000), EVENT_DECK).state;
    expect(state.status).toBe('ended');
    expect(state.finalScore).not.toBeNull();
    // Judged on the goal as it stands: 3,000 kg a shift cannot reach it.
    expect(state.trials.find((t) => t.id === 'wet_harvest')!.phase).toBe('failed');
    expect(Number.isFinite(before)).toBe(true);
  });

  it('still translates an announcement with the old briefing', () => {
    const saved = savedBeforeRetune();
    const notice = (saved.notices as Array<Parameters<typeof localizedNotice>[0]>).at(-1)!;
    setLocale('pt-BR');
    const local = localizedNotice(notice);
    expect(local.title).not.toBe(notice.title);
    expect(local.body).toContain('6.000 kg');
    expect(local.body).not.toContain('Dispatch');
  });

  it('reads a saved initiative line in the old wording', () => {
    const entry = {
      id: 'initiative-3',
      shift: 30,
      kind: 'event' as const,
      targetId: 'event-12',
      summary: 'Two buyers, one slot: Put the pasta works first',
      reason: 'Routine event within the delegated budget; the recommended choice.',
      reversible: false,
      reversed: false,
    };
    expect(localizedInitiative(entry).summary).toBe(
      'Two buyers, one slot: Put the polenta kitchen first'
    );
    setLocale('pt-BR');
    expect(localizedInitiative(entry).summary).toMatch(/cozinha de polenta/);
  });
});
