import { render, screen, fireEvent } from '@testing-library/react';
import { Dock } from './Dock';
import { describe, it, expect, vi } from 'vitest';

// Mock Lucide icons to avoid rendering issues in tests
vi.mock('lucide-react', () => ({
  Factory: () => <span data-testid="icon-factory" />,
  Home: () => <span data-testid="icon-home" />,
  Brain: () => <span data-testid="icon-brain" />,
  Activity: () => <span data-testid="icon-activity" />,
  Users: () => <span data-testid="icon-users" />,
  HardHat: () => <span data-testid="icon-hardhat" />,
  Shield: () => <span data-testid="icon-shield" />,
  Settings: () => <span data-testid="icon-settings" />,
  Eye: () => <span data-testid="icon-eye" />,
  Radio: () => <span data-testid="icon-radio" />,
  Heart: () => <span data-testid="icon-heart" />,
  Maximize: () => <span data-testid="icon-maximize" />,
  Minimize: () => <span data-testid="icon-minimize" />,
}));

describe('Dock Component', () => {
  it('renders the main navigation items', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);

    expect(screen.getByLabelText('Mill Overview')).toBeInTheDocument();
    expect(screen.getByLabelText('AI Command')).toBeInTheDocument();
    expect(screen.getByLabelText('SCADA System')).toBeInTheDocument();
    expect(screen.getByLabelText('Workforce')).toBeInTheDocument();
    expect(screen.getByLabelText('BAMS')).toBeInTheDocument();
    expect(screen.getByLabelText('Multiplayer')).toBeInTheDocument();
    expect(screen.getByLabelText('Safety & Emergency')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('highlights the active mode', () => {
    const { rerender } = render(<Dock activeMode="overview" onModeChange={() => {}} />);

    // Check overview is active (implementation dependent, e.g., class or aria-current)
    const overviewBtn = screen.getByLabelText('Mill Overview');
    expect(overviewBtn).toHaveAttribute('aria-pressed', 'true');

    rerender(<Dock activeMode="ai" onModeChange={() => {}} />);
    const aiBtn = screen.getByLabelText('AI Command');
    expect(aiBtn).toHaveAttribute('aria-pressed', 'true');
    expect(overviewBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onModeChange when an item is clicked', () => {
    const handleModeChange = vi.fn();
    render(<Dock activeMode="overview" onModeChange={handleModeChange} />);

    fireEvent.click(screen.getByLabelText('AI Command'));
    expect(handleModeChange).toHaveBeenCalledWith('ai');
  });

  it('has accessible labels for screen readers', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
