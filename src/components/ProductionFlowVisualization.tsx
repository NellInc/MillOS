/**
 * ProductionFlowVisualization Component
 *
 * Renders animated DataFlowLines between connected machines showing
 * material flow through the factory. Uses the digital twin aesthetic.
 *
 * Signals share the live spouting curves with the steel pipes and moving grain.
 * They sit just outside the pipe skin, staying depth-tested behind fittings and
 * machinery. Status updates retain the cached route and its geometry.
 */
import React, { useMemo } from 'react';
import { useProductionStore } from '../stores/productionStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { DataFlowLine } from './DataFlowLine';
import { MachineData } from '../types';
import { buildSpoutRoutes, type SpoutRoute } from './flow/spoutRoutes';

// Process accents stay distinct without competing with actual status beacons.
export const PROCESS_FLOW_COLORS = {
  'silos-to-mills': '#78aeb9',
  'mills-to-sifters': '#78b5aa',
  'sifters-to-packers': '#c3b88c',
} as const;

type ZoneKey = keyof typeof PROCESS_FLOW_COLORS;

export interface FlowConnection {
  id: string;
  fromMachineId: string;
  toMachineId: string;
  from: [number, number, number];
  to: [number, number, number];
  zone: ZoneKey;
  path: SpoutRoute['curve'];
}

// Read the actual service-rack curves, including their process-port heights.
// Working if every signal follows the same route object as pipes and grain.
const FLOW_ZONE_BY_FAMILY = {
  intake: 'silos-to-mills',
  pneumatic: 'mills-to-sifters',
  finished: 'sifters-to-packers',
} as const;

export function buildProcessFlowConnections(machines: MachineData[]): FlowConnection[] {
  return buildSpoutRoutes(machines).map((route) => ({
    id: `flow-${route.fromMachineId}-${route.toMachineId}`,
    fromMachineId: route.fromMachineId,
    toMachineId: route.toMachineId,
    from: route.curve.getPointAt(0).toArray(),
    to: route.curve.getPointAt(1).toArray(),
    path: route.curve,
    zone: FLOW_ZONE_BY_FAMILY[route.family],
  }));
}

export function isProcessFlowActive(
  connection: Pick<FlowConnection, 'fromMachineId' | 'toMachineId'>,
  statusByMachine: ReadonlyMap<string, MachineData['status']>,
  productionSpeed: number
): boolean {
  // A machine in 'warning' is still processing (the simulation runs it), so its
  // flow keeps moving; only idle or critical ends stop the line.
  const from = statusByMachine.get(connection.fromMachineId);
  const to = statusByMachine.get(connection.toMachineId);
  return (
    Number.isFinite(productionSpeed) &&
    productionSpeed > 0 &&
    (from === 'running' || from === 'warning') &&
    (to === 'running' || to === 'warning')
  );
}

export const ProductionFlowVisualization: React.FC = () => {
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const { machines, productionSpeed } = useProductionStore(
    useShallow((state) => ({
      machines: state.machines,
      productionSpeed: state.productionSpeed,
    }))
  );

  // Build connections from the real machines, mirroring SpoutingSystem's pairing.
  const connections = useMemo(() => buildProcessFlowConnections(machines), [machines]);
  const statusByMachine = useMemo(
    () => new Map(machines.map((machine) => [machine.id, machine.status] as const)),
    [machines]
  );

  // Skip on low quality
  if (graphicsQuality === 'low') return null;

  return (
    <group name="production-flow-visualization">
      {connections.map((conn) => (
        <DataFlowLine
          key={conn.id}
          start={conn.from}
          end={conn.to}
          path={conn.path}
          active={isProcessFlowActive(conn, statusByMachine, productionSpeed)}
          color={PROCESS_FLOW_COLORS[conn.zone]}
          segments={24}
        />
      ))}
    </group>
  );
};

export default ProductionFlowVisualization;
