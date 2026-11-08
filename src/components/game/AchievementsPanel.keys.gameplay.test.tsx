import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementsPanel } from './AchievementsPanel';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSafetyStore } from '../../stores/safetyStore';
import { selectClockHolder, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { setLocale } from '../../i18n';

vi.mock('../CameraController', () => ({
  useCameraStore: (selector: (state: { setPreset: () => void }) => unknown) =>
    selector({ setPreset: vi.fn() }),
  CAMERA_PRESETS: Array.from({ length: 7 }, (_, i) => ({ name: `View ${i + 1}` })),
}));
vi.mock('../GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [{ message: 'Forklifts stopped.' }],
  FORKLIFT_STOP_TOPIC: 'forklift-stop',
}));
vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    playClick: vi.fn(),
    playEmergencyStop: vi.fn(),
    playPanelClose: vi.fn(),
    playPanelOpen: vi.fn(),
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

// The Achievements panel floats beside the plant with no backdrop. As an
// aria-modal dialog it took every global shortcut with it whenever focus sat on
// <body>: the stop key could not stop the forklifts and P could not pause while it
// was merely open. Keys pressed inside it still belong to it.
describe('the Achievements panel is a floating panel, not a modal', () => {
  beforeEach(() => {
    setLocale('en');
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useGameSimulationStore.setState({
      emergencyActive: false,
      emergencyDrillMode: false,
      gameSpeed: 60,
      clockHolds: [],
    });
    useUIStore.setState({ fpsMode: false, theme: 'dark' });
  });
  afterEach(() => {
    cleanup();
    useAchievementsStore.getState().resetAchievements();
  });

  it('leaves X and P to the plant while focus is outside it', async () => {
    const user = userEvent.setup();
    render(<AchievementsPanel onClose={vi.fn()} />);
    renderHook(() => useKeyboardShortcuts(config));
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(document.activeElement).toBe(document.body);
    await user.keyboard('x');
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    await user.keyboard('p');
    expect(selectClockHolder(useGameSimulationStore.getState())).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Achievements' })).not.toHaveAttribute('aria-modal');
  });

  it('keeps X and P pressed inside it away from the plant', async () => {
    const user = userEvent.setup();
    render(<AchievementsPanel onClose={vi.fn()} />);
    renderHook(() => useKeyboardShortcuts(config));
    const panel = screen.getByRole('dialog', { name: 'Achievements' });
    // A click on its text focuses the panel itself (tabindex -1).
    await user.click(screen.getAllByText('Progress')[0]);
    expect(document.activeElement).toBe(panel);
    await user.keyboard('x');
    await user.keyboard('p');
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(selectClockHolder(useGameSimulationStore.getState())).toBeNull();
  });

  it('closes on Escape inside it without the plant acting on that Escape', () => {
    const onClose = vi.fn();
    render(<AchievementsPanel onClose={onClose} />);
    renderHook(() => useKeyboardShortcuts(config));
    const panel = screen.getByRole('dialog', { name: 'Achievements' });
    panel.focus();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(config.setShowAIPanel).not.toHaveBeenCalled();
  });
});
