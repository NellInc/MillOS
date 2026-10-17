import { describe, expect, it } from 'vitest';
import type { MachineBuffer } from '../../stores/materialFlowStore';
import {
  getMachineOperationalState,
  sampleMachineVisualPhase,
  type MachineVisualClock,
} from '../machineMotion';

const createBuffer = (overrides: Partial<MachineBuffer> = {}): MachineBuffer => ({
  machineId: 'rm-101',
  machineType: 'roller_mill',
  inputBuffer: [{ type: 'wheat_grain', amount: 100 }],
  outputBuffer: [{ type: 'flour', amount: 20 }],
  inputCapacity: 2000,
  outputCapacity: 2000,
  processingRate: 50,
  conversionRatios: [],
  isProcessing: true,
  ...overrides,
});

describe('machine motion semantics', () => {
  it('distinguishes operating, stopped, and faulted state', () => {
    expect(getMachineOperationalState('running', createBuffer())).toBe('operating');
    expect(getMachineOperationalState('idle', createBuffer())).toBe('stopped');
    expect(getMachineOperationalState('critical', createBuffer())).toBe('faulted');
    expect(getMachineOperationalState('running', createBuffer({ isProcessing: false }))).toBe(
      'stopped'
    );
  });

  it('identifies starved processing equipment', () => {
    expect(
      getMachineOperationalState('running', createBuffer({ inputBuffer: [], outputBuffer: [] }))
    ).toBe('starved');
  });

  it('identifies downstream blockage', () => {
    expect(
      getMachineOperationalState(
        'warning',
        createBuffer({
          outputBuffer: [{ type: 'flour', amount: 2000 }],
        })
      )
    ).toBe('blocked');
  });

  it('uses silo output as its source inventory', () => {
    expect(
      getMachineOperationalState(
        'running',
        createBuffer({
          machineType: 'silo',
          inputBuffer: [],
          outputBuffer: [],
        })
      )
    ).toBe('starved');
  });
});

it('holds the live mechanical phase instead of snapping stopped rollers, sifters and packers to rest', () => {
  const clock: MachineVisualClock = { sampleTime: 0, phaseTime: null };
  const running = sampleMachineVisualPhase(clock, 2.3, true);
  expect(running).toBeCloseTo(2.3);
  expect(sampleMachineVisualPhase(clock, 2.4, false)).toBe(running);
});

it('resumes each independent machine from held time across starvation, blockage, faults and stops', () => {
  const clock: MachineVisualClock = { sampleTime: 0, phaseTime: null };
  sampleMachineVisualPhase(clock, 1.7, true);
  const held = clock.phaseTime;
  const stopped = [
    ['running', createBuffer({ inputBuffer: [] })],
    ['running', createBuffer({ outputBuffer: [{ type: 'flour', amount: 2000 }] })],
    ['critical', createBuffer()],
    ['idle', createBuffer()],
  ] as const;
  stopped.forEach(([status, buffer], i) => {
    const operating = getMachineOperationalState(status, buffer) === 'operating';
    expect(sampleMachineVisualPhase(clock, i + 2, operating)).toBe(held);
  });
  expect(sampleMachineVisualPhase(clock, 5.1, true)).toBeCloseTo(1.8);
  expect(sampleMachineVisualPhase(clock, 5.1, true)).toBeCloseTo(1.8);
  const other: MachineVisualClock = { sampleTime: 5.1, phaseTime: null };
  expect(sampleMachineVisualPhase(other, 5.2, true)).toBeCloseTo(0.1);
  expect(clock.phaseTime).toBeCloseTo(1.8);
});
it('discards hidden intervals and starts a fresh visual cycle on a simulation rewind', () => {
  const clock: MachineVisualClock = { sampleTime: 0, phaseTime: null };
  sampleMachineVisualPhase(clock, 1.2, true);
  expect(sampleMachineVisualPhase(clock, 80, true, false)).toBeCloseTo(1.2);
  expect(sampleMachineVisualPhase(clock, 80.02, true)).toBeCloseTo(1.22);
  expect(sampleMachineVisualPhase(clock, 0, false)).toBeNull();
  expect(sampleMachineVisualPhase(clock, 0.02, true)).toBeCloseTo(0.02);
  expect(sampleMachineVisualPhase(clock, Number.NaN, true)).toBeCloseTo(0.02);
});
it('keeps roller, sifter and filling-cycle samples independent of display cadence', () => {
  const phases = [30, 60, 120].map((fps) => {
    const clock: MachineVisualClock = { sampleTime: 0, phaseTime: null };
    for (let frame = 1; frame <= fps * 3; frame++)
      sampleMachineVisualPhase(clock, frame / fps, true);
    const t = clock.phaseTime!;
    return [t * 4.5, -t * 4.5, Math.sin(t * 10 + 1.7) * 0.055, (Math.sin(t * 3.2 + 1) + 1) * 0.5];
  });
  phases.forEach((p) => p.forEach((v, i) => expect(v).toBeCloseTo(phases[0][i], 10)));
});
