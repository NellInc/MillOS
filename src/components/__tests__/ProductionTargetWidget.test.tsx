import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductionTargetWidget } from '../ProductionTargetWidget';
import { useAIConfigStore } from '../../stores/aiConfigStore';

describe('ProductionTargetWidget', () => {
  beforeEach(() => {
    // Deterministic starting point: widget visible (store default is ON).
    useAIConfigStore.getState().setShowProductionTarget(true);
  });

  afterEach(() => {
    cleanup();
    useAIConfigStore.getState().setShowProductionTarget(true);
  });

  it('rests at the bottom-left corner so it clears the right-side sidebar', () => {
    render(<ProductionTargetWidget />);
    const card = screen.getByRole('region', { name: 'Production target tracker' });
    // The ContextSidebar (settings panel) lives at right-4; the widget must not
    // share that column, or it occludes the panel (the reported bug).
    expect(card.className).toContain('left-4');
    expect(card.className).not.toContain('right-4');
  });

  it('closes to a launcher pill and re-opens the full card', () => {
    render(<ProductionTargetWidget />);

    // Open: full card with a close control, no launcher pill.
    expect(screen.getByRole('region', { name: 'Production target tracker' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show production target tracker' })
    ).not.toBeInTheDocument();

    // Close -> card gone, launcher pill shown.
    fireEvent.click(screen.getByRole('button', { name: 'Close production target tracker' }));
    expect(
      screen.queryByRole('region', { name: 'Production target tracker' })
    ).not.toBeInTheDocument();
    const pill = screen.getByRole('button', { name: 'Show production target tracker' });
    expect(pill).toBeInTheDocument();

    // Re-open from the pill -> full card returns.
    fireEvent.click(pill);
    expect(screen.getByRole('region', { name: 'Production target tracker' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show production target tracker' })
    ).not.toBeInTheDocument();
  });
});
