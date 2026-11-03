import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useUIStore } from '../../stores/uiStore';
import { setLocale } from '../../i18n';

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
const setAutoRotate = vi.fn();
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
  setAutoRotate,
  setQualityNotification,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useUIStore.setState({ fpsMode: false });
});

// No camera controller runs in walk mode (App mounts CameraController only
// outside it), so C said 'ROTATION ON' and nothing turned; the orbit then
// started by itself the moment the player left walk mode. The choice is kept
// and the notice says when it applies, as T and G already do.
// Working if C never announces a turn that is not happening.
it('C in walk mode keeps the orbit choice and says it starts in orbit view', () => {
  useUIStore.setState({ fpsMode: true });
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'c' });
  expect(setAutoRotate).toHaveBeenLastCalledWith(true);
  expect(setQualityNotification).toHaveBeenLastCalledWith('ROTATION ON IN ORBIT VIEW');
});

it('C in walk mode reads in Portuguese in pt-BR', () => {
  setLocale('pt-BR');
  useUIStore.setState({ fpsMode: true });
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'c' });
  expect(setQualityNotification).toHaveBeenLastCalledWith('ROTAÇÃO LIGADA NA VISÃO ORBITAL');
});

it('C in orbit view still announces the turn plainly', () => {
  renderHook(() => useKeyboardShortcuts(config));
  fireEvent.keyDown(window, { key: 'c' });
  expect(setQualityNotification).toHaveBeenLastCalledWith('ROTATION ON');
});
