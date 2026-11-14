import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { workplaceImprovementPanelMessages } from './WorkplaceImprovementPanel.messages';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale, translate } from '../../../i18n';

// D14 (D-012): the handoff panel keeps its headings, controls, costs, cash
// and state; it drops the intro, the notes under controls, the role-play
// disclaimer and the advice tails.
// Working if the idle, deciding, held and finalised panels render none of the
// cut copy in either language, and the trimmed lines keep their values.

const CUT = [
  /member’s idea on the packing floor/,
  /ideia de um cooperado no setor de ensaque/,
  /One 90-minute trial/,
  /Um teste de 90 minutos/,
  /Opening it holds the plant clock/,
  /Abrir o experimento para o relógio/,
  /Synthetic role-play/,
  /Encenação sintética/,
  /Nothing is funded yet/,
  /Nada foi financiado ainda/,
  /This later shift keeps earlier trial pay/,
  /Finalising the member review below/,
  /Concluir a avaliação dos cooperados abaixo/,
  /Review each concern with its raiser/,
  /A policy ballot grants no optional-duty consent/,
  /Uma votação de política não concede/,
  /The optional comparison below/,
  /A comparação opcional abaixo/,
  /Closing ends the experiment/,
  /Encerrar finaliza o experimento/,
  /Hear the adviser response to capture/,
  /Ouça a resposta do conselheiro para registrar/,
  /Facilitated workshop: no physical/,
  /Governance grants no capacity bonus/,
  /A governança não concede bônus/,
  /no repeat purchase/,
  /não exige nova compra/,
  /Reserve 108 credits/,
  /Reserve primeiro 108 créditos/,
  /Every ending preserves/,
  /Todo desfecho preserva/,
  /runs normally again at the shift pace below/,
  /volta a funcionar normalmente/,
  /old consent supplies no current permission/,
  /um consentimento antigo não concede/,
  /Watch the line and customer dispatch/,
  /Acompanhe a linha e a expedição/,
  /individual objection rights retained/,
  /direitos individuais de objeção mantidos/,
];

const body = () => document.body.textContent ?? '';
const noHelper = () => {
  for (const pattern of CUT) expect(body()).not.toMatch(pattern);
};

const report = vi.fn();
const mount = () =>
  render(
    <WorkplaceImprovementPanel
      profile="cooperative"
      setProfile={() => {}}
      activate={async () => {
        useWorkplaceStore.getState().activate(useWorkplaceStore.getState().workplace.revision);
      }}
      busy={false}
      report={report}
    />
  );

const decided = () => {
  const store = useWorkplaceStore.getState();
  store.beginImprovement('team', store.workplace.revision);
  store.proposeImprovement('briefing', 'packing');
  store.challengeImprovement('quality', 'forecast');
  store.acknowledgeImprovement();
  for (const m of useWorkplaceStore.getState().workplace.members) {
    store.understand(m.id);
    store.vote(m.id, true);
  }
};

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

describe.each(['en', 'pt-BR'] as const)('handoff panel without helper text (%s)', (locale) => {
  beforeEach(() => setLocale(locale));

  it('idle, before the experiment opens', () => {
    mount();
    noHelper();
    // What shows instead: the control that opens it (review 2).
    expect(
      screen.getByRole('button', {
        name: translate(workplaceImprovementPanelMessages, 'openExperiment'),
      })
    ).toBeInTheDocument();
  });

  it('while the team decides, with the clock held', () => {
    const store = useWorkplaceStore.getState();
    store.beginImprovement('team', store.workplace.revision);
    store.proposeImprovement('buffer', 'maintenance');
    mount();
    noHelper();
    // What shows instead: the decision's own controls (review 2).
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    cleanup();
    decided();
    mount();
    noHelper();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('running, then finalised in review', () => {
    decided();
    const store = useWorkplaceStore.getState();
    store.activate(useWorkplaceStore.getState().workplace.revision);
    mount();
    noHelper();
    cleanup();
    store.tick(90, 500, false);
    mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: locale === 'en' ? 'Hear the adviser review its forecast' : /Ouvir o conselheiro/,
      })
    );
    fireEvent.change(
      screen.getByLabelText(
        locale === 'en' ? 'Packing review decision' : /^Decisão de revisão: (Ensaque|Packing)$/
      ),
      { target: { value: 'adopt' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: locale === 'en' ? 'Finalise handoff review' : /Concluir a revisão/,
      })
    );
    expect(body()).toMatch(
      locale === 'en' ? /Review recorded: adopt\./ : /Revisão registrada: adotar\./
    );
    noHelper();
  });
});

describe('the trimmed handoff lines keep their values', () => {
  it('cost, cash, verdict and completion', () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      (translate as (c: unknown, k: string, p?: unknown) => string)(
        workplaceImprovementPanelMessages,
        key,
        params
      );
    expect(t('costLine', { cost: '40', briefingMinutes: '5', capacity: '1.00' })).toBe(
      '40 credits for a new arrangement; 5 paid minutes of pacing hold; 1.00× modeled pace.'
    );
    expect(t('reserveLine', { cost: '40.00', cash: '500.00' })).toBe(
      'This shift’s purchase: 40.00 credits. Cash before reservations: 500.00.'
    );
    expect(t('reviewRecorded', { verdict: 'stop' })).toBe('Review recorded: stop.');
    expect(t('complete')).toBe('This handoff experiment is complete.');
    expect(t('originNote', { cash: '500.00' })).toBe('Origin closing cash: 500.00 credits.');
    for (const locale of ['en', 'pt-BR'] as const)
      for (const key of [
        'introIdea',
        'introProtected',
        'openHoldNote',
        'rolePlayNote',
        'cancelNote',
        'endToReviewNote',
        'finaliseToReleaseNote',
        'remediesNote',
        'roleDecisionsNote',
        'comparisonNote',
        'closeNote',
        'hearAdviserHint',
        'workshopNoForecast',
        'noCapacityBonus',
        'watchLineDispatch',
        'completeGame',
        'completeWorkshop',
      ])
        expect(Object.keys(workplaceImprovementPanelMessages[locale])).not.toContain(key);
  });
});
