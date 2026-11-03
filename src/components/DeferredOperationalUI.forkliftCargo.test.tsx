import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeferredOperationalUI } from './DeferredOperationalUI';
import { vehicleTelemetryRegistry } from '../simulation/vehicles/vehicleTelemetryRegistry';
import { useForkliftDriveStore } from '../stores/forkliftDriveStore';
import { forkliftCrewLive } from '../stores/forkliftCrewStore';
import type { ForkliftCrewPhase } from '../simulation/forkliftCrew';

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
  vi.useRealTimers();
  vehicleTelemetryRegistry.clear();
});

const publish = (cargo: 'pallet' | 'empty') =>
  vehicleTelemetryRegistry.publish({
    id: 'FL-1',
    type: 'forklift',
    speedMps: 1,
    steeringRadians: 0,
    phase: 'traveling',
    stopReason: 'none',
    articulationRadians: 0,
    transferReady: false,
    cargo,
  });

// The inspector was handed the forklift once, at the click, so 'Cargo' kept
// that reading while the forklift picked up and set down pallets.
// Working if the open inspector follows the forklift's live cargo.
describe('forklift inspector cargo', () => {
  it('follows the forklift picking up a pallet while it is open', () => {
    vi.useFakeTimers();
    publish('empty');
    render(
      <DeferredOperationalUI
        productionSpeed={1}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={null}
        selectedForklift={{
          id: 'FL-1',
          cargo: 'empty',
          position: [0, 0, 0],
          rotation: 0,
          status: 'moving',
        }}
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
        qualityNotification={null}
        enableAudioReactive={false}
      />
    );
    expect(screen.getByText('Empty')).toBeInTheDocument();
    publish('pallet');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});

// Forklifts are crewed (CLAUDE.md 'Forklift Crews and Driving'), and the player
// can board one in first person, so 'Autonomous' was false either way.
// Working if Control names the crew operator, or the player while driving.
describe('forklift inspector control', () => {
  const renderInspector = () =>
    render(
      <DeferredOperationalUI
        productionSpeed={1}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={null}
        selectedForklift={{
          id: 'forklift-1',
          cargo: 'empty',
          position: [0, 0, 0],
          rotation: 0,
          status: 'moving',
        }}
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
        qualityNotification={null}
        enableAudioReactive={false}
      />
    );

  afterEach(() => useForkliftDriveStore.setState({ drivenId: null, inReachId: null }));

  it('names the crew operator, then the player who boards it', () => {
    renderInspector();
    expect(screen.queryByText('Autonomous')).not.toBeInTheDocument();
    expect(screen.getByText('Crew operator')).toBeInTheDocument();
    act(() => useForkliftDriveStore.setState({ drivenId: 'forklift-1' }));
    expect(screen.getByText('You')).toBeInTheDocument();
    act(() => useForkliftDriveStore.setState({ drivenId: 'forklift-2' }));
    expect(screen.getByText('Crew operator')).toBeInTheDocument();
  });

  // The operator walks off on break or waits beside a displaced forklift; the
  // inspector said 'Crew operator' throughout. Working if Control names where
  // the anonymous operator is, from the crew's live record.
  it('follows the crew operator off the forklift and back', () => {
    vi.useFakeTimers();
    const entry = forkliftCrewLive('forklift-1');
    const step = (phase: ForkliftCrewPhase) => {
      entry.state = { phase, timer: 0, handover: null };
      entry.heartbeat = performance.now();
      act(() => {
        vi.advanceTimersByTime(600);
      });
    };
    renderInspector();
    step('off');
    expect(screen.getByText('Operator on break')).toBeInTheDocument();
    step('boarding');
    expect(screen.getByText('Operator climbing in or out')).toBeInTheDocument();
    step('displaced');
    expect(screen.getByText('Waiting for its operator')).toBeInTheDocument();
    step('aboard');
    expect(screen.getByText('Crew operator')).toBeInTheDocument();
    entry.state = null;
    vi.useRealTimers();
  });
});
