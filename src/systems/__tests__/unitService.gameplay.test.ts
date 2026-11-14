import { beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import {
  PART_PRICE,
  PARTS_REORDER_RULE,
  partsOnOrder,
  useBreakdownStore,
} from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import {
  getWearConfig,
  REPAIR_HEADROOM_WEAR,
  useProductionStore,
} from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { shiftMargin } from '../../simulation/shiftReview';
import { lineOverdrive, OVERDRIVE_WEAR_SLOPE } from '../../simulation/machineLoad';
import { getMachineEnergy } from '../../utils/energyCalculations';
import type { TickContext } from '../CentralTickSystem';
import { productPathQuality, resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import {
  beginUnitRestart,
  beginUnitService,
  RESTART_GAME_SECONDS,
  stepUnitWork,
  unitInService,
  unitRestarting,
} from '../unitService';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
} from '../../utils/physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../simulation/workplaceReplayRuntime';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { PROPOSAL_KIND_IDS } from '../../simulation/partnerProposals';

// Written with every proposal kind asking (a service waits its card's window);
// a kind's default now follows the delegation rule, so "ask me" is set here,
// as the card's toggle sets it.
beforeEach(() => {
  usePartnerProposalStore.getState().reset();
  for (const kind of PROPOSAL_KIND_IDS)
    usePartnerProposalStore.getState().setDelegation(kind, 'ask');
});

// Plan items 3.3 (D7) and 3.6. Service takes the unit offline on the game
// clock; a repair is not a service; a broken unit never lifts quality; parts
// are ordered and paid for; Restart runs on the game clock; above 100% a line
// wears and draws power faster than it gains.

/** One tick of `gameSeconds` game time (0.5 s real at the matching pace). */
const tick = (gameSeconds: number, n = 1): void => {
  for (let i = 0; i < n; i++)
    unifiedGameTick({
      deltaSeconds: 0.5,
      gameTime: useGameSimulationStore.getState().gameTime,
      gameSpeed: gameSeconds / 0.5,
      elapsedTime: 0,
      tickCount: i + 1,
    } satisfies TickContext);
};

const mill = (overrides: Partial<MachineData> = {}): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 1400, temperature: 50, vibration: 2, load: 74, wear: 70, efficiency: 73 },
  lastMaintenance: '2026-08-01T00:00:00.000Z',
  nextMaintenance: '2026-08-08T00:00:00.000Z',
  ...overrides,
});
const unit = () => useProductionStore.getState().machines.find((m) => m.id === 'rm-101')!;

