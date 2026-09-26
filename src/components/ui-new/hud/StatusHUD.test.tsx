import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';

const viewport = { width: window.innerWidth, height: window.innerHeight };

describe('StatusHUD operational controls', () => {
  beforeEach(() => {
    useUIStore.setState({ alerts: [], showFPSCounter: false });
    useProductionStore.setState({
      metrics: { ...useProductionStore.getState().metrics, throughput: 9320 },
      dailyBagsProduced: 4680,
      productionTarget: { ...useProductionStore.getState().productionTarget!, targetBags: 5000 },
    });
    useGameSimulationStore.setState({ gameTime: 16.5, currentShift: 'afternoon' });
    useGraphicsStore.setState({
      graphics: { ...useGraphicsStore.getState().graphics, enableSCADA: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height });
  });

  it('shows actual packer output, target, simulation time and shared safety score', () => {
    render(<StatusHUD />);
    expect(screen.getByLabelText('Final packer throughput 9,320 bags per hour')).toBeVisible();
    expect(screen.getByLabelText('Daily target 4680 of 5000 bags')).toBeVisible();
    expect(screen.getByText('16:30')).toBeVisible();
    expect(screen.getByLabelText('MillOS')).toBeVisible();
    expect(
      screen.getByLabelText(
        `Safety score: ${computeSafetyScore(useSafetyStore.getState().safetyMetrics)} percent`
      )
    ).toBeVisible();
    expect(screen.getByLabelText('Simulated SCADA telemetry enabled')).toBeVisible();
    act(() =>
      useProductionStore.setState({
        metrics: { ...useProductionStore.getState().metrics, throughput: 0 },
      })
    );
    expect(screen.getByLabelText('Final packer throughput 0 bags per hour')).toBeVisible();
    act(() =>
      useGraphicsStore.setState({
        graphics: { ...useGraphicsStore.getState().graphics, enableSCADA: false },
      })
    );
    expect(screen.getByLabelText('SCADA telemetry disabled')).toBeVisible();
  });

  it('retains keyboard movement and clamps the HUD after viewport resizing', () => {
    render(<StatusHUD />);
    const hud = screen.getByRole('banner');
    vi.spyOn(hud, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 48 } as DOMRect);
    const grip = screen.getByRole('button', { name: /Reposition status bar/ });
    fireEvent.keyDown(grip, { key: 'ArrowRight', shiftKey: true });
    expect(hud).toHaveStyle({ left: '36px', top: '16px' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    expect(hud).toHaveStyle({ top: '20px' });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 430 });
    fireEvent(window, new Event('resize'));
    expect(hud).toHaveStyle({ left: '16px' });
    fireEvent.keyDown(grip, { key: 'Home' });
    expect(hud).toHaveStyle({ left: '0px', top: '0px' });
    expect(hud).toHaveClass('w-full');
  });

  it('keeps a dragged notification dialog on screen and preserves acknowledgement and dismissal', () => {
    useUIStore.setState({
      alerts: [
        {
          id: 'hud-alert',
          type: 'warning',
          title: 'Low input',
          message: 'Awaiting wheat delivery.',
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    render(<StatusHUD />);
    const bell = screen.getByRole('button', { name: 'Notifications (1 unread)' });
    vi.spyOn(bell, 'getBoundingClientRect').mockReturnValue({ right: 760, bottom: 590 } as DOMRect);
    fireEvent.click(bell);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveStyle({
      left: '432px',
      top: '216px',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge Low input' }));
    expect(screen.getByRole('button', { name: 'Notifications (0 unread)' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Low input' }));
    expect(screen.getByText('All clear.')).toBeVisible();
    const sidebarEscape = vi.fn();
    document.addEventListener('keydown', sidebarEscape);
    try {
      fireEvent.keyDown(bell, { key: 'Escape' });
      expect(sidebarEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', sidebarEscape);
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });
});
