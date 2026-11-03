import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { setLocale } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

const camera = vi.hoisted(() => ({ setPreset: vi.fn() }));
vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: typeof camera) => unknown) => selector(camera),
  CAMERA_PRESETS: [{ name: 'Overview' }, { name: 'Silos' }, { name: 'Milling' }],
}));
vi.mock('../../components/GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [],
  FORKLIFT_STOP_TOPIC: 'forklift-stop',
}));
vi.mock('../../utils/audioManager', () => ({ audioManager: { playClick: vi.fn() } }));

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
  useUIStore.setState({ fpsMode: false });
});
afterEach(() => setLocale('en'));

// CAMERA_PRESETS keeps English ids; the words are translated where they are shown.
it('names a camera preset in the interface language', () => {
  setLocale('pt-BR');
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: '3' });
  expect(camera.setPreset).toHaveBeenCalledWith(2);
  expect(setQualityNotification).toHaveBeenLastCalledWith('MOAGEM');
});

it('keeps the English preset name in English', () => {
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: '2' });
  expect(setQualityNotification).toHaveBeenLastCalledWith('SILOS');
});
