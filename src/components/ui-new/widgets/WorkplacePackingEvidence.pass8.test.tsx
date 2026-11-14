import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FrozenPackingAdvice } from './WorkplacePackingEvidence';
import { setLocale, translate } from '../../../i18n';
import { workplaceAdviceMessages } from '../../../simulation/workplaceAdvice.messages';
import { plantSecondsForGameSeconds } from '../../../simulation/pace';
import type { PackingAdvice } from '../../../types/workplaceAdvice';

afterEach(() => {
  cleanup();
  setLocale('en');
});

/** Advice frozen while the game was in English, as the engine records it. */
function englishAdvice(reasonToAbstain: string | null): PackingAdvice {
  // A save from before D14 holds the assumption captions it was modelled with.
  const assumptions = [
    `90 workplace minutes = ${plantSecondsForGameSeconds(5400)} plant seconds at every resume pace.`,
    'Real material engine at 0.5 and 0.25 physical-second steps; bounds reflect time resolution, not statistical confidence.',
  ];
  return {
    version: 1,
    fingerprint: 'f',
    arrangement: 'steady',
    evidence: {
      materialSessionId: 's',
      orderId: 'order-001',
      recipeId: 'r',
      finishedMaterial: 'flour',
      remainingOrderKg: 6000,
      releasedPackedKg: 0,
      heldPackedKg: 0,
      processingMachines: 1,
      totalMachines: 1,
      materialClockSeconds: 1,
      productionSpeed: 1,
      campaignMultiplier: 1,
      gameSpeed: 30,
      qualityRelease: true,
      truckCapacityKg: null,
      truckLoadedKg: null,
      truckStatus: null,
      missingFacts: [],
    },
    reasonToAbstain,
    workplaceMinutes: 90,
    physicalSeconds: 180,
    stepSeconds: 0.5,
    briefingMinutes: 0,
    linePacing: 0.78,
    packedLowKg: 0,
    packedHighKg: 0,
    dispatchLowerKg: 0,
    dispatchUpperKg: 0,
    genealogyErrorKg: null,
    assumptions,
  };
}

describe('Workplace lane, eighth pass: frozen advice after a language switch', () => {
  // D14: the assumption captions are cut, including those an old save holds.
  it('shows no assumption caption, even from advice saved with them', () => {
    const advice = englishAdvice(null);
    render(<FrozenPackingAdvice advice={advice} />);
    expect(screen.queryByText(/^Real material engine/)).toBeNull();
    expect(screen.queryByText(/^90 workplace minutes/)).toBeNull();
  });

  it('gives the reason it abstained in the language chosen after it was frozen', () => {
    setLocale('en');
    const reason = [
      translate(workplaceAdviceMessages, 'missingOrder'),
      translate(workplaceAdviceMessages, 'missingClock'),
    ].join(' ');
    const advice = englishAdvice(reason);
    setLocale('pt-BR');
    render(<FrozenPackingAdvice advice={advice} />);
    expect(
      screen.getByText(
        'O pedido ativo e a receita não estão disponíveis. O relógio de material é inválido.'
      )
    ).toBeInTheDocument();
  });
});