describe('the maintenance window, on the game clock', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.setState({ machines: [mill()], productionSpeed: 1 });
    useUIStore.setState({ alerts: [] });
  });

  it('takes the unit offline for its service minutes, holds while paused, and takes one part at the start', () => {
    const minutes = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes;
    const filters = useBreakdownStore.getState().partsInventory.filters;
    const result = beginUnitService('rm-101');
    expect(result).toEqual({ started: true, part: 'filters', minutes });
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters - 1);
    expect(unit().status).toBe('idle');
    expect(unit().metrics.wear).toBe(70);

    // A paused clock grants no game time, so the service stands still.
    unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 0, elapsedTime: 0, tickCount: 1 });
    expect(unitInService('rm-101')).toBe(true);

    // A Restart cannot put an offline unit back on line.
    expect(beginUnitRestart('rm-101')).toBe(false);
    useProductionStore.getState().updateMachineStatus('rm-101', 'running');

    tick(60, minutes - 1);
    expect(unitInService('rm-101')).toBe(true);
    expect(unit().status).toBe('idle');
    expect(unit().metrics.wear).toBe(70);

    tick(60);
    expect(unitInService('rm-101')).toBe(false);
    expect(unit().status).toBe('running');
    // Serviced to 20; the rest of that tick it ran, and wore a little.
    expect(unit().metrics.wear).toBeGreaterThanOrEqual(20);
    expect(unit().metrics.wear).toBeLessThan(20.1);
    expect(unit().maintenanceHistory?.[0]).toMatchObject({ type: 'preventive', duration: minutes });
    // One part, at the start; none at the end.
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters - 1);
  });

  it('a unit idle when its service began stays idle once serviced', () => {
    useProductionStore.setState({ machines: [mill({ status: 'idle' })] });
    expect(beginUnitService('rm-101').started).toBe(true);
    tick(60, getWearConfig(MachineType.ROLLER_MILL).serviceMinutes);
    expect(unitInService('rm-101')).toBe(false);
    expect(unit().status).toBe('idle');
    expect(unit().metrics.wear).toBe(20);
  });

  it('a repair restart is not a service: the unit returns just below its breakdown wear, still to be serviced', () => {
    useProductionStore.setState({
      machines: [
        mill({ status: 'critical', metrics: { ...mill().metrics, wear: 90, efficiency: 0 } }),
      ],
    });
    const breakdown = useBreakdownStore
      .getState()
      .triggerBreakdown('rm-101', 'R.M. 101', 'mechanical')!;
    const store = useBreakdownStore.getState();
    expect(store.startRepair(breakdown.id).started).toBe(true);
    store.updateRepairProgress(breakdown.id, 100);
    expect(useBreakdownStore.getState().verifyRepair(breakdown.id)).toBe(true);
    expect(useBreakdownStore.getState().requestMachineRestart(breakdown.id)).toBe(true);
    tick(1);

    const threshold = getWearConfig(MachineType.ROLLER_MILL).breakdownThreshold;
    expect(unit().metrics.wear).toBeCloseTo(threshold - REPAIR_HEADROOM_WEAR, 1);
    expect(unit().status).toBe('warning');
    // Its service is asked for: a wear prediction is open for it again.
    const open = useBreakdownStore
      .getState()
      .predictiveAlerts.filter((a) => a.machineId === 'rm-101' && !a.acknowledged);
    expect(open).toHaveLength(1);
    expect(open[0].windowFromWear).toBe(true);
    expect(open[0].predictedTimeToFailure).toBeGreaterThan(60);
  });

  it('a unit that breaks down never lifts the stamp on what the others pack', () => {
    const line = [
      mill({
        id: 'rm-101',
        status: 'warning',
        metrics: { ...mill().metrics, wear: 89, efficiency: 61 },
      }),
      mill({
        id: 'rm-102',
        status: 'running',
        metrics: { ...mill().metrics, wear: 10, efficiency: 100 },
      }),
    ];
    const before = productPathQuality(line);
    const broken = line.map((m) =>
      m.id === 'rm-101'
        ? { ...m, status: 'critical' as const, metrics: { ...m.metrics, wear: 90, efficiency: 0 } }
        : m
    );
    expect(productPathQuality(broken)).toBeLessThanOrEqual(before);
    // Nor does taking it offline for service, until the service is done.
    const offline = line.map((m) => (m.id === 'rm-101' ? { ...m, status: 'idle' as const } : m));
    expect(productPathQuality(offline)).toBe(before);
  });

  it('runs a Restart on the game clock, whatever pace, and only then puts the unit back', () => {
    useProductionStore.setState({
      machines: [
        mill({ status: 'idle', metrics: { ...mill().metrics, wear: 10, efficiency: 100 } }),
      ],
    });
    expect(beginUnitRestart('rm-101')).toBe(true);
    tick(15, RESTART_GAME_SECONDS / 15 - 1);
    expect(unitRestarting('rm-101')).toBe(true);
    expect(unit().status).toBe('idle');
    tick(15, 1);
    expect(unitRestarting('rm-101')).toBe(false);
    expect(unit().status).toBe('running');
  });
});

describe('parts are ordered and paid for', () => {
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it('a delivery brings only what the reorder rule has on order', () => {
    expect(useBreakdownStore.getState().restockDelivery()).toEqual({});
    const filters = PARTS_REORDER_RULE.filters;
    useBreakdownStore.setState((s) => ({
      partsInventory: { ...s.partsInventory, filters: filters.reorderPoint },
    }));
    expect(partsOnOrder(useBreakdownStore.getState().partsInventory)).toEqual({
      filters: filters.orderUpTo - filters.reorderPoint,
    });
    expect(useBreakdownStore.getState().restockDelivery()).toEqual({
      filters: filters.orderUpTo - filters.reorderPoint,
    });
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters.orderUpTo);
  });

  it('books grain into stock held and parts as spent', () => {
    useOperationsCampaignStore
      .getState()
      .bookPurchase({ grainCost: 440, partsCost: PART_PRICE.filters });
    const metrics = useOperationsCampaignStore.getState().shiftMetrics;
    expect(metrics.grainCost).toBe(440);
    expect(metrics.stockHeld).toBe(440);
    expect(metrics.partsCost).toBe(PART_PRICE.filters);
    // Grain not yet shipped is money spent, not earned: the net carries only the parts.
    expect(shiftMargin(metrics)).toBeCloseTo(-PART_PRICE.filters, 6);
  });
});

