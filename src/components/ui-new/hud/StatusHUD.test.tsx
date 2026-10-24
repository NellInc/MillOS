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
import { autoplayWorkplaceStep } from '../../../simulation/workplaceAutoplay';
import { withAutomaticWorkplaceStep } from '../../../simulation/workplaceParticipation';

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

  it('keeps the agreement chip through a running season instead of blinking out between shifts', () => {
    // The runtime trace read 78%, absent, 98%, 78%: the cover plan after its
    // cover expires, the gap between two shifts, then the next shift's cover.
    // Drive the real season the autonomous demo runs through those moments.
    try {
      useWorkplaceStore.setState({
        workplace: createWorkplace(),
        participationMode: 'solo',
        turn: null,
      });
      render(<StatusHUD />);
      const reading = () =>
        screen.queryByText(/^Agreement (pacing \d+%|between shifts)$/)?.textContent ?? null;
      const readings: (string | null)[] = [];
      const step = () => {
        let result = { changed: false, reason: null as string | null };
        act(() => {
          result = withAutomaticWorkplaceStep(() => autoplayWorkplaceStep('cooperative'));
        });
        // A review owing recovery waits on plant time, as in the running game.
        if (!result.changed && !result.reason)
          act(() => {
            useWorkplaceStore.getState().tick(1, 0, false);
          });
        readings.push(reading());
      };
      act(() => {
        expect(useWorkplaceStore.getState().startCampaign('cooperative').changed).toBe(true);
      });
      const until = (phase: string) => {
        for (let i = 0; i < 300 && useWorkplaceStore.getState().workplace.phase !== phase; i++)
          step();
        expect(useWorkplaceStore.getState().workplace.phase).toBe(phase);
      };
      until('active');
      expect(reading()).toBe('Agreement pacing 98%');
      act(() => {
        useWorkplaceStore.getState().tick(15, 0, false);
      });
      expect(reading()).toBe('Agreement pacing 78%');
      act(() => {
        useWorkplaceStore.getState().tick(75, 0, false);
      });
      expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
      expect(reading()).toBe('Agreement between shifts');
      readings.length = 0;
      until('active');
      expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(1);
      expect(reading()).toBe('Agreement pacing 98%');
      // Every sample between the two shifts kept the chip, saying why it reads as it does.
      expect(readings.length).toBeGreaterThan(5);
      expect(readings.every((text) => text !== null)).toBe(true);
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

  it('offers Open repair while wear holds a machine in warning, and not once it is serviced', () => {
    const machines = useProductionStore.getState().machines;
    // Only type, status and wear decide whether wear holds a warning.
    const silo = {
      id: 'silo-alpha',
      name: 'Silo Alpha',
      type: 'silo',
      status: 'running',
      metrics: { wear: 0 },
    } as unknown as (typeof machines)[number];
    const setWear = (wear: number) =>
      useProductionStore.setState({
        machines: [...machines, { ...silo, metrics: { ...silo.metrics, wear } }],
      });
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({
      alerts: [
        {
          id: `wear-${silo.id}`,
          type: 'warning',
          title: 'Wear warning',
          message: `${silo.name} needs a diagnostic review.`,
          machineId: silo.id,
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
    try {
      setWear(95);
      render(<StatusHUD />);
      fireEvent.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }));
      expect(screen.getByRole('button', { name: 'Open repair for Wear warning' })).toBeVisible();
      act(() => setWear(0));
      expect(
        screen.queryByRole('button', { name: 'Open repair for Wear warning' })
      ).not.toBeInTheDocument();
    } finally {
      useProductionStore.setState({ machines });
    }
  });

  it('files achievements and other successes as records, not as unread items needing action', () => {
    const alert = (id: string, type: 'success' | 'info', title: string) => ({
      id,
      type,
      title,
      message: `${title}.`,
      timestamp: new Date(),
      acknowledged: false,
    });
    useUIStore.setState({
      alerts: [
        alert('achievement-first-bag', 'success', 'Achievement unlocked'),
        alert('achievement-century', 'success', 'Achievement unlocked again'),
        alert('shift-review-1', 'info', 'Morning shift closed: grade B'),
      ],
    });
    render(<StatusHUD />);
    const bell = screen.getByRole('button', { name: 'Notifications (1 unread)' });
    expect(bell).toHaveTextContent('1');
    fireEvent.click(bell);
    // Still listed and dismissable, but nothing to acknowledge.
    expect(screen.getByText('Achievement unlocked')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Acknowledge Achievement unlocked' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss Achievement unlocked' })).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Acknowledge Morning shift closed: grade B' })
    );
    expect(screen.getByRole('button', { name: 'Notifications (0 unread)' })).toBeVisible();
  });
});
