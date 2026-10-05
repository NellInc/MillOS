import { describe, expect, it } from 'vitest';
import { createMaterialFlowStore } from '../stores/materialFlowStore';
import {
  canonicalProcessMachines,
  MATERIAL_TRANSPORT_SPEEDS,
  resolveMaterialTransport,
} from './materialTransport';

describe('geometry-coupled material transport', () => {
  it('resolves all typed connections, exposes modeled intakes and shares physical product paths', () => {
    const segments = createMaterialFlowStore().getState().network.segments;
    const routes = resolveMaterialTransport(canonicalProcessMachines(), segments);
    expect(routes).toHaveLength(24);
    expect(routes.filter((r) => r.provenance === 'modeled')).toHaveLength(6);
    expect(routes.every((r) => r.transitSeconds! > 0 && r.lengthMetres! > 0)).toBe(true);
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      expect(route.transitSeconds).toBeCloseTo(
        route.lengthMetres! / MATERIAL_TRANSPORT_SPEEDS[route.route!.family]
      );
      const paired = routes.find(
        (r, j) =>
          j !== i && r.fromMachineId === route.fromMachineId && r.toMachineId === route.toMachineId
      );
      if (paired) expect(paired.route).toBe(route.route);
    }
    expect(routes.find((r) => r.fromMachineId === 'silo-4')?.provenance).toBe('modeled');
    expect(new Set(routes.map((r) => r.transitSeconds)).size).toBeGreaterThan(3);
  });

  it('changes only future departures, preserves in-flight parcels and conserves mass/genealogy', () => {
    const store = createMaterialFlowStore();
    store.getState().tickMaterialFlow(1, 1);
    const machines = canonicalProcessMachines();
    const before = store.getState().network.segments;
    const priorBalance = store.getState().getMaterialBalance();
    machines.find((m) => m.id === 'silo-0')!.position[0] += 20;
    store.getState().syncTransportGeometry(machines);
    const after = store.getState().network.segments;
    const index = before.findIndex((s) => s.fromMachineId === 'silo-0');
    expect(after[index].transitTime).toBeGreaterThan(before[index].transitTime);
    after.forEach((segment, i) => expect(segment.inTransit).toBe(before[i].inTransit));
    expect(store.getState().getMaterialBalance()).toEqual(priorBalance);
    expect(Math.abs(store.getState().getGenealogyBalance().errorKg)).toBeLessThan(0.001);
    const oldArrivals = after[index].inTransit.map((p) => p.arrivalTime);
    store.getState().tickMaterialFlow(0.1, 2);
    expect(store.getState().simulationTime).toBeCloseTo(1.2);
    const parcels = store.getState().network.segments[index].inTransit;
    expect(parcels.slice(0, oldArrivals.length).map((p) => p.arrivalTime)).toEqual(oldArrivals);
    expect(parcels.at(-1)!.arrivalTime).toBeCloseTo(1.2 + after[index].transitTime);
    expect(Math.abs(store.getState().getMaterialBalance().errorKg)).toBeLessThan(0.001);
    expect(Math.abs(store.getState().getGenealogyBalance().errorKg)).toBeLessThan(0.001);
  });

  it('stops new departures on unresolved geometry while prior parcels drain normally', () => {
    const store = createMaterialFlowStore();
    store.getState().tickMaterialFlow(1, 1);
    const prior = store.getState().network.segments.find((s) => s.fromMachineId === 'silo-4')!;
    expect(prior.inTransit.length).toBeGreaterThan(0);
    store
      .getState()
      .syncTransportGeometry(canonicalProcessMachines().filter((m) => m.id !== 'silo-4'));
    expect(store.getState().network.segments.find((s) => s.id === prior.id)!.routeProvenance).toBe(
      'unresolved'
    );
    store.getState().tickMaterialFlow(prior.transitTime + 1, 1);
    expect(store.getState().network.segments.find((s) => s.id === prior.id)!.inTransit).toEqual([]);
    expect(Math.abs(store.getState().getMaterialBalance().errorKg)).toBeLessThan(0.001);
    expect(Math.abs(store.getState().getGenealogyBalance().errorKg)).toBeLessThan(0.001);
  });

  it('labels missing endpoints, invalid speeds and nonfinite geometry explicitly unresolved', () => {
    const connections = [{ fromMachineId: 'silo-0', toMachineId: 'rm-101' }];
    const machines = canonicalProcessMachines();
    expect(
      resolveMaterialTransport(machines, connections, {
        ...MATERIAL_TRANSPORT_SPEEDS,
        intake: 0,
      })[0].provenance
    ).toBe('unresolved');
    machines.find((m) => m.id === 'silo-0')!.position[0] = NaN;
    expect(resolveMaterialTransport(machines, connections)[0].transitSeconds).toBeNull();
    expect(resolveMaterialTransport([], connections)[0].route).toBeNull();
  });
});
