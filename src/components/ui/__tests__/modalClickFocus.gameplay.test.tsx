import { cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import { useSafetyStore } from '../../../stores/safetyStore';
import { selectClockHolder, useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';
import { AboutModal } from '../../AboutModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';

vi.mock('../../CameraController', () => ({
  useCameraStore: (selector: (state: { setPreset: () => void }) => unknown) =>
    selector({ setPreset: vi.fn() }),
  CAMERA_PRESETS: Array.from({ length: 7 }, (_, i) => ({ name: `View ${i + 1}` })),
}));
vi.mock('../../GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [{ message: 'Forklifts stopped.' }],
  FORKLIFT_STOP_TOPIC: 'forklift-stop',
}));
vi.mock('../../../utils/audioManager', () => ({
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

// A click on a modal's text (not a control) moved focus to <body>, where the
// global shortcuts no longer saw the dialog: Space then stopped every forklift
// behind it and P paused the plant. Working if the dialog keeps focus.
describe('a click inside an open modal keeps the shortcuts out', () => {
  beforeEach(() => {
    setLocale('en');
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useGameSimulationStore.setState({
      emergencyActive: false,
      emergencyDrillMode: false,
      clockHolds: [],
    });
    useUIStore.setState({ fpsMode: false, theme: 'dark' });
  });
  afterEach(() => cleanup());

  const expectShortcutsHeld = async (text: string) => {
    const user = userEvent.setup();
    renderHook(() => useKeyboardShortcuts(config));
    await user.click(screen.getByText(text, { exact: false }));
    await user.keyboard(' ');
    await user.keyboard('p');
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(selectClockHolder(useGameSimulationStore.getState())).toBeNull();
    expect(document.activeElement?.closest('[role="dialog"][aria-modal="true"]')).not.toBeNull();
  };

  it('About', async () => {
    render(<AboutModal isOpen onClose={vi.fn()} theme="dark" />);
    await expectShortcutsHeld('Original MillOS soundtrack');
  });

  it('a confirmation', async () => {
    render(
      <ConfirmDialog
        isOpen
        title="Reset to 10 AM"
        message="The plant clock returns to ten."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    await expectShortcutsHeld('The plant clock returns to ten.');
  });

  it('the keyboard help', async () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    await expectShortcutsHeld('Move forward');
  });

  // Other lanes' modals (Datalinks, Achievements, AI settings, the lyrics view)
  // have no focusable container, so a click on their text still lands on
  // <body>; the hook itself must see that a modal is open.
  it('a modal whose container cannot take focus', async () => {
    const user = userEvent.setup();
    render(
      <div role="dialog" aria-modal="true" aria-label="Achievements">
        <p>Twelve shifts without a near miss.</p>
      </div>
    );
    renderHook(() => useKeyboardShortcuts(config));
    await user.click(screen.getByText('Twelve shifts without a near miss.'));
    expect(document.activeElement).toBe(document.body);
    await user.keyboard(' ');
    await user.keyboard('p');
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(selectClockHolder(useGameSimulationStore.getState())).toBeNull();
  });
});
