import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { installFocusRescue } from '../../utils/focusRescue';

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
  productionSpeed: 1,
  setProductionSpeed: vi.fn(),
  showZones: false,
  setShowZones: vi.fn(),
  autoRotate: false,
  setAutoRotate: vi.fn(),
  setQualityNotification,
};

beforeEach(() => {
  vi.clearAllMocks();
  useSafetyStore.setState({ showIncidentHeatMap: false, forkliftEmergencyStop: false });
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
});
afterEach(cleanup);

// The sidebar, guided-delivery and maintenance headings take programmatic
// focus (tabindex="-1") when their opener unmounts. X there is the forklift stop.
// Working if X stops the forklifts with focus on such a heading or a button.
it('X stops the forklifts while focus rests on a programmatic focus target', () => {
  render(
    <h2 tabIndex={-1} data-testid="heading">
      Mill Overview
    </h2>
  );
  renderHook(() => useKeyboardShortcuts(config));
  const heading = screen.getByTestId('heading');
  heading.focus();
  fireEvent.keyDown(heading, { key: 'x', code: 'KeyX' });
  expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
});

// A click leaves focus on its button, and X is no button's activation key, so
// the stop still answers there (Space, its old key, had to stand aside).
it('X stops the forklifts while a clicked button keeps focus', () => {
  render(<button type="button">Acknowledge</button>);
  renderHook(() => useKeyboardShortcuts(config));
  const button = screen.getByRole('button', { name: 'Acknowledge' });
  button.focus();
  fireEvent.keyDown(button, { key: 'x', code: 'KeyX' });
  expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
});

// Maintain disables itself for 1.2 s (Restart for 2.5 s); Chromium drops the
// focused button's focus, and the rescue lands on its panel. A second Space,
// meant for the button, once stopped every forklift from that landing.
// Working if Space, the button's key, never reaches the stop from there.
it('Space does not stop the forklifts from a rescued landing while its control is busy', () => {
  vi.useFakeTimers();
  const dispose = installFocusRescue();
  try {
    renderHook(() => useKeyboardShortcuts(config));
    render(
      <section aria-label="Machine">
        <button type="button">Perform maintenance</button>
      </section>
    );
    const button = screen.getByRole('button', { name: 'Perform maintenance' });
    button.focus();
    button.blur();
    (button as HTMLButtonElement).disabled = true;
    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    vi.advanceTimersByTime(100);
    const landing = screen.getByRole('region', { name: 'Machine' });
    expect(document.activeElement).toBe(landing);
    fireEvent.keyDown(landing, { key: ' ', code: 'Space' });
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  } finally {
    dispose();
    vi.useRealTimers();
  }
});

// The scene's heat map (MillScene IncidentHeatMap) and the Safety panel's
// toggle both read safetyStore.showIncidentHeatMap. Working if H shows and
// hides that map and the Safety panel's toggle agrees with it.
it('H toggles the incident heat map the scene draws', () => {
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'h' });
  expect(useSafetyStore.getState().showIncidentHeatMap).toBe(true);
  expect(setQualityNotification).toHaveBeenLastCalledWith('HEATMAP ON');
  fireEvent.keyDown(window, { key: 'h' });
  expect(useSafetyStore.getState().showIncidentHeatMap).toBe(false);
  expect(setQualityNotification).toHaveBeenLastCalledWith('HEATMAP OFF');
});
