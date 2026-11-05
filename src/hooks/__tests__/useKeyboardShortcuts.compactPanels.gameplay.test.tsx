import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useMobileControlStore } from '../../stores/mobileControlStore';

vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: { setPreset: () => void }) => unknown) =>
    selector({ setPreset: vi.fn() }),
  CAMERA_PRESETS: [{ name: 'Overview' }],
}));
vi.mock('../../components/GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [{ message: 'Forklifts stopped.' }],
  FORKLIFT_STOP_TOPIC: 'forklift-stop',
}));
vi.mock('../../utils/audioManager', () => ({
  audioManager: { playClick: vi.fn(), playPanelOpen: vi.fn(), playPanelClose: vi.fn() },
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

const initialWidth = window.innerWidth;
const setWidth = (width: number) =>
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

beforeEach(() => {
  vi.clearAllMocks();
  useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
});
afterEach(() => {
  cleanup();
  setWidth(initialWidth);
  useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
});

// The compact layout (a window under 768 px, a handheld) has no context
// sidebar: AI Partner and SCADA open as sheets, as the dock's own buttons do.
// I and O set the sidebar flags anyway, so they played the open sound and
// showed nothing, and the hidden 'ai' workspace then held back the reflection
// card until the key was pressed again.
// Working if I and O open the AI Partner and SCADA sheets in a narrow window.
it.each([
  ['i', 'ai'],
  ['o', 'scada'],
] as const)('%s in the compact layout opens the %s sheet', (key, sheet) => {
  setWidth(600);
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key });
  expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
  expect(useMobileControlStore.getState().mobilePanelContent).toBe(sheet);
  expect(config.setShowAIPanel).not.toHaveBeenCalled();
  expect(config.setShowSCADAPanel).not.toHaveBeenCalled();
});

it('I and O on a wide window still toggle the sidebar panels', () => {
  setWidth(1280);
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'i' });
  expect(config.setShowAIPanel).toHaveBeenLastCalledWith(true);
  fireEvent.keyDown(window, { key: 'o' });
  expect(config.setShowSCADAPanel).toHaveBeenLastCalledWith(true);
  expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
});
