/**
 * ProductionFlowVisualization Component
 *
 * Renders animated DataFlowLines between connected machines showing
 * material flow through the factory. Uses the digital twin aesthetic.
 *
 * Endpoints are DERIVED FROM THE LIVE MACHINE LIST (productionStore) rather than
 * hardcoded, so the flow lines always terminate on real machines and automatically
 * track any layout change. The connection topology mirrors SpoutingSystem's physical
 * pipe pairing (mill[i] <- silo[i % silos], mill[i] -> sifter[i % sifters],
 * packer[i] <- sifter[i % sifters]) so the data-flow lines match the rendered spouting.
 */
import React, { useMemo } from 'react';
import { useProductionStore } from '../stores/productionStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { DataFlowLine } from './DataFlowLine';
import { MachineData, MachineType } from '../types';

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
}

// Anchor a flow line at the vertical center of a machine (base + half-height),
// so lines connect machine-to-machine instead of hugging the floor.
const anchor = (m: MachineData): [number, number, number] => [
  m.position[0],
  m.position[1] + (m.size?.[1] ?? 0) / 2,
  m.position[2],
];

export function buildProcessFlowConnections(machines: MachineData[]): FlowConnection[] {
  if (machines.length === 0) return [];

  const silos = machines.filter((m) => m.type === MachineType.SILO);
  const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
  const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);
  const packers = machines.filter((m) => m.type === MachineType.PACKER);
  const connections: FlowConnection[] = [];

  if (silos.length > 0) {
    mills.forEach((mill, index) => {
      const silo = silos[index % silos.length];
      if (!silo) return;
      connections.push({
        id: `flow-${silo.id}-${mill.id}`,
        fromMachineId: silo.id,
        toMachineId: mill.id,
        from: anchor(silo),
        to: anchor(mill),
        zone: 'silos-to-mills',
      });
    });
  }

  if (sifters.length > 0) {
    mills.forEach((mill, index) => {
      const sifter = sifters[index % sifters.length];
      if (!sifter) return;
      connections.push({
        id: `flow-${mill.id}-${sifter.id}`,
        fromMachineId: mill.id,
        toMachineId: sifter.id,
        from: anchor(mill),
        to: anchor(sifter),
        zone: 'mills-to-sifters',
      });
    });

    packers.forEach((packer, index) => {
      const sifter = sifters[index % sifters.length];
      if (!sifter) return;
      connections.push({
        id: `flow-${sifter.id}-${packer.id}`,
        fromMachineId: sifter.id,
        toMachineId: packer.id,
        from: anchor(sifter),
        to: anchor(packer),
        zone: 'sifters-to-packers',
      });
    });
  }

  return connections;
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
          active={isProcessFlowActive(conn, statusByMachine, productionSpeed)}
          color={PROCESS_FLOW_COLORS[conn.zone]}
          segments={24}
        />
      ))}
    </group>
  );
};

export default ProductionFlowVisualization;
