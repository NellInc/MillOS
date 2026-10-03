import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({
  callback: null as null | ((state: { clock: { elapsedTime: number } }) => void),
  startup: {
    pendingAssets: 0,
    pendingTasks: 0,
    loadedAssets: 10,
    totalAssets: 10,
    errors: 0,
    revision: 0,
    ready: false,
  },
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: typeof probe.callback) => {
    probe.callback = callback;
  },
}));
vi.mock('../../utils/startupReadiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/startupReadiness')>()),
  getStartupSnapshot: () => probe.startup,
}));

import { CentralTickProvider } from '../CentralTickProvider';
import { LoadingScreen } from '../../components/LoadingScreen';
import { centralTick, TICK_PRIORITY } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useProductionStore } from '../../stores/productionStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';

const onTick = vi.fn(unifiedGameTick);
const lazyTick = vi.fn();

function frame(elapsedTime: number) {
  probe.callback?.({ clock: { elapsedTime } });
}

beforeEach(() => {
  centralTick.reset();
  resetUnifiedTickState();
  probe.callback = null;
  probe.startup.ready = false;
  onTick.mockClear();
  lazyTick.mockClear();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.getState().setTabVisible(true);
  useOperationsCampaignStore.getState().resetCampaign();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useProductionStore.setState(useProductionStore.getInitialState(), true);
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  render(<CentralTickProvider />);
  centralTick.register('actual-unified-tick', onTick, TICK_PRIORITY.CRITICAL);
  centralTick.register('lazy-observer', lazyTick, TICK_PRIORITY.NORMAL);
});

afterEach(() => {
  cleanup();
  centralTick.reset();
  resetUnifiedTickState();
  delete document.documentElement.dataset.millosStartupReady;
  delete document.documentElement.dataset.loaderFallback;
});

describe('CentralTickProvider player-ready simulation barrier', () => {
  it('offers reload recovery while keeping the real shift frozen until readiness', async () => {
    render(<LoadingScreen recoveryDelayMs={0} minimumLoadTimeMs={0} />);
    frame(90);
    expect(onTick).not.toHaveBeenCalled();

    expect(await screen.findByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continue while preparing' })).toBeNull();
    frame(90.5);

    expect(probe.startup.ready).toBe(false);
    expect(document.documentElement.dataset.millosStartupReady).toBeUndefined();
    expect(document.documentElement.dataset.loaderFallback).toBeUndefined();
    expect(onTick).not.toHaveBeenCalled();
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(0);
  });

  it('ignores an obsolete loader fallback flag rather than bypassing real readiness', () => {
    document.documentElement.dataset.loaderFallback = 'true';
    frame(90);
    frame(90.5);
    expect(onTick).not.toHaveBeenCalled();
    expect(lazyTick).not.toHaveBeenCalled();
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(0);
    expect(centralTick.getStats().tickCount).toBe(0);
  });

  it('preserves the clock, deadlines and physical stock throughout a long loading screen', () => {
    const gameTime = useGameSimulationStore.getState().gameTime;
    const campaignMinutes = useOperationsCampaignStore.getState().elapsedMinutes;
    const balance = useMaterialFlowStore.getState().getMaterialBalance();
    const tracking = { ...useProductionStore.getState()._metricTracking };
    // The canonical readiness snapshot, rather than a stale DOM marker, owns this gate.
    document.documentElement.dataset.millosStartupReady = 'true';
    for (let elapsedTime = 0.5; elapsedTime <= 90; elapsedTime += 0.5) frame(elapsedTime);

    expect(useGameSimulationStore.getState().gameTime).toBe(gameTime);
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(campaignMinutes);
    expect(useMaterialFlowStore.getState().getMaterialBalance()).toEqual(balance);
    expect(useProductionStore.getState()._metricTracking).toEqual(tracking);
    expect(onTick).not.toHaveBeenCalled();
    expect(lazyTick).not.toHaveBeenCalled();
    expect(centralTick.getStats().tickCount).toBe(0);
  });

  it('starts with one ordinary interval after readiness, without charging hidden load time', () => {
    frame(90);
    probe.startup.ready = true;
    frame(90.5);

    expect(onTick).toHaveBeenCalledOnce();
    expect(onTick.mock.calls[0][0]).toMatchObject({ deltaSeconds: 0.5, tickCount: 1 });
    expect(lazyTick).toHaveBeenCalledOnce();
    expect(useGameSimulationStore.getState().gameTime).toBeCloseTo(10 + 90 / 3600);
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(1.5);

    frame(90.6);
    expect(onTick).toHaveBeenCalledOnce();
    frame(91);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(3);
  });

  it('keeps a ready hidden tab frozen and resumes without a catch-up burst', () => {
    probe.startup.ready = true;
    useGameSimulationStore.getState().setTabVisible(false);
    frame(90);
    expect(onTick).not.toHaveBeenCalled();
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(0);

    useGameSimulationStore.getState().setTabVisible(true);
    frame(90.5);
    expect(onTick).toHaveBeenCalledOnce();
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(1.5);
  });

  it('retains the existing pause and chosen pace when startup becomes ready', () => {
    useGameSimulationStore.getState().setGameSpeed(30);
    centralTick.setPaused(true);
    frame(90);
    probe.startup.ready = true;
    frame(90.5);
    expect(onTick).not.toHaveBeenCalled();
    expect(centralTick.getStats().isPaused).toBe(true);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);

    centralTick.setPaused(false);
    frame(91);
    expect(onTick).toHaveBeenCalledOnce();
    expect(useOperationsCampaignStore.getState().elapsedMinutes).toBe(0.25);
  });
});
