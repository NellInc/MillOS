import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

// Browsers run the focus fixup rule: a focused control that becomes disabled
// loses focus to <body>. jsdom does not, so the test does what the browser does.
const fixupFocus = () => {
  const active = document.activeElement as HTMLButtonElement | null;
  if (!active || active === document.body || !active.disabled) return;
  const sink = document.createElement('div');
  sink.tabIndex = -1;
  document.body.appendChild(sink);
  sink.focus();
  sink.remove();
};
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
const get = () => useWorkplaceStore.getState();

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(cleanup);

// An objection recorded while the shift runs stops it safely into review, so
// "Record authored objection" disables itself with focus on it; a browser then
// drops focus to <body>, where Space is the forklift emergency stop.
describe('Lab objection recorded mid-shift (pass twenty)', () => {
  it('keeps focus on an enabled Lab control', async () => {
    expect(get().start('game', 17).changed).toBe(true);
    const workplace = structuredClone(get().workplace);
    workplace.phase = 'active';
    workplace.minute = 30;
    useWorkplaceStore.setState({ workplace });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Agreement / Voices' }));
    const control = screen.getByRole('button', { name: 'Record authored objection' });
    act(() => control.focus());
    fireEvent.click(control);
    expect(get().workplace.phase).toBe('review');
    expect(control).toBeDisabled();
    fixupFocus();
    await nextFrame();
    const active = document.activeElement as HTMLButtonElement | null;
    expect(active).not.toBe(document.body);
    expect(active?.disabled).toBe(false);
  });
});
