import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StrategicPriorityCards } from './StrategicPriorityCards';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { setLocale } from '../../i18n';
import { MachineType, type MachineData } from '../../types';

// The strategic layer names its focus by machine id (it is validated against
// the plant's ids), and the chip printed that id: "Focus: silo-0", a name no
// other surface in the game uses. Working if the chip shows the designation
// the rest of the game shows, with the id only as a fallback.

const silo = {
  id: 'silo-0',
  name: 'Silo Alpha',
  type: MachineType.SILO,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 0, temperature: 20, vibration: 0.8, load: 60, wear: 0, efficiency: 100 },
  lastMaintenance: '2024-01-15',
  nextMaintenance: '2024-04-15',
} as unknown as MachineData;

describe('the strategic focus chip', () => {
  const originalStrategic = useAIConfigStore.getState().strategic;
  const originalMachines = useProductionStore.getState().machines;
  beforeEach(() => setLocale('en'));
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ strategic: originalStrategic });
    useProductionStore.setState({ machines: originalMachines });
  });

  const showFocus = (focusMachine: string) =>
    useAIConfigStore.setState({
      strategic: {
        ...originalStrategic,
        isThinking: false,
        legacyPriorities: ['Draw down the oldest silo first'],
        insight: undefined,
        tradeoff: undefined,
        focusMachine,
      },
    });

  it('names the focus machine by its designation, not its id', () => {
    useProductionStore.setState({ machines: [silo] });
    showFocus('silo-0');
    render(<StrategicPriorityCards />);
    expect(screen.getByText('Focus: Silo Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Focus: silo-0')).not.toBeInTheDocument();
  });

  it('falls back to the id for a machine the plant no longer lists', () => {
    useProductionStore.setState({ machines: [silo] });
    showFocus('rm-109');
    render(<StrategicPriorityCards />);
    expect(screen.getByText('Focus: rm-109')).toBeInTheDocument();
  });
});
