import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decisionCardText, reactToAlert } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { defineMessages, setLocale } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { mockMachines } from '../test/fixtures/mockMachines';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

const catalog = defineMessages({
  en: { title: 'Bearing warm', message: 'Bearing temperature rising.' },
  'pt-BR': { title: 'Rolamento aquecido', message: 'Temperatura do rolamento subindo.' },
});
registerAlertCatalog('aiEngineAlertCopyTest', catalog);

// An alert reaction's card quotes the alert. The bell now words a keyed notice
// in the language chosen now, but the card kept the alert's stored text, so a
// pending reaction the player still had to answer read Portuguese around an
// English reason. Working if the card's reason follows the alert's keys, and an
// alert without keys keeps its stored words.
describe('an alert reaction quotes the alert in the language chosen now', () => {
  beforeEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines(mockMachines.map((machine) => ({ ...machine })));
  });
  afterEach(() => setLocale('en'));

  it('rewords a keyed alert after a switch to Portuguese', () => {
    const decision = reactToAlert({
      id: 'keyed',
      type: 'warning',
      title: 'Bearing warm',
      message: 'Bearing temperature rising.',
      machineId: mockMachines[0].id,
      timestamp: new Date(),
      acknowledged: false,
      copy: { catalog: 'aiEngineAlertCopyTest', title: 'title', message: 'message' },
    });
    expect(decision).not.toBeNull();
    expect(decisionCardText(decision!, 'en').reasoning).toBe(
      'Bearing warm: Bearing temperature rising.'
    );
    setLocale('pt-BR');
    expect(decisionCardText(decision!, 'pt-BR').reasoning).toBe(
      'Rolamento aquecido: Temperatura do rolamento subindo.'
    );
  });

  it('keeps the stored words of an alert without keys', () => {
    const decision = reactToAlert({
      id: 'plain',
      type: 'warning',
      title: 'Bearing warm',
      message: 'Rising.',
      machineId: mockMachines[0].id,
      timestamp: new Date(),
      acknowledged: false,
    });
    setLocale('pt-BR');
    expect(decisionCardText(decision!, 'pt-BR').reasoning).toBe('Bearing warm: Rising.');
  });
});
