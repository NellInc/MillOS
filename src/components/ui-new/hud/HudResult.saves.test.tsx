import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const startup = vi.hoisted(() => ({
  ready: false,
  listeners: new Set<() => void>(),
}));
vi.mock('../../../utils/startupReadiness', async (original) => ({
  ...(await original<typeof import('../../../utils/startupReadiness')>()),
  getStartupSnapshot: () => ({ ready: startup.ready, opened: false }),
  subscribeStartup: (callback: () => void) => {
    startup.listeners.add(callback);
    return () => startup.listeners.delete(callback);
  },
}));
import { HudResult } from './HudResult';
import { resetReorientation } from './reorientAfterRestore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useUIStore } from '../../../stores/uiStore';
import { resetUnifiedTickState } from '../../../systems/UnifiedGameTick';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
  installPhysicalSession,
  PHYSICAL_SESSION_KEY,
} from '../../../utils/physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../../simulation/workplaceReplayRuntime';

// The celebration queue is saved twice: in the physical session (restored
// without the store's sanitiser) and in the store's own persisted record
// (through it). A save from before 'order_fulfilled' and one holding it must
// both load, and neither may replay a result on reload.
const REAL_SAVE = join(
  __dirname,
  '../../../utils/__tests__/fixtures/physical-saves/2026-11-02-15c8b571.json'
);

let dispose: (() => void) | undefined;
let removeOwners: (() => void)[] = [];
const resetPlant = () => {
  useMaterialFlowStore.getState().resetMaterialFlow();
  useProductionStore.setState(useProductionStore.getInitialState(), true);
  useOperationsCampaignStore.getState().resetCampaign();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useGameSimulationStore.getState().resetGameState();
  resetUnifiedTickState();
};

type SavedRecord = {
  participants: { id: string; value: unknown }[];
  game: { celebrations: { milestoneQueue: unknown[]; celebrationActive: boolean } };
};
/** The real 2 November save, its queue set to `queue`, restored as a reload restores it. */
function restoreRealSave(queue: unknown[]) {
  const record = JSON.parse(readFileSync(REAL_SAVE, 'utf8')) as SavedRecord;
  record.participants = REQUIRED_REPLAY_PARTICIPANTS.map((id) => ({
    id,
    value: { phase: 'waiting', value: 17 },
  }));
  record.game.celebrations.milestoneQueue = queue;
  record.game.celebrations.celebrationActive = queue.length > 0;
  const raw = JSON.stringify(record);
  expect(() => decodePhysicalSession(raw)).not.toThrow();
  localStorage.setItem(PHYSICAL_SESSION_KEY, raw);
  dispose = installPhysicalSession();
  expect(useGameSimulationStore.getState().clockHolds.map((h) => h.holder)).not.toContain(
    'restoreFailed'
  );
}
const finishRestore = () =>
  act(() => {
    startup.ready = true;
    startup.listeners.forEach((f) => f());
  });

beforeEach(() => {
  resetReorientation();
  resetPlant();
  localStorage.clear();
  startup.ready = false;
  useUIStore.setState({ alerts: [], journeyVisible: true });
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, {
      capture: () => ({ phase: 'waiting', value: 17 }),
      restore: () => undefined,
    })
  );
});

afterEach(() => {
  cleanup();
  dispose?.();
  dispose = undefined;
  removeOwners.forEach((f) => f());
  localStorage.clear();
  resetPlant();
});

describe('saved celebration queues', () => {
  it('a save from before this change, holding the old daily-target entries, loads and shows nothing', () => {
    restoreRealSave([
      { type: 'milestone', timestamp: 1, value: 300, message: 'Daily target 25% complete' },
      {
        type: 'target_met',
        timestamp: 2,
        value: 1200,
        message: 'Daily target reached: 1,200 bags!',
      },
      { type: 'milestone', timestamp: 3, message: 'Achievement unlocked: First Bag' },
    ]);
    render(<HudResult />);
    finishRestore();
    expect(screen.queryByTestId('hud-result')).toBeNull();
    expect(screen.getByTestId('hud-result-status')).toHaveTextContent('');
    expect(useGameSimulationStore.getState().celebrations.milestoneQueue).toEqual([]);
  });

  it('a save holding an order result loads, keeps its facts, and a reload raises nothing', () => {
    useGameSimulationStore.getState().triggerCelebration('order_fulfilled', {
      customer: "Riverside Bakers' Cooperative",
      value: 6000,
      lateMinutes: 0,
    });
    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    const entry = saved.game.celebrations.milestoneQueue[0];
    expect(entry).toMatchObject({
      type: 'order_fulfilled',
      customer: "Riverside Bakers' Cooperative",
      value: 6000,
      lateMinutes: 0,
    });
    resetPlant();
    restoreRealSave([entry, 'corrupt', { type: 'order_fulfilled', timestamp: 'x' }]);
    render(<HudResult />);
    finishRestore();
    expect(screen.queryByTestId('hud-result')).toBeNull();
    expect(useGameSimulationStore.getState().celebrations.milestoneQueue).toEqual([]);
  });

  it("the store's own record keeps an order result's facts and drops what is malformed", () => {
    const merge = useGameSimulationStore.persist.getOptions().merge!;
    const merged = merge(
      {
        celebrations: {
          milestoneQueue: [
            {
              type: 'order_fulfilled',
              timestamp: 5,
              customer: 'Community Pasta Works',
              value: 4000,
              lateMinutes: 12.4,
              grade: 'Z',
            },
            { type: 'shift_complete', timestamp: 6, grade: 'B', shiftKey: 'day-0-night' },
            { type: 'unknown_kind', timestamp: 7 },
          ],
        },
      },
      useGameSimulationStore.getState()
    ) as ReturnType<typeof useGameSimulationStore.getState>;
    expect(merged.celebrations.milestoneQueue).toEqual([
      {
        type: 'order_fulfilled',
        timestamp: 5,
        customer: 'Community Pasta Works',
        value: 4000,
        lateMinutes: 13,
      },
      { type: 'shift_complete', timestamp: 6, grade: 'B', shiftKey: 'day-0-night' },
    ]);
  });
});
