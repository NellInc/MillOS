import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { setLocale } from '../i18n';
import { useWorkplaceStore, workplaceReasonText } from './workplaceStore';
import { fulfilFirstDelivery } from '../test/firstDelivery';

const get = () => useWorkplaceStore.getState();

// The laboratory status line keeps a wrong answer's clarification and renders
// it through workplaceReasonText, beside the check's own clarification, which
// follows the language. Working if both read in the language chosen now.
describe('understanding-check clarifications follow a language switch (pass eleven)', () => {
  beforeEach(() => {
    setLocale('en');
    endReplayClock();
    useWorkplaceStore.setState({
      workplace: createWorkplace(),
      participationMode: 'solo',
      turn: null,
    });
  });
  afterEach(() => setLocale('en'));

  it('keys a season check clarification', () => {
    fulfilFirstDelivery();
    expect(get().startCampaign('toe-dip', 17).changed).toBe(true);
    const result = get().answerCheck('packing', 'refusal', 'majority');
    expect(result.changed).toBe(true);
    const english = result.reason;
    expect(english).toBeTruthy();
    setLocale('pt-BR');
    const portuguese = workplaceReasonText(result);
    expect(portuguese).toBeTruthy();
    expect(portuguese).not.toBe(english);
  });

  it('keys a participant turn check clarification', () => {
    expect(get().setParticipationMode('separate-turns').changed).toBe(true);
    expect(get().start('workshop', 17).changed).toBe(true);
    expect(get().startTurn('packing').changed).toBe(true);
    const token = get().turn!.token;
    const result = get().answerTurnCheck(token, 'duty', 'automatic');
    expect(result.changed).toBe(true);
    const english = result.reason;
    expect(english).toBeTruthy();
    setLocale('pt-BR');
    const portuguese = workplaceReasonText(result);
    expect(portuguese).toBeTruthy();
    expect(portuguese).not.toBe(english);
  });
});
