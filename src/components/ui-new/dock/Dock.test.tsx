import { render, screen, fireEvent } from '@testing-library/react';
import { Dock } from './Dock';
import { beforeEach, describe, it, expect, vi } from 'vitest';

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
}));

describe('Dock Component', () => {
  beforeEach(() => {
    layout.compact = false;
    layout.openPanel.mockClear();
  });

  it('pairs every desktop mode with a visible label inside its unchanged accessible name', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    for (const [label, name, mode] of [
      ['Overview', 'Mill Overview', 'overview'],
      ['Production', 'Production', 'production'],
      ['SCADA', 'Simulated SCADA', 'scada'],
      ['Autonomy', 'Bilateral Autonomy System (BAS)', 'management'],
      ['Safety', 'Safety & Emergency', 'safety'],
      ['Settings', 'Settings', 'settings'],
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveTextContent(label);
      expect(button).toHaveAttribute('data-dock-mode', mode);
    }
  });

  it('routes compact navigation to real mobile panels and retains Autonomy in More', () => {
    layout.compact = true;
    const onModeChange = vi.fn();
    render(<Dock activeMode="overview" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    expect(layout.openPanel).toHaveBeenCalledWith('production');
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bilateral Autonomy System' }));
    expect(layout.openPanel).toHaveBeenCalledWith('management');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('renders the main navigation items', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);

    expect(screen.getByLabelText('Mill Overview')).toBeInTheDocument();
    expect(screen.getByLabelText('Production')).toBeInTheDocument();
    expect(screen.queryByLabelText('AI Partner')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Simulated SCADA')).toBeInTheDocument();
    expect(screen.queryByLabelText('Workforce')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bilateral Autonomy System (BAS)')).toBeInTheDocument();
    expect(screen.getByLabelText('Safety & Emergency')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('highlights the active mode', () => {
    const { rerender } = render(<Dock activeMode="overview" onModeChange={() => {}} />);

    // Check overview is active (implementation dependent, e.g., class or aria-current)
    const overviewBtn = screen.getByLabelText('Mill Overview');
    expect(overviewBtn).toHaveAttribute('aria-pressed', 'true');

    rerender(<Dock activeMode="production" onModeChange={() => {}} />);
    const aiBtn = screen.getByLabelText('Production');
    expect(aiBtn).toHaveAttribute('aria-pressed', 'true');
    expect(overviewBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onModeChange when an item is clicked', () => {
    const handleModeChange = vi.fn();
    render(<Dock activeMode="overview" onModeChange={handleModeChange} />);

    fireEvent.click(screen.getByLabelText('Production'));
    expect(handleModeChange).toHaveBeenCalledWith(
      'production',
      screen.getByLabelText('Production')
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

  it('has accessible labels for screen readers', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
