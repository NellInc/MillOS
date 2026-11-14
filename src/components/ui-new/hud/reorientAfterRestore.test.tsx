import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));
import { HudResult } from './HudResult';
import { resetReorientation } from './reorientAfterRestore';
import { resetRestoreLatch } from '../../../systems/restoreLatch';
import { FirstDeliveryJourney } from '../onboarding/PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { resetUnifiedTickState } from '../../../systems/UnifiedGameTick';
import {
  capturePhysicalSession,
  encodePhysicalSession,
  installPhysicalSession,
  isPhysicalSessionRestoring,
  PHYSICAL_SESSION_KEY,
} from '../../../utils/physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../../simulation/workplaceReplayRuntime';

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
const ready = () =>
  act(() => {
    startup.ready = true;
    startup.listeners.forEach((f) => f());
  });

/** The app as a returning player loads it: the HUD's result host and the guide's host rule. */
function Host() {
  const visible = useUIStore((s) => s.journeyVisible);
  return (
    <>
      <HudResult />
      {visible && <FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />}
    </>
  );
}

/** A shift saved mid-order (order-001, nothing shipped), then a reload that restores it. */
function reloadMidOrder() {
  useOperationsCampaignStore.getState().initializeCampaign();
  localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(capturePhysicalSession()));
  resetPlant();
  dispose = installPhysicalSession();
  expect(isPhysicalSessionRestoring()).toBe(true);
}

beforeEach(() => {
  resetReorientation();
  resetPlant();
  resetRestoreLatch();
  localStorage.clear();
  startup.ready = false;
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useUIStore.setState({
    ...useUIStore.getInitialState(),
    alerts: [],
    hasSeenIntro: true,
    journeyVisible: false,
    journeyOrderId: null,
    inspectedMachineIds: ['rm-101'],
  });
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

describe('a returning player', () => {
  it('a reload shows the current order in the compact guide, once', () => {
    reloadMidOrder();
    const view = render(<Host />);
    // Nothing until the restore has finished.
    expect(screen.queryByRole('button', { name: 'Expand delivery guide' })).toBeNull();
    ready();
    expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toBeVisible();
    expect(screen.getByText(/Riverside Bakers' Cooperative: 6,000 kg/)).toBeVisible();
    expect(useUIStore.getState().journeyOrderId).toBe('order-001');
    // The opening lesson the player already had is not started again.
    expect(useUIStore.getState().inspectedMachineIds).toEqual(['rm-101']);
    // Closed, it stays closed: a remount does not reopen it.
    fireEvent.click(screen.getByRole('button', { name: 'Close guided delivery' }));
    view.unmount();
    render(<Host />);
    expect(useUIStore.getState().journeyVisible).toBe(false);
    expect(screen.queryByRole('button', { name: 'Expand delivery guide' })).toBeNull();
  });

  // The operational UI is a deferred chunk revealed on the first frame, so it
  // can mount after the restore has finished.
  it('still reorients when the interface mounts after the restore finished', () => {
    reloadMidOrder();
    ready();
    expect(isPhysicalSessionRestoring()).toBe(false);
    render(<Host />);
    expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toBeVisible();
    expect(screen.getByText(/Riverside Bakers' Cooperative: 6,000 kg/)).toBeVisible();
  });

  it('leaves a guide that was open as it was', () => {
    useUIStore.setState({ journeyVisible: true, journeyOrderId: 'order-002' });
    reloadMidOrder();
    useUIStore.setState({ journeyVisible: true, journeyOrderId: 'order-002' });
    render(<Host />);
    ready();
    expect(useUIStore.getState().journeyOrderId).toBe('order-002');
    expect(screen.getByRole('button', { name: 'Compact delivery guide' })).toBeVisible();
  });

  it('waits for the tour when it has not been seen, and does nothing without a restore', () => {
    useUIStore.setState({ hasSeenIntro: false });
    reloadMidOrder();
    render(<Host />);
    ready();
    expect(useUIStore.getState().journeyVisible).toBe(false);
    cleanup();
    dispose?.();
    dispose = undefined;
    resetReorientation();
    resetRestoreLatch();
    localStorage.clear();
    useUIStore.setState({ hasSeenIntro: true });
    // A first visit: nothing saved, nothing restored.
    dispose = installPhysicalSession();
    expect(isPhysicalSessionRestoring()).toBe(false);
    render(<Host />);
    ready();
    expect(useUIStore.getState().journeyVisible).toBe(false);
  });
});
