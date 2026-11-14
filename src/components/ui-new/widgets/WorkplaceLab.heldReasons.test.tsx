import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale, type Locale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

// The lab held its role decisions outside deliberation, and in a pilot, with
// nothing saying why. Each held control now names its reason (the engine's
// own refusal, or the condition already on screen) through aria-describedby.

const openTools = () => {
  const tools = screen.queryByText(/Facilitator tools|Ferramentas/)?.closest('details');
  if (tools) tools.open = true;
};
const sectionNames: Record<Locale, string[]> = {
  en: ['Agreement / Voices', 'Review', 'Shift'],
  'pt-BR': ['Acordo / Vozes', 'Revisão', 'Turno'],
};
const heldWithout = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('disabled'))
    .filter((button) => {
      const ids = (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      return !ids.some((id) => (document.getElementById(id)?.textContent ?? '').trim());
    })
    .map((button) => button.textContent);

beforeEach(() => {
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.setState({ gameSpeed: 180 });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe.each(['en', 'pt-BR'] as const)('held lab controls say why (%s)', (locale) => {
  beforeEach(() => setLocale(locale));

  it.each(['idle', 'pilot'] as const)('outside deliberation: %s', (setup) => {
    useWorkplaceStore.setState({
      participationMode: 'solo',
      turn: null,
      workplace: createWorkplace(),
    });
    if (setup === 'pilot') useWorkplaceStore.getState().start('pilot', 17);
    render(<WorkplaceLab />);
    let visited = 0;
    let held = 0;
    for (const name of sectionNames[locale]) {
      openTools();
      const tab = screen.queryByRole('button', { name });
      if (!tab) continue;
      fireEvent.click(tab);
      visited += 1;
      held += screen.getAllByRole('button').filter((b) => b.hasAttribute('disabled')).length;
      expect(heldWithout(), `${setup} · ${name}`).toEqual([]);
    }
    expect(visited).toBe(sectionNames[locale].length);
    expect(held).toBeGreaterThan(5);
  });
});
