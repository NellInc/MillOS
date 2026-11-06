import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { ContextSidebar } from './ContextSidebar';

vi.mock('../widgets/AutonomyPanel', () => ({
  AutonomyPanel: () => <button type="button">Take over</button>,
}));
vi.mock('../panels/OverviewPanel', () => ({ OverviewPanel: () => <p>Overview body</p> }));
vi.mock('../panels/SafetyPanel', () => ({ SafetyPanel: () => null }));
vi.mock('../panels/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('./MachineInspector', () => ({ MachineInspector: () => null }));
vi.mock('./panelPreloader', () => ({ preloadPanelsForMode: vi.fn() }));

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(cleanup);

const Shell = (props: Partial<ComponentProps<typeof ContextSidebar>>) => (
  <>
    <button type="button" data-dock-mode="overview">
      Mill Overview
    </button>
    <ContextSidebar
      mode="management"
      isVisible
      onClose={vi.fn()}
      selectedMachine={null}
      productionSpeed={1}
      setProductionSpeed={vi.fn()}
      {...props}
    />
  </>
);

// A second I or O press hides the sidebar through its panel flag, not its
// Close, so nothing handed focus on: with focus on a control inside the panel
// it fell to <body> and Tab restarted at the top of the page.
// Working if a sidebar hidden with focus inside it leaves focus on the dock.
describe('sidebar hidden with focus inside it', () => {
  it('hands focus to the dock', () => {
    const { rerender } = render(<Shell />);
    const inside = screen.getByRole('button', { name: 'Take over' });
    inside.focus();
    expect(document.activeElement).toBe(inside);
    rerender(<Shell mode="overview" isVisible={false} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mill Overview' }));
  });

  it('leaves focus where it is when it was outside the sidebar', () => {
    const { rerender } = render(<Shell />);
    const dock = screen.getByRole('button', { name: 'Mill Overview' });
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    rerender(<Shell mode="overview" isVisible={false} />);
    expect(document.activeElement).toBe(outside);
    expect(document.activeElement).not.toBe(dock);
    outside.remove();
  });
});
