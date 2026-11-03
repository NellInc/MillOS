import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

vi.mock('../../components/CameraController', () => ({
  useCameraStore: (selector: (state: { setPreset: () => void }) => unknown) =>
    selector({ setPreset: vi.fn() }),
  CAMERA_PRESETS: [{ name: 'Overview' }],
}));
vi.mock('../../components/GameFeatures', () => ({
  FORKLIFT_STOP_ANNOUNCEMENTS: [{ message: 'Forklifts stopped.' }],
  FORKLIFT_STOP_TOPIC: 'forklift-stop',
}));
vi.mock('../../utils/audioManager', () => ({ audioManager: { playClick: vi.fn() } }));

const setProductionSpeed = vi.fn();
const config = (productionSpeed: number) => ({
  showAIPanel: false,
  setShowAIPanel: vi.fn(),
  showSCADAPanel: false,
  setShowSCADAPanel: vi.fn(),
  selectedMachine: null,
  setSelectedMachine: vi.fn(),
  selectedForklift: null,
  setSelectedForklift: vi.fn(),
  productionSpeed,
  setProductionSpeed,
  showZones: false,
  setShowZones: vi.fn(),
  autoRotate: false,
  setAutoRotate: vi.fn(),
  setQualityNotification: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const press = (speed: number, key: '+' | '-'): number => {
  const { unmount } = renderHook(() => useKeyboardShortcuts(config(speed)));
  fireEvent.keyDown(window, { key });
  unmount();
  return setProductionSpeed.mock.calls.at(-1)?.[0] as number;
};

// The Settings slider moves in 5 % steps (and AI decisions set any rate), but
// + and - rounded speed +/- 0.1 to the 10 % grid, so from 85 % + went to 100 %,
// and from 15 % - stopped the line outright. Working if + and - go to the next
// 10 % mark above or below, wherever the rate starts.
it('steps to the next 10 % mark from a rate between marks', () => {
  expect(press(0.85, '+')).toBe(0.9);
  expect(press(0.85, '-')).toBe(0.8);
  expect(press(0.15, '-')).toBe(0.1);
  expect(press(0.05, '+')).toBe(0.1);
  expect(press(1.45, '-')).toBe(1.4);
  expect(press(1.95, '+')).toBe(2);
});

it('keeps exact 10 % steps from a mark and the 0 and 200 % limits', () => {
  expect(press(0.8, '+')).toBe(0.9);
  expect(press(0.8, '-')).toBe(0.7);
  expect(press(0.3, '-')).toBe(0.2);
  expect(press(0.7, '+')).toBe(0.8);
  expect(press(0, '-')).toBe(0);
  expect(press(2, '+')).toBe(2);
});
