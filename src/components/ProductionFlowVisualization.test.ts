import { describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../types';
import { buildSpoutRoutes } from './flow/spoutRoutes';
import { buildProcessFlowConnections, isProcessFlowActive } from './ProductionFlowVisualization';

function machine(
  id: string,
  type: MachineType,
  position: [number, number, number],
  status: MachineData['status'] = 'running'
): MachineData {
  return {
    id,
    name: id,
    type,
    position,
    size: [4, 4, 4],
    rotation: 0,
    status,
    metrics: { rpm: 0, temperature: 20, vibration: 0, load: 0, wear: 0, efficiency: 100 },
    lastMaintenance: '2026-01-01',
    nextMaintenance: '2027-01-01',
  };
}

describe('scene-linked process flow', () => {
  const machines = [
    machine('silo', MachineType.SILO, [0, 0, -20]),
    machine('mill', MachineType.ROLLER_MILL, [0, 0, -6]),
    machine('sifter', MachineType.PLANSIFTER, [0, 9, 6]),
    machine('packer', MachineType.PACKER, [0, 0, 25]),
  ];

  it('builds the physical silo-to-packer production chain', () => {
    expect(buildProcessFlowConnections(machines).map(({ id }) => id)).toEqual([
      'flow-silo-mill',
      'flow-mill-sifter',
      'flow-sifter-packer',
    ]);
  });

  it('shares real process ports, service-rack bends and cached paths with steel and grain', () => {
    const connections = buildProcessFlowConnections(machines);
    const routes = buildSpoutRoutes(machines);
    connections.forEach((connection, index) => {
      expect(connection.path).toBe(routes[index].curve);
      expect(connection.from).toEqual(routes[index].curve.getPointAt(0).toArray());
      expect(connection.to).toEqual(routes[index].curve.getPointAt(1).toArray());
    });
    const updated = buildProcessFlowConnections(machines.map((m) => ({ ...m, status: 'warning' })));
    updated.forEach((connection, index) => expect(connection.path).toBe(connections[index].path));
    const relocated = buildProcessFlowConnections(
      machines.map((m) => (m.id === 'mill' ? { ...m, position: [3, 0, -6] } : m))
    );
    expect(relocated[0].path).not.toBe(connections[0].path);
    expect(relocated[0].to[0]).toBe(3);
  });

  it('animates only when production is advancing and both endpoint machines run', () => {
    const connection = buildProcessFlowConnections(machines)[1];
    const running = new Map(machines.map(({ id, status }) => [id, status] as const));
    const stopped = new Map(running);
    stopped.set('sifter', 'critical');

    expect(isProcessFlowActive(connection, running, 1)).toBe(true);
    expect(isProcessFlowActive(connection, running, 0)).toBe(false);
    expect(isProcessFlowActive(connection, stopped, 1)).toBe(false);
  });

  it('keeps flowing through a machine that is running with a warning', () => {
    const connection = buildProcessFlowConnections(machines)[1];
    const warning = new Map(machines.map(({ id, status }) => [id, status] as const));
    warning.set('sifter', 'warning');
    const idle = new Map(warning);
    idle.set('mill', 'idle');

    expect(isProcessFlowActive(connection, warning, 1)).toBe(true);
    expect(isProcessFlowActive(connection, idle, 1)).toBe(false);
  });
});
