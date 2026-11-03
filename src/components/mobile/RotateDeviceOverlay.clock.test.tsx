import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { RotateDeviceOverlay } from './RotateDeviceOverlay';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

beforeEach(() => {
  useGameSimulationStore.setState({ gameSpeed: 120, clockHolds: [] });
});
afterEach(cleanup);

it('holds the shift clock while the upright phone blocks play and resumes the pace on rotation', () => {
  const view = render(<RotateDeviceOverlay visible />);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  expect(useGameSimulationStore.getState().clockHolds.at(-1)?.holder).toBe('orientation');
  view.rerender(<RotateDeviceOverlay visible={false} />);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(120);
  expect(useGameSimulationStore.getState().clockHolds).toEqual([]);
});

it('leaves another holder in place when the phone is rotated', () => {
  const view = render(<RotateDeviceOverlay visible />);
  act(() => useGameSimulationStore.getState().holdClock('tour'));
  view.rerender(<RotateDeviceOverlay visible={false} />);
  const state = useGameSimulationStore.getState();
  expect(state.gameSpeed).toBe(0);
  expect(state.clockHolds.map((hold) => hold.holder)).toEqual(['tour']);
  act(() => useGameSimulationStore.getState().releaseClock('tour'));
  expect(useGameSimulationStore.getState().gameSpeed).toBe(120);
});

it('releases its hold when unmounted while upright', () => {
  const view = render(<RotateDeviceOverlay visible />);
  view.unmount();
  expect(useGameSimulationStore.getState().gameSpeed).toBe(120);
  expect(useGameSimulationStore.getState().clockHolds).toEqual([]);
});

it('never holds the clock while the device is landscape', () => {
  render(<RotateDeviceOverlay visible={false} />);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(120);
});
