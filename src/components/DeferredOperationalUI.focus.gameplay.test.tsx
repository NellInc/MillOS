import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeferredOperationalUI } from './DeferredOperationalUI';

vi.mock('./ui-new/GameInterface', () => ({
  GameInterface: () => (
    <button type="button" data-dock-mode="overview">
      Mill Overview
    </button>
  ),
}));
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

afterEach(() => cleanup());

const FORKLIFT = {
  id: 'forklift-1',
  cargo: 'empty' as const,
  position: [0, 0, 0] as [number, number, number],
  rotation: 0,
  status: 'moving' as const,
};

const props = (
  overrides: Partial<ComponentProps<typeof DeferredOperationalUI>> = {}
): ComponentProps<typeof DeferredOperationalUI> => ({
  productionSpeed: 1,
  setProductionSpeed: vi.fn(),
  showZones: false,
  setShowZones: vi.fn(),
  selectedMachine: null,
  selectedForklift: null,
  onCloseSelection: vi.fn(),
  onClearForklift: vi.fn(),
  showAIPanel: false,
  showSCADAPanel: false,
  onAIPanelChange: vi.fn(),
  onSCADAPanelChange: vi.fn(),
  onFocusMachine: vi.fn(),
  isMobile: false,
  isCompactLayout: false,
  isLandscape: true,
  fpsMode: false,
  showFpsInstructions: false,
  onDismissFpsInstructions: vi.fn(),
  qualityNotification: null,
  enableAudioReactive: false,
  ...overrides,
});

// The forklift card's Close (or Escape) unmounts the card with focus on its
// button, which dropped focus to <body>: Tab restarted at the top of the page.
// The card has no opener (a forklift is picked in the scene), so the dock takes it.
// Working if closing the card from inside it leaves focus on the dock.
describe('forklift card focus', () => {
  it('hands focus to the dock when the card closes with focus inside it', () => {
    const { rerender } = render(
      <DeferredOperationalUI {...props({ selectedForklift: FORKLIFT })} />
    );
    const close = screen.getByRole('button', { name: 'Close forklift details' });
    close.focus();
    expect(document.activeElement).toBe(close);
    rerender(<DeferredOperationalUI {...props({ selectedForklift: null })} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mill Overview' }));
  });

  it('leaves focus alone when the card closes while focus is elsewhere', () => {
    const { rerender } = render(
      <>
        <input aria-label="elsewhere" />
        <DeferredOperationalUI {...props({ selectedForklift: FORKLIFT })} />
      </>
    );
    const elsewhere = screen.getByLabelText('elsewhere');
    elsewhere.focus();
    rerender(
      <>
        <input aria-label="elsewhere" />
        <DeferredOperationalUI {...props({ selectedForklift: null })} />
      </>
    );
    expect(document.activeElement).toBe(elsewhere);
  });
});

// The shortcut notice (P, Z, G, the Space-bar stop...) mounted its live region
// together with its text, and a live region inserted with its content is not
// read by screen readers: a region must already be on the page when its text
// changes. Working if a persistent status region receives each notice.
describe('shortcut notice live region', () => {
  it('announces a notice through a region that was on the page before it', () => {
    const { rerender } = render(<DeferredOperationalUI {...props()} />);
    const region = screen.getByRole('status', { hidden: false });
    expect(region).toHaveTextContent('');
    rerender(<DeferredOperationalUI {...props({ qualityNotification: 'PAUSED' })} />);
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('PAUSED');
    rerender(<DeferredOperationalUI {...props({ qualityNotification: null })} />);
    expect(region).toHaveTextContent('');
  });
});
