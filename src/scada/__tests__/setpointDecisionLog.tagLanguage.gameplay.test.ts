import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { logWordingText, useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { getTagById } from '../tagDatabase';
import { recordSetpointDecision } from '../setpointDecisionLog';

// The logbook re-words a setpoint line in the language active now, but it
// reused the tag name stored when the line was written: after a write in
// English and a switch to pt-BR the line read half in each language.
// Working if the tag name follows the language too.
describe('a setpoint logbook line after a language switch', () => {
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => setLocale('en'));

  it('names the tag in the language active now', () => {
    const tag = getTagById('RM101.ST001.SP')!;
    expect(tag).toBeDefined();
    const englishName = tag.name;
    recordSetpointDecision(tag, 1500, 'operator');
    const entry = useOperationsCampaignStore.getState().logbook.at(-1)!;
    setLocale('pt-BR');
    const portugueseName = getTagById('RM101.ST001.SP')!.name;
    expect(portugueseName).not.toBe(englishName);
    const line = logWordingText(entry.wording)!;
    expect(line).toContain(portugueseName);
    expect(line).not.toContain(englishName);
  });
});
