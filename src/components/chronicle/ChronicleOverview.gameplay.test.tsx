import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { PlansTab } from './PlansTab';
import { LedgerTab } from './LedgerTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import {
  createInitialState,
  knowHowOf,
  signCharter,
  type ChronicleState,
} from '../../chronicle/engine';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(): ChronicleState {
  return signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
}

describe('Chronicle overview numbers a player acts on', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });
  afterEach(() => cleanup());

  // Know-how the AI partner earns comes in halves (a 5 know-how workshop is 2.5).
  // Rounded for display, 7.5 read as 8 beside an 8 know-how plan the player
  // could not draw up.
  it('shows a fractional know-how balance as it is, not rounded up past a price', () => {
    const base = signed();
    const state: ChronicleState = {
      ...base,
      ledger: { ...base.ledger, knowHow: { ...base.ledger.knowHow, events: 7.5 } },
    };
    expect(knowHowOf(state)).toBe(7.5);
    const { unmount } = render(<ChronicleOverview state={state} />);
    const status = screen.getByRole('region', { name: 'Chronicle status' });
    expect(within(status).getByText('7.5')).toBeInTheDocument();
    expect(within(status).queryByText('8')).toBeNull();
    unmount();

    render(<PlansTab state={state} />);
    const draw = screen.getAllByRole('button', { name: /Draw up the plan/ })[0];
    expect(draw).toBeDisabled();
    cleanup();

    render(<LedgerTab state={state} />);
    const knowHow = screen.getByRole('region', { name: 'Know-how' });
    expect(within(knowHow).getByText('7.5', { selector: 'td.font-semibold' })).toBeInTheDocument();
  });

  // The record keeps the title in the language it was raised in; the card
  // names the incident the way the operations card does now.
  it('names a chronicle-raised incident in the language active now', () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    expect(incident).not.toBeNull();
    act(() =>
      useOperationsCampaignStore.setState((s) => ({
        incidents: s.incidents.map((i) =>
          i.id === incident!.id ? { ...i, title: 'Pressão diferencial do filtro de pó' } : i
        ),
      }))
    );
    const base = signed();
    const state: ChronicleState = {
      ...base,
      ownedIncidents: [{ incidentId: incident!.id, kind: 'dust_filter_pressure', raisedShift: 0 }],
    };
    render(<ChronicleOverview state={state} />);
    const card = screen.getByRole('region', { name: 'Incidents raised by the chronicle' });
    expect(within(card).getByText(/Dust filter differential pressure/)).toBeInTheDocument();
    expect(within(card).queryByText(/Pressão/)).toBeNull();
  });

  // Each Decide opens a different decision, yet every one was named "Decide",
  // so a screen-reader list of the workspace's buttons could not tell them apart.
  it('names each Decide button after the decision it opens', () => {
    const base = signed();
    const pending = (eventId: string, n: number) => ({
      instanceId: `event-test-${n}`,
      eventId,
      appearedShift: base.shift,
      lapsesShift: base.shift + 2,
    });
    const state: ChronicleState = {
      ...base,
      pendingEvents: [pending('evt-inspector-visit', 1), pending('evt-off-peak-tariff', 2)],
    };
    render(<ChronicleOverview state={state} />);
    const names = screen
      .getAllByRole('button', { name: /^Decide/ })
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(screen.getByRole('button', { name: 'Decide: The food-safety inspector' })).toBeVisible();
  });

  // Acknowledge and Apply mitigation here are the player's choices, yet they
  // were logged as the controller's, so the shift review never counted them.
  // Working if both reach the logbook as operator actions.
  it("logs the player's acknowledge and mitigation as operator actions", () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    expect(incident).not.toBeNull();
    const base = signed();
    const state: ChronicleState = {
      ...base,
      ownedIncidents: [{ incidentId: incident!.id, kind: 'dust_filter_pressure', raisedShift: 0 }],
    };
    const { rerender } = render(<ChronicleOverview state={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    rerender(<ChronicleOverview state={{ ...state }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply mitigation' }));
    const actors = useOperationsCampaignStore
      .getState()
      .logbook.filter((entry) => entry.relatedId === incident!.id && entry.category === 'operation')
      .map((entry) => entry.actor)
      .filter((actor) => actor !== undefined);
    expect(actors.length).toBeGreaterThanOrEqual(2);
    expect(actors).not.toContain('controller');
  });
});
