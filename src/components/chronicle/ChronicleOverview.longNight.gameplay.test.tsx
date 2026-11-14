import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { ChronicleEventHost } from './ChronicleEventHost';
import { PlansTab } from './PlansTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import {
  INCIDENT_DEFINITIONS,
  useOperationsCampaignStore,
} from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';
import { FRONT_HOLD_THRESHOLD, LONG_NIGHT_EVENT_ID } from '../../chronicle/longNight';
import { setLocale } from '../../i18n';

// Report 08, F1 and P1: the long night was scored on preparation the player
// could not see until the telegraph at shift 52, after every errand had gone.
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function at(shift: number, charter = DEFAULT_CHARTER): ChronicleState {
  const signed = signCharter(createInitialState(), charter, 7, baseline).state;
  return { ...signed, shift };
}

const sandbox = () => ({ ...DEFAULT_CHARTER, mode: 'sandbox' as const });

describe('The long night from the first errand', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({
      chronicle: createInitialState(),
      quiz: null,
      deferredPrompts: [],
    });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('shows the card at shift 3 with what counts and the threshold', () => {
    render(<ChronicleOverview state={at(3)} />);
    const card = screen.getByRole('region', { name: 'The long night' });
    expect(within(card).getByText('In 51 shifts')).toBeInTheDocument();
    // What counts, before any of it is met: the errands, the plans, the organisations.
    expect(within(card).getByText('Rebuilt the culvert under the yard')).toBeInTheDocument();
    expect(within(card).getByText('Surveyed the roller-floor switchgear')).toBeInTheDocument();
    expect(
      within(card).getByText(/Yard drainage works or grain dryer installed/)
    ).toBeInTheDocument();
    expect(within(card).getAllByText(`0 / ${FRONT_HOLD_THRESHOLD}`)).toHaveLength(2);
    // What each front costs if it falls, from the incident the engine raises.
    const sag = INCIDENT_DEFINITIONS.power_sag;
    expect(card).toHaveTextContent(
      `${sag.title.toLowerCase()}, production x${sag.effect.productionMultiplier}`
    );
  });

  it('does not show it before the first errand', () => {
    render(<ChronicleOverview state={at(2)} />);
    expect(screen.queryByRole('region', { name: 'The long night' })).toBeNull();
  });

  it('does not show it in a sandbox, which has no long night', () => {
    render(<ChronicleOverview state={at(30, sandbox())} />);
    expect(screen.queryByRole('region', { name: 'The long night' })).toBeNull();
  });

  it('marks the four plans that prepare for it, and only those', () => {
    const state = at(3);
    render(<PlansTab state={state} />);
    for (const label of ['Yard drainage works', 'Grain dryer'])
      expect(screen.getByRole('article', { name: label })).toHaveTextContent(
        'prepares the intake and grain stores for the long night'
      );
    for (const label of ['Standby generator', 'Vibration monitoring'])
      expect(screen.getByRole('article', { name: label })).toHaveTextContent(
        'prepares the roller floor for the long night'
      );
    expect(screen.getAllByText(/for the long night/)).toHaveLength(4);
  });

  it('puts the falling front’s incident and production cost on the shift-54 buttons', () => {
    const state: ChronicleState = {
      ...at(54),
      longNightTelegraphed: true,
      pendingEvents: [
        {
          instanceId: 'event-night',
          eventId: LONG_NIGHT_EVENT_ID,
          appearedShift: 54,
          lapsesShift: 56,
        },
      ],
    };
    act(() => useChronicleStore.setState({ chronicle: state }));
    render(<ChronicleEventHost />);
    const dialog = screen.getByRole('dialog');
    const sag = INCIDENT_DEFINITIONS.power_sag;
    const rain = INCIDENT_DEFINITIONS.severe_rain;
    // Holding the intake leaves the unprepared roller floor to fall, and the reverse.
    expect(
      within(dialog).getByRole('button', { name: /^Hold the intake and grain stores/ })
    ).toHaveTextContent(
      `raises ${sag.title.toLowerCase()}, production x${sag.effect.productionMultiplier}`
    );
    expect(
      within(dialog).getByRole('button', { name: /^Hold the roller floor/ })
    ).toHaveTextContent(
      `raises ${rain.title.toLowerCase()}, production x${rain.effect.productionMultiplier}`
    );
  });

  it('says the stake in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<ChronicleOverview state={at(3)} />);
    const card = screen.getByRole('region', { name: 'A longa noite' });
    expect(card).toHaveTextContent('produção x0,45');
  });
});
