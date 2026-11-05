import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MachineType, type MachineData } from '../../types';
import { SITE_LAYOUT, type Vec3Tuple } from '../../constants/siteLayout';
import { useCameraStore } from '../CameraController';

vi.mock('@react-three/fiber', () => ({ useFrame: () => {}, useThree: () => ({}) }));
vi.mock('../models/WindmillInterior', () => ({ taskLitMaterial: () => ({ dispose() {} }) }));
vi.mock('../exterior/ExteriorLighting', () => ({ EXTERIOR_LAMP_LEVEL: { value: 0 } }));

const { MachineInspectionInterior } = await import('./MachineInspectionInterior');

const silo: MachineData = {
  id: 'silo-2',
  name: 'Gamma',
  type: MachineType.SILO,
  position: [...SITE_LAYOUT.machines.silos[2].position] as Vec3Tuple,
  size: SITE_LAYOUT.machineDimensions.silo as Vec3Tuple,
  rotation: 0,
  status: 'running',
  metrics: { rpm: 0, temperature: 20, vibration: 0, load: 50, wear: 1, efficiency: 90 },
  lastMaintenance: '',
  nextMaintenance: '',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('machine cutaway lesson camera', () => {
  // CompactMachinesContainer hands the cutaway a new machine object whenever any
  // machine's status changes (and the inspected one's differs from its first).
  // The lesson re-flew the camera then, pulling back a player who had orbited.
  it('does not fly back to the lesson when only the machine status changes', () => {
    // three-fiber tags render as unknown DOM elements here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const focusOn = vi.spyOn(useCameraStore.getState(), 'focusOn');
    const pose = {
      current: { phase: null, offset: [0, 0, 0], state: 'running', fill: 0.5, cycle: 0 },
    } as const;
    const props = { pose: pose as never, onSelect: () => {} };
    const view = render(createElement(MachineInspectionInterior, { machine: silo, ...props }));
    expect(focusOn).toHaveBeenCalledTimes(1);
    // The player orbits away from the lesson framing.
    act(() => useCameraStore.getState().cancelAnimation());
    view.rerender(
      createElement(MachineInspectionInterior, {
        machine: { ...silo, status: 'warning' },
        ...props,
      })
    );
    expect(focusOn).toHaveBeenCalledTimes(1);
    expect(useCameraStore.getState().isAnimating).toBe(false);
  });
});
