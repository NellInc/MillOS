import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';
import { setLocale } from '../../i18n';

// Report 08, F8 and P5: nothing answered "what needs me now". Decisions sat
// below seven other sections, and countdowns, the open proposal and drifting
// organisations lived on other tabs or nowhere.
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function midGame(): ChronicleState {
  const base = signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
  return {
    ...base,
    shift: 30,
    pendingEvents: [
      {
        instanceId: 'event-needs-1',
        eventId: 'evt-inspector-visit',
        appearedShift: 30,
        lapsesShift: 32,
      },
    ],
    stakeholders: base.stakeholders.map((s) =>
      s.id === 'haulier' ? { ...s, value: 36 } : s.id === 'growers' ? { ...s, value: 50 } : s
    ),
    governance: {
      ...base.governance,
      policies: { ...base.governance.policies, stock: 0 },
      countdowns: [{ id: 'countdown-1', party: 'village', ladder: 'stock', rung: 0, dueShift: 32 }],
      proposal: { ladder: 'orders', from: 1, to: 2, proposedShift: 30, concessions: [] },
    },
  };
}

/** Every run of digits a reader sees, a decimal counting once. */
const numbers = (text: string) => text.match(/\d+(?:[.,]\d+)*/g) ?? [];

describe('Needs you, at the top of the overview', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('puts a countdown, the open proposal and a cooling organisation on the overview', () => {
    const { container } = render(<ChronicleOverview state={midGame()} />);
    const needs = screen.getByRole('region', { name: 'Needs you' });
    // It is the first thing on the overview.
    expect(container.querySelector('section')).toBe(needs);
    expect(needs).toHaveTextContent('Village committee: 2 shifts unless stock moves off lean');
    expect(needs).toHaveTextContent('Order book: mixed to contract');
    expect(needs).toHaveTextContent('Valley Haulage: nearly cool');
    // An organisation five or more from cool is not listed.
    expect(needs).not.toHaveTextContent('cooperative: nearly cool');
    expect(within(needs).getByRole('region', { name: 'Awaiting a decision' })).toBeInTheDocument();
  });

  it('keeps fewer than 15 numbers above the fold with every kind of need present', () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    const state: ChronicleState = {
      ...midGame(),
      fire: { active: true, suppressing: false, resolveAtMinute: null },
      upkeepShortfall: 40,
      ownedIncidents: [{ incidentId: incident!.id, kind: 'dust_filter_pressure', raisedShift: 29 }],
    };
    render(<ChronicleOverview state={state} />);
    // jsdom lays nothing out, so the fold is structural: the list, then the status.
    const fold = ['Needs you', 'Chronicle status']
      .map((name) => screen.getByRole('region', { name }).textContent ?? '')
      .join(' ');
    for (const kind of ['Duct fire', 'Lack of material', 'Incidents raised by the chronicle'])
      expect(
        within(screen.getByRole('region', { name: 'Needs you' })).getByRole('region', {
          name: kind,
        })
      ).toBeInTheDocument();
    expect(numbers(fold).length).toBeLessThan(15);
  });

  it('shows nothing to do when nothing needs the player', () => {
    const base = signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
    render(<ChronicleOverview state={base} />);
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
    // The desks of attention were cut (D10).
    expect(screen.queryByRole('region', { name: 'Desks' })).toBeNull();
  });

  it('lists the needs in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<ChronicleOverview state={midGame()} />);
    const needs = screen.getByRole('region', { name: 'Precisa de você' });
    expect(needs).toHaveTextContent('2 turnos, a menos que estoque saia de enxuto');
    expect(needs).toHaveTextContent('quase fria');
  });
});
