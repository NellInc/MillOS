import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { workplaceLabMessages } from './WorkplaceLab.messages';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { WORKPLACE_PLANS, createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale, translate, type Locale } from '../../../i18n';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

beforeEach(() => {
  setLocale('en');
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
  useGameSimulationStore.setState({ gameSpeed: 180 });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// D14: the laboratory carried an intro under its heading, a disclaimer, and a
// note under nearly every control group. Each fragment below only explained the
// screen or repeated the About disclaimer; what stays is labels, readings, the
// terms being checked and the reason a held control is held.
const CUT: Record<Locale, string[]> = {
  en: [
    'Synthetic roles only',
    'Worker proposals, bounded trials and member review',
    'The handoff experiment: member proposals',
    'three shifts, shared obligations',
    'Friday order: meet the shipment',
    'Try a worker-led improvement',
    'Adviser role checks are authored role-play',
    'must correct its earlier recommendation',
    'Review the shift, deliver owed recovery',
    'Trying the demand pauses activation',
    'A declined offer can lead to protected pacing',
    'Alternatives: compare the four responses',
    'Dispatch remains uncertain until quality-qualified',
    'Workplace credits are illustrative accounts',
    'Always active: safe stops',
    'Change the allocation of decisions',
    'Policy votes and optional-cover consent are separate',
    'Manual workshop: record each',
    'Every role acts in its own turn',
    'Simulated responses belong to the other',
    'Answer Packing and Adviser checks',
    'Optional preference sharing is for this shift',
    'Records the local rehearsal only',
    'Execution requires this explicit approval',
    'Public requests, challenges, repairs',
    'bounded 120-event log',
    'Outstanding recovery is delivered through',
    'Confirmations expire on review',
    'revenue less operating costs',
    'Three member ballots',
    'under three decision structures',
    'These are illustrative forecasts',
    'standalone 600 kg exercise',
    'Illustrative model forecasts',
    'Local download only',
    'Changing a plan clears the role agreement',
    'Illustrative workplace credits',
    'AI minds have a voice',
    'Shared surplus is part of',
    'Restarting clears the current discussion',
    'No plant movement or shipment',
    'No remote send',
    'Synthetic scenario exported',
    'The full customer commitment remains',
    'Cover lasts at most ten minutes',
    'customer commitment progress is shown above',
    'shift history remain recorded',
    'once everyone consents again',
    'without ranking people',
    'The next shift links one',
    'illustrative credits',
    'Choose a charter for the fresh exercise',
    'Choose a mode, seed or season',
  ],
  'pt-BR': [
    'Somente funções sintéticas',
    'Propostas dos trabalhadores, testes delimitados',
    'O experimento de passagem de turno: propostas',
    'três turnos, obrigações compartilhadas',
    'Pedido de sexta-feira: cumpra',
    'Experimente uma melhoria conduzida',
    'As verificações da função de conselheiro',
    'precisa corrigir a recomendação anterior',
    'Revise o turno, entregue a recuperação devida',
    'Tentar a exigência pausa a ativação',
    'Uma oferta recusada pode levar',
    'Alternativas: compare as quatro respostas',
    'A expedição continua incerta até chegarem',
    'são contas ilustrativas',
    'Sempre ativos: paradas seguras',
    'Mude a distribuição das decisões',
    'Votos sobre a política e consentimento',
    'Oficina manual: registre',
    'Cada função age na sua própria vez',
    'As respostas simuladas pertencem',
    'Responda explicitamente às verificações',
    'O compartilhamento opcional de preferências',
    'Registra apenas o ensaio local',
    'A execução exige esta aprovação',
    'Pedidos públicos, contestações',
    'limitado a 120 eventos',
    'A recuperação pendente é entregue',
    'As confirmações expiram na revisão',
    'A receita da temporada menos custos',
    'Três votos dos cooperados',
    'sob três estruturas de decisão',
    'Estas são previsões ilustrativas',
    'exercício avulso de 600 kg',
    'Previsões ilustrativas do modelo',
    'Somente download local',
    'Mudar o plano apaga o acordo',
    'Créditos ilustrativos do local de trabalho',
    'Mentes de IA têm voz',
    'As sobras compartilhadas fazem parte',
    'Reiniciar apaga a discussão',
    'Nenhum movimento na planta',
    'Nada foi enviado',
    'Cenário sintético exportado',
    'O compromisso integral com o cliente continua valendo',
    'A cobertura dura no máximo dez minutos',
    'o progresso do compromisso com o cliente aparece acima',
    'histórico do turno continuam registrados',
    'quando todos consentirem de novo',
    'sem classificar pessoas',
    'O próximo turno vincula um',
    'créditos ilustrativos',
    'Escolha um estatuto para o novo exercício',
    'Escolha um modo, uma semente',
  ],
};

// These fragments also live in other components' catalogues (negotiation,
// archive, replay, the campaign prompts), which this lab renders; the
// catalogue check below covers them here.
const SHARED = new Set([
  'Dispatch remains uncertain until quality-qualified',
  'A expedição continua incerta até chegarem',
  'The full customer commitment remains',
  'O compromisso integral com o cliente continua valendo',
  'The next shift links one',
  'O próximo turno vincula um',
  'illustrative credits',
  'créditos ilustrativos',
  'Illustrative workplace credits',
  'Créditos ilustrativos do local de trabalho',
  'once everyone consents again',
  'quando todos consentirem de novo',
]);

const LOCALES: Locale[] = ['en', 'pt-BR'];

const catalogueText = (locale: Locale) =>
  Object.values(workplaceLabMessages[locale])
    .filter((value): value is string => typeof value === 'string')
    .join('\n');

/** Every section of the lab, with the management comparison opened. */
const visitAllSections = () => {
  let text = '';
  const nav = screen.getByLabelText(translate(workplaceLabMessages, 'sectionsLabel'));
  const names = within(nav)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
  for (const name of names) {
    fireEvent.click(within(nav).getByRole('button', { name }));
    const compare = screen.queryByRole('button', {
      name: translate(workplaceLabMessages, 'compareApproaches'),
    });
    if (compare) fireEvent.click(compare);
    text += document.body.textContent ?? '';
  }
  return text;
};

describe('D14: the workplace laboratory carries no helper text', () => {
  it.each(LOCALES)('has no helper or disclaimer copy in its %s catalogue', (locale) => {
    const text = catalogueText(locale);
    expect(CUT[locale].filter((fragment) => text.includes(fragment))).toEqual([]);
  });

  it.each(LOCALES)('renders none of it in a %s workshop', (locale) => {
    setLocale(locale);
    expect(useWorkplaceStore.getState().start('workshop', 17).changed).toBe(true);
    render(<WorkplaceLab />);
    const text = visitAllSections();
    const found = CUT[locale].filter((f) => !SHARED.has(f) && text.includes(f));
    expect(found).toEqual([]);
    // What shows instead: every section's own controls and the plans' titles (review 2).
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    expect(text).toContain(WORKPLACE_PLANS[0].title);
  });

  it.each(LOCALES)('renders none of it in a %s third season shift, turn by turn', (locale) => {
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startCampaign('team', 17).changed).toBe(true);
    const state = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      participationMode: 'separate-turns',
      turn: null,
      workplace: { ...state, campaign: { ...state.campaign!, shift: 2 } },
    });
    setLocale(locale);
    render(<WorkplaceLab />);
    const text = visitAllSections();
    const found = CUT[locale].filter((f) => !SHARED.has(f) && text.includes(f));
    expect(found).toEqual([]);
    expect(text).toContain(WORKPLACE_PLANS[0].title);
  });
});

