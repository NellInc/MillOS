import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOUD_TASKS,
  alertDeliveryDecision,
  clockReading,
  egressAccessDecision,
  fileEgressAccessCheck,
  loudTaskMovedDecision,
  movesInForce,
  planLoudTasks,
  resetAccommodationDecisions,
  stepAccommodationDecisions,
  stepQuietRoomPlanner,
} from '../aiAccommodation';
import { decisionCardText } from '../aiEngine';
import { aiEngineMessages } from '../aiEngine.messages';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { QUIET_ROOM_BOOKINGS, quietRoomBookingAt } from '../../simulation/agreedAdjustments';
import type { AIDecision } from '../../types';

const accessCards = (kind = '') =>
  useProductionStore
    .getState()
    .aiDecisions.filter((decision) => decision.id.startsWith(`access-${kind}`));

/** Every key a card was filed with exists in both catalogues, and reads differently in each. */
function expectBilingual(decision: AIDecision) {
  for (const entry of Object.values(decision.copy ?? {})) {
    if (!entry) continue;
    expect(Object.keys(aiEngineMessages.en)).toContain(entry.key);
    expect(Object.keys(aiEngineMessages['pt-BR'])).toContain(entry.key);
  }
  const en = decisionCardText(decision, 'en');
  const pt = decisionCardText(decision, 'pt-BR');
  expect(en.action).not.toBe(pt.action);
  expect(en.reasoning).not.toBe(pt.reasoning);
  expect(en.reasoning.length).toBeGreaterThan(40);
}

