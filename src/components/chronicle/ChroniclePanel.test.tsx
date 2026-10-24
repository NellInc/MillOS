import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChroniclePanel } from './ChroniclePanel';
import { ChronicleEventHost } from './ChronicleEventHost';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { createInitialState } from '../../chronicle/engine';
import { EVENT_DECK } from '../../chronicle/eventDeck';

describe('Mill Chronicle workspace', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
  });

  it('offers the charter until it is signed, then the chronicle tabs', () => {
    render(<ChroniclePanel />);
    expect(screen.getByRole('radio', { name: /Cooperative growers/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Hard fortune/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sign the charter \(score \+3\)/ }));
    expect(useChronicleStore.getState().chronicle.charter?.fortune).toBe('hard');
    expect(screen.getByRole('tab', { name: /Chronicle/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Village mill')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Plans/ }));
    expect(screen.getByRole('article', { name: 'Grain moisture meters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Notes/ }));
    expect(screen.getByText(/Lineage notes 1 \//)).toBeInTheDocument();
  });

  it('puts the price on each event choice and greys out what the fund cannot cover', () => {
    act(() =>
      useChronicleStore.getState().sign(
        {
          grain: 'cooperative',
          plant: 'overhauled',
          customers: 'loyal',
          fortune: 'kind',
          mode: 'historical',
        },
        4
      )
    );
    const event = EVENT_DECK.find((e) => e.choices.some((c) => (c.cost?.fund ?? 0) > 0))!;
    const costly = event.choices.find((c) => (c.cost?.fund ?? 0) > 0)!;
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          ledger: { ...s.chronicle.ledger, fund: { ...s.chronicle.ledger.fund, charter: 0 } },
          pendingEvents: [
            { instanceId: 'event-x', eventId: event.id, appearedShift: 0, lapsesShift: 3 },
          ],
        },
      }))
    );
    render(<ChronicleEventHost />);
    expect(screen.getByRole('dialog', { name: event.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(costly.label) })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Think it over' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useChronicleStore.getState().chronicle.pendingEvents).toHaveLength(1);
  });

  it('never leaves a duct fire without a way out', () => {
    act(() =>
      useChronicleStore.getState().sign(
        {
          grain: 'cooperative',
          plant: 'overhauled',
          customers: 'loyal',
          fortune: 'kind',
          mode: 'historical',
        },
        4
      )
    );
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          ledger: { ...s.chronicle.ledger, fund: { ...s.chronicle.ledger.fund, charter: 0 } },
          fire: { active: true, suppressing: false, resolveAtMinute: null },
        },
      }))
    );
    render(<ChronicleEventHost />);
    expect(screen.getByRole('button', { name: /Suppress and clean/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Clean by hand/ }));
    expect(useChronicleStore.getState().chronicle.fire.suppressing).toBe(true);
  });

  it('opens nothing but the fire unasked while a facility stop holds', () => {
    act(() =>
      useChronicleStore.getState().sign(
        {
          grain: 'cooperative',
          plant: 'overhauled',
          customers: 'loyal',
          fortune: 'kind',
          mode: 'historical',
        },
        4
      )
    );
    const event = EVENT_DECK[0];
    act(() => {
      useGameSimulationStore.setState({ emergencyActive: true });
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          pendingEvents: [
            { instanceId: 'event-x', eventId: event.id, appearedShift: 0, lapsesShift: 3 },
          ],
        },
      }));
    });
    try {
      render(<ChronicleEventHost />);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(useChronicleStore.getState().dialogOpen).toBe(false);
      act(() =>
        useChronicleStore.setState((s) => ({
          chronicle: {
            ...s.chronicle,
            fire: { active: true, suppressing: false, resolveAtMinute: null },
          },
        }))
      );
      expect(screen.getByRole('dialog', { name: /Smouldering dust/ })).toBeInTheDocument();
      expect(useChronicleStore.getState().dialogOpen).toBe(true);
      act(() => {
        useGameSimulationStore.setState({ emergencyActive: false });
        useChronicleStore.setState((s) => ({
          chronicle: { ...s.chronicle, fire: { ...s.chronicle.fire, active: false } },
        }));
      });
      expect(screen.getByRole('dialog', { name: event.title })).toBeInTheDocument();
      // A forklift-only hold leaves the mill running, so decisions still open.
      act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
      expect(screen.getByRole('dialog', { name: event.title })).toBeInTheDocument();
    } finally {
      act(() => {
        useGameSimulationStore.setState({ emergencyActive: false });
        useSafetyStore.getState().setForkliftEmergencyStop(false);
      });
    }
  });
});
