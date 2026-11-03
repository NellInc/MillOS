import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { setLocale, translate } from '../../i18n';
import { keyedText } from '../../i18n/alertCopy';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { sharedMessages } from '../../components/game/shared.messages';

vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: { setPreset: () => void }) => unknown) =>
    selector({ setPreset: vi.fn() }),
  CAMERA_PRESETS: [],
}));
vi.mock('../../components/GameFeatures', () => ({ FORKLIFT_STOP_TOPIC: 'forklift-stop' }));
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

beforeEach(() => {
  useSafetyStore.setState({ forkliftEmergencyStop: false });
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useUIStore.setState({ fpsMode: false });
  useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
});
afterEach(() => setLocale('en'));

// Working if a Space-bar stop line queued in English reads in Portuguese
// after the player switches language (and after a reload restores it).
it('keys the Space-bar forklift-stop PA line so it follows a language switch', () => {
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  const line = useAnnouncementsStore
    .getState()
    .announcements.find((announcement) => announcement.topic === 'forklift-stop');
  expect(line).toBeDefined();
  const english = translate(sharedMessages, 'forkliftStop');

  setLocale('pt-BR');
  const portuguese = translate(sharedMessages, 'forkliftStop');
  expect(portuguese).not.toBe(english);
  expect(keyedText(line!.copy, line!.message)).toBe(portuguese);
});
