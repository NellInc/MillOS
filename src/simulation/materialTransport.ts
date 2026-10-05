import { SITE_LAYOUT } from '../constants/siteLayout';
import { MachineType } from '../types';
import {
  buildSpoutRoutes,
  createMachineSpoutRoute,
  type PipeRouteFamily,
  type SpoutMachine,
  type SpoutRoute,
} from '../components/flow/spoutRoutes';

/** Explicit simulation assumptions, metres per material-clock second. */
export const MATERIAL_TRANSPORT_SPEEDS: Record<PipeRouteFamily, number> = {
  intake: 12,
  pneumatic: 18,
  finished: 8,
};

export interface TransportConnection {
  readonly fromMachineId: string;
  readonly toMachineId: string;
}

export interface MaterialTransportRoute extends TransportConnection {
  readonly provenance: 'rendered' | 'modeled' | 'unresolved';
  readonly route: SpoutRoute | null;
  readonly lengthMetres: number | null;
  readonly transitSeconds: number | null;
}

export function canonicalProcessMachines(): SpoutMachine[] {
  const groups = [
    [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
    [
      SITE_LAYOUT.machines.rollerMills,
      MachineType.ROLLER_MILL,
      SITE_LAYOUT.machineDimensions.rollerMill,
    ],
    [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
    [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
  ] as const;
  return groups.flatMap(([anchors, type, size]) =>
    anchors.map(({ id, position }) => ({ id, type, position: [...position], size: [...size] }))
  );
}

/** Physical identities are endpoint pairs; flour and semolina share a pipe. */
export function resolveMaterialTransport(
  machines: readonly SpoutMachine[],
  connections: readonly TransportConnection[],
  speeds: Readonly<Record<PipeRouteFamily, number>> = MATERIAL_TRANSPORT_SPEEDS
): MaterialTransportRoute[] {
  const byId = new Map(machines.map((machine) => [machine.id, machine]));
  const rendered = new Map(
    buildSpoutRoutes(machines).map((route) => [
      `${route.fromMachineId}>${route.toMachineId}`,
      route,
    ])
  );
  const mills = machines.filter(({ type }) => type === MachineType.ROLLER_MILL);
  const packers = machines.filter(({ type }) => type === MachineType.PACKER);
  const resolved = new Map<string, MaterialTransportRoute>();
  return connections.map(({ fromMachineId, toMachineId }) => {
    const key = `${fromMachineId}>${toMachineId}`;
    const prior = resolved.get(key);
    if (prior) return prior;
    const from = byId.get(fromMachineId),
      to = byId.get(toMachineId);
    const visibleRoute = rendered.get(key);
    const lane =
      to?.type === MachineType.ROLLER_MILL
        ? mills.findIndex(({ id }) => id === toMachineId)
        : to?.type === MachineType.PACKER
          ? packers.findIndex(({ id }) => id === toMachineId)
          : mills.findIndex(({ id }) => id === fromMachineId);
    const route =
      visibleRoute ?? (from && to ? createMachineSpoutRoute(from, to, Math.max(0, lane)) : null);
    const speed = route ? speeds[route.family] : Number.NaN;
    const valid =
      !!route &&
      Number.isFinite(route.length) &&
      route.length > 0 &&
      Number.isFinite(speed) &&
      speed > 0;
    const result: MaterialTransportRoute = {
      fromMachineId,
      toMachineId,
      provenance: valid ? (visibleRoute ? 'rendered' : 'modeled') : 'unresolved',
      route: valid ? route : null,
      lengthMetres: valid ? route.length : null,
      transitSeconds: valid ? route.length / speed : null,
    };
    resolved.set(key, result);
    return result;
  });
}
