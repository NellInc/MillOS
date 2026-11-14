import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FrozenPackingAdvice,
  HandoffConduct,
  HandoffEpisodes,
  MatchedPackingRehearsal,
} from './WorkplacePackingEvidence';
import { workplacePackingEvidenceMessages } from './WorkplacePackingEvidence.messages';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale, translate } from '../../../i18n';
import type { PackingAdvice } from '../../../types/workplaceAdvice';

// D14 (D-012): the packing evidence keeps its values, results, refusals and
// the questions the exercise asks; it drops the intros, the "this changes
// nothing live" disclaimers and the advice tails.
// Working if none of the cut copy renders in either language, and each
// trimmed line keeps its state or value.

const CUT = [
  /Optional planning episodes/,
  /Episódios opcionais de planejamento/,
  /To act in the plant/,
  /Para agir no moinho/,
  /These are scenario bounds/,
  /São limites de cenário/,
  /Resolve the missing evidence above/,
  /Resolva a evidência que falta acima/,
  /Unknown evidence remains unknown/,
  /Evidência desconhecida continua desconhecida/,
  /90 workplace minutes are/,
  /90 minutos de trabalho correspondem/,
  /Facts are frozen/,
  /Os fatos ficam congelados/,
  /Three isolated copies/,
  /Três cópias isoladas/,
  /Compare ideas first/,
  /Comparem as ideias primeiro/,
  /A declined policy ballot grants/,
  /Uma recusa na votação da política não concede/,
  /Each remedy belongs/,
  /Cada reparação pertence/,
];

const body = () => document.body.textContent ?? '';
const noHelper = () => {
  for (const pattern of CUT) expect(body()).not.toMatch(pattern);
};

function advice(reasonToAbstain: string | null): PackingAdvice {
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
    assumptions: [],
  };
}

beforeEach(() => {
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useGameSimulationStore.getState().setGameSpeed(0);
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe.each(['en', 'pt-BR'] as const)('packing evidence without helper text (%s)', (locale) => {
  beforeEach(() => setLocale(locale));

  it('frozen advice, with bounds and abstaining', () => {
    render(<FrozenPackingAdvice advice={advice(null)} />);
    expect(body()).toMatch(locale === 'en' ? /1\.0x pace\./ : /Ritmo 1,0x\./);
    noHelper();
    cleanup();
    render(<FrozenPackingAdvice advice={advice('Released stock is unknown.')} />);
    expect(body()).toMatch(
      locale === 'en'
        ? /Numeric plant facts are unavailable for this forecast\./
        : /Os fatos numéricos do moinho não estão disponíveis para esta previsão\./
    );
    noHelper();
  });

  it('the episode picker, the matched rehearsal and the conduct debrief', () => {
    const store = useWorkplaceStore.getState();
    store.beginImprovement('team', store.workplace.revision);
    store.setImprovementEpisode('late-truck');
    store.proposeImprovement('buffer', 'maintenance');
    store.object('quality', 'burden');
    const state = useWorkplaceStore.getState().workplace;
    render(
      <>
        <HandoffEpisodes state={state} report={() => {}} />
        <MatchedPackingRehearsal state={state} report={() => {}} />
        <HandoffConduct state={state} />
      </>
    );
    noHelper();
    // What shows instead: the picker's and the rehearsal's own controls (review 2).
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('the trimmed packing lines keep their state', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    (translate as (c: unknown, k: string, p?: unknown) => string)(
      workplacePackingEvidenceMessages,
      key,
      params
    );

  it('in English', () => {
    expect(t('paceValue', { speed: '1.0' })).toBe('1.0x pace.');
    expect(t('alreadyHeld')).toBe('Release was already held in the captured facts.');
    expect(t('alreadyZero')).toBe('The original departure bounds were already zero.');
    expect(t('matchedInput', { fingerprint: 'f' })).toBe('Matched input: f.');
    expect(t('timingUnavailable')).toBe('Timing is unavailable for this comparison.');
    expect(t('resolveMissing')).toBe('Resolve missing captured facts before this exercise.');
    expect(t('objections', { count: 2, countText: '2' })).toBe('2 unresolved objections.');
    expect(t('independentEvidence')).toBe(
      'Which independent evidence would Quality and the coordinator need before an actual departure?'
    );
  });

  it('and has no key left for a cut line, in either language', () => {
    for (const locale of ['en', 'pt-BR'] as const)
      for (const key of [
        'handoffIntro',
        'actInPlant',
        'scenarioBounds',
        'frozenFacts',
        'isolatedCopies',
        'compareIdeas',
        'firstPackingExplain',
        'briefingRetains',
        'assumeWithheld',
        'moreStock',
        'declinedNoPermission',
        'abstainReason',
        'keepOpen',
      ])
        expect(Object.keys(workplacePackingEvidenceMessages[locale])).not.toContain(key);
  });
});
