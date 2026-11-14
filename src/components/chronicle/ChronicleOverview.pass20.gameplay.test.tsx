import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { ChronicleEventHost } from './ChronicleEventHost';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';
import { LONG_NIGHT_EVENT_ID } from '../../chronicle/longNight';
import { setLocale } from '../../i18n';

// Spreading the standby cover prepares each front by half a point, so the long
// night's preparation is fractional; a Portuguese player reads it with a comma.
describe('Long-night preparation in Brazilian Portuguese', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({
      chronicle: createInitialState(),
      quiz: null,
      deferredPrompts: [],
    });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  const spreadCover = (pending: boolean): ChronicleState => ({
    ...useChronicleStore.getState().chronicle,
    shift: 53,
    longNightTelegraphed: true,
    marks: {
      'cover-thin': {
        id: 'cover-thin',
        shift: 3,
        eventId: 'evt-standby-cover',
        choiceId: 'thin',
        actor: 'player',
      },
      'culvert-rebuilt': {
        id: 'culvert-rebuilt',
        shift: 17,
        eventId: 'evt-culvert-mason',
        choiceId: 'rebuild',
        actor: 'player',
      },
    },
    pendingEvents: pending
      ? [
          {
            instanceId: 'event-pass20',
            eventId: LONG_NIGHT_EVENT_ID,
            appearedShift: 53,
            lapsesShift: 55,
          },
        ]
      : [],
  });

  it('prints the card’s fractional preparation and weights with a decimal comma', () => {
    setLocale('pt-BR');
    render(<ChronicleOverview state={spreadCover(false)} />);
    // Intake: culvert 1 + spread cover 0.5.
    expect(screen.getByText('1,5 / 2')).toBeInTheDocument();
    expect(screen.queryByText('1.5 / 2')).toBeNull();
    expect(screen.getAllByText(/\(0,5\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\(0\.5\)/)).toBeNull();
  });

  it('prints the dialog’s fractional preparation with a decimal comma', () => {
    setLocale('pt-BR');
    act(() => useChronicleStore.setState({ chronicle: spreadCover(true) }));
    render(<ChronicleEventHost />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('(1,5 preparados, 2 necessários)');
    expect(dialog).not.toHaveTextContent('1.5');
  });

  // Seen in a capture of the shift-54 dialog: a front past its threshold read
  // "the roller floor will hold (3 of 2 prepared)". It names both counts.
  it('words a front past its threshold as prepared and needed', () => {
    act(() => useChronicleStore.setState({ chronicle: spreadCover(true) }));
    render(<ChronicleEventHost />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('(1.5 prepared, 2 needed)');
    expect(dialog).not.toHaveTextContent(/of 2 prepared/);
  });
});
