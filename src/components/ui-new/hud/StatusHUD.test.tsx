import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useUIStore } from '../../../stores/uiStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import {
  createWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../../../simulation/bilateralWorkplace';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { autoplayWorkplaceStep } from '../../../simulation/workplaceAutoplay';
import { mondayMinute } from '../../../simulation/workplaceCampaign';
import { withAutomaticWorkplaceStep } from '../../../simulation/workplaceParticipation';

const viewport = { width: window.innerWidth, height: window.innerHeight };

describe('StatusHUD operational controls', () => {
  beforeEach(() => {
    useUIStore.setState({ alerts: [], showFPSCounter: false });
    useProductionStore.setState({
      metrics: { ...useProductionStore.getState().metrics, throughput: 9320 },
      dailyBagsProduced: 4680,
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

  // The capture pass (wave 2): the bag rate is gone from the HUD; the target
  // is tonnes, and a rate beside it competed with it.
  it('shows the programme target, simulation time and shared safety score, and no bag rate', () => {
    useOperationsCampaignStore.getState().resetCampaign();
    render(<StatusHUD />);
    expect(screen.queryByLabelText(/bags per hour/)).not.toBeInTheDocument();
    // D11: the guided programme's 18 t, not the day's bag count (4,680 here).
    expect(screen.getByLabelText('Programme commitment: 0.0 of 18.0 tonnes shipped')).toBeVisible();
    expect(screen.queryByText(/4,680/)).not.toBeInTheDocument();
    expect(screen.getByText('16:30')).toBeVisible();
    expect(screen.getByLabelText('MillOS')).toBeVisible();
    expect(
      screen.getByLabelText(
        `Safety score: ${computeSafetyScore(useSafetyStore.getState().safetyMetrics)} percent`
      )
    ).toBeVisible();
    // SCADA's mode is shown in the SCADA workspace, not as a constant here.
    expect(screen.queryByText(/SCADA/)).not.toBeInTheDocument();
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
          'Changing over: the line is starting the next order, for Community Polenta Kitchen'
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
      const chip = screen.getByLabelText(
        'Line idle: the active order is packed and awaiting dispatch'
      );
      expect(chip).toBeVisible();
      // The chip names the reason as its state, whole: it never truncates.
      const text = within(chip).getByText('Line idle: all packed');
      expect(text.className).not.toMatch(/\btruncate\b/);
      expect(text.className).toMatch(/whitespace-nowrap/);
      expect(chip.className).toMatch(/\bshrink-0\b/);
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

  // D4: the steady, resequence and cover plans run the line at the plant's own
  // rate (1.0), so a season that runs to them does not slow the line and the
  // chip has nothing to explain. It shows only while the agreed pace is below
  // the plant rate: the Monday inspection hold and the handoff experiment.
  it('shows no agreement chip while a steady-plan shift runs at the plant rate', () => {
    try {
      useWorkplaceStore.setState({ workplace: { ...createWorkplace(), phase: 'active' } });
      render(<StatusHUD />);
      expect(screen.queryByText(/^Agreement /)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/cooperative agreement/)).not.toBeInTheDocument();
    } finally {
      useWorkplaceStore.setState({ workplace: createWorkplace() });
    }
  });

  it('names the handoff briefing hold, and shows nothing once the line runs at the plant rate', () => {
    // The briefing arrangement holds the line for its 5-minute briefing; after
    // it, and once stopped, the trial runs at the plant rate (5.4, D4), so the
    // chip has nothing to say, between shifts too. Driven through the engine.
    let state = createWorkplace('game', 17);
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      state = result.state;
      return result;
    };
    const show = () => act(() => useWorkplaceStore.setState({ workplace: state }));
    try {
      expect(run({ type: 'beginImprovement', args: ['cooperative', state.revision] }).changed).toBe(
        true
      );
      run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
      run({ type: 'acknowledgeImprovement', args: [] });
      for (const m of state.members) {
        run({ type: 'understand', args: [m.id] });
        run({ type: 'vote', args: [m.id, true] });
      }
      run({ type: 'vote', args: ['quality', false] });
      expect(run({ type: 'activate', args: [state.revision] }).changed).toBe(true);
      render(<StatusHUD />);
      show();
      expect(
        screen.getByLabelText('The cooperative agreement paces the line at 0% of the plant rate')
      ).toBeVisible();
      expect(screen.getByText('Agreement pacing 0%')).toBeVisible();
      run({ type: 'tick', args: [10, 40, false] });
      show();
      expect(screen.queryByText(/^Agreement /)).not.toBeInTheDocument();
      expect(run({ type: 'stopImprovement', args: ['quality'] }).changed).toBe(true);
      show();
      expect(screen.queryByText(/^Agreement /)).not.toBeInTheDocument();
      run({ type: 'tick', args: [80, 400, false] });
      expect(state.phase).toBe('review');
      show();
      expect(screen.queryByText(/^Agreement /)).not.toBeInTheDocument();
      act(() => useWorkplaceStore.setState({ workplace: createWorkplace() }));
      expect(screen.queryByText(/^Agreement /)).not.toBeInTheDocument();
    } finally {
      useWorkplaceStore.setState({ workplace: createWorkplace() });
    }
  });

  it('shows the chip in a running season only while the Monday inspection holds the line', () => {
    // Drive the real season the autonomous demo runs: its plans run at the
    // plant rate, so no shift or gap between shifts shows the chip, until the
    // second shift reaches the season's drawn Monday minute (5.10) and Quality
    // holds the line for its inspection (5b).
    try {
      fulfilFirstDelivery();
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
      expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(0);
      expect(reading()).toBeNull();
      act(() => {
        useWorkplaceStore.getState().tick(15, 0, false);
      });
      expect(reading()).toBeNull();
      act(() => {
        useWorkplaceStore.getState().tick(75, 0, false);
      });
      expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
      expect(reading()).toBeNull();
      readings.length = 0;
      until('active');
      expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(1);
      expect(readings.length).toBeGreaterThan(5);
      expect(readings.every((text) => text === null)).toBe(true);
      expect(reading()).toBeNull();
      act(() => {
        const s = useWorkplaceStore.getState();
        s.tick(mondayMinute(s.workplace) + 1, 0, false);
      });
      expect(useWorkplaceStore.getState().workplace.campaign?.decision).toBe('inspect');
      expect(useWorkplaceStore.getState().workplace.campaign?.inspectionComplete).toBe(false);
      expect(reading()).toBe('Agreement pacing 0%');
      act(() => {
        useWorkplaceStore.getState().tick(5, 0, false);
      });
      expect(reading()).toBeNull();
    } finally {
      useWorkplaceStore.setState({ workplace: createWorkplace() });
      useOperationsCampaignStore.getState().resetCampaign();
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
    const focusMachine = vi.fn();
    window.addEventListener('millos:open-operations-workspace', opened);
    try {
      render(<StatusHUD onFocusMachine={focusMachine} />);
      fireEvent.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
      // A healthy machine's notice has nothing to repair.
      expect(
        screen.queryByRole('button', { name: 'Open repair for Maintenance Not Needed' })
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open repair for Machine Breakdown' }));
      expect(useUIStore.getState().maintenanceFocusRequested).toBe(true);
      expect(opened).toHaveBeenCalledTimes(1);
      expect((opened.mock.calls[0][0] as CustomEvent).detail).toBe('overview');
      // A fault is repaired through its work order, not serviced at the unit.
      expect(focusMachine).not.toHaveBeenCalled();
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

  // A wear notice's Open repair went to Overview's maintenance section, where
  // the only service offered was the booked one. Working if it selects the
  // worn unit, its Inspector opens, and focus lands on Maintain; a fault's
  // notice still goes to the work orders (the test above).
  it('sends a wear notice to the unit: its Inspector opens with focus on Maintain', () => {
    const machines = useProductionStore.getState().machines;
    const silo: MachineData = {
      id: 'silo-alpha',
      name: 'Silo Alpha',
      type: MachineType.SILO,
      position: [0, 0, 0],
      size: [1, 1, 1],
      rotation: 0,
      status: 'warning',
      metrics: { rpm: 0, temperature: 30, vibration: 1, load: 60, wear: 75, efficiency: 90 },
      lastMaintenance: '',
      nextMaintenance: '',
    };
    // App holds the selection; GameInterface passes its focus route to the HUD.
    const Workspace = () => {
      const [selected, setSelected] = useState<MachineData | null>(null);
      return (
        <>
          <StatusHUD
            onFocusMachine={(id) =>
              setSelected(useProductionStore.getState().machines.find((m) => m.id === id) ?? null)
            }
          />
          {selected && <MachineInspector key={selected.id} machine={selected} />}
        </>
      );
    };
    useBreakdownStore.getState().resetBreakdownStore();
    useProductionStore.setState({ machines: [silo] });
    useUIStore.setState({
      maintenanceFocusRequested: false,
      alerts: [
        {
          id: `wear-warning-${silo.id}`,
          type: 'warning',
          title: 'Wear warning',
          message: `${silo.name} needs a diagnostic review.`,
          machineId: silo.id,
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
    const opened = vi.fn();
    window.addEventListener('millos:open-operations-workspace', opened);
    try {
      render(<Workspace />);
      fireEvent.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Open repair for Wear warning' }));

      // Service takes game time, so the button names its part and its minutes.
      const maintain = screen.getByRole('button', {
        name: 'Perform Maintenance · 1 × filters · 20 min offline',
      });
      expect(maintain).toBeEnabled();
      expect(maintain).toHaveFocus();
      expect(opened).not.toHaveBeenCalled();
      expect(useUIStore.getState().maintenanceFocusRequested).toBe(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener('millos:open-operations-workspace', opened);
      useProductionStore.setState({ machines });
      useUIStore.setState({ maintenanceFocusRequested: false });
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
