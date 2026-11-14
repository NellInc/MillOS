import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudResult } from './HudResult';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../../../stores/operationsCampaignStore';
import type { MaterialManifest, ProductionBatch } from '../../../stores/materialFlowStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { celebrateCampaignResults, openOrderIds } from '../../../systems/campaignResults';
import { setLocale } from '../../../i18n';
import { audioManager } from '../../../utils/audioManager';

vi.mock('../../../utils/audioManager', () => ({
  audioManager: { muted: false, playCycleBell: vi.fn() },
}));

const campaign = () => useOperationsCampaignStore.getState();
const game = () => useGameSimulationStore.getState();

function tickContext(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.2,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-0',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
    ...overrides,
  };
}

/**
 * order-001's last 5,000 kg leaves on a truck through the campaign's own
 * shipment credit, with the tick's before and after reading around it.
 */
function deliverOrder001() {
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) =>
      order.id === 'order-001' ? { ...order, shippedKg: 1000 } : order
    ),
  });
  const kg = 5000;
  const batch: ProductionBatch = {
    id: 'batch-hud-1',
    packerId: 'packer-0',
    materialType: 'flour',
    producedKg: kg,
    availableKg: 0,
    simulationTime: 10,
    sourceContributions: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
    disposition: 'shipped',
    dispositionReason: 'Fully dispatched',
    qcTestIds: [],
    dispatchManifestIds: ['shipping-hud-1'],
    sealed: true,
  };
  const manifest: MaterialManifest = {
    id: 'shipping-hud-1',
    kind: 'shipping',
    dock: 'shipping',
    requestedKg: kg,
    actualKg: kg,
    materials: [{ type: 'flour', amount: kg }],
    sourceLots: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
    productBatches: [{ batchId: batch.id, amount: kg }],
    simulationTime: 20,
  };
  campaign().tickCampaign(60, tickContext());
  const openBefore = openOrderIds();
  const lastReportBefore = campaign().reports.at(-1)?.id;
  campaign().tickCampaign(
    60,
    tickContext({
      manifests: [manifest],
      productionBatches: [batch],
      dispatchLoad: {
        cycleId: 'shipping-1',
        status: 'departed',
        loadedKg: kg,
        capacityKg: kg,
        materialType: 'flour',
        blockReason: null,
        lastDispatchKg: kg,
      },
    })
  );
  celebrateCampaignResults(openBefore, lastReportBefore);
}

const status = () => screen.getByTestId('hud-result-status');
const chip = () => screen.queryByTestId('hud-result');

