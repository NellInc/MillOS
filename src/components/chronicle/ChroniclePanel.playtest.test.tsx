import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ChroniclePanel } from './ChroniclePanel';
import { ChronicleEventHost } from './ChronicleEventHost';
import { ChronicleOverview } from './ChronicleOverview';
import { NotesTab } from './NotesTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import {
  createInitialState,
  FIRE_HAND_CLEAN_MINUTES,
  type ChronicleState,
} from '../../chronicle/engine';
import { HISTORY_NOTES } from '../../chronicle/history';

function sign(seed = 4): void {
  act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, seed));
}

function chronicle(): ChronicleState {
  return useChronicleStore.getState().chronicle;
}

function notesTab(): HTMLElement {
  return screen.getByRole('tab', { name: /^Notes/ });
}

describe('Chronicle workspace playtest', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });

  it('clears the Notes badge once the Notes tab is opened, without reading the notes for the player', () => {
    sign();
    const ids = HISTORY_NOTES.slice(0, 3).map((note) => note.id);
    act(() => useChronicleStore.setState({ chronicle: { ...chronicle(), unlockedNotes: ids } }));
    const knowHowBefore = chronicle().ledger.knowHow.notes;
    render(<ChroniclePanel />);
    expect(notesTab()).toHaveTextContent('Notes3');
    fireEvent.click(notesTab());
    expect(notesTab()).toHaveTextContent(/^Notes$/);
    // Opening the tab is not reading: no know-how, and each note is still marked new.
    expect(chronicle().readNotes).toEqual([]);
    expect(chronicle().ledger.knowHow.notes).toBe(knowHowBefore);
    expect(screen.getAllByText('new')).toHaveLength(3);
    // Leaving the tab keeps the badge cleared; a note unlocked later brings it back.
    fireEvent.click(screen.getByRole('tab', { name: /^Chronicle/ }));
    expect(notesTab()).toHaveTextContent(/^Notes$/);
    act(() =>
      useChronicleStore.setState({
        chronicle: { ...chronicle(), unlockedNotes: [...ids, HISTORY_NOTES[3].id] },
      })
    );
    expect(notesTab()).toHaveTextContent('Notes1');
  });

  it('keeps the Notes badge cleared across abandoning and signing anew', () => {
    sign();
    const ids = HISTORY_NOTES.slice(0, 2).map((note) => note.id);
    act(() => useChronicleStore.setState({ chronicle: { ...chronicle(), unlockedNotes: ids } }));
    render(<ChroniclePanel />);
    fireEvent.click(notesTab());
    act(() => useChronicleStore.getState().abandon());
    sign(5);
    expect(chronicle().unlockedNotes).toEqual(expect.arrayContaining(ids));
    const unseen = chronicle().unlockedNotes.filter((id) => !ids.includes(id)).length;
    expect(notesTab()).toHaveTextContent(unseen > 0 ? `Notes${unseen}` : /^Notes$/);
  });

  it('leaves a lineage note closed after the player closes it, when the chronicle next changes', () => {
    sign();
    const note = HISTORY_NOTES[0];
    act(() =>
      useChronicleStore.setState({ chronicle: { ...chronicle(), unlockedNotes: [note.id] } })
    );
    const view = render(<NotesTab state={chronicle()} />);
    const details = view.container.querySelector('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    view.rerender(<NotesTab state={chronicle()} />);
    expect(details.open).toBe(true);
    details.open = false;
    fireEvent(details, new Event('toggle'));
    // Any later change (a notice, a tick) re-renders the tab.
    act(() => useChronicleStore.setState({ chronicle: { ...chronicle(), sequence: 99 } }));
    view.rerender(<NotesTab state={chronicle()} />);
    expect(details.open).toBe(false);
  });

  it('does not call a duct being cleaned by hand a suppression', () => {
    sign();
    const state: ChronicleState = {
      ...chronicle(),
      fire: { active: true, suppressing: true, resolveAtMinute: FIRE_HAND_CLEAN_MINUTES },
    };
    render(<ChronicleOverview state={state} />);
    const section = screen.getByRole('region', { name: 'Duct fire' });
    expect(within(section).queryByText('Suppression under way')).toBeNull();
  });

  describe('keyboard flow', () => {
    it('moves selection and focus through the tabs with arrows, Home and End', () => {
      sign();
      render(<ChroniclePanel />);
      const overview = screen.getByRole('tab', { name: /^Chronicle/ });
      overview.focus();
      fireEvent.keyDown(overview, { key: 'ArrowRight' });
      const plans = screen.getByRole('tab', { name: 'Plans' });
      expect(plans).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(plans);
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', plans.id);
      fireEvent.keyDown(plans, { key: 'End' });
      const score = screen.getByRole('tab', { name: 'Score' });
      expect(document.activeElement).toBe(score);
      fireEvent.keyDown(score, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(overview);
      fireEvent.keyDown(overview, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(score);
      fireEvent.keyDown(score, { key: 'Home' });
      expect(document.activeElement).toBe(overview);
      expect(overview).toHaveAttribute('aria-selected', 'true');
      // Only the selected tab is in the Tab order.
      for (const tab of screen.getAllByRole('tab'))
        expect(tab).toHaveAttribute('tabindex', tab === overview ? '0' : '-1');
    });

    it('moves the delegation level and focus together with the arrow keys', () => {
      sign();
      render(<ChroniclePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Partners' }));
      const advise = screen.getByRole('radio', { name: /^0 Advise/ });
      advise.focus();
      fireEvent.keyDown(advise, { key: 'ArrowDown' });
      expect(chronicle().delegation).toBe(1);
      const routine = screen.getByRole('radio', { name: /^1 Routine/ });
      expect(routine).toHaveAttribute('aria-checked', 'true');
      expect(document.activeElement).toBe(routine);
      fireEvent.keyDown(routine, { key: 'ArrowUp' });
      expect(chronicle().delegation).toBe(0);
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^0 Advise/ }));
    });

    it('defers a decision with Escape only from inside the dialog, and gives focus back to Decide', () => {
      sign();
      const pending = {
        instanceId: 'event-kb',
        eventId: 'evt-millwrights-workshop',
        appearedShift: 0,
        lapsesShift: 3,
      };
      act(() =>
        useChronicleStore.setState({ chronicle: { ...chronicle(), pendingEvents: [pending] } })
      );
      render(
        <>
          <ChroniclePanel />
          <ChronicleEventHost />
        </>
      );
      // Opened unasked: Escape with focus outside the dialog leaves it alone.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const decideBefore = screen.getByRole('button', { name: /^Decide: / });
      decideBefore.focus();
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Escape from inside defers it.
      const heading = within(screen.getByRole('dialog')).getByRole('heading');
      heading.focus();
      fireEvent.keyDown(heading, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      // Reopened from Decide, Escape gives focus back to Decide.
      const decide = screen.getByRole('button', { name: /^Decide: / });
      decide.focus();
      fireEvent.click(decide);
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Decide: / }));
    });
  });
});
