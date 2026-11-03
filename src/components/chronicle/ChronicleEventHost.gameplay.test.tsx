import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleEventHost } from './ChronicleEventHost';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';

const FIRE = { active: true, suppressing: false, resolveAtMinute: null };

const restore = (patch: Partial<ChronicleState>) =>
  act(() =>
    useChronicleStore.setState((s) => ({ chronicle: { ...s.chronicle, ...patch, fire: FIRE } }))
  );

// At delegation 2 or 3 the AI partner answers a fire on its next tick. A save
// restored with that fire unanswered opened the fire dialog for that one tick.
describe('Chronicle fire prompt under delegation', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => cleanup());

  it('opens no fire dialog when the partner will answer the fire', () => {
    restore({ delegation: 2 });
    render(<ChronicleEventHost />);
    expect(screen.queryByRole('dialog', { name: /Smouldering dust/ })).toBeNull();
    expect(useChronicleStore.getState().dialogOpen).toBe(false);
  });

  it('still asks the player below delegation 2', () => {
    restore({ delegation: 1 });
    render(<ChronicleEventHost />);
    expect(screen.getByRole('dialog', { name: /Smouldering dust/ })).toBeInTheDocument();
  });

  it('still asks the player once the chronicle has ended and the partner no longer ticks', () => {
    restore({ delegation: 3, status: 'ended' });
    render(<ChronicleEventHost />);
    expect(screen.getByRole('dialog', { name: /Smouldering dust/ })).toBeInTheDocument();
  });
});

// On a phone the game interface, this host's root, is inert while a sheet is
// open, but the dialog draws above the sheet: a tap on one of its buttons fell
// through to the sheet control underneath. A prompt nobody asked for waits for
// the sheet to close (the Chronicle sheet answers it meanwhile).
describe('Chronicle prompts over a phone sheet', () => {
  const width = window.innerWidth;
  const setWidth = (value: number) =>
    Object.defineProperty(window, 'innerWidth', { configurable: true, value });
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => {
    cleanup();
    setWidth(width);
    useMobileControlStore.getState().closeMobilePanel();
  });

  it('holds an unasked prompt back while a phone sheet is open, and shows it once the sheet closes', () => {
    setWidth(390);
    act(() => useMobileControlStore.getState().openMobilePanel('safety'));
    restore({ delegation: 0 });
    render(<ChronicleEventHost />);
    expect(screen.queryByRole('dialog', { name: /Smouldering dust/ })).toBeNull();
    expect(useChronicleStore.getState().dialogOpen).toBe(false);
    act(() => useMobileControlStore.getState().closeMobilePanel());
    expect(screen.getByRole('dialog', { name: /Smouldering dust/ })).toBeInTheDocument();
  });

  it('still shows the prompt on a wide screen, where no sheet covers the interface', () => {
    act(() => useMobileControlStore.setState({ mobilePanelVisible: true }));
    restore({ delegation: 0 });
    render(<ChronicleEventHost />);
    expect(screen.getByRole('dialog', { name: /Smouldering dust/ })).toBeInTheDocument();
  });
});
