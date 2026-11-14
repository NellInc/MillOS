import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useChronicleStore } from '../stores/chronicleStore';
import { setLocale, translate, type Locale } from '../i18n';
import { keyboardShortcutsMessages } from '../hooks/useKeyboardShortcuts.messages';
import { DeferredOperationalUI } from './DeferredOperationalUI';

vi.mock('./ui-new/GameInterface', () => ({ GameInterface: () => null }));
vi.mock('./ProductionTargetWidget', () => ({ ProductionTargetWidget: () => null }));
vi.mock('./ui', () => ({
  EnergyDashboard: () => null,
  MultiObjectiveDashboard: () => null,
  CostEstimationOverlay: () => null,
  WeatherEffectsOverlay: () => null,
}));
vi.mock('./AudioReactiveProvider', () => ({ AudioReactiveProvider: () => null }));
vi.mock('./mobile/MobileControlsOverlay', () => ({
  MobileControlsOverlay: () => null,
  RotateDeviceOverlay: () => null,
}));
vi.mock('./CameraController', () => ({ CameraPresetIndicator: () => null }));
vi.mock('./FirstPersonController', () => ({
  FPSCrosshair: () => null,
  FPSInstructions: () => null,
}));
vi.mock('./mobile/MobileFirstPersonController', () => ({ MobileFPSInstructions: () => null }));

afterEach(() => {
  cleanup();
  setLocale('en');
});

const renderNotification = (qualityNotification: string) =>
  render(
    <DeferredOperationalUI
      productionSpeed={1}
      setProductionSpeed={vi.fn()}
      showZones={false}
      setShowZones={vi.fn()}
      selectedMachine={null}
      selectedForklift={null}
      onCloseSelection={vi.fn()}
      onClearForklift={vi.fn()}
      showAIPanel={false}
      showSCADAPanel={false}
      onAIPanelChange={vi.fn()}
      onSCADAPanelChange={vi.fn()}
      onFocusMachine={vi.fn()}
      isMobile={false}
      isCompactLayout={false}
      isLandscape
      fpsMode={false}
      showFpsInstructions={false}
      onDismissFpsInstructions={vi.fn()}
      qualityNotification={qualityNotification}
      enableAudioReactive={false}
    />
  );

// Seen in play: PAUSED drew over a dialog that opened while paused (or that
// paused the game). A dialog, a phone sheet or a Chronicle decision is what is
// read, so the notice steps aside at once, as the rain badge does; the live
// region still announces it. Working if no shortcut notice shows over one.
describe('shortcut notice under a dialog', () => {
  afterEach(() => {
    document.querySelectorAll('[data-test-modal]').forEach((node) => node.remove());
    useMobileControlStore.setState({ mobilePanelVisible: false });
    useChronicleStore.setState({ dialogOpen: false });
  });
  const notice = () => document.querySelector('[data-shortcut-notice]');
  const openModal = () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('data-test-modal', '');
    document.body.appendChild(modal);
  };

  it('shows over the plant when nothing is open', () => {
    renderNotification('PAUSED');
    expect(notice()).not.toHaveClass('invisible');
  });

  it('is hidden from the first frame under a modal already open', () => {
    openModal();
    renderNotification('PAUSED');
    expect(notice()).toHaveClass('invisible');
    expect(screen.getByRole('status')).toHaveTextContent('PAUSED');
  });

  it('steps aside when a modal opens over it', async () => {
    renderNotification('PAUSED');
    openModal();
    await waitFor(() => expect(notice()).toHaveClass('invisible'));
  });

  it('is hidden under a phone sheet and a Chronicle decision', () => {
    useMobileControlStore.setState({ mobilePanelVisible: true });
    renderNotification('PAUSED');
    expect(notice()).toHaveClass('invisible');
    cleanup();
    useMobileControlStore.setState({ mobilePanelVisible: false });
    useChronicleStore.setState({ dialogOpen: true });
    renderNotification('PAUSED');
    expect(notice()).toHaveClass('invisible');
  });
});

describe('Space-bar stop notification', () => {
  // The Space-bar stop raises translate(keyboardShortcutsMessages, 'emergencyStop').
  // Working if the stop reads as an emergency (red, pulsing) in every language.
  it.each<Locale>(['en', 'pt-BR'])('styles the stop as an emergency in %s', (locale) => {
    setLocale(locale);
    renderNotification(translate(keyboardShortcutsMessages, 'emergencyStop'));
    const card = document.querySelector('[data-shortcut-notice]')?.firstElementChild;
    expect(card?.className).toContain('border-red-500');
  });

  it('keeps an ordinary notice neutral', () => {
    setLocale('pt-BR');
    renderNotification(translate(keyboardShortcutsMessages, 'emergencyStopReleased'));
    const card = document.querySelector('[data-shortcut-notice]')?.firstElementChild;
    expect(card?.className).toBeDefined();
    expect(card?.className).not.toContain('border-red-500');
  });
});
