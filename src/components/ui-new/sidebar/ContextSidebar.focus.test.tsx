import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWindmillLearningStore as lesson } from '../../../stores/windmillLearningStore';
import { useUIStore } from '../../../stores/uiStore';
import { ContextSidebar } from './ContextSidebar';
import { setLocale } from '../../../i18n';

vi.mock('../widgets/AutonomyPanel', () => ({ AutonomyPanel: () => <p>Autonomy controls</p> }));
vi.mock('../panels/OverviewPanel', () => ({ OverviewPanel: () => <p>Overview body</p> }));
vi.mock('../panels/SafetyPanel', () => ({ SafetyPanel: () => null }));
vi.mock('../panels/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('./MachineInspector', () => ({ MachineInspector: () => null }));
vi.mock('./panelPreloader', () => ({ preloadPanelsForMode: vi.fn() }));
vi.mock('../../chronicle/ChroniclePanel', () => ({ ChroniclePanel: () => <p>Chronicle body</p> }));

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(() => {
  cleanup();
  setLocale('en');
});

const renderSidebar = (mode: 'management' | 'chronicle' = 'management') =>
  render(
    <ContextSidebar
      mode={mode}
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

it('translates the Chronicle heading and panel name on a live language change', async () => {
  renderSidebar('chronicle');
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Mill Chronicle' })).toBeVisible()
  );
  act(() => setLocale('pt-BR'));
  expect(screen.getByRole('heading', { name: 'Crônica do moinho' })).toBeVisible();
  expect(
    screen.getByRole('complementary', { name: 'Painel lateral: Crônica do moinho' })
  ).toBeVisible();
});

it('closes inspection on hide before AnimatePresence releases its exiting subtree', () => {
  const release = lesson.getState().registerModel();
  const props = {
    mode: 'management' as const,
    onClose: vi.fn(),
    selectedMachine: null,
    productionSpeed: 1,
    setProductionSpeed: vi.fn(),
  };
  const view = render(<ContextSidebar {...props} isVisible />);
  act(() => {
    lesson.getState().start();
  });
  view.rerender(<ContextSidebar {...props} isVisible={false} />);
  expect(lesson.getState().open).toBe(false);
  release();
});