beforeEach(() => {
  vi.useFakeTimers();
  setLocale('en');
  campaign().resetCampaign();
  game().resetGameState();
  useUIStore.setState({ alerts: [] });
  audioManager.muted = false;
  vi.mocked(audioManager.playCycleBell).mockClear();
  useAnnouncementsStore.setState({ mode: 'focused' });
  useAnnouncementsStore.getState().setContext({ safetyCritical: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLocale('en');
});

describe('the HUD result', () => {
  it('fulfilling order-001 renders a status naming the customer and "on time", with one bell', () => {
    render(<HudResult />);
    act(() => deliverOrder001());
    expect(campaign().orders.find((order) => order.id === 'order-001')?.status).toBe('fulfilled');
    expect(status()).toHaveAttribute('role', 'status');
    expect(status()).toHaveTextContent("Riverside Bakers' Cooperative: 6,000 kg, on time");
    expect(chip()).toHaveTextContent("Riverside Bakers' Cooperative: 6,000 kg, on time");
    expect(audioManager.playCycleBell).toHaveBeenCalledTimes(1);
    // Shown once, then gone; the queue is drained.
    act(() => vi.advanceTimersByTime(6000));
    expect(chip()).toBeNull();
    expect(game().celebrations.milestoneQueue).toEqual([]);
    expect(audioManager.playCycleBell).toHaveBeenCalledTimes(1);
  });

  it('reads in the language active now', () => {
    render(<HudResult />);
    act(() => setLocale('pt-BR'));
    act(() => deliverOrder001());
    expect(status()).toHaveTextContent("Riverside Bakers' Cooperative: 6.000 kg, no prazo");
  });

  it('names a late delivery as late and does not ring for it', () => {
    render(<HudResult />);
    act(() =>
      game().triggerCelebration('order_fulfilled', {
        customer: 'Community Pasta Works',
        value: 4000,
        lateMinutes: 75,
      })
    );
    expect(chip()).toHaveTextContent('Community Polenta Kitchen: 4,000 kg, 1h 15m late');
    expect(audioManager.playCycleBell).not.toHaveBeenCalled();
  });

  it('shows a graded shift without reading it again, and rings for an A or B', () => {
    render(<HudResult />);
    act(() =>
      game().triggerCelebration('shift_complete', { grade: 'B', shiftKey: 'day-0-morning' })
    );
    expect(chip()).toHaveTextContent('Morning shift: grade B');
    // Its bell notice and PA caption already read it.
    expect(status()).toHaveTextContent('');
    expect(audioManager.playCycleBell).toHaveBeenCalledTimes(1);
  });

  it('shows and reads an unlock, one result at a time, each once', () => {
    render(<HudResult />);
    act(() => {
      game().triggerCelebration('milestone', { message: 'Achievement unlocked: First Bag' });
      game().triggerCelebration('shift_complete', { grade: 'D', shiftKey: 'day-0-night' });
    });
    expect(chip()).toHaveTextContent('Achievement unlocked: First Bag');
    expect(status()).toHaveTextContent('Achievement unlocked: First Bag');
    act(() => vi.advanceTimersByTime(6000));
    expect(chip()).toHaveTextContent('Night shift: grade D');
    act(() => vi.advanceTimersByTime(6000));
    expect(chip()).toBeNull();
    // A D is not a win.
    expect(audioManager.playCycleBell).toHaveBeenCalledTimes(1);
  });

  it('is silent while muted, with the PA off, and under the PA safety hold', () => {
    audioManager.muted = true;
    render(<HudResult />);
    act(() => deliverOrder001());
    expect(chip()).not.toBeNull();
    audioManager.muted = false;
    act(() => vi.advanceTimersByTime(6000));
    useAnnouncementsStore.setState({ mode: 'off' });
    act(() => game().triggerCelebration('milestone', { message: 'Achievement unlocked: A' }));
    expect(chip()).toHaveTextContent('Achievement unlocked: A');
    act(() => vi.advanceTimersByTime(6000));
    useAnnouncementsStore.setState({ mode: 'focused' });
    act(() => useAnnouncementsStore.getState().setContext({ safetyCritical: true }));
    act(() => game().triggerCelebration('milestone', { message: 'Achievement unlocked: B' }));
    expect(chip()).toHaveTextContent('Achievement unlocked: B');
    expect(audioManager.playCycleBell).not.toHaveBeenCalled();
  });

  it('names kilograms that failed quality, and does not ring for them', () => {
    render(<HudResult />);
    act(() =>
      game().triggerCelebration('order_fulfilled', {
        customer: 'County School Meals',
        value: 8000,
        lateMinutes: 0,
        offSpecKg: 1200,
      })
    );
    expect(status()).toHaveTextContent(
      'County School Meals: 8,000 kg, on time, 1,200 kg failed quality'
    );
    expect(audioManager.playCycleBell).not.toHaveBeenCalled();
  });

  it('discards what was queued before it mounted, the old daily-target entries among them', () => {
    useGameSimulationStore.setState({
      celebrations: {
        ...game().celebrations,
        milestoneQueue: [
          { type: 'milestone', timestamp: 1, value: 300, message: 'Daily target 25% complete' },
          { type: 'target_met', timestamp: 2, value: 1200, message: 'Daily target reached' },
          { type: 'order_fulfilled', timestamp: 3, customer: 'Old', value: 1, lateMinutes: 0 },
        ],
        celebrationActive: true,
      },
    });
    render(<HudResult />);
    expect(chip()).toBeNull();
    expect(game().celebrations.milestoneQueue).toEqual([]);
    expect(audioManager.playCycleBell).not.toHaveBeenCalled();
  });

  it('is inert in a benchmark run', () => {
    const url = window.location.href;
    window.history.replaceState(null, '', '/?benchmark=1');
    try {
      render(<HudResult />);
      act(() => deliverOrder001());
      expect(chip()).toBeNull();
      expect(screen.queryByTestId('hud-result-status')).toBeNull();
      expect(audioManager.playCycleBell).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, '', url);
    }
  });
});

describe('unread notices, surfaced once', () => {
  const alert = (id: string, type: 'warning' | 'critical' | 'success' | 'info', title: string) => ({
    id,
    type,
    title,
    message: `${title}.`,
    timestamp: new Date(),
    acknowledged: false,
  });

  it('shows a new notice that needs reading once, and leaves records and old notices alone', () => {
    useUIStore.setState({ alerts: [alert('old-warning', 'warning', 'Old warning')] });
    render(<HudResult />);
    expect(chip()).toBeNull();
    act(() => {
      useUIStore.getState().addAlert(alert('ach', 'success', 'Achievement unlocked'));
      useUIStore.getState().addAlert(alert('shift', 'info', 'Morning shift closed: grade B'));
      useUIStore.getState().addAlert(alert('wear', 'warning', 'Wear warning'));
    });
    expect(chip()).toHaveTextContent('Wear warning');
    expect(chip()).toHaveAttribute('data-kind', 'notice');
    // Visual only: AlertSystem reads announced notices.
    expect(status()).toHaveTextContent('');
    expect(audioManager.playCycleBell).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5000));
    expect(chip()).toBeNull();
    // Acknowledging it later raises nothing again.
    act(() => useUIStore.getState().acknowledgeAlert('wear'));
    act(() => vi.advanceTimersByTime(5000));
    expect(chip()).toBeNull();
  });

  it('skips a notice acknowledged before its turn, and shows results before notices', () => {
    render(<HudResult />);
    act(() => {
      game().triggerCelebration('shift_complete', { grade: 'A', shiftKey: 'day-0-morning' });
      useUIStore.getState().addAlert(alert('fault', 'critical', 'Machine Breakdown'));
      useUIStore.getState().addAlert(alert('hold', 'warning', 'Quality hold'));
    });
    expect(chip()).toHaveTextContent('Morning shift: grade A');
    act(() => useUIStore.getState().acknowledgeAlert('fault'));
    act(() => vi.advanceTimersByTime(6000));
    expect(chip()).toHaveTextContent('Quality hold');
    act(() => vi.advanceTimersByTime(5000));
    expect(chip()).toBeNull();
  });
});
