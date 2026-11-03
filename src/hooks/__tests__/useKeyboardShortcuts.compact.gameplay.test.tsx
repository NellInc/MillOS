import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useUIStore } from '../../stores/uiStore';

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
  audioManager: { playClick: vi.fn() },
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

const initialWidth = window.innerWidth;
const setWidth = (width: number) =>
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

beforeEach(() => {
  vi.clearAllMocks();
  useUIStore.setState({ showMiniMap: false });
});
afterEach(() => {
  cleanup();
  setWidth(initialWidth);
});

// The compact layout (a window under 768 px) mounts no mini-map
// (GameInterface), so G announced 'GPS ON' and nothing appeared. The choice is
// kept for a wider window, and the notice says so.
// Working if G never announces a map that did not appear.
it('G in the compact layout keeps the map choice and says where it shows', () => {
  setWidth(600);
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'g' });
  expect(useUIStore.getState().showMiniMap).toBe(true);
  expect(setQualityNotification).toHaveBeenLastCalledWith('GPS ON IN A WIDER WINDOW');
});

it('G on a wide window still announces the map it shows', () => {
  setWidth(1280);
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'g' });
  expect(useUIStore.getState().showMiniMap).toBe(true);
  expect(setQualityNotification).toHaveBeenLastCalledWith('GPS ON');
  fireEvent.keyDown(window, { key: 'g' });
  expect(setQualityNotification).toHaveBeenLastCalledWith('GPS OFF');
});
