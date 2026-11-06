import { describe, expect, it } from 'vitest';
import { safetyConfigPanelMessages } from '../SafetyConfigPanel.messages';

// Speed zones now cap the forklifts inside them (speedZoneLimit, ForkliftSystem),
// so the Safety Config note must not tell the player the rate does nothing.
describe('Safety Config speed-zone note', () => {
  it('no longer says the speed zone rate is not enforced, in either language', () => {
    expect(safetyConfigPanelMessages.en.enforcementNote).not.toMatch(
      /not enforced|planning value/i
    );
    expect(safetyConfigPanelMessages['pt-BR'].enforcementNote).not.toMatch(
      /ainda não é aplicada|valor de planejamento/i
    );
    expect(safetyConfigPanelMessages.en.enforcementNote).toMatch(/speed zone/i);
    expect(safetyConfigPanelMessages['pt-BR'].enforcementNote).toMatch(/zona de velocidade/i);
  });

  // A forklift the player drives obeys the zone too, so the note must not
  // limit it to a forklift on its route.
  it('says a driven forklift obeys the zone as well, in either language', () => {
    expect(safetyConfigPanelMessages.en.enforcementNote).toMatch(/driven/i);
    expect(safetyConfigPanelMessages['pt-BR'].enforcementNote).toMatch(/conduzida/i);
  });
});
