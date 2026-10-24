import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { selectClockHolder, useGameSimulationStore } from '../gameSimulationStore';
import { useWorkplaceStore } from '../workplaceStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { setLocale } from '../../i18n';

// The P key against the real derived handoff hold (workplaceStore's
// syncHandoffHold), not a hand-pushed one. The hook file itself is guarded, so
// this exercises it from outside.
vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: { setPreset: () => void }) => unknown) =>
    selector({ setPreset: vi.fn() }),
  CAMERA_PRESETS: Array.from({ length: 7 }, (_, i) => ({ name: `View ${i + 1}` })),
}));
vi.mock('../../components/GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [{ message: 'Forklifts stopped.' }],
}));
vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    playClick: vi.fn(),
    playEmergencyStop: vi.fn(),
    playPanelClose: vi.fn(),
    startEmergencyStopAlarm: vi.fn(),
    stopEmergencyStopAlarm: vi.fn(),
  },
}));

const setQualityNotification = vi.fn();
const config = {
  showAIPanel: false,
  setShowAIPanel: vi.fn(),
  showSCADAPanel: false,
  setShowSCADAPanel: vi.fn(),
  selectedMachine: null,
  setSelectedMachine: vi.fn(),
  selectedForklift: null,
  setSelectedForklift: vi.fn(),
  productionSpeed: 1,
  setProductionSpeed: vi.fn(),
  showZones: false,
  setShowZones: vi.fn(),
  autoRotate: false,
  setAutoRotate: vi.fn(),
  setQualityNotification,
};
const pressP = () => fireEvent.keyDown(window, { key: 'p' });
const holders = () => useGameSimulationStore.getState().clockHolds.map((hold) => hold.holder);
const openHandoff = () => {
  const store = useWorkplaceStore.getState();
  expect(store.beginImprovement('team', store.workplace.revision, undefined, 'game').changed).toBe(
    true
  );
};
const cancelHandoff = () => {
  const store = useWorkplaceStore.getState();
  expect(store.cancelImprovement(store.workplace.revision).changed).toBe(true);
};

describe('P under the handoff hold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocale('en');
    useWorkplaceStore.setState({
      workplace: createWorkplace(),
      participationMode: 'solo',
      turn: null,
    });
    useGameSimulationStore.setState({
      gameSpeed: 30,
      clockHolds: [],
      emergencyActive: false,
      emergencyDrillMode: false,
    });
    renderHook(() => useKeyboardShortcuts(config));
  });

  it('names the hold and leaves no player or shortcut pause on top of it', () => {
    openHandoff();
    expect(holders()).toEqual(['handoff']);
    pressP();
    pressP();
    expect(holders()).toEqual(['handoff']);
    expect(selectClockHolder(useGameSimulationStore.getState())).toBe('handoff');
    expect(setQualityNotification).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Held while the team decides the handoff experiment/)
    );
    // Ending the decision resumes the plant with nothing left holding it.
    cancelHandoff();
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 30, clockHolds: [] });
  });

  it('keeps a pace chosen under the hold as the resume pace, untouched by P', () => {
    openHandoff();
    useGameSimulationStore.getState().setGameSpeed(60);
    pressP();
    expect(useGameSimulationStore.getState().clockHolds).toEqual([
      { holder: 'handoff', resumeSpeed: 60 },
    ]);
    cancelHandoff();
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 60, clockHolds: [] });
  });

  it('leaves an earlier P pause with P, which still resumes it after the handoff', () => {
    pressP();
    expect(holders()).toEqual(['shortcut']);
    openHandoff();
    expect(holders()).toEqual(['shortcut', 'handoff']);
    pressP();
    expect(holders()).toEqual(['shortcut', 'handoff']);
    cancelHandoff();
    // The handoff hold resumed at the paused pace beneath it: P's hold remains.
    expect(selectClockHolder(useGameSimulationStore.getState())).toBe('shortcut');
    pressP();
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 30, clockHolds: [] });
  });
});
