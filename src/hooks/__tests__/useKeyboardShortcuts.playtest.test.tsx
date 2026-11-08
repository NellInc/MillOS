import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { incidentDescription, useSafetyStore } from '../../stores/safetyStore';
import { selectClockHolder, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useUIStore } from '../../stores/uiStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { setLocale, translate } from '../../i18n';
import { sharedMessages } from '../../components/game/shared.messages';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';

const camera = vi.hoisted(() => ({ setPreset: vi.fn() }));
vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: typeof camera) => unknown) => selector(camera),
  CAMERA_PRESETS: [{ name: 'Overview' }],
}));
vi.mock('../../components/GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [{ message: 'Forklifts stopped.' }],
  FORKLIFT_STOP_TOPIC: 'forklift-stop',
}));
vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    playClick: vi.fn(),
    playPanelClose: vi.fn(),
    playEmergencyStop: vi.fn(),
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
  productionSpeed: 0.8,
  setProductionSpeed: vi.fn(),
  showZones: false,
  setShowZones: vi.fn(),
  autoRotate: false,
  setAutoRotate: vi.fn(),
  setQualityNotification,
};

const press = (key: string) => fireEvent.keyDown(window, { key });

beforeEach(() => {
  vi.clearAllMocks();
  setLocale('en');
  useSafetyStore.setState({ forkliftEmergencyStop: false, safetyIncidents: [] });
  useGameSimulationStore.setState({
    gameSpeed: STANDARD_GAME_SPEED,
    clockHolds: [],
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  useAIConfigStore.setState({
    showEnergyDashboard: false,
    showMultiObjective: false,
    showProductionTarget: false,
  });
  useUIStore.setState({ journeyVisible: false, fpsMode: false });
  useAnnouncementsStore.setState((state) => ({
    context: { ...state.context, onboarding: false },
  }));
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// PLAYTEST-3: P is the documented pause/resume key, so it resumes a pause the
// player made with the Shift pace select as well as its own.
describe('P and a player pause', () => {
  it('resumes a Shift pace pause at the pace that ran before it', () => {
    useGameSimulationStore.getState().setGameSpeed(60);
    useGameSimulationStore.getState().setGameSpeed(0);
    expect(selectClockHolder(useGameSimulationStore.getState())).toBe('player');
    renderHook(() => useKeyboardShortcuts(config));
    press('p');
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 60, clockHolds: [] });
    expect(setQualityNotification).toHaveBeenLastCalledWith('RESUMED');
  });

  it('resumes a restored paused shift (no recorded hold) at standard pace', () => {
    useGameSimulationStore.setState({ gameSpeed: 0, clockHolds: [] });
    renderHook(() => useKeyboardShortcuts(config));
    press('p');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(STANDARD_GAME_SPEED);
  });

  it('releases only the player pause, naming a hold still underneath it', () => {
    useGameSimulationStore.getState().holdClock('tour');
    useGameSimulationStore.getState().setGameSpeed(0);
    renderHook(() => useKeyboardShortcuts(config));
    press('p');
    const sim = useGameSimulationStore.getState();
    expect(sim.gameSpeed).toBe(0);
    expect(selectClockHolder(sim)).toBe('tour');
    expect(setQualityNotification).toHaveBeenLastCalledWith(
      'Paused for the tour. It resumes when the tour closes.'
    );
  });
});

// PLAYTEST-9: the help lists "Close panels: ESC", and U and Y open panels.
describe('Escape and the U and Y dashboards', () => {
  it('closes the most recently opened dashboard first, then the other', () => {
    renderHook(() => useKeyboardShortcuts(config));
    press('y');
    press('u');
    expect(useAIConfigStore.getState()).toMatchObject({
      showEnergyDashboard: true,
      showMultiObjective: true,
    });
    press('Escape');
    expect(useAIConfigStore.getState()).toMatchObject({
      showEnergyDashboard: false,
      showMultiObjective: true,
    });
    press('Escape');
    expect(useAIConfigStore.getState().showMultiObjective).toBe(false);
  });

  it('leaves the dashboards to a later Escape while a selection is open', () => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
    renderHook(() =>
      useKeyboardShortcuts({ ...config, selectedForklift: { id: 'forklift-1' } as never })
    );
    press('Escape');
    expect(config.setSelectedForklift).toHaveBeenCalledWith(null);
    expect(useAIConfigStore.getState().showEnergyDashboard).toBe(true);
  });
});

// PLAYTEST-9: the target card yields its slot to the guided delivery, so T
// must not announce a card the player cannot see.
it('T does not claim the target card is on while guidance holds its slot', () => {
  useUIStore.setState({ journeyVisible: true });
  renderHook(() => useKeyboardShortcuts(config));
  press('t');
  expect(useAIConfigStore.getState().showProductionTarget).toBe(true);
  expect(setQualityNotification).not.toHaveBeenLastCalledWith('TARGET ON');
});

it('T still says TARGET ON when the card can show', () => {
  renderHook(() => useKeyboardShortcuts(config));
  press('t');
  expect(setQualityNotification).toHaveBeenLastCalledWith('TARGET ON');
});

// PLAYTEST-14: + and - show the new line rate in the shortcut notice.
it('+ and - show the new line rate', () => {
  renderHook(() => useKeyboardShortcuts(config));
  press('=');
  expect(config.setProductionSpeed).toHaveBeenLastCalledWith(0.9);
  expect(setQualityNotification).toHaveBeenLastCalledWith('LINE RATE 90%');
  press('-');
  expect(setQualityNotification).toHaveBeenLastCalledWith('LINE RATE 70%');
});

// PLAYTEST-14: the keyboard stop's incident is recorded in the active language.
it('records the X-key stop incident in Portuguese in a pt-BR session', () => {
  setLocale('pt-BR');
  renderHook(() => useKeyboardShortcuts(config));
  press('x');
  expect(useSafetyStore.getState().safetyIncidents[0]?.description).toBe(
    'Parada de emergência acionada pelo teclado (X)'
  );
});

// PLAYTEST-14: the log line follows a language switch made after the stop.
it('reads the X-key stop incident in the language active now', () => {
  renderHook(() => useKeyboardShortcuts(config));
  press('x');
  setLocale('pt-BR');
  expect(incidentDescription(useSafetyStore.getState().safetyIncidents[0])).toBe(
    'Parada de emergência acionada pelo teclado (X)'
  );
});

// The forklift-stop line carries its topic, so the release retires it even
// when the language changed between engage and release.
it('tags the X-key stop PA line with the forklift-stop topic', () => {
  useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
  renderHook(() => useKeyboardShortcuts(config));
  press('x');
  // The line is keyed (the forklift-stop corpus has the one line), so it
  // follows a language switch; see useKeyboardShortcuts.paKeyed.gameplay.test.
  expect(useAnnouncementsStore.getState().announcements.at(-1)).toMatchObject({
    message: translate(sharedMessages, 'forkliftStop'),
    channel: 'safety',
    topic: 'forklift-stop',
    copy: { key: 'forkliftStop' },
  });
});
