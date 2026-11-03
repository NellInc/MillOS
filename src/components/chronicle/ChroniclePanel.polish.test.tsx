import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChroniclePanel } from './ChroniclePanel';
import { ChronicleEventHost } from './ChronicleEventHost';
import { ChronicleOverview } from './ChronicleOverview';
import { PartnersTab } from './PartnersTab';
import { NotesTab } from './NotesTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { CHRONICLE_SHIFTS } from '../../chronicle/cropYears';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';
import { HISTORY_NOTES } from '../../chronicle/history';
import { LONG_NIGHT_SHIFT } from '../../chronicle/longNight';

function sign(seed = 4): void {
  act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, seed));
}

function chronicle(): ChronicleState {
  return useChronicleStore.getState().chronicle;
}

describe('Chronicle workspace polish', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });

  it('offers no maintenance policy, training or delegation once the chronicle has ended', () => {
    sign();
    const ended: ChronicleState = {
      ...chronicle(),
      status: 'ended',
      shift: CHRONICLE_SHIFTS,
      trainingOffered: true,
    };
    const { unmount } = render(<ChronicleOverview state={ended} />);
    expect(screen.queryByRole('button', { name: /Enable: costs -25%/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Conserve resources/ })).toBeDisabled();
    unmount();
    render(<PartnersTab state={ended} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });

  it('shows no upkeep due or next era to work toward once the chronicle has ended', () => {
    sign();
    const ended: ChronicleState = { ...chronicle(), status: 'ended', shift: CHRONICLE_SHIFTS };
    render(<ChronicleOverview state={ended} />);
    expect(screen.queryByText(/^Upkeep/)).toBeNull();
    expect(screen.queryByRole('region', { name: /^Next era/ })).toBeNull();
  });

  it('returns focus to the Chronicle tabs when the decision it opened from is gone', () => {
    sign();
    const pending = [
      {
        instanceId: 'event-9',
        eventId: 'evt-millwrights-workshop',
        appearedShift: 0,
        lapsesShift: 3,
      },
    ];
    act(() =>
      useChronicleStore.setState({ chronicle: { ...chronicle(), pendingEvents: pending } })
    );
    render(
      <>
        <ChronicleEventHost />
        <ChroniclePanel />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Think it over' }));
    const decide = screen.getByRole('button', { name: /^Decide: / });
    decide.focus();
    fireEvent.click(decide);
    expect(screen.getByRole('dialog', { name: 'The travelling millwrights' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Take their notes only/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Chronicle/ }));
  });

  it('says the long night waits, not "In 0 shifts", while a challenge holds it back', () => {
    sign();
    const waiting: ChronicleState = {
      ...chronicle(),
      shift: LONG_NIGHT_SHIFT,
      longNightTelegraphed: true,
    };
    render(<ChronicleOverview state={waiting} />);
    expect(screen.queryByText(/In 0 shifts/)).toBeNull();
  });

  it('opens a new chronicle’s first decision even if its id was deferred in the last one', () => {
    sign();
    const pending = [
      {
        instanceId: 'event-9',
        eventId: 'evt-millwrights-workshop',
        appearedShift: 0,
        lapsesShift: 3,
      },
    ];
    act(() =>
      useChronicleStore.setState({ chronicle: { ...chronicle(), pendingEvents: pending } })
    );
    render(<ChronicleEventHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Think it over' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useChronicleStore.getState().abandon());
    sign(5);
    act(() =>
      useChronicleStore.setState({ chronicle: { ...chronicle(), pendingEvents: pending } })
    );
    expect(screen.getByRole('dialog', { name: 'The travelling millwrights' })).toBeInTheDocument();
  });

  it('keeps keyboard focus on the quiz as each answer and question replaces the last', () => {
    sign();
    act(() =>
      useChronicleStore.setState({
        chronicle: { ...chronicle(), unlockedNotes: HISTORY_NOTES.slice(0, 3).map((n) => n.id) },
      })
    );
    render(<NotesTab state={chronicle()} />);
    const start = screen.getByRole('button', { name: 'Start the quiz' });
    start.focus();
    fireEvent.click(start);
    const first = screen.getByText(/Question 1 \//).closest('section')!;
    expect(first.contains(document.activeElement)).toBe(true);
    const option = document.activeElement as HTMLButtonElement;
    fireEvent.click(option);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.click(document.activeElement!);
    const second = screen.getByText(/Question 2 \//).closest('section')!;
    expect(second.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('deals a fresh question order after the Notes tab is left and reopened', () => {
    sign();
    act(() =>
      useChronicleStore.setState({
        chronicle: { ...chronicle(), unlockedNotes: HISTORY_NOTES.slice(0, 8).map((n) => n.id) },
      })
    );
    const first = render(<NotesTab state={chronicle()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    const round1 = useChronicleStore.getState().quiz!.questionIds;
    first.unmount();
    act(() => useChronicleStore.setState({ quiz: null }));
    render(<NotesTab state={chronicle()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    expect(useChronicleStore.getState().quiz!.questionIds).not.toEqual(round1);
  });

  it('keeps focus in the workspace when a paid action replaces its own button', () => {
    sign();
    act(() =>
      useChronicleStore.setState({
        chronicle: {
          ...chronicle(),
          forecasts: [
            {
              id: 'forecast-f',
              kind: 'severe_rain',
              issuedShift: 0,
              dueShift: 2,
              chance: 0.5,
              mitigated: false,
              mitigatedBy: null,
              paidFund: 0,
              status: 'pending',
            },
          ],
        },
      })
    );
    render(<ChroniclePanel />);
    const mitigate = screen.getByRole('button', { name: /Clear the drains/ });
    mitigate.focus();
    fireEvent.click(mitigate);
    expect(screen.getByText(/Clear the drains: done/)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('tabpanel'));
  });

  it('moves focus to the confirmation and back when abandoning is asked and declined', () => {
    sign();
    render(<ChroniclePanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Score/ }));
    const abandon = screen.getByRole('button', { name: 'Abandon this chronicle' });
    abandon.focus();
    fireEvent.click(abandon);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(document.activeElement!);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Abandon this chronicle' })
    );
  });

  it('opens a newly signed chronicle on its overview with focus on it, even after abandoning from Score', () => {
    sign();
    render(<ChroniclePanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Score/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon this chronicle' }));
    const yes = screen.getByRole('button', { name: 'Yes, abandon it' });
    yes.focus();
    fireEvent.click(yes);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /Cooperative growers/ }));
    const signButton = screen.getByRole('button', { name: /Sign the charter/ });
    signButton.focus();
    fireEvent.click(signButton);
    const overview = screen.getByRole('tab', { name: /Chronicle/ });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(overview);
  });
});
