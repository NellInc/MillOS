import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { setLocale } from '../i18n';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useWorkplaceStore, workplaceReasonText } from './workplaceStore';
import { fulfilFirstDelivery } from '../test/firstDelivery';

// A status line that keeps a refusal (the guided card, the laboratory) renders
// it through workplaceReasonText, so a language switch reaches it.
// Working if a refusal shown in English reads in Portuguese after a switch.
describe('workplace refusals follow a language switch', () => {
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useWorkplaceStore.setState({
      workplace: createWorkplace(),
      participationMode: 'solo',
      turn: null,
    });
  });
  afterEach(() => setLocale('en'));

  it('keys a startMission refusal from the store catalogue', () => {
    // No open customer commitment to link.
    fulfilFirstDelivery();
    useOperationsCampaignStore.setState({ activeOrderId: null });
    const result = useWorkplaceStore.getState().startMission('toe-dip');
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/^Choose an open, quality-qualified customer commitment/);
    setLocale('pt-BR');
    expect(workplaceReasonText(result)).toMatch(/^Escolha um compromisso de cliente em aberto/);
  });

  it('keys an engine refusal passed through the store', () => {
    const store = useWorkplaceStore.getState();
    fulfilFirstDelivery();
    expect(store.startCampaign('toe-dip', 17).changed).toBe(true);
    const result = useWorkplaceStore.getState().startCampaign('toe-dip', 17);
    expect(result.changed).toBe(false);
    const english = result.reason;
    setLocale('pt-BR');
    const portuguese = workplaceReasonText(result);
    expect(portuguese).toBeTruthy();
    expect(portuguese).not.toBe(english);
  });

  it('keeps an unkeyed reason as written', () => {
    expect(workplaceReasonText({ reason: 'As written.' })).toBe('As written.');
    expect(workplaceReasonText({ reason: null })).toBeNull();
    // An unknown key keeps the stored text rather than printing the key.
    expect(
      workplaceReasonText({
        reason: 'Stored.',
        reasonCopy: { catalog: 'store', key: 'noSuchKey' },
      })
    ).toBe('Stored.');
  });
});
