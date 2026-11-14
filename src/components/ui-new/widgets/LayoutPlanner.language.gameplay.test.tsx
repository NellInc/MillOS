import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LayoutPlanner } from './LayoutPlanner';
import { useProductionStore } from '../../../stores/productionStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { canonicalProcessMachines } from '../../../simulation/materialTransport';
import type { MachineData } from '../../../types';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../../stores/logisticsLayoutStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { setLocale } from '../../../i18n';

// The workspace scores both plans with the real logistics model on every render.
vi.setConfig({ testTimeout: 180_000 });

const priorProduction = useProductionStore.getState();
beforeEach(() => {
  setLocale('en');
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useProductionStore.setState({
    machines: canonicalProcessMachines().map((m) => ({ ...m, status: 'running' })) as MachineData[],
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useGameSimulationStore.getState().setGameSpeed(60);
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useGameSimulationStore.getState().releaseClock('layout');
  useProductionStore.setState(priorProduction, true);
});
// A string name is matched exactly ('Pause mill', not 'Resume … Pause mill').
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const status = () => screen.getByRole('status');

it('the status line follows a language switch for the planner own messages', () => {
  render(<LayoutPlanner onClose={vi.fn()} />);
  // No opening line telling the player what the planner is for (D-012): the
  // status region is there, empty, until something happens.
  expect(status()).toHaveTextContent(/^$/);
  expect(screen.queryByText(/Edit a proposal or search/)).toBeNull();
  click('Pause mill');
  expect(status()).toHaveTextContent('Mill paused. Apply a clear proposal');
  act(() => setLocale('pt-BR'));
  expect(status()).toHaveTextContent('Moinho pausado. Aplique uma proposta');
});

it('the clearance conflicts listed under the proposal follow a language switch', () => {
  render(<LayoutPlanner onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '29' } });
  expect(
    screen.getByText('Resolve these clearance conflicts', { exact: false })
  ).toBeInTheDocument();
  const english = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
  expect(english.some((line) => line.startsWith('shipping:'))).toBe(true);
  act(() => setLocale('pt-BR'));
  const portuguese = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
  expect(portuguese.some((line) => line.startsWith('expedição:'))).toBe(true);
  expect(portuguese.some((line) => line.startsWith('shipping:'))).toBe(false);
});

it('Pause mill under a safety hold says why instead of doing nothing', () => {
  render(<LayoutPlanner onClose={vi.fn()} />);
  // Live queue readings off: nothing re-renders the planner on its own.
  fireEvent.click(screen.getByRole('checkbox'));
  act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
  try {
    // The planner now follows the hold: Pause mill is held, and the note under
    // the operate buttons says why, in the language active now.
    expect(screen.getByRole('button', { name: 'Pause mill' })).toBeDisabled();
    click('Pause mill');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    expect(screen.getByText(/Resolve the site safety hold first\./)).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText(/Resolva primeiro a retenção de segurança do local\./)
    ).toBeInTheDocument();
  } finally {
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(false));
  }
});

it('a refusal the layout store gives follows a language switch', () => {
  // No forklift has registered, so the store refuses the apply with its own reason.
  render(<LayoutPlanner onClose={vi.fn()} />);
  click('Pause mill');
  fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '18' } });
  click('Apply to mill');
  expect(status()).toHaveTextContent('Wait for both forklifts to finish loading');
  act(() => setLocale('pt-BR'));
  expect(status()).toHaveTextContent('Aguarde até que as duas empilhadeiras');
});

// With live queue readings off the planner subscribed only to the pause, so a
// safety hold that started while it was open left its note reading as if the
// mill could be operated. Working if the note follows the hold.
it('the hold note follows a safety hold that starts while the planner is open', () => {
  render(<LayoutPlanner onClose={vi.fn()} />);
  expect(screen.queryByText(/Resolve the site safety hold first\./)).not.toBeInTheDocument();
  act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
  try {
    expect(screen.getByText(/Resolve the site safety hold first\./)).toBeInTheDocument();
  } finally {
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(false));
  }
});
