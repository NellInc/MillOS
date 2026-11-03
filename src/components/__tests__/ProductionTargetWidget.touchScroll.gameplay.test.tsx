/**
 * The tracker and the Energy dashboard are draggable cards whose content
 * scrolls (overflow-y-auto under a max height). framer-motion's whole-card drag
 * sets `touch-action: none` on the card, so on a phone a swipe over the content
 * dragged the card instead of scrolling it: in landscape the tracker's max
 * height is about 130 px and the dashboard's 80vh, so the rest of either could
 * not be read. Working if only the header handle takes the drag and the card
 * itself leaves touch scrolling to the browser.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductionTargetWidget } from '../ProductionTargetWidget';
import { EnergyDashboard } from '../ui/EnergyDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { setLocale } from '../../i18n';

describe('draggable production cards scroll by touch', () => {
  const saved = {
    target: useAIConfigStore.getState().showProductionTarget,
    energy: useAIConfigStore.getState().showEnergyDashboard,
  };

  beforeEach(() => {
    setLocale('en');
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.getState().closeMobilePanel();
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
  });

  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({
      showProductionTarget: saved.target,
      showEnergyDashboard: saved.energy,
    });
  });

  it('leaves the tracker card scrollable and drags from its header', () => {
    useAIConfigStore.setState({ showProductionTarget: true });
    render(<ProductionTargetWidget />);
    const card = screen.getByRole('region', { name: 'Production target tracker' });
    expect(card.style.touchAction).not.toBe('none');
    const handle = card.querySelector('[data-drag-handle]') as HTMLElement | null;
    expect(handle).not.toBeNull();
    expect(handle!.className).toMatch(/\btouch-none\b/);
  });

  it('leaves the Energy dashboard scrollable and drags from its header', () => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
    render(<EnergyDashboard />);
    const card = screen.getByRole('region', { name: 'Energy dashboard' });
    expect(card.style.touchAction).not.toBe('none');
    const handle = card.querySelector('[data-drag-handle]') as HTMLElement | null;
    expect(handle).not.toBeNull();
    expect(handle!.className).toMatch(/\btouch-none\b/);
  });
});
