import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';

// The tick holds a requested restart while a facility stop, drill or crisis
// interlock holds (UnifiedGameTick), and applies it once the stop clears. The
// card read "Controlled restart queued" for the whole stop, so the player was
// not told what it waited for; a phone has no tooltip to say it either.
// Working if a held restart names the stop it waits on, in either language.
describe('A requested restart held by a facility stop', () => {
  let breakdownId = '';
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.setState({ emergencyActive: false });
    const breakdown = useBreakdownStore.getState().triggerBreakdown('mill', 'Mill', 'mechanical');
    breakdownId = breakdown!.id;
    const store = useBreakdownStore.getState();
    store.startRepair(breakdownId);
    store.updateRepairProgress(breakdownId, 100);
    store.verifyRepair(breakdownId);
    store.requestMachineRestart(breakdownId);
  });
  afterEach(() => {
    cleanup();
    act(() => {
      setLocale('en');
      useBreakdownStore.getState().resetBreakdownStore();
      useGameSimulationStore.setState({ emergencyActive: false });
    });
  });

  it('reads queued while the plant runs', () => {
    render(<PredictiveMaintenancePanel />);
    expect(screen.getByText('Controlled restart queued')).toBeVisible();
  });

  it('says it waits for the stop to clear while the facility is stopped', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<PredictiveMaintenancePanel />);
    expect(screen.queryByText('Controlled restart queued')).not.toBeInTheDocument();
    expect(
      screen.getByText('Controlled restart queued: it runs once the facility stop clears')
    ).toBeVisible();

    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText(
        'Reinício controlado na fila: ele ocorre assim que a parada da unidade for liberada'
      )
    ).toBeVisible();
  });
});
