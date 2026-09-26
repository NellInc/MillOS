import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { audioManager } from '../../utils/audioManager';

const camera = vi.hoisted(() => ({ setPreset: vi.fn() }));
vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: typeof camera) => unknown) => selector(camera),
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
  setQualityNotification: vi.fn(),
};

describe('keyboard control ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useUIStore.setState({ fpsMode: false });
  });

  it('keeps native select and editable typing out of production controls', () => {
    render(
      <>
        <select aria-label="Collection">
          <option>Production songs</option>
        </select>
        <div contentEditable data-testid="editor" />
      </>
    );
    const note = document.createElement('span');
    note.textContent = 'Notes';
    screen.getByTestId('editor').append(note);
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'p' });
    fireEvent.keyDown(screen.getByText('Notes'), { key: 'p' });
    expect(config.setProductionSpeed).not.toHaveBeenCalled();
  });

  it('leaves Space to the native onboarding disclosure', () => {
    render(
      <details>
        <summary>Camera controls</summary>Help
      </details>
    );
    renderHook(() => useKeyboardShortcuts(config));
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(screen.getByText('Camera controls'), event);
    expect(event.defaultPrevented).toBe(false);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  });

  it('does not operate the mill from inside a modal or a consumed event', () => {
    render(
      <div role="dialog" aria-modal="true">
        <button>Close lyrics</button>
      </div>
    );
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(screen.getByRole('button'), { key: 'p' });
    const event = new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(window, event);
    expect(config.setProductionSpeed).not.toHaveBeenCalled();
  });

  it('retains scene shortcuts and all seven camera presets', () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(window, { key: 'p' });
    expect(config.setProductionSpeed).toHaveBeenCalledWith(0);
    fireEvent.keyDown(window, { key: '7' });
    expect(camera.setPreset).toHaveBeenCalledWith(6);
  });

  it('retains the forklift stop when the scene owns Space', () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(audioManager.startEmergencyStopAlarm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(audioManager.stopEmergencyStopAlarm).toHaveBeenCalledTimes(1);
  });

  it('does not toggle the forklift stop on key auto-repeat', () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
    fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(audioManager.playEmergencyStop).toHaveBeenCalledTimes(1);
  });

  it('honours the fire-drill interlock instead of claiming a release', () => {
    useSafetyStore.setState({ forkliftEmergencyStop: true });
    useGameSimulationStore.setState({ emergencyDrillMode: true });
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(config.setQualityNotification).toHaveBeenCalledWith('DRILL INTERLOCK ACTIVE');
  });

  it('steps speed on a 0.1 grid so it reaches exactly zero', () => {
    const setProductionSpeed = vi.fn();
    const { rerender } = renderHook(
      ({ speed }) =>
        useKeyboardShortcuts({ ...config, productionSpeed: speed, setProductionSpeed }),
      { initialProps: { speed: 0.8 } }
    );
    let speed = 0.8;
    for (let i = 0; i < 8; i++) {
      fireEvent.keyDown(window, { key: '-' });
      speed = setProductionSpeed.mock.lastCall?.[0] as number;
      rerender({ speed });
    }
    expect(speed).toBe(0);
  });

  it('leaves first-person before flying to a camera preset', () => {
    useUIStore.setState({ fpsMode: true });
    renderHook(() => useKeyboardShortcuts(config));
    fireEvent.keyDown(window, { key: '2' });
    expect(useUIStore.getState().fpsMode).toBe(false);
    expect(camera.setPreset).toHaveBeenCalledWith(1);
  });
});
