import { describe, expect, it } from 'vitest';
import type { MachineBuffer } from '../../stores/materialFlowStore';
import { PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../pace';
import {
  clampFrameDelta,
  easeToward,
  isFlowAudible,
  isSpoutRouteFlowing,
  spoutRouteTargets,
  lineMotionRate,
  machineFlowState,
} from '../lineFlow';

const buffer = (overrides: Partial<MachineBuffer> = {}): MachineBuffer => ({
  machineId: 'packer-0',
  machineType: 'packer',
  inputBuffer: [{ type: 'flour', amount: 100 }],
  outputBuffer: [{ type: 'flour', amount: 20 }],
  inputCapacity: 2000,
  outputCapacity: 2000,
  processingRate: 25,
  conversionRatios: [],
  isProcessing: true,
  ...overrides,
});

describe('lineMotionRate', () => {
  it('stops every line visual while the shift clock is held', () => {
    expect(lineMotionRate(0.8, 0, false)).toBe(0);
  });

  it('scales with the pace exactly as plant time does', () => {
    const rates = PACE_GAME_SPEEDS.map((speed) => lineMotionRate(1, speed, false));
    expect(rates).toEqual([0, 0.5, 1, 2, 4]);
  });

  it('stops under a safety hold at any pace and never runs backwards', () => {
    expect(lineMotionRate(0.8, STANDARD_GAME_SPEED * 4, true)).toBe(0);
    expect(lineMotionRate(-1, STANDARD_GAME_SPEED, false)).toBe(0);
    expect(lineMotionRate(Number.NaN, STANDARD_GAME_SPEED, false)).toBe(0);
  });
});

describe('clampFrameDelta', () => {
  it('caps the first frame after a hidden tab and rejects junk', () => {
    expect(clampFrameDelta(0.016)).toBeCloseTo(0.016);
    expect(clampFrameDelta(12)).toBe(0.1);
    expect(clampFrameDelta(-1)).toBe(0);
    expect(clampFrameDelta(Number.NaN)).toBe(0);
  });
});

describe('easeToward', () => {
  it('holds still when no plant time elapses, so a paused ease freezes mid-way', () => {
    expect(easeToward(0.4, 0, 0, 0.5)).toBe(0.4);
  });

  it('approaches the target and snaps once it is close', () => {
    const half = easeToward(1, 0, 0.5, 0.5);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    let value = 1;
    for (let i = 0; i < 200; i++) value = easeToward(value, 0, 0.05, 0.5);
    expect(value).toBe(0);
  });
});

describe('machineFlowState', () => {
  const machines = [
    { id: 'packer-0', status: 'running' },
    { id: 'packer-1', status: 'critical' },
  ];
  const buffers = new Map([
    ['packer-0', buffer()],
    ['packer-1', buffer({ machineId: 'packer-1' })],
  ]);

  it('reads the same operational state CompactMachines animates from', () => {
    expect(machineFlowState('packer-0', machines, buffers)).toBe('operating');
    expect(machineFlowState('packer-1', machines, buffers)).toBe('faulted');
  });

  it('reports a starved packer once the feed budget has emptied its hopper', () => {
    const starved = new Map([['packer-0', buffer({ inputBuffer: [] })]]);
    expect(machineFlowState('packer-0', machines, starved)).toBe('starved');
  });

  it('returns null for a machine the roster does not have yet', () => {
    expect(machineFlowState('packer-9', machines, buffers)).toBeNull();
  });
});

describe('isSpoutRouteFlowing', () => {
  it('flows only while the source discharges into a machine that can take it', () => {
    expect(isSpoutRouteFlowing('operating', 'operating')).toBe(true);
    expect(isSpoutRouteFlowing('operating', 'starved')).toBe(true);
    expect(isSpoutRouteFlowing('starved', 'operating')).toBe(false);
    expect(isSpoutRouteFlowing('blocked', 'operating')).toBe(false);
    expect(isSpoutRouteFlowing('operating', 'faulted')).toBe(false);
    expect(isSpoutRouteFlowing('operating', 'stopped')).toBe(false);
    expect(isSpoutRouteFlowing('faulted', 'operating')).toBe(false);
  });

  it('keeps the authored flow while the roster has not loaded', () => {
    expect(isSpoutRouteFlowing(null, null)).toBe(true);
  });
});

describe('spoutRouteTargets', () => {
  const routes = [
    { fromMachineId: 'silo-0', toMachineId: 'rm-101' },
    { fromMachineId: 'rm-101', toMachineId: 'sifter-a' },
    { fromMachineId: 'sifter-a', toMachineId: 'packer-0' },
  ];
  const machine = (id: string, status = 'running') => ({ id, status });
  const full = (machineId: string, machineType: MachineBuffer['machineType']) =>
    buffer({
      machineId,
      machineType,
      inputBuffer: machineType === 'silo' ? [] : [{ type: 'wheat_grain', amount: 50 }],
      outputBuffer: [{ type: 'flour', amount: 50 }],
    });
  const buffers = new Map<string, MachineBuffer>([
    ['silo-0', full('silo-0', 'silo')],
    ['rm-101', full('rm-101', 'roller_mill')],
    ['sifter-a', full('sifter-a', 'plansifter')],
    ['packer-0', full('packer-0', 'packer')],
  ]);

  it('runs every route of a healthy line', () => {
    const machines = ['silo-0', 'rm-101', 'sifter-a', 'packer-0'].map((id) => machine(id));
    expect(Array.from(spoutRouteTargets(routes, machines, buffers))).toEqual([1, 1, 1]);
  });

  it('stops product into and out of a critical mill', () => {
    const machines = [
      machine('silo-0'),
      machine('rm-101', 'critical'),
      machine('sifter-a'),
      machine('packer-0'),
    ];
    expect(Array.from(spoutRouteTargets(routes, machines, buffers))).toEqual([0, 0, 1]);
  });

  it('stops the finished-product spout into a broken packer', () => {
    const machines = [
      machine('silo-0'),
      machine('rm-101'),
      machine('sifter-a'),
      machine('packer-0', 'critical'),
    ];
    expect(Array.from(spoutRouteTargets(routes, machines, buffers))).toEqual([1, 1, 0]);
  });
});

describe('isFlowAudible', () => {
  it('is silent while the clock or a safety hold stops the plant', () => {
    expect(isFlowAudible('operating', 0, false)).toBe(false);
    expect(isFlowAudible('operating', STANDARD_GAME_SPEED, true)).toBe(false);
  });

  it('follows the machine the product is flowing through', () => {
    expect(isFlowAudible('operating', STANDARD_GAME_SPEED, false)).toBe(true);
    expect(isFlowAudible('starved', STANDARD_GAME_SPEED, false)).toBe(false);
    expect(isFlowAudible('faulted', STANDARD_GAME_SPEED, false)).toBe(false);
    expect(isFlowAudible(null, STANDARD_GAME_SPEED, false)).toBe(true);
  });
});
