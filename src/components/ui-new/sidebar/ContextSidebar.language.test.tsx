import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLocale } from '../../../i18n';
import { useUIStore } from '../../../stores/uiStore';
import { ContextSidebar } from './ContextSidebar';

vi.mock('../widgets/AutonomyPanel', () => ({ AutonomyPanel: () => null }));
vi.mock('../panels/OverviewPanel', () => ({ OverviewPanel: () => null }));
vi.mock('../panels/SafetyPanel', () => ({ SafetyPanel: () => null }));
vi.mock('../panels/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('./MachineInspector', () => ({ MachineInspector: () => null }));
vi.mock('../../chronicle/ChroniclePanel', () => ({ ChroniclePanel: () => null }));
vi.mock('./panelPreloader', () => ({ preloadPanelsForMode: vi.fn() }));

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(() => {
  cleanup();
  setLocale('en');
});

// The sidebar is a translated integration point for the Chronicle (CLAUDE.md,
// Mill Chronicle rule 7): its header follows the interface language.
it('names the Chronicle workspace in the interface language', () => {
  setLocale('pt-BR');
  render(
    <ContextSidebar
      mode="chronicle"
      isVisible
      onClose={vi.fn()}
      selectedMachine={null}
      productionSpeed={1}
      setProductionSpeed={vi.fn()}
    />
  );
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Crônica do moinho');
});
