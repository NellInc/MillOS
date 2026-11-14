import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductionTargetWidget } from '../ProductionTargetWidget';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useUIStore } from '../../stores/uiStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';

describe('ProductionTargetWidget', () => {
  beforeEach(() => {
    // The guided programme is open: the tracker's target (D11).
    useOperationsCampaignStore.getState().resetCampaign();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.getState().closeMobilePanel();
    // Deterministic starting point: widget visible (store default is ON).
    useAIConfigStore.getState().setShowProductionTarget(true);
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
    useGameSimulationStore.setState({ gameTime: 12, gameSpeed: 30 });
    // Throughput is bags per game hour: 48 bags is 1.2 t per game hour.
    useProductionStore.setState({
      dailyBagsProduced: 0,
      metrics: { ...useProductionStore.getState().metrics, throughput: 48 },
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

  it('returns once the agreement reaches a review that owes nothing, and not while one is owed', () => {
    render(<ProductionTargetWidget />);
    const owing = createWorkplace();
    owing.phase = 'review';
    owing.members[0].recoveryOwedMinutes = 30;
    act(() => useWorkplaceStore.setState({ workplace: owing }));
    expect(screen.queryByRole('region', { name: 'Production target tracker' })).toBeNull();
    act(() => useWorkplaceStore.setState({ workplace: { ...createWorkplace(), phase: 'review' } }));
    expect(screen.getByRole('region', { name: 'Production target tracker' })).toBeInTheDocument();
    act(() => useWorkplaceStore.setState({ workplace: { ...createWorkplace(), phase: 'active' } }));
    expect(screen.queryByRole('region', { name: 'Production target tracker' })).toBeNull();
  });

  // One time model: the plant speeds up with the clock, so the rate per game
  // hour is the same at every pace.
  it.each([15, 30, 60, 120])('shows the same rate per game hour at pace %i', (pace) => {
    useGameSimulationStore.setState({ gameSpeed: pace });
    useProductionStore.setState({
      metrics: { ...useProductionStore.getState().metrics, throughput: 288 },
    });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('7.2 t/game h')).toBeInTheDocument();
    expect(screen.getByText('ON TRACK')).toBeInTheDocument();
  });

  it('keeps the rate on its own full-width row at larger text sizes', () => {
    render(<ProductionTargetWidget />);
    const value = screen.getByText('1.2 t/game h');
    expect(value).toHaveClass('whitespace-nowrap');
    expect(value.parentElement).toHaveClass('col-span-2');
  });

  it('shows a paused shift without treating the last physical rate as ongoing production', () => {
    useGameSimulationStore.setState({ gameSpeed: 0 });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByText('0.0 t/game h')).toBeInTheDocument();
    expect(screen.queryByText('ON TRACK')).toBeNull();
  });

  it('uses the actual last minute before the next order is due', () => {
    useOperationsCampaignStore.setState({ elapsedMinutes: 239 });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('Due in 1m')).toBeInTheDocument();
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

  // Seen on a landscape phone (844 x 390): at 30dvh from the bottom the
  // launcher sat on the walk D-pad (MobileControlsOverlay, bottom-24 left-4)
  // and covered its down arrow. On a short screen it drops to the corner below.
  it('drops below the walk D-pad on a short screen', () => {
    useAIConfigStore.getState().setShowProductionTarget(false);
    render(<ProductionTargetWidget />);
    const launcher = screen.getByRole('button', { name: 'Show production target tracker' });
    expect(launcher).toHaveClass('[@media(max-height:480px)]:bottom-4');
  });

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

  it('keeps keyboard focus on the control that replaces the one just pressed', () => {
    render(<ProductionTargetWidget />);

    const close = screen.getByRole('button', { name: 'Close production target tracker' });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Show production target tracker' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show production target tracker' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close production target tracker' })
    );
  });

  it('hands focus to the replacement when the T shortcut removes the focused control', () => {
    render(<ProductionTargetWidget />);
    screen.getByRole('button', { name: 'Close production target tracker' }).focus();

    // T pressed while the close button has focus: the card goes, focus must not.
    act(() => useAIConfigStore.getState().setShowProductionTarget(false));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Show production target tracker' })
    );

    act(() => useAIConfigStore.getState().setShowProductionTarget(true));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close production target tracker' })
    );
  });

  it('does not take focus when the tracker is toggled from elsewhere', () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <ProductionTargetWidget />
      </>
    );
    const elsewhere = screen.getByRole('textbox', { name: 'elsewhere' });
    elsewhere.focus();

    // The T shortcut or a settings toggle flips the same preference.
    act(() => useAIConfigStore.getState().setShowProductionTarget(false));
    act(() => useAIConfigStore.getState().setShowProductionTarget(true));
    expect(document.activeElement).toBe(elsewhere);
  });
});
