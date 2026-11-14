import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { setLocale } from '../../../i18n';
import {
  WorkplaceAutomaticDemo,
  WorkplaceAutoplayStatus,
  WorkplaceDemonstration,
  WorkplaceFairness,
  WorkplaceParticipation,
  WorkplaceSeasonEntry,
} from './WorkplaceParticipation';
import { workplaceParticipationMessages } from './WorkplaceParticipation.messages';

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  useWorkplaceAutoplay.setState({ manual: false, message: null, messageKey: null });
  endReplayClock();
  useUIStore.setState({ hasSeenIntro: true, journeyVisible: false });
  useAnnouncementsStore.getState().setContext({ onboarding: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  cleanup();
  setLocale('en');
  vi.useRealTimers();
  delete document.documentElement.dataset.millosStartupReady;
});

// D14: the owner's rule cuts helper text; the disclaimers live in About.
const CUT = {
  en: [
    'Shared-device synthetic rehearsal',
    'Changed terms end the turn',
    'Confirming understanding remains',
    'Hand the device over',
    'Friday: agree an urgent delivery',
    'Keep this degree of adoption',
    'Requires an open, qualified',
    'Illustrative credits and modeled minutes',
    'About ten minutes of discussion',
    'Automatic solo demonstration',
    'runs autonomously by default',
    'You can let fictional solo roles',
    "making this season's decisions",
  ],
  'pt-BR': [
    'Ensaio sintético',
    'Termos alterados encerram a vez',
    'Confirmar o entendimento continua',
    'Passe o dispositivo',
    'Sexta-feira: combine',
    'Mantenha esse grau de adoção',
    'Exige um compromisso com o cliente',
    'Créditos ilustrativos e minutos modelados',
    'Cerca de dez minutos de conversa',
    'Demonstração individual automática',
    'roda de forma autônoma por padrão',
    'Você pode deixar funções individuais',
    'Funções cooperativas fictícias tomam',
  ],
} as const;

const REMOVED_KEYS = [
  'rehearsalNotice',
  'handOverNote',
  'seasonIntro',
  'adoptionNote',
  'seasonRequires',
  'fairnessIntro',
  'guideIntro',
  'autoRunning',
  'autoIdle',
  'autoManual',
  'autonomousSeasonDetail',
];

const TRIMMED = {
  en: {
    turnOnly: /^Only \S+ may record this turn’s role decisions\.$/,
    checks: /^Mandate checks: 0 of 3 match the current agreement\.$/,
  },
  'pt-BR': {
    // The role name is set when the workplace is made (English here).
    turnOnly: /^Somente \S+ pode registrar as decisões de função desta vez\.$/,
    checks: /^Verificações do mandato: 0 de 3 conferem com o acordo atual\.$/,
  },
} as const;

const textOf = () => document.body.textContent ?? '';

describe('the cooperative participation surfaces carry no helper text', () => {
  it.each(['en', 'pt-BR'] as const)('the catalogue has no cut key in %s', (locale) => {
    for (const key of REMOVED_KEYS)
      expect(Object.keys(workplaceParticipationMessages[locale])).not.toContain(key);
  });

  it.each(['en', 'pt-BR'] as const)(
    'separate turns keep the turn holder and the check count, nothing more, in %s',
    (locale) => {
      setLocale(locale);
      const get = () => useWorkplaceStore.getState();
      get().setParticipationMode('separate-turns');
      get().start('workshop', 17);
      get().startTurn('packing');
      render(<WorkplaceParticipation report={() => {}} />);
      expect(screen.getByText(TRIMMED[locale].turnOnly)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(TRIMMED[locale].checks);
      act(() => {
        get().endTurn();
      });
      const text = textOf();
      for (const cut of CUT[locale]) expect(text).not.toContain(cut);
    }
  );

  it.each(['en', 'pt-BR'] as const)(
    'season entry, fairness, guide and automatic demo render no cut copy in %s',
    (locale) => {
      setLocale(locale);
      render(
        <>
          <WorkplaceSeasonEntry
            profile="toe-dip"
            setProfile={() => {}}
            report={() => {}}
            onStart={() => {}}
          />
          <WorkplaceFairness />
          <WorkplaceDemonstration navigate={() => {}} report={() => {}} />
          <WorkplaceAutomaticDemo profile="toe-dip" />
        </>
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: locale === 'en' ? 'Open ten-minute guide' : 'Abrir o guia de dez minutos',
        })
      );
      let text = textOf();
      for (const cut of CUT[locale]) expect(text).not.toContain(cut);
      // What shows instead: the season entry's own controls (review 2).
      expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
      // Manual, then running: neither state carries a caption.
      act(() => useWorkplaceAutoplay.setState({ manual: true }));
      act(() => useWorkplaceAutoplay.getState().start('toe-dip'));
      text = textOf();
      for (const cut of CUT[locale]) expect(text).not.toContain(cut);
    }
  );

  it.each([
    ['en', 'Take over cooperative season'],
    ['pt-BR', 'Assumir a temporada cooperativa'],
  ] as const)('the running-season notice is its name and its button in %s', (locale, name) => {
    vi.useFakeTimers();
    document.documentElement.dataset.millosStartupReady = 'true';
    setLocale(locale);
    render(<WorkplaceAutoplayStatus />);
    const takeover = screen.getByRole('button', { name });
    expect(takeover).not.toHaveAttribute('title');
    const text = textOf();
    for (const cut of CUT[locale]) expect(text).not.toContain(cut);
  });
});
