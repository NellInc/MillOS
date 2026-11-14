import { render, screen, fireEvent } from '@testing-library/react';
import { Dock } from './Dock';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';

const layout = vi.hoisted(() => ({ compact: false, openPanel: vi.fn() }));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isMobile: layout.compact, isCompactLayout: layout.compact }),
}));
vi.mock('../../../stores/mobileControlStore', () => ({
  useMobileControlStore: (
    selector: (state: { openMobilePanel: typeof layout.openPanel }) => unknown
  ) => selector({ openMobilePanel: layout.openPanel }),
}));

// Mock Lucide icons to avoid rendering issues in tests
vi.mock('lucide-react', () => ({
  ChartColumn: () => <span data-testid="icon-production" />,
  Factory: () => <span data-testid="icon-factory" />,
  Home: () => <span data-testid="icon-home" />,
  Brain: () => <span data-testid="icon-brain" />,
  Activity: () => <span data-testid="icon-activity" />,
  Shield: () => <span data-testid="icon-shield" />,
  Settings: () => <span data-testid="icon-settings" />,
  Eye: () => <span data-testid="icon-eye" />,
  Radio: () => <span data-testid="icon-radio" />,
  Heart: () => <span data-testid="icon-heart" />,
  Maximize: () => <span data-testid="icon-maximize" />,
  Minimize: () => <span data-testid="icon-minimize" />,
  Database: () => <span data-testid="icon-database" />,
  MoreHorizontal: () => <span data-testid="icon-more" />,
  ScrollText: () => <span data-testid="icon-chronicle" />,
  Trophy: () => <span data-testid="icon-trophy" />,
  Route: () => <span data-testid="icon-route" />,
}));

describe('Dock Component', () => {
  beforeEach(() => {
    layout.compact = false;
    layout.openPanel.mockClear();
  });

  it('pairs every desktop mode with a visible label inside its unchanged accessible name', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-dock-layout', 'wide');
    for (const [label, name, mode] of [
      ['Overview', 'Mill Overview', 'overview'],
      ['SCADA', 'Simulated SCADA', 'scada'],
      ['Autonomy', 'Autonomy', 'management'],
      ['Chronicle', 'Mill Chronicle', 'chronicle'],
      ['Safety', 'Safety & Emergency', 'safety'],
      ['Settings', 'Settings', 'settings'],
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveTextContent(label);
      expect(button).toHaveAttribute('data-dock-mode', mode);
      expect(button).toHaveAttribute('title', name);
      expect(button.querySelector('[data-dock-label]')).toHaveTextContent(label);
    }
  });

  it('routes compact navigation to real mobile panels and retains Autonomy in More', () => {
    layout.compact = true;
    const onModeChange = vi.fn();
    render(<Dock activeMode="overview" onModeChange={onModeChange} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-dock-layout', 'compact');
    fireEvent.click(screen.getByRole('button', { name: 'Mill Overview' }));
    expect(layout.openPanel).toHaveBeenCalledWith('overview');
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Autonomy' }));
    expect(layout.openPanel).toHaveBeenCalledWith('management');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('renders the main navigation items', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);

    expect(screen.getByLabelText('Mill Overview')).toBeInTheDocument();
    // One entry for the one panel: Production opened Overview (report 09 F7).
    expect(screen.queryByLabelText('Production')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('AI Partner')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Simulated SCADA')).toBeInTheDocument();
    expect(screen.queryByLabelText('Workforce')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Autonomy')).toBeInTheDocument();
    expect(screen.getByLabelText('Safety & Emergency')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('highlights the active mode', () => {
    const { rerender } = render(<Dock activeMode="overview" onModeChange={() => {}} />);

    // Check overview is active (implementation dependent, e.g., class or aria-current)
    const overviewBtn = screen.getByLabelText('Mill Overview');
    expect(overviewBtn).toHaveAttribute('aria-pressed', 'true');

    rerender(<Dock activeMode="safety" onModeChange={() => {}} />);
    expect(screen.getByLabelText('Safety & Emergency')).toHaveAttribute('aria-pressed', 'true');
    expect(overviewBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onModeChange when an item is clicked', () => {
    const handleModeChange = vi.fn();
    render(<Dock activeMode="overview" onModeChange={handleModeChange} />);

    fireEvent.click(screen.getByLabelText('Mill Overview'));
    expect(handleModeChange).toHaveBeenCalledWith(
      'overview',
      screen.getByLabelText('Mill Overview')
    );
  });

  it('keeps AI Partner in More with a keyboard shortcut and a stable return target', () => {
    const change = vi.fn();
    render(<Dock activeMode="ai" onModeChange={change} />);
    const more = screen.getByRole('button', { name: 'More workspaces and view controls' });
    fireEvent.click(more);
    const partner = screen.getByRole('menuitem', { name: /AI Partner/ });
    expect(partner).toHaveAttribute('aria-current', 'page');
    fireEvent.click(partner);
    expect(change).toHaveBeenCalledWith('ai', more);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('groups secondary workspaces and view controls behind one menu', () => {
    const handleModeChange = vi.fn();
    const handleDatalinksOpen = vi.fn();
    render(
      <Dock
        activeMode="overview"
        onModeChange={handleModeChange}
        onDatalinksOpen={handleDatalinksOpen}
      />
    );

    fireEvent.click(screen.getByLabelText('More workspaces and view controls'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Datalinks/ }));
    expect(handleDatalinksOpen).toHaveBeenCalledOnce();
    expect(handleModeChange).not.toHaveBeenCalled();
  });

  // Seen on a landscape phone (844 x 390): the seven-item menu was taller than
  // the room above the dock and its first item ran off the top of the screen.
  it('caps the More menu to the screen and scrolls it', () => {
    layout.compact = true;
    render(<Dock activeMode="overview" onModeChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('More workspaces and view controls'));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveClass('max-h-[calc(100dvh-6rem)]');
    expect(menu).toHaveClass('overflow-y-auto');
  });

  it('closes the More menu on Escape without the key reaching other Escape handlers', () => {
    const outerEscape = vi.fn();
    document.addEventListener('keydown', outerEscape);
    try {
      render(<Dock activeMode="overview" onModeChange={() => {}} />);
      fireEvent.click(screen.getByLabelText('More workspaces and view controls'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(outerEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outerEscape);
    }
  });

  // The phone's Overview sheet has no achievements list (report 09 F3).
  it('opens the achievements list from More on a phone, and only there', () => {
    useUIStore.setState({ showAchievements: false });
    layout.compact = true;
    const { unmount } = render(<Dock activeMode="overview" onModeChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Achievements' }));
    expect(useUIStore.getState().showAchievements).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    unmount();

    useUIStore.setState({ showAchievements: false });
    layout.compact = false;
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    expect(screen.queryByRole('menuitem', { name: 'Achievements' })).not.toBeInTheDocument();
  });

  it('has accessible labels for screen readers', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // Plan 7.8: the layout planner is an engineering tool behind More.
  it('opens the logistics planner from the More menu', () => {
    const open = vi.fn();
    window.addEventListener('millos:open-layout-planner', open);
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logistics planning' }));
    expect(open).toHaveBeenCalledOnce();
    window.removeEventListener('millos:open-layout-planner', open);
  });
});
