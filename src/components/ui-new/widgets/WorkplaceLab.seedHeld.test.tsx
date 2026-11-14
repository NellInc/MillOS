import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

// A seed out of range held every control that needs one, with nothing saying
// why. The refusal now shows at the seed and describes each held control.

beforeEach(() => {
  setLocale('en');
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
  useGameSimulationStore.setState({ gameSpeed: 180 });
});
afterEach(() => cleanup());

it('says why a seed holds the start, at the seed and on the held button', () => {
  render(<WorkplaceLab />);
  const seed = screen.getByRole('spinbutton', { name: 'Scenario seed' });
  fireEvent.change(seed, { target: { value: '0' } });
  const reason = 'The seed is a whole number from 1 to 2,147,483,647.';
  expect(screen.getByRole('alert')).toHaveTextContent(reason);
  expect(seed).toHaveAttribute('aria-invalid', 'true');
  const held = screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('disabled') && button.getAttribute('aria-describedby'));
  expect(held.length).toBeGreaterThan(0);
  for (const button of held) expect(button).toHaveAccessibleDescription(reason);
  fireEvent.change(seed, { target: { value: '42' } });
  expect(screen.queryByText(reason)).toBeNull();
});
