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
import { registerLogisticsVehicle } from '../../../simulation/logisticsRuntime';
import { setLocale, translate } from '../../../i18n';
import { forkliftSystemMessages } from '../../ForkliftSystem.messages';

// The workspace scores both plans with the real logistics model on every render.
vi.setConfig({ testTimeout: 180_000 });

const priorProduction = useProductionStore.getState();
const unregister: Array<() => void> = [];
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
  for (const off of unregister.splice(0)) off();
  setLocale('en');
  useGameSimulationStore.getState().releaseClock('layout');
  useProductionStore.setState(priorProduction, true);
});

// The forklift controller refuses an apply while a forklift stands on a changed
// route corner, in the language active at the refusal (ForkliftSystem prepare).
// The planner stored those words, so the status line stayed in that language
// after a switch. Working if the refusal follows the language active now.
it("a forklift's route-corner refusal follows a language switch", () => {
  unregister.push(
    registerLogisticsVehicle('shipping', {
      prepare: () =>
        translate(forkliftSystemMessages, 'routeCornerAmbiguous', { id: 'forklift-1' }),
      restore: () => undefined,
    }),
    registerLogisticsVehicle('receiving', {
      prepare: () => () => undefined,
      restore: () => undefined,
    })
  );
  render(<LayoutPlanner onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause mill' }));
  fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '18' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to mill' }));
  const status = () => screen.getByRole('status');
  expect(status()).toHaveTextContent('forklift-1 occupies a changed or ambiguous route corner');
  act(() => setLocale('pt-BR'));
  expect(status()).toHaveTextContent('forklift-1 está em uma curva de rota alterada ou ambígua');
  act(() => setLocale('en'));
  expect(status()).toHaveTextContent('forklift-1 occupies a changed or ambiguous route corner');
});

it('a refusal given in Portuguese reads in English after a switch back', () => {
  setLocale('pt-BR');
  unregister.push(
    registerLogisticsVehicle('shipping', {
      prepare: () => () => undefined,
      restore: () => undefined,
    }),
    registerLogisticsVehicle('receiving', {
      prepare: () =>
        translate(forkliftSystemMessages, 'routeCornerAmbiguous', { id: 'forklift-2' }),
      restore: () => undefined,
    })
  );
  setLocale('en');
  render(<LayoutPlanner onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause mill' }));
  fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '18' } });
  act(() => setLocale('pt-BR'));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar ao moinho' }));
  const status = () => screen.getByRole('status');
  expect(status()).toHaveTextContent('forklift-2 está em uma curva de rota alterada ou ambígua');
  act(() => setLocale('en'));
  expect(status()).toHaveTextContent('forklift-2 occupies a changed or ambiguous route corner');
});
