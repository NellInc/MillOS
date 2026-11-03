import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleEventHost } from './ChronicleEventHost';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { OPEN_EVENT } from './ChronicleOverview';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';

const FIRE = { active: true, suppressing: false, resolveAtMinute: null };

const patch = (next: Partial<ChronicleState>) =>
  act(() => useChronicleStore.setState((s) => ({ chronicle: { ...s.chronicle, ...next } })));

// A prompt nobody asked for opens at a shift close, whatever the player is doing.
// Taking focus from a text field sent the rest of what was typed to the game's
// shortcuts (Space is the emergency stop), and closing the prompt later pulled
// focus back out of whatever field the player had moved to.
describe('Chronicle prompts and the player’s own focus', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => cleanup());

  it('leaves focus in the text field the player is typing in when a prompt opens unasked', () => {
    render(
      <>
        <input aria-label="Agent command" />
        <ChronicleEventHost />
      </>
    );
    const field = screen.getByRole('textbox', { name: 'Agent command' });
    field.focus();
    patch({ fire: FIRE });
    expect(screen.getByRole('dialog', { name: /Smouldering dust/ })).toBeInTheDocument();
    expect(document.activeElement).toBe(field);
  });

  it('leaves focus inside an open modal dialog when a prompt opens unasked', () => {
    render(
      <>
        <div role="dialog" aria-modal="true" aria-label="AI settings">
          <button>Save</button>
        </div>
        <ChronicleEventHost />
      </>
    );
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    patch({ fire: FIRE });
    expect(document.activeElement).toBe(save);
  });

  it('still takes focus to the prompt from a button, and does not pull it back later from a field', () => {
    render(
      <>
        <button>Elsewhere</button>
        <input aria-label="Search notes" />
        <ChronicleEventHost />
      </>
    );
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    patch({ fire: FIRE });
    const heading = screen.getByRole('heading', { name: /Smouldering dust/ });
    expect(document.activeElement).toBe(heading);
    // The player moves on to type somewhere else while the prompt stands.
    const field = screen.getByRole('textbox', { name: 'Search notes' });
    field.focus();
    // The fire is answered elsewhere (the Overview, or the partner).
    patch({ fire: { active: true, suppressing: true, resolveAtMinute: 999 } });
    expect(screen.queryByRole('dialog', { name: /Smouldering dust/ })).toBeNull();
    expect(document.activeElement).toBe(field);
  });
});

// On a phone the game interface (this host's root) is inert while a sheet is
// open, so Decide in the Chronicle sheet opened a dialog nobody could press.
// Working if a requested decision closes the sheet over it.
describe('a decision asked for from the phone sheet', () => {
  afterEach(() => {
    cleanup();
    useMobileControlStore.getState().closeMobilePanel();
  });

  it('closes the phone sheet so the dialog it opens is live', () => {
    render(<ChronicleEventHost />);
    act(() => useMobileControlStore.setState({ mobilePanelVisible: true }));
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: 'evt-1' }));
    });
    expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
  });
});

// 'Think it over' leaves a decision in the workspace, but the deferral lived in
// component state, so every deferred prompt popped up again unasked after a
// reload. Working if a deferral survives a remount and is part of the save.
describe('a deferred Chronicle prompt across a reload', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => cleanup());

  it('keeps the prompt deferred after the host remounts, and saves the deferral', async () => {
    const { fireEvent } = await import('@testing-library/react');
    patch({ fire: FIRE });
    const first = render(<ChronicleEventHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Think it over' }));
    expect(screen.queryByRole('dialog', { name: /Smouldering dust/ })).toBeNull();
    first.unmount();
    render(<ChronicleEventHost />);
    expect(screen.queryByRole('dialog', { name: /Smouldering dust/ })).toBeNull();
    const persisted = useChronicleStore.persist
      .getOptions()
      .partialize?.(useChronicleStore.getState()) as Record<string, unknown>;
    expect(JSON.stringify(persisted)).toContain('fire');
    expect(persisted).toHaveProperty('deferredPrompts');
  });
});