describe('factory AI agreed adjustments', () => {
  beforeEach(() => {
    useProductionStore.setState({ aiDecisions: [] });
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    resetAccommodationDecisions();
  });
  afterEach(() => {
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useGameSimulationStore.getState().resetGameState();
    vi.restoreAllMocks();
  });

  it('confirms an alarm went out as light and vibration, explaining the agreement', () => {
    for (const cause of ['drill', 'emergency', 'forklift-stop'] as const) {
      const card = alertDeliveryDecision(cause);
      expect(card.status).toBe('completed');
      expect(card.type).toBe('safety');
      expect(card.machineId).toBeUndefined();
      expectBilingual(card);
      const en = decisionCardText(card, 'en');
      expect(en.action).toMatch(/light and vibration/);
      expect(en.reasoning).toMatch(/As agreed with the shift supervisor/);
      expect(en.reasoning).toMatch(/pager confirmed delivery/);
      expect(decisionCardText(card, 'pt-BR').reasoning).toMatch(/Como combinado/);
    }
  });

  it('files one alert card when the forklift emergency stop starts, none while it holds', () => {
    stepAccommodationDecisions();
    expect(accessCards('alert')).toHaveLength(0);
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    stepAccommodationDecisions();
    stepAccommodationDecisions();
    expect(accessCards('alert')).toHaveLength(1);
    expect(decisionCardText(accessCards('alert')[0], 'en').reasoning).toMatch(
      /forklift emergency stop/
    );
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    stepAccommodationDecisions();
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    stepAccommodationDecisions();
    expect(accessCards('alert')).toHaveLength(2);
  });

  it('files the drill as a drill, not as an evacuation', () => {
    stepAccommodationDecisions();
    useGameSimulationStore.getState().startEmergencyDrill();
    stepAccommodationDecisions();
    const card = accessCards('alert')[0];
    expect(decisionCardText(card, 'en').reasoning).toMatch(/egress verification drill/);
    expect(decisionCardText(card, 'en').reasoning).not.toMatch(/evacuat/i);
    useGameSimulationStore.getState().endEmergencyDrill();
  });

  it('moves each loud purge out of the quiet room bookings to the booking end', () => {
    const plans = planLoudTasks();
    expect(plans).toHaveLength(LOUD_TASKS.length);
    for (const plan of plans) {
      expect(plan.movedFor).toBeDefined();
      expect(plan.start).toBe(plan.movedFor!.end);
      for (let h = plan.start; h < plan.start + plan.task.hours; h += 0.01)
        expect(quietRoomBookingAt(h)).toBeUndefined();
    }
    // With no booking, nothing moves.
    expect(planLoudTasks(LOUD_TASKS, []).every((plan) => !plan.movedFor)).toBe(true);
    const card = loudTaskMovedDecision(plans[0])!;
    expectBilingual(card);
    expect(decisionCardText(card, 'en').action).toBe(
      'Moved the air-line purge from 10:00 to 10:30'
    );
    expect(decisionCardText(card, 'pt-BR').action).toBe(
      'Purga da linha de ar movida de 10:00 para 10:30'
    );
    expect(decisionCardText(card, 'en').reasoning).toMatch(/asked for it/);
  });

  it('gives notice before the planned hour and runs the purge when the booking ends', () => {
    const run = vi.fn();
    const day = 2 * 24;
    expect(stepQuietRoomPlanner(day + 9.4, day + 9.6, run).noticed).toEqual([
      'air-line-purge-morning',
    ]);
    expect(run).not.toHaveBeenCalled();
    // Nothing runs inside the booking.
    expect(stepQuietRoomPlanner(day + 9.9, day + 10.4, run).ran).toEqual([]);
    expect(stepQuietRoomPlanner(day + 10.4, day + 10.6, run).ran).toEqual([
      'air-line-purge-morning',
    ]);
    expect(run).toHaveBeenCalledOnce();
    // A clock jump files and runs nothing.
    expect(stepQuietRoomPlanner(day + 9, day + 15, run)).toEqual({ noticed: [], ran: [] });
    expect(accessCards()).toHaveLength(1);
    expect(clockReading(QUIET_ROOM_BOOKINGS[1].end)).toBe('14:30');
  });

  it('says on start why the purge is not running when the session opens inside a booking', () => {
    expect(movesInForce(10).map((plan) => plan.task.id)).toEqual(['air-line-purge-morning']);
    expect(movesInForce(10.6)).toEqual([]);
    expect(movesInForce(9.4)).toEqual([]);
    expect(movesInForce(13.75).map((plan) => plan.task.id)).toEqual(['air-line-purge-afternoon']);
    // The plant clock starts at 10:00, inside the morning booking.
    useGameSimulationStore.setState({ gameDay: 40, gameTime: 10 });
    stepAccommodationDecisions();
    stepAccommodationDecisions();
    expect(accessCards('quiet-room')).toHaveLength(1);
    resetAccommodationDecisions();
    stepAccommodationDecisions();
    expect(accessCards('quiet-room')).toHaveLength(1);
  });

  it('explains every egress check and files each zone result once per drill', () => {
    const clear = egressAccessDecision({ status: 'clear', zoneId: 'west' })!;
    const alternative = egressAccessDecision({
      status: 'alternative',
      zoneId: 'west',
      alternative: 'east',
    })!;
    // The front and back zones go by the level door beside their dock.
    const front = egressAccessDecision({ status: 'clear', zoneId: 'front' })!;
    const back = egressAccessDecision({ status: 'clear', zoneId: 'back' })!;
    const blocked = egressAccessDecision({ status: 'blocked', zoneId: 'east' })!;
    for (const card of [clear, alternative, front, back, blocked]) expectBilingual(card);
    expect(decisionCardText(alternative, 'en').reasoning).toMatch(/east service door/);
    expect(decisionCardText(front, 'en').reasoning).toMatch(/level door beside the shipping dock/);
    expect(decisionCardText(back, 'en').reasoning).toMatch(/level door beside the receiving dock/);
    expect(decisionCardText(front, 'pt-BR').reasoning).toMatch(/doca de expedição/);
    expect(decisionCardText(back, 'pt-BR').reasoning).toMatch(/doca de recebimento/);
    expect(decisionCardText(clear, 'en').reasoning).not.toMatch(/dock/);
    expect(decisionCardText(clear, 'en').action).toMatch(/step-free route and refuge point clear/);
    expect(decisionCardText(blocked, 'en').action).toMatch(/waits for a step-free route/);
    expect(decisionCardText(blocked, 'en').reasoning).toMatch(/hold their safe positions/);
    fileEgressAccessCheck(1, { status: 'blocked', zoneId: 'east' });
    fileEgressAccessCheck(1, { status: 'blocked', zoneId: 'east' });
    fileEgressAccessCheck(1, { status: 'clear', zoneId: 'east' });
    expect(accessCards()).toHaveLength(2);
    fileEgressAccessCheck(2, { status: 'blocked', zoneId: 'east' });
    expect(accessCards()).toHaveLength(3);
  });

  it('never leaves a card waiting for a decision', () => {
    stepAccommodationDecisions();
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    stepAccommodationDecisions();
    fileEgressAccessCheck(7, { status: 'clear', zoneId: 'front' });
    stepQuietRoomPlanner(30 * 24 + 9.4, 30 * 24 + 9.6, () => {});
    expect(accessCards().length).toBeGreaterThanOrEqual(3);
    for (const card of accessCards()) {
      expect(card.status).toBe('completed');
      expect(card.outcome).toBeUndefined();
    }
  });
});
