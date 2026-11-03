import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { AutonomyPanel } from '../widgets/AutonomyPanel';
import { MobilePanel } from '../../mobile/MobilePanel';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { setLocale } from '../../../i18n';

vi.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

const initialMetrics = useProductionStore.getState().metrics;

// Paused, the tick stops, so the last bags/h froze on the HUD, Autonomy and the
// phone sheet beside a 'Paused' chip, while the production target card read 0.
// A paused plant packs nothing. Working if every rate reads 0 while the clock
// is at 0, and the real rate returns on resume.
describe('throughput while the clock is held', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState((state) => ({
      metrics: { ...state.metrics, throughput: 917 },
    }));
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
  });
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ metrics: initialMetrics });
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
  });

  it('reads 0 on the HUD while paused and the rate again on resume', () => {
    render(<StatusHUD />);
    expect(screen.getByLabelText(/throughput 917 bags/)).toBeInTheDocument();
    act(() => useGameSimulationStore.getState().setGameSpeed(0));
    expect(screen.getByLabelText(/throughput 0 bags/)).toBeInTheDocument();
    act(() => useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED));
    expect(screen.getByLabelText(/throughput 917 bags/)).toBeInTheDocument();
  });

  it('reads 0 on the Autonomy panel and the phone sheet while paused', () => {
    act(() => useGameSimulationStore.getState().setGameSpeed(0));
    const autonomy = render(<AutonomyPanel />);
    expect(screen.queryByText('917')).toBeNull();
    autonomy.unmount();
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    expect(screen.queryByText('917')).toBeNull();
  });
});
