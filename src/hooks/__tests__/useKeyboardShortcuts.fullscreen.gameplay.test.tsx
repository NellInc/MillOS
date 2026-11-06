import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useForkliftDriveStore } from '../../stores/forkliftDriveStore';
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
  audioManager: { playClick: vi.fn(), playPanelOpen: vi.fn(), playPanelClose: vi.fn() },
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

const root = document.documentElement;
const defineRequest = (value: unknown) =>
  Object.defineProperty(root, 'requestFullscreen', { configurable: true, value });

beforeEach(() => {
  vi.clearAllMocks();
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
  useUIStore.setState({ fpsMode: false });
});
afterEach(() => {
  Reflect.deleteProperty(root, 'requestFullscreen');
});

const pressF = async () => {
  fireEvent.keyDown(window, { key: 'f' });
  // The notice follows the browser's answer, which settles a microtask later.
  await act(async () => {
    await Promise.resolve();
  });
};

// F announced FULLSCREEN as it asked, before the browser answered. Where the
// document cannot go fullscreen (an iPhone has no Fullscreen API; an embed
// without allowfullscreen rejects the request) the notice was false, and with
// no request function at all the key threw before saying anything.
// Working if F says FULLSCREEN only once the page is fullscreen, and says the
// view is unavailable otherwise.
it('says fullscreen is unavailable where the page has no Fullscreen API', async () => {
  renderHook(() => useKeyboardShortcuts(config));
  await pressF();
  expect(setQualityNotification).toHaveBeenLastCalledWith('FULLSCREEN UNAVAILABLE');
});

it('says fullscreen is unavailable when the browser refuses the request', async () => {
  defineRequest(vi.fn(() => Promise.reject(new TypeError('Permissions check failed'))));
  renderHook(() => useKeyboardShortcuts(config));
  await pressF();
  expect(setQualityNotification).not.toHaveBeenCalledWith('FULLSCREEN');
  expect(setQualityNotification).toHaveBeenLastCalledWith('FULLSCREEN UNAVAILABLE');
});

it('says FULLSCREEN once the browser grants it', async () => {
  const request = vi.fn(() => Promise.resolve());
  defineRequest(request);
  renderHook(() => useKeyboardShortcuts(config));
  await pressF();
  expect(request).toHaveBeenCalledTimes(1);
  expect(setQualityNotification).toHaveBeenLastCalledWith('FULLSCREEN');
});
