/**
 * Item 4.8 (report 08, F10): the co-op reserve paid only upkeep, which the fund
 * pays anyway, so it was weakly dominated. A reserve of 100 or more now counts
 * as one preparation for the long night.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { createInitialState, signCharter, type ChronicleState } from '../engine';
import {
  frontPreparation,
  frontSources,
  localizedFrontSources,
  RESERVE_PREPARATION_BALANCE,
} from '../longNight';
import { setLocale } from '../../i18n';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const withReserve = (balance: number): ChronicleState => {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 5, baseline).state;
  return {
    ...state,
    governance: { ...state.governance, reserve: { ...state.governance.reserve, balance } },
  };
};

describe('the co-op reserve on the long night', () => {
  it('counts one preparation on each front at a balance of 100 or more', () => {
    expect(RESERVE_PREPARATION_BALANCE).toBe(100);
    for (const front of ['intake', 'floor'] as const) {
      const below = frontPreparation(withReserve(99), front);
      expect(frontPreparation(withReserve(100), front)).toBe(below + 1);
      expect(frontPreparation(withReserve(250), front)).toBe(below + 1);
      const source = frontSources(withReserve(100), front).find((s) => s.id === 'reserve');
      expect(source).toMatchObject({ weight: 1, met: true });
      expect(frontSources(withReserve(99), front).find((s) => s.id === 'reserve')?.met).toBe(false);
    }
  });

  it('names the reserve in both languages', () => {
    setLocale('en');
    const english = localizedFrontSources(withReserve(100), 'intake').find(
      (s) => s.id === 'reserve'
    );
    expect(english?.label).toBe('Co-op reserve at 100 or more');
    setLocale('pt-BR');
    const portuguese = localizedFrontSources(withReserve(100), 'intake').find(
      (s) => s.id === 'reserve'
    );
    expect(portuguese?.label).toBe('Reserva da cooperativa em 100 ou mais');
    setLocale('en');
  });
});