describe('D14: a held Continue says why, at the control', () => {
  const reviewWith = (patch: 'recovery' | 'objection') => {
    fulfilFirstDelivery();
    const store = useWorkplaceStore.getState();
    expect(store.startCampaign('toe-dip', 17).changed).toBe(true);
    const state = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'review',
        members:
          patch === 'recovery'
            ? state.members.map((m, i) => (i === 0 ? { ...m, recoveryOwedMinutes: 5 } : m))
            : state.members,
        objections:
          patch === 'objection'
            ? [
                {
                  id: 'held-objection',
                  actorId: state.members[0].id,
                  kind: 'rest',
                  statement: 'held',
                  status: 'open',
                  resolution: null,
                },
              ]
            : state.objections,
      },
    });
  };
  const openReview = () => {
    const tools = screen.queryByText(/Facilitator tools|Ferramentas/)?.closest('details');
    if (tools) tools.open = true;
    const nav = screen.getByLabelText(translate(workplaceLabMessages, 'sectionsLabel'));
    fireEvent.click(
      within(nav).getByRole('button', {
        name: translate(workplaceLabMessages, 'sectionLabel', { section: 'Review' }),
      })
    );
  };

  it('names owed recovery in English and Portuguese', () => {
    reviewWith('recovery');
    render(<WorkplaceLab />);
    openReview();
    const next = screen.getByRole('button', { name: 'Continue to next campaign shift' });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription('Held until owed recovery is delivered.');
    act(() => setLocale('pt-BR'));
    expect(
      screen.getByRole('button', { name: 'Continuar para o próximo turno da campanha' })
    ).toHaveAccessibleDescription('Aguarda a entrega da recuperação devida.');
  });

  it('names an open objection', () => {
    reviewWith('objection');
    render(<WorkplaceLab />);
    openReview();
    const next = screen.getByRole('button', { name: 'Continue to next campaign shift' });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription('Held until each open objection is resolved.');
  });
});
