import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { ContextSidebar } from './ContextSidebar';

vi.mock('../widgets/AutonomyPanel', () => ({ AutonomyPanel: () => <p>Autonomy controls</p> }));
vi.mock('../panels/OverviewPanel', () => ({ OverviewPanel: () => <p>Overview body</p> }));
vi.mock('../panels/SafetyPanel', () => ({ SafetyPanel: () => null }));
vi.mock('../panels/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('./MachineInspector', () => ({ MachineInspector: () => null }));
vi.mock('./panelPreloader', () => ({ preloadPanelsForMode: vi.fn() }));

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(cleanup);

const renderSidebar = () =>
  render(
    <ContextSidebar
      mode="management"
      isVisible
      onClose={vi.fn()}
      selectedMachine={null}
      productionSpeed={1}
      setProductionSpeed={vi.fn()}
    />
  );

// Take over and the companion's Open remove the focused control as they open
// the panel. Working if focus lands on the panel's heading, not on <body>.
it('takes focus on its heading when the opening control asked for it', async () => {
  useUIStore.getState().requestPanelFocus();
  renderSidebar();
  const heading = screen.getByRole('heading', { name: 'Workplace & Autonomy' });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(heading).toHaveAttribute('tabindex', '-1');
  expect(useUIStore.getState().panelFocusRequested).toBe(false);
});

it('leaves focus alone when nothing asked for it', async () => {
  renderSidebar();
  await screen.findByText('Autonomy controls');
  expect(screen.getByRole('heading', { name: 'Workplace & Autonomy' })).not.toHaveFocus();
});
