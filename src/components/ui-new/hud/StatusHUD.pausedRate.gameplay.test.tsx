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

  // The HUD shows no bag rate since the capture pass (the target is tonnes),
  // so no frozen rate can sit beside its 'Paused' chip.
  it('shows no bag rate on the HUD, paused or running', () => {
    render(<StatusHUD />);
    expect(screen.queryByLabelText(/bags/)).toBeNull();
    act(() => useGameSimulationStore.getState().setGameSpeed(0));
    expect(screen.queryByLabelText(/bags/)).toBeNull();
    expect(screen.queryByText('917')).toBeNull();
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