describe('the mill setting', () => {
  it('above 100% wear and energy per tonne rise with the rate', () => {
    const working = mill({ status: 'running', metrics: { ...mill().metrics, load: 80 } });
    const wearPerTonne = (rate: number) =>
      ((0.5 + Math.min(100, 50 + rate * 30) / 100) * lineOverdrive(rate, OVERDRIVE_WEAR_SLOPE)) /
      rate;
    const energyPerTonne = (rate: number) =>
      getMachineEnergy(
        { ...working, metrics: { ...working.metrics, load: Math.min(100, 50 + rate * 30) } },
        rate
      ) / rate;
    expect(wearPerTonne(1.2)).toBeGreaterThan(wearPerTonne(1));
    expect(wearPerTonne(2)).toBeGreaterThan(wearPerTonne(1.2));
    expect(energyPerTonne(1.2)).toBeGreaterThan(energyPerTonne(1));
    expect(energyPerTonne(2)).toBeGreaterThan(energyPerTonne(1.2));
    // At or below 100% nothing changes.
    expect(lineOverdrive(0.8, OVERDRIVE_WEAR_SLOPE)).toBe(1);
    expect(lineOverdrive(1, OVERDRIVE_WEAR_SLOPE)).toBe(1);
  });
});

describe('saved state', () => {
  const roundTrip = () => {
    const owners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
      registerReplayParticipant(id, { capture: () => ({ id }), restore: () => {} })
    );
    try {
      return decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    } finally {
      owners.forEach((remove) => remove());
    }
  };

  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.setState({ machines: [mill()], productionSpeed: 1 });
  });

  it('a unit saved mid-service restores offline and finishes its service', () => {
    expect(beginUnitService('rm-101').started).toBe(true);
    stepUnitWork(20 * 60);
    const saved = roundTrip();
    const task = saved.maintenance.maintenanceSchedule.find((t) => t.machineId === 'rm-101');
    expect(task?.serviceMinutesLeft).toBeCloseTo(25, 6);
    // A fresh plant, then the saved one.
    useBreakdownStore.getState().resetBreakdownStore();
    useProductionStore.setState({ machines: [] });
    useBreakdownStore.setState(saved.maintenance);
    useProductionStore.setState({ machines: saved.production.machines });
    expect(unit().status).toBe('idle');
    stepUnitWork(24 * 60);
    expect(unitInService('rm-101')).toBe(true);
    stepUnitWork(60);
    expect(unitInService('rm-101')).toBe(false);
    expect(unit().status).toBe('running');
    expect(unit().metrics.wear).toBe(20);
  });

  it('a real save from before the purchase lines restores, books and nets without NaN', () => {
    const fixture = join(
      __dirname,
      '../../utils/__tests__/fixtures/physical-saves/2026-11-02-15c8b571.json'
    );
    const old = JSON.parse(readFileSync(fixture, 'utf8'));
    old.participants = REQUIRED_REPLAY_PARTICIPANTS.map((id) => ({
      id,
      value: { phase: 'waiting' },
    }));
    expect('grainCost' in old.operations.economics).toBe(false);
    const saved = decodePhysicalSession(JSON.stringify(old));
    useOperationsCampaignStore.setState(saved.operations);
    useOperationsCampaignStore.getState().bookPurchase({ grainCost: 100, partsCost: 35 });
    const { economics, shiftMetrics } = useOperationsCampaignStore.getState();
    expect(economics.grainCost).toBe(100);
    expect(economics.stockHeld).toBe(100);
    expect(Number.isFinite(shiftMargin(shiftMetrics))).toBe(true);
    // The record still encodes: no non-finite value reached the ledger.
    expect(() => encodePhysicalSession(capturePhysicalSession())).not.toThrow();
  });
});
