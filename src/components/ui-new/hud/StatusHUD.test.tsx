import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';

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

  it('says the line is changing over when it has moved on to the next commitment', () => {
    const execution = useOperationsCampaignStore.getState().execution;
    try {
      useProductionStore.setState({
        metrics: { ...useProductionStore.getState().metrics, throughput: 0 },
      });
      useOperationsCampaignStore.setState({
        execution: {
          ...execution,
          orderId: 'order-001',
          stage: 'dispatched',
          remainingKg: 1000,
          finishedAvailableKg: 1000,
          lineOrderId: 'order-002',
          lineCustomer: 'Community Pasta Works',
        },
      });
      render(<StatusHUD />);
      expect(
        screen.getByLabelText(
          'Changing over: the line is starting the next order, for Community Pasta Works'
        )
      ).toBeVisible();
      expect(screen.queryByLabelText(/Line idle/)).not.toBeInTheDocument();
    } finally {
      useOperationsCampaignStore.setState({ execution });
    }
  });

  it('says why the line is idle once the active order is already packed', () => {
    const execution = useOperationsCampaignStore.getState().execution;
    try {
      useProductionStore.setState({
        metrics: { ...useProductionStore.getState().metrics, throughput: 0 },
      });
      useOperationsCampaignStore.setState({
        execution: { ...execution, orderId: 'order-001', stage: 'milling', remainingKg: 6000 },
      });
      render(<StatusHUD />);
      expect(screen.queryByLabelText(/Line idle/)).not.toBeInTheDocument();
      act(() =>
        useOperationsCampaignStore.setState({
          execution: {
            ...execution,
            orderId: 'order-001',
            stage: 'dispatched',
            remainingKg: 1000,
            finishedAvailableKg: 999.5,
          },
        })
      );
      expect(screen.getByLabelText('Final packer throughput 0 bags per hour')).toBeVisible();
      expect(
        screen.getByLabelText('Line idle: the active order is packed and awaiting dispatch')
      ).toBeVisible();
      // Output resumes, or the order is fulfilled: the explanation goes away.
      act(() =>
        useProductionStore.setState({
          metrics: { ...useProductionStore.getState().metrics, throughput: 240 },
        })
      );
      expect(screen.queryByLabelText(/Line idle/)).not.toBeInTheDocument();
      act(() => {
        useProductionStore.setState({
          metrics: { ...useProductionStore.getState().metrics, throughput: 0 },
        });
        useOperationsCampaignStore.setState({
          execution: { ...execution, orderId: null, stage: 'fulfilled', remainingKg: 0 },
        });
      });
      expect(screen.queryByLabelText(/Line idle/)).not.toBeInTheDocument();
    } finally {
      useOperationsCampaignStore.setState({ execution });
    }
  });

  it('names the agreed line pacing beside the plant rate while a cooperative shift runs', () => {
    try {
      useWorkplaceStore.setState({ workplace: { ...createWorkplace(), phase: 'active' } });
      render(<StatusHUD />);
      // The steady plan paces the line to 78% of the plant rate.
      expect(
        screen.getByLabelText('The cooperative agreement paces the line at 78% of the plant rate')
      ).toBeVisible();
      expect(screen.getByText('Agreement pacing 78%')).toBeVisible();
      act(() => useWorkplaceStore.setState({ workplace: createWorkplace() }));
      expect(screen.queryByText(/Agreement pacing/)).not.toBeInTheDocument();
    } finally {
      useWorkplaceStore.setState({ workplace: createWorkplace() });
    }
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
    expect(screen.getByRole('banner')).toHaveClass('z-50');
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
    expect(screen.getByRole('banner')).toHaveClass('z-30');
    expect(bell).toHaveFocus();
  });

  it('offers Open repair on an alert about a broken machine, by the shift card route', () => {
    useBreakdownStore.getState().resetBreakdownStore();
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', 'mechanical');
    useUIStore.setState({
      maintenanceFocusRequested: false,
      alerts: [
        {
          id: 'breakdown-rm-101',
          type: 'critical',
          title: 'Machine Breakdown',
          message: 'R.M. 101 has broken down.',
          machineId: 'rm-101',
          timestamp: new Date(),
          acknowledged: false,
        },
        {
          id: 'maintenance-skip-rm-102',
          type: 'info',
          title: 'Maintenance Not Needed',
          message: 'R.M. 102 runs as new.',
          machineId: 'rm-102',
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
    const opened = vi.fn();
    window.addEventListener('millos:open-operations-workspace', opened);
    try {
      render(<StatusHUD />);
      fireEvent.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
      // A healthy machine's notice has nothing to repair.
      expect(
        screen.queryByRole('button', { name: 'Open repair for Maintenance Not Needed' })
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open repair for Machine Breakdown' }));
      expect(useUIStore.getState().maintenanceFocusRequested).toBe(true);
      expect(opened).toHaveBeenCalledTimes(1);
      expect((opened.mock.calls[0][0] as CustomEvent).detail).toBe('overview');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener('millos:open-operations-workspace', opened);
      useBreakdownStore.getState().resetBreakdownStore();
      useUIStore.setState({ maintenanceFocusRequested: false });
    }
  });
});
