/**
 * A roller mill's two rolls turn at different speeds (the differential). The
 * cutaway's rolls are fluted, so they are a break pair, and it turned both at
 * the same speed (report 03, finding 9). Sources: millingSources.ts.
 * Working if the front roll turns the break differential faster than the back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MachineType, type MachineData } from '../../types';
import { SITE_LAYOUT, type Vec3Tuple } from '../../constants/siteLayout';

const frames: (() => void)[] = [];
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => frames.push(callback),
  useThree: () => ({}),
}));
vi.mock('../models/WindmillInterior', () => ({ taskLitMaterial: () => ({ dispose() {} }) }));
vi.mock('../exterior/ExteriorLighting', () => ({ EXTERIOR_LAMP_LEVEL: { value: 0 } }));

const { MachineInspectionInterior } = await import('./MachineInspectionInterior');

const mill: MachineData = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [...SITE_LAYOUT.machines.rollerMills[0].position] as Vec3Tuple,
  size: SITE_LAYOUT.machineDimensions.rollerMill as Vec3Tuple,
  rotation: 0,
  status: 'running',
  metrics: { rpm: 0, temperature: 20, vibration: 0, load: 50, wear: 1, efficiency: 90 },
  lastMaintenance: '',
  nextMaintenance: '',
};

// three-fiber tags render as unknown DOM elements here; give them the
// transform fields the frame callback writes.
for (const field of ['rotation', 'position', 'scale', 'userData', 'instanceMatrix'] as const)
  Object.defineProperty(HTMLUnknownElement.prototype, field, {
    configurable: true,
    get(this: HTMLElement & Record<string, unknown>) {
      const key = `__${field}`;
      this[key] ??= { x: 0, y: 0, z: 0, set() {} };
      return this[key];
    },
  });
Object.assign(HTMLUnknownElement.prototype, { localToWorld() {}, setMatrixAt() {} });

afterEach(() => {
  cleanup();
  frames.length = 0;
  vi.restoreAllMocks();
});

describe('roller-mill cutaway rolls', () => {
  it('turns the front roll faster than the back one, at the break differential', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pose = {
      current: { phase: 0, offset: [0, 0, 0], state: 'operating', fill: 0, cycle: 0 },
    };
    const view = render(
      createElement(MachineInspectionInterior, {
        machine: mill,
        pose: pose as never,
        onSelect: () => {},
      })
    );
    // The two roll meshes are the only placed meshes in a mill cutaway; the
    // back roll stands at -z, the front (nearer the lesson camera) at +z.
    const rolls = [...view.container.querySelectorAll('mesh')].filter((mesh) =>
      mesh.getAttribute('position')
    );
    expect(rolls).toHaveLength(2);
    const [back, front] = rolls as unknown as { rotation: { x: number } }[];
    const turn = (phase: number) => {
      pose.current.phase = phase;
      frames.forEach((frame) => frame());
      return { back: back.rotation.x, front: front.rotation.x };
    };
    const start = turn(1);
    const end = turn(2);
    const fast = Math.abs(end.front - start.front);
    const slow = Math.abs(end.back - start.back);
    expect(slow).toBeGreaterThan(0);
    expect(fast / slow).toBeCloseTo(2.5, 6);
    // The pair turn in opposite senses.
    expect(Math.sign(end.front - start.front)).toBe(-Math.sign(end.back - start.back));
  });
});
