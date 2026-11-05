import { afterEach, describe, expect, it } from 'vitest';
import { safetyEventCopy, useGameSimulationStore } from '../gameSimulationStore';
import { useSafetyStore } from '../safetyStore';
import { setLocale, translate } from '../../i18n';
import { gameSimulationStoreMessages } from '../gameSimulationStore.messages';

// A safety event's cause, response and recovery were stored as text in the
// language active when it began, so the Safety panel kept English after a
// switch to Portuguese. Working if the record reads in the current language.
describe('safety event copy follows the interface language', () => {
  afterEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
  });

  it('reads a facility stop raised in English in Portuguese after a switch', () => {
    setLocale('en');
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    const state = useGameSimulationStore.getState();
    const event = state.safetyEvents.find((e) => e.id === state.activeSafetyEventId)!;
    setLocale('pt-BR');
    expect(safetyEventCopy(event, 'cause')).toBe(
      translate(gameSimulationStoreMessages, 'facilityStopCause')
    );
    expect(safetyEventCopy(event, 'response')).toBe(
      translate(gameSimulationStoreMessages, 'facilityStopResponse')
    );
    expect(safetyEventCopy(event, 'cause')).not.toBe(event.cause);
  });

  it('keeps the stored text for a record saved before copy keys', () => {
    const legacy = { cause: 'Old cause', response: 'Old response', recovery: 'Old recovery' };
    expect(safetyEventCopy(legacy, 'cause')).toBe('Old cause');
  });
});
