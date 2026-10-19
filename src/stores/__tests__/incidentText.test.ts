import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { deriveOperationsPlay } from '../../simulation/operationsPlay';
import { useOperationsCampaignStore, type OperationalIncident } from '../operationsCampaignStore';
import { incidentDescription, incidentTitle } from '../incidentText';

/*
 * An incident's title and description are copied into the record when it
 * fires, and the record is persisted. A language switch afterwards (or a save
 * restored in the other language) must still render the current language.
 */
describe('incident text follows the current language', () => {
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => setLocale('en'));

  it('re-renders an incident raised in English after switching to Portuguese', () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('power_sag')!;
    expect(incident.title).toBe('Site power sag');

    setLocale('pt-BR');
    expect(incidentTitle(incident)).toBe('Queda de tensão na unidade');
    expect(incidentDescription(incident)).not.toMatch(/voltage/i);

    const play = deriveOperationsPlay(useOperationsCampaignStore.getState());
    expect(play.nextAction.consequence).toContain('Queda de tensão na unidade');
    expect(play.nextAction.consequence).not.toContain('Site power sag');
  });

  it('keeps the stored text for a persisted record whose kind is unknown', () => {
    const legacy = {
      kind: 'retired_kind',
      title: 'Legacy title',
      description: 'Legacy description',
    } as unknown as OperationalIncident;
    setLocale('pt-BR');
    expect(incidentTitle(legacy)).toBe('Legacy title');
    expect(incidentDescription(legacy)).toBe('Legacy description');
  });
});
