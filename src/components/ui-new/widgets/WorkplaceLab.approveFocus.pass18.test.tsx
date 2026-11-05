import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace, workplaceReadiness } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

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

// The Lab's approve control disables itself once the agreement runs (the phase
// leaves deliberation). A browser drops focus from a control that becomes
// disabled to <body>, where Space is the forklift emergency stop.
// Working if focus lands on the open section's tab instead.
it('Record workshop agreement keeps focus on an enabled control', async () => {
  const get = () => useWorkplaceStore.getState();
  expect(get().start('workshop', 17).changed).toBe(true);
  for (const m of get().workplace.members) {
    get().understand(m.id);
    get().vote(m.id, true);
  }
  expect(workplaceReadiness(get().workplace).allowed).toBe(true);
  render(<WorkplaceLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Agreement / Voices' }));
  const approve = screen.getByRole('button', { name: 'Record workshop agreement' });
  act(() => approve.focus());
  fireEvent.click(approve);
  expect(get().workplace.phase).toBe('active');
  await waitFor(() => {
    const active = document.activeElement as HTMLButtonElement | null;
    expect(active).not.toBe(document.body);
    expect(active?.disabled).toBe(false);
  });
});
