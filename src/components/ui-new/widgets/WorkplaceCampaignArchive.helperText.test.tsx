import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceCampaignArchive, WorkplaceLeaveSeason } from './WorkplaceCampaignArchive';
import { workplaceCampaignArchiveMessages } from './WorkplaceCampaignArchive.messages';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  mondayMinute,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../../../simulation/workplaceCampaign';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { setLocale } from '../../../i18n';

function agreeShift() {
  const store = useWorkplaceStore.getState();
  for (const actor of ['packing', 'mind']) {
    for (const check of requiredChecks(actor))
      store.answerCheck(actor, check, WORKPLACE_CHECKS.find((item) => item.id === check)!.correct);
    if (actor === 'packing') store.understand(actor);
  }
  store.vote('packing', true);
  store.simulateResponses();
  expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
}

/** As WorkplaceCampaignArchive.test.tsx: three shifts played to the final review. */
function finishCampaign() {
  const store = useWorkplaceStore.getState();
  fulfilFirstDelivery();
  store.startCampaign('cooperative', 17);
  for (let shift = 0; shift < 3; shift++) {
    if (shift !== 1)
      store.campaignDecision(shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator');
    agreeShift();
    while (useWorkplaceStore.getState().workplace.phase === 'active') {
      const state = useWorkplaceStore.getState().workplace;
      if (shift === 1 && state.minute >= mondayMinute(state) && !state.campaign?.decision)
        store.campaignDecision('inspect', 'quality');
      store.tick(5, 0, false);
    }
    if (shift < 2) store.nextCampaignShift();
  }
}

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
  useWorkplaceReplayStore.setState({ activeRunId: null });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// D14: refusals and values stay; notes and the "illustrative" prefix go.
const CUT = {
  en: [
    'Archive these three shifts',
    'Each exercise opens with 400',
    'The last six reviews',
    'Each was left before its final review',
    'It is kept as a season left early',
    'Illustrative credits',
  ],
  'pt-BR': [
    'Arquive estes três turnos',
    'Cada exercício começa com 400',
    'As seis revisões mais recentes',
    'Cada uma foi encerrada antes',
    'Ela fica guardada como temporada',
    'Créditos ilustrativos',
  ],
} as const;

const REMOVED_KEYS = ['freshIntro', 'freshCredits', 'retainedNote', 'leftNote'];

const COPY = {
  en: {
    archive: 'Archive review and open a fresh exercise',
    accounts: /^Credits: closing cash [\d.,]+; wages paid [\d.,]+; compensation paid [\d.,]+\.$/,
    leave: 'Leave this season',
    kept: /^Leaving keeps what was earned: .+ minutes of recovery delivered\.$/,
  },
  'pt-BR': {
    archive: 'Arquivar a revisão e abrir um novo exercício',
    accounts:
      /^Créditos: caixa de fechamento [\d.,]+; remuneração paga [\d.,]+; compensação paga [\d.,]+\.$/,
    leave: 'Sair desta temporada',
    kept: /^Sair mantém o que foi conquistado: .+ minutos de recuperação concedida\.$/,
  },
} as const;

const text = () => document.body.textContent ?? '';

describe('the campaign archive without notes', () => {
  it.each(['en', 'pt-BR'] as const)('the catalogue has no cut key in %s', (locale) => {
    for (const key of REMOVED_KEYS)
      expect(Object.keys(workplaceCampaignArchiveMessages[locale])).not.toContain(key);
  });

  it.each(['en', 'pt-BR'] as const)(
    'the final review and its retained record carry values only in %s',
    (locale) => {
      finishCampaign();
      setLocale(locale);
      render(<WorkplaceCampaignArchive onFreshExercise={vi.fn()} />);
      for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
      fireEvent.click(screen.getByRole('button', { name: COPY[locale].archive }));
      expect(screen.getByText(COPY[locale].accounts)).toBeInTheDocument();
      for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
    }
  );

  it.each(['en', 'pt-BR'] as const)(
    'leaving says what it keeps, in one sentence, in %s',
    (locale) => {
      const store = useWorkplaceStore.getState();
      fulfilFirstDelivery();
      store.startCampaign('cooperative', 17);
      store.campaignDecision('keep-target', 'coordinator');
      agreeShift();
      store.tick(30, 0, false);
      act(() => {
        store.stop();
      });
      setLocale(locale);
      render(
        <>
          <WorkplaceCampaignArchive onFreshExercise={vi.fn()} />
          <WorkplaceLeaveSeason />
        </>
      );
      expect(screen.getByText(COPY[locale].kept)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: COPY[locale].leave }));
      for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
    }
  );
});
