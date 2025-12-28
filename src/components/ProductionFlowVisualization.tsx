/**
 * ProductionFlowVisualization Component
 *
 * Renders animated DataFlowLines between connected machines showing
 * material flow through the factory. Uses the digital twin aesthetic.
 */
import React, { useMemo } from 'react';
import { useProductionStore } from '../stores/productionStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { DataFlowLine } from './DataFlowLine';
import { PALETTE } from '../utils/digitalTwinPalette';

// Machine positions in the factory (centers at base height)
const MACHINE_POSITIONS: Record<string, [number, number, number]> = {
  // Silos (Zone 1, z=-22) - raised for visual connection
  'silo-alpha': [-18, 4, -22],
  'silo-beta': [-9, 4, -22],
  'silo-gamma': [0, 4, -22],
  'silo-delta': [9, 4, -22],
  'silo-epsilon': [18, 4, -22],

  // Roller Mills (Zone 2, z=-6)
  'rm-101': [-15, 3, -6],
  'rm-102': [-7.5, 3, -6],
  'rm-103': [0, 3, -6],
  'rm-104': [7.5, 3, -6],
  'rm-105': [15, 3, -6],
  'rm-106': [22.5, 3, -6],

  // Plansifters (Zone 3, z=6, elevated)
  'plansifter-a': [-14, 6, 6],
  'plansifter-b': [0, 6, 6],
  'plansifter-c': [14, 6, 6],

  // Packers (Zone 4, z=20)
  'pack-line-1': [-12, 3, 20],
  'pack-line-2': [0, 3, 20],
  'pack-line-3': [12, 3, 20],
};

// Zone colors for flow lines
const ZONE_COLORS: Record<string, string> = {
  'silos-to-mills': PALETTE.zones.silos, // Blue
  'mills-to-sifters': PALETTE.zones.milling, // Purple
  'sifters-to-packers': PALETTE.zones.packing, // Green
};

// Production flow connections
interface FlowConnection {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  zone: keyof typeof ZONE_COLORS;
}

const FLOW_CONNECTIONS: FlowConnection[] = [
  // Silos → Mills (Zone 1 → Zone 2)
  {
    id: 'silo-alpha-to-rm-101',
    from: MACHINE_POSITIONS['silo-alpha'],
    to: MACHINE_POSITIONS['rm-101'],
    zone: 'silos-to-mills',
  },
  {
    id: 'silo-beta-to-rm-102',
    from: MACHINE_POSITIONS['silo-beta'],
    to: MACHINE_POSITIONS['rm-102'],
    zone: 'silos-to-mills',
  },
  {
    id: 'silo-gamma-to-rm-103',
    from: MACHINE_POSITIONS['silo-gamma'],
    to: MACHINE_POSITIONS['rm-103'],
    zone: 'silos-to-mills',
  },
  {
    id: 'silo-delta-to-rm-104',
    from: MACHINE_POSITIONS['silo-delta'],
    to: MACHINE_POSITIONS['rm-104'],
    zone: 'silos-to-mills',
  },
  {
    id: 'silo-epsilon-to-rm-105',
    from: MACHINE_POSITIONS['silo-epsilon'],
    to: MACHINE_POSITIONS['rm-105'],
    zone: 'silos-to-mills',
  },

  // Mills → Sifters (Zone 2 → Zone 3)
  {
    id: 'rm-101-to-plansifter-a',
    from: MACHINE_POSITIONS['rm-101'],
    to: MACHINE_POSITIONS['plansifter-a'],
    zone: 'mills-to-sifters',
  },
  {
    id: 'rm-102-to-plansifter-a',
    from: MACHINE_POSITIONS['rm-102'],
    to: MACHINE_POSITIONS['plansifter-a'],
    zone: 'mills-to-sifters',
  },
  {
    id: 'rm-103-to-plansifter-b',
    from: MACHINE_POSITIONS['rm-103'],
    to: MACHINE_POSITIONS['plansifter-b'],
    zone: 'mills-to-sifters',
  },
  {
    id: 'rm-104-to-plansifter-b',
    from: MACHINE_POSITIONS['rm-104'],
    to: MACHINE_POSITIONS['plansifter-b'],
    zone: 'mills-to-sifters',
  },
  {
    id: 'rm-105-to-plansifter-c',
    from: MACHINE_POSITIONS['rm-105'],
    to: MACHINE_POSITIONS['plansifter-c'],
    zone: 'mills-to-sifters',
  },
  {
    id: 'rm-106-to-plansifter-c',
    from: MACHINE_POSITIONS['rm-106'],
    to: MACHINE_POSITIONS['plansifter-c'],
    zone: 'mills-to-sifters',
  },

  // Sifters → Packers (Zone 3 → Zone 4)
  {
    id: 'plansifter-a-to-pack-1',
    from: MACHINE_POSITIONS['plansifter-a'],
    to: MACHINE_POSITIONS['pack-line-1'],
    zone: 'sifters-to-packers',
  },
  {
    id: 'plansifter-b-to-pack-2',
    from: MACHINE_POSITIONS['plansifter-b'],
    to: MACHINE_POSITIONS['pack-line-2'],
    zone: 'sifters-to-packers',
  },
  {
    id: 'plansifter-c-to-pack-3',
    from: MACHINE_POSITIONS['plansifter-c'],
    to: MACHINE_POSITIONS['pack-line-3'],
    zone: 'sifters-to-packers',
  },
];

export const ProductionFlowVisualization: React.FC = () => {
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const machines = useProductionStore(useShallow((state) => state.machines));

  // Determine which connections are active based on running machines
  const activeConnections = useMemo(() => {
    // For simplicity, show all connections as active when any machine is running
    const hasRunningMachine = machines.some((m) => m.status === 'running');
    return FLOW_CONNECTIONS.map((conn) => ({
      ...conn,
      active: hasRunningMachine,
    }));
  }, [machines]);

  // Skip on low quality
  if (graphicsQuality === 'low') return null;

  return (
    <group name="production-flow-visualization">
      {activeConnections.map((conn) => (
        <DataFlowLine
          key={conn.id}
          start={conn.from}
          end={conn.to}
          active={conn.active}
          color={ZONE_COLORS[conn.zone]}
          segments={24}
        />
      ))}
    </group>
  );
};

export default ProductionFlowVisualization;
