/**
 * Plan item 7.5 (owner's choice): the roll-speed setpoint is the line rate.
 * Working if a setpoint write changes the rate the tick reads, and the slider's
 * action moves every mill's setpoint reading.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSCADAService, initializeSCADA, shutdownSCADA } from '../SCADAService';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { setLocale } from '../../i18n';
import { createMillOSRuntimeCommandHandlers } from '../../agent/adapters/runtime/runtimeCommandHandlers';
import {
  bindRollSpeedSetpoints,
  lineRatePerTonne,
  ROLL_SPEED_SETPOINT_TAG_IDS,
} from '../lineRateSetpoint';
import { lineOverdrive, OVERDRIVE_WEAR_SLOPE } from '../../simulation/machineLoad';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('the roll-speed setpoint is the line rate', () => {
  let unbind: () => void = () => undefined;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.getState().setProductionSpeed(0.8);
    await initializeSCADA({ mode: 'simulation', connection: { type: 'simulation' } });
    unbind = bindRollSpeedSetpoints(getSCADAService());
    await flush();
  });
  afterEach(async () => {
    unbind();
    await shutdownSCADA();
    vi.useRealTimers();
  });

  it('an operator write sets the rate the tick reads', async () => {
    expect(await getSCADAService().writeSetpoint('RM102.ST001.SP', 1200, 'operator')).toBe(true);
    expect(useProductionStore.getState().productionSpeed).toBeCloseTo(1.2, 9);
    await flush();
    // Every mill now reads the one rate.
    for (const tagId of ROLL_SPEED_SETPOINT_TAG_IDS)
      expect(getSCADAService().getValue(tagId)?.value).toBeCloseTo(1200, 6);
  });

  it("an agent's write-setpoint command sets it too", async () => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'scada.write-setpoint'
    )!;
    await handler.execute({
      targetUri: 'millos://tag/RM101.ST001.SP',
      parameters: { value: 600 },
    } as never);
    expect(useProductionStore.getState().productionSpeed).toBeCloseTo(0.6, 9);
  });

  it("the slider's action moves every setpoint reading", async () => {
    useProductionStore.getState().setProductionSpeed(1.5);
    await flush();
    for (const tagId of ROLL_SPEED_SETPOINT_TAG_IDS)
      expect(getSCADAService().getValue(tagId)?.value).toBeCloseTo(1500, 6);
    // A plant write is not an operator decision.
    expect(
      useOperationsCampaignStore
        .getState()
        .logbook.filter((entry) => (entry.relatedId ?? '').endsWith('.ST001.SP'))
    ).toEqual([]);
  });

  it('a write outside the band is refused and leaves the rate', async () => {
    expect(await getSCADAService().writeSetpoint('RM101.ST001.SP', 2500, 'operator')).toBe(false);
    expect(useProductionStore.getState().productionSpeed).toBeCloseTo(0.8, 9);
  });
});

describe('wear and energy per tonne by rate', () => {
  it('reads 1 at 100% and rises above it, from the functions that compute them', () => {
    expect(lineRatePerTonne(1).wear).toBeCloseTo(1, 9);
    expect(lineRatePerTonne(1).energy).toBeCloseTo(1, 9);
    expect(lineRatePerTonne(1.2).wear).toBeGreaterThan(1);
    expect(lineRatePerTonne(1.2).energy).toBeGreaterThan(1);
    // The tick's wear per tonne (unitService.gameplay.test 'the mill setting').
    const tickWear = (rate: number) =>
      ((0.5 + Math.min(100, 50 + rate * 30) / 100) * lineOverdrive(rate, OVERDRIVE_WEAR_SLOPE)) /
      rate;
    expect(lineRatePerTonne(1.6).wear).toBeCloseTo(tickWear(1.6) / tickWear(1), 9);
  });
});

describe('a plant outside the simulation', () => {
  it('is never written by a rate change: its setpoints belong to its PLC', () => {
    const writes: string[] = [];
    const service = {
      getMode: () => 'live',
      writeSetpoint: async (tagId: string) => {
        writes.push(tagId);
        return true;
      },
    };
    const unbind = bindRollSpeedSetpoints(service);
    useProductionStore.getState().setProductionSpeed(1.3);
    unbind();
    expect(writes).toEqual([]);
  });
});
