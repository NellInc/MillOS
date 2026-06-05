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
import { PALETTE } from '../utils/digitalTwinPalette';
import { MachineData, MachineType } from '../types';

// Zone colors for flow lines
const ZONE_COLORS = {
  'silos-to-mills': PALETTE.zones.silos, // Blue
  'mills-to-sifters': PALETTE.zones.milling, // Purple
  'sifters-to-packers': PALETTE.zones.packing, // Green
} as const;

type ZoneKey = keyof typeof ZONE_COLORS;

interface FlowConnection {
  id: string;
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

export const ProductionFlowVisualization: React.FC = () => {
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const machines = useProductionStore(useShallow((state) => state.machines));

  // Build connections from the real machines, mirroring SpoutingSystem's pairing.
  const connections = useMemo<FlowConnection[]>(() => {
    if (machines.length === 0) return [];

    const silos = machines.filter((m) => m.type === MachineType.SILO);
    const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
    const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);
    const packers = machines.filter((m) => m.type === MachineType.PACKER);

    const conns: FlowConnection[] = [];

    // Silos -> Mills: each mill is fed by silo[i % silos.length] (matches SpoutingSystem)
    if (silos.length > 0) {
      mills.forEach((mill, i) => {
        const silo = silos[i % silos.length];
        if (!silo) return;
        conns.push({
          id: `flow-${silo.id}-${mill.id}`,
          from: anchor(silo),
          to: anchor(mill),
          zone: 'silos-to-mills',
        });
      });
    }

    // Mills -> Sifters: each mill lifts to sifter[i % sifters.length]
    if (sifters.length > 0) {
      mills.forEach((mill, i) => {
        const sifter = sifters[i % sifters.length];
        if (!sifter) return;
        conns.push({
          id: `flow-${mill.id}-${sifter.id}`,
          from: anchor(mill),
          to: anchor(sifter),
          zone: 'mills-to-sifters',
        });
      });

      // Sifters -> Packers: each packer is fed by sifter[i % sifters.length]
      packers.forEach((packer, i) => {
        const sifter = sifters[i % sifters.length];
        if (!sifter) return;
        conns.push({
          id: `flow-${sifter.id}-${packer.id}`,
          from: anchor(sifter),
          to: anchor(packer),
          zone: 'sifters-to-packers',
        });
      });
    }

    return conns;
  }, [machines]);

  // Active whenever any machine is running
  const hasRunningMachine = useMemo(() => machines.some((m) => m.status === 'running'), [machines]);

  // Skip on low quality
  if (graphicsQuality === 'low') return null;

  return (
    <group name="production-flow-visualization">
      {connections.map((conn) => (
        <DataFlowLine
          key={conn.id}
          start={conn.from}
          end={conn.to}
          active={hasRunningMachine}
          color={ZONE_COLORS[conn.zone]}
          segments={24}
        />
      ))}
    </group>
  );
};

export default ProductionFlowVisualization;
