import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceCompanion } from './WorkplaceCompanion';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { campaignRecord } from '../../../simulation/workplaceCampaign';
import { setLocale } from '../../../i18n';

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// D14: a state line keeps its first clause; the disclaimers live in About.
const CUT = {
  en: [
    'Missing plant evidence remains',
    'Actual receipts remain separate',
    'Earned pay and recovery remain owed',
    'Refusal remains available',
    'Only its raiser can confirm',
    'still part of the full commitment',
  ],
  'pt-BR': [
    'A evidência ausente da planta',
    'Os comprovantes reais continuam',
    'A remuneração conquistada e a recuperação continuam',
    'A recusa continua disponível',
    'Somente quem a levantou',
    'ainda parte do compromisso total',
  ],
} as const;

const COPY = {
  en: {
    review: 'Future authority has ended.',
    credits: '8.00 credits.',
    objection: /^\S+: open objection\.$/,
    deferral: '200 kg.',
  },
  'pt-BR': {
    review: 'A autoridade futura terminou.',
    credits: '8,00 créditos.',
    objection: /^\S+: objeção aberta\.$/,
    deferral: '200 kg.',
  },
} as const;

const text = () => document.body.textContent ?? '';
const show = () => render(<WorkplaceCompanion onOpen={vi.fn()} />);

describe('the agreement companion carries values, not captions', () => {
  it.each(['en', 'pt-BR'] as const)('review: state and credits only, in %s', (locale) => {
    setLocale(locale);
    useWorkplaceStore.getState().startCampaign('team', 19);
    const state = useWorkplaceStore.getState().workplace;
    const past = campaignRecord({
      ...state,
      members: state.members.map((m) => ({
        ...m,
        compensationPaid: m.id === 'packing' ? 8 : 0,
      })),
    });
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'review',
        campaign: { ...state.campaign!, shift: 1, history: [past] },
      },
    });
    show();
    expect(screen.getByText(COPY[locale].review, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(COPY[locale].credits, { exact: true })).toBeInTheDocument();
    for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
  });

  it.each(['en', 'pt-BR'] as const)('an open objection names its raiser, in %s', (locale) => {
    setLocale(locale);
    useWorkplaceStore.getState().start('game', 19);
    useWorkplaceStore.getState().object('packing', 'authority');
    show();
    expect(screen.getByText(COPY[locale].objection)).toBeInTheDocument();
    for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
  });

  it.each(['en', 'pt-BR'] as const)('a deferral is its weight, in %s', (locale) => {
    setLocale(locale);
    useWorkplaceStore.getState().startCampaign('cooperative', 19);
    const s = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: {
        ...s,
        campaign: {
          ...s.campaign!,
          mission: {
            orderId: 'o',
            customer: 'Customer',
            materialSessionId: 'session',
            startingShippedKg: 0,
            originalTargetKg: 1000,
            targetKg: 800,
            observedShippedKg: 600,
            creditedKg: 600,
            manifestIds: ['real'],
            evidence: 'current',
          },
        },
      },
    });
    show();
    const deferral = screen.getByText(
      locale === 'en' ? 'Agreed deferral:' : 'Adiamento acordado:'
    ).nextElementSibling;
    expect(deferral).toHaveTextContent(new RegExp(`^${COPY[locale].deferral}$`));
    for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
  });
});
