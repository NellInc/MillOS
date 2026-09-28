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

  it('rests above desktop playback and leaves the sidebar column clear at larger UI scales', () => {
    render(<ProductionTargetWidget />);
    const card = screen.getByRole('region', { name: 'Production target tracker' });
    // The ContextSidebar (settings panel) lives at right-4; the widget must not
    // share that column, or it occludes the panel (the reported bug).
    expect(card.className).toContain('left-4');
    expect(card.className).not.toContain('right-4');
    expect(card).toHaveClass('top-4', 'bottom-auto', 'sm:top-auto', 'sm:bottom-[11rem]');
    expect(card).toHaveClass('max-w-[calc(100vw-2rem)]', 'sm:max-w-[calc(50vw-2rem)]');
    expect(card).toHaveClass('sm:max-h-[calc(100dvh-17rem)]', 'overflow-y-auto');
  });

  it('closes to a launcher pill and re-opens the full card', () => {
    render(<ProductionTargetWidget />);

    // Open: full card with a close control, no launcher pill.
    expect(screen.getByRole('region', { name: 'Production target tracker' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show production target tracker' })
    ).not.toBeInTheDocument();

    // Close -> card gone, launcher pill shown.
    const close = screen.getByRole('button', { name: 'Close production target tracker' });
    expect(close).toHaveClass('p-3.5', '-m-2.5');
    fireEvent.click(close);
    expect(
      screen.queryByRole('region', { name: 'Production target tracker' })
    ).not.toBeInTheDocument();
    const pill = screen.getByRole('button', { name: 'Show production target tracker' });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('top-4', 'bottom-auto', 'sm:top-auto', 'sm:bottom-[11rem]');

    // Re-open from the pill -> full card returns.
    fireEvent.click(pill);
    expect(screen.getByRole('region', { name: 'Production target tracker' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show production target tracker' })
    ).not.toBeInTheDocument();
  });
});
