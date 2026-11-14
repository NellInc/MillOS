import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertSystem } from '../../components/AlertSystem';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import {
  PROGRAMME_WINDOW_MINUTES,
  PROPOSAL_KIND_IDS,
  type PartnerProposal,
} from '../../simulation/partnerProposals';
import { ringIncident, ringIntake } from '../incidentRuntime';
import { ringTemper } from '../temperRuntime';
import { MachineType, type MachineData } from '../../types';
import { setLocale } from '../../i18n';

vi.mock('../../utils/audioManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/audioManager')>();
  return { ...actual, audioManager: Object.assign(actual.audioManager, { playAlert: vi.fn() }) };
});

// An asked card has a window that runs out, then the partner's choice runs.
// A screen-reader player must hear it raised, once and politely, with what is
// asked and how long there is; a decided-and-told card stays quiet unless it
// reports a problem (a decision that could not run).

const tick = (n = 1): void => {
  for (let i = 0; i < n; i++)
    unifiedGameTick({
      deltaSeconds: 0.5,
      gameTime: useGameSimulationStore.getState().gameTime,
      gameSpeed: STANDARD_GAME_SPEED,
      elapsedTime: 0,
      tickCount: i,
    } satisfies TickContext);
};
const politeRegion = () => document.querySelector('[role="status"][aria-live="polite"]');
const completeProgramme = () =>
  useOperationsCampaignStore.setState({
    orders: useOperationsCampaignStore.getState().orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 1,
    })),
    activeOrderId: null,
  });
const mill = (): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 450, temperature: 50, vibration: 1, load: 80, wear: 70, efficiency: 86 },
  lastMaintenance: '2026-11-01',
  nextMaintenance: '2026-11-08',
});
const delegate = (value: 'ask' | 'decide') => {
  usePartnerProposalStore.getState().reset();
  for (const kind of PROPOSAL_KIND_IDS)
    usePartnerProposalStore.getState().setDelegation(kind, value);
};

beforeEach(() => {
  setLocale('en');
  resetUnifiedTickState();
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
  useProductionStore.setState({ ...useProductionStore.getInitialState(), machines: [] });
  delegate('ask');
  useUIStore.setState({ alerts: [] });
  tick();
});
afterEach(() => cleanup());

describe('an asked proposal reaches a screen reader', () => {
  it('reads the programme card once, politely, with its window in game minutes', () => {
    render(<AlertSystem />);
    act(() => {
      completeProgramme();
      tick();
    });
    const window = `You have ${PROGRAMME_WINDOW_MINUTES} min to answer.`;
    expect(politeRegion()?.textContent).toMatch(/Programme \d+ is offered/);
    expect(politeRegion()?.textContent).toContain(window);
    const bell = useUIStore.getState().alerts.find((a) => a.id.startsWith('partner-proposal-'));
    expect(bell?.announce).toBe('polite');
    expect(bell?.message).toContain(window);
  });

  it('keeps a decided-and-told card quiet, and reads one that could not run', () => {
    delegate('decide');
    render(<AlertSystem />);
    act(() => {
      completeProgramme();
      tick();
    });
    const told = useUIStore.getState().alerts.find((a) => a.id.startsWith('partner-decided-'));
    expect(told?.message).toMatch(/The partner accepted programme/);
    expect(told?.announce).toBeUndefined();
    expect(politeRegion()?.textContent ?? '').not.toMatch(/accepted programme/);

    // Service with no free part: the partner's choice cannot run, a problem.
    act(() => {
      useBreakdownStore.setState({
        partsInventory: { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 },
      });
      useProductionStore.setState({ machines: [mill()] });
      useBreakdownStore
        .getState()
        .addPredictiveAlert(
          'rm-101',
          'R.M. 101',
          { vibration: 1, temperature: 50, load: 80 },
          600,
          'mechanical'
        );
      tick();
    });
    const refused = useUIStore
      .getState()
      .alerts.find((a) => a.id.startsWith('partner-decided-') && /could not/.test(a.message));
    expect(refused?.announce).toBe('polite');
    expect(politeRegion()?.textContent).toMatch(/could not service R\.M\. 101/);
  });

  it('announces the intake, incident and temper cards with their windows', () => {
    const asked = (kind: string, facts: Record<string, unknown>, option: string) =>
      ({
        id: `proposal-${kind}`,
        kind,
        subject: kind,
        raisedAtMinute: 0,
        windowMinutes: 24,
        options: [],
        defaultOptionId: option,
        facts,
        sessionId: 's',
        status: 'open',
      }) as unknown as PartnerProposal<never>;
    ringIntake(asked('intake', { fallingNumberS: 240, moisturePct: 14.2 }, 'accept'));
    ringIncident(asked('incident', { incidentKind: 'bearing_overheat' }, 'isolate'));
    ringTemper(asked('temper', { moisturePct: 15.5 }, 'dry-first'));
    for (const id of ['proposal-intake', 'proposal-incident', 'proposal-temper']) {
      const bell = useUIStore.getState().alerts.find((a) => a.id === `partner-proposal-${id}`);
      expect(bell?.announce, id).toBe('polite');
      expect(bell?.message, id).toContain('You have 24 min to answer.');
    }
  });
});
