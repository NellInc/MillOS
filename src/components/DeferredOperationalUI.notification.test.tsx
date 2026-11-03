import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
