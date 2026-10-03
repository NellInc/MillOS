import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductionTargetWidget } from '../ProductionTargetWidget';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useUIStore } from '../../stores/uiStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';

describe('ProductionTargetWidget', () => {
  beforeEach(() => {
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.getState().closeMobilePanel();
    // Deterministic starting point: widget visible (store default is ON).
    useAIConfigStore.getState().setShowProductionTarget(true);
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
    useGameSimulationStore.setState({ gameTime: 12, gameSpeed: 180 });
    useProductionStore.setState({
      dailyBagsProduced: 0,
      metrics: { ...useProductionStore.getState().metrics, throughput: 8640 },
    });
  });

  afterEach(() => {
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.getState().closeMobilePanel();
    cleanup();
    useAIConfigStore.getState().setShowProductionTarget(true);
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
    const game = useGameSimulationStore.getInitialState();
    const production = useProductionStore.getInitialState();
    useGameSimulationStore.setState({ gameTime: game.gameTime, gameSpeed: game.gameSpeed });
    useProductionStore.setState({
      dailyBagsProduced: production.dailyBagsProduced,
      metrics: production.metrics,
    });
  });

  it.each([true, false])(
    'yields expanded=%s to an actual Game agreement, keeping its preference',
    (expanded) => {
      useAIConfigStore.getState().setShowProductionTarget(expanded);
      render(<ProductionTargetWidget />);
      act(() => useWorkplaceStore.getState().start('game', 19));
      expect(screen.queryByRole('region', { name: 'Production target tracker' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show production target tracker' })).toBeNull();
      expect(useAIConfigStore.getState().showProductionTarget).toBe(expanded);
      act(() => useWorkplaceStore.setState({ workplace: createWorkplace() }));
      expect(
        expanded
          ? screen.getByRole('region', { name: 'Production target tracker' })
          : screen.getByRole('button', { name: 'Show production target tracker' })
      ).toBeInTheDocument();
    }
  );

  it.each([
    [180, '1.2 t/game h', 'BEHIND SCHEDULE'],
    [30, '7.2 t/game h', 'ON TRACK'],
    [1, '216.0 t/game h', 'ON TRACK'],
  ] as const)('compares forecast and remaining clock time at %ix', (pace, rate, status) => {
    useGameSimulationStore.setState({ gameSpeed: pace });
    render(<ProductionTargetWidget />);
    expect(screen.getByText(rate)).toBeInTheDocument();
    expect(screen.getByText('2.5 t/game h')).toBeInTheDocument();
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(useProductionStore.getState().metrics.throughput).toBe(8640);
  });

  it('keeps each complete rate on its own full-width row at larger text sizes', () => {
    render(<ProductionTargetWidget />);
    for (const rate of ['1.2 t/game h', '2.5 t/game h']) {
      const value = screen.getByText(rate);
      expect(value).toHaveClass('whitespace-nowrap');
      expect(value.parentElement).toHaveClass('col-span-2');
    }
  });

  it('shows a paused shift without treating the last physical rate as ongoing production', () => {
    useGameSimulationStore.setState({ gameSpeed: 0 });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByText('0.0 t/game h')).toBeInTheDocument();
    expect(screen.queryByText('ON TRACK')).toBeNull();
  });

  it('uses the actual last minute instead of inventing fifteen minutes of grace', () => {
    useGameSimulationStore.setState({ gameTime: 23 + 59 / 60 });
    useProductionStore.setState({ dailyBagsProduced: 1199 });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('1m left')).toBeInTheDocument();
    expect(screen.getByText('1.5 t/game h')).toBeInTheDocument();
    expect(screen.getByText('AT RISK')).toBeInTheDocument();
  });

  it('retains a met daily target when paused and hides its zero required rate', () => {
    useGameSimulationStore.setState({ gameSpeed: 0 });
    useProductionStore.setState({ dailyBagsProduced: 1200 });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('TARGET MET')).toBeInTheDocument();
    expect(screen.queryByText('Req:')).toBeNull();
  });

  it.each([true, false])(
    'yields expanded=%s to the mobile work sheet and restores the saved preference',
    (expanded) => {
      useAIConfigStore.getState().setShowProductionTarget(expanded);
      useMobileControlStore.getState().openMobilePanel('ai');
      render(<ProductionTargetWidget />);
      expect(screen.queryByRole('region', { name: 'Production target tracker' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show production target tracker' })).toBeNull();
      expect(useAIConfigStore.getState().showProductionTarget).toBe(expanded);
      act(() => useMobileControlStore.getState().closeMobilePanel());
      expect(
        expanded
          ? screen.getByRole('region', { name: 'Production target tracker' })
          : screen.getByRole('button', { name: 'Show production target tracker' })
      ).toBeInTheDocument();
    }
  );

  it.each([true, false])(
    'rests expanded=%s clear of header and music at every width',
    (expanded) => {
      useAIConfigStore.getState().setShowProductionTarget(expanded);
      render(<ProductionTargetWidget />);
      const tracker = expanded
        ? screen.getByRole('region', { name: 'Production target tracker' })
        : screen.getByRole('button', { name: 'Show production target tracker' });
      expect(tracker).toHaveClass('bottom-[min(11rem,30dvh)]');
      expect(tracker).not.toHaveClass('top-4');
      if (expanded) expect(tracker).toHaveClass('max-h-[calc(100dvh-min(11rem,30dvh)-9rem)]');
    }
  );

  it.each([true, false])(
    'yields the target with expanded=%s to the tour and restores the preference',
    (expanded) => {
      useAIConfigStore.getState().setShowProductionTarget(expanded);
      useAnnouncementsStore.getState().setContext({ onboarding: true });
      render(<ProductionTargetWidget />);
      expect(screen.queryByRole('region', { name: 'Production target tracker' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show production target tracker' })).toBeNull();
      expect(useAIConfigStore.getState().showProductionTarget).toBe(expanded);
      act(() => useAnnouncementsStore.getState().setContext({ onboarding: false }));
      expect(
        expanded
          ? screen.getByRole('region', { name: 'Production target tracker' })
          : screen.getByRole('button', { name: 'Show production target tracker' })
      ).toBeInTheDocument();
    }
  );

  it.each([true, false])(
    'yields the target with expanded=%s to first-delivery guidance until dismissed',
    (expanded) => {
      useAIConfigStore.getState().setShowProductionTarget(expanded);
      useUIStore.getState().startDeliveryJourney(null);
      render(<ProductionTargetWidget />);
      expect(screen.queryByRole('region', { name: 'Production target tracker' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show production target tracker' })).toBeNull();
      expect(useAIConfigStore.getState().showProductionTarget).toBe(expanded);
      act(() => useUIStore.getState().setJourneyVisible(false));
      expect(
        expanded
          ? screen.getByRole('region', { name: 'Production target tracker' })
          : screen.getByRole('button', { name: 'Show production target tracker' })
      ).toBeInTheDocument();
    }
  );

  it('reserves playback and dock space while leaving the sidebar column clear', () => {
    render(<ProductionTargetWidget />);
    const card = screen.getByRole('region', { name: 'Production target tracker' });
    // The ContextSidebar (settings panel) lives at right-4; the widget must not
    // share that column, or it occludes the panel (the reported bug).
    expect(card.className).toContain('left-4');
    expect(card.className).not.toContain('right-4');
    // Narration uses z-40 and must remain readable above this background tracker.
    expect(card).toHaveClass('z-30');
    expect(card).toHaveClass('bottom-[min(11rem,30dvh)]');
    expect(card).toHaveClass('max-w-[calc(100vw-2rem)]', 'sm:max-w-[calc(50vw-2rem)]');
    expect(card).toHaveClass('max-h-[calc(100dvh-min(11rem,30dvh)-9rem)]', 'overflow-y-auto');
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
    expect(pill).toHaveClass('bottom-[min(11rem,30dvh)]');

    // Re-open from the pill -> full card returns.
    fireEvent.click(pill);
    expect(screen.getByRole('region', { name: 'Production target tracker' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show production target tracker' })
    ).not.toBeInTheDocument();
  });
});
