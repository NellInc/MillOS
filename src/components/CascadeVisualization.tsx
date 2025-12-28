/**
 * CascadeVisualization Component
 *
 * Renders connection lines between machines showing production flow.
 * Highlights stressed connections when load is high.
 */

import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { FACTORY_ZONE_Z } from '../constants/factoryLayout';
import { useProductionStore } from '../stores/productionStore';
import { useShallow } from 'zustand/react/shallow';
import { MachineData } from '../types';

interface CascadeConnection {
  from: string;
  to: string;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
  stressed: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// Machine positions in the factory (approximate centers)
const MACHINE_POSITIONS: Record<string, [number, number, number]> = {
  // Silos (Zone 1, z=-22)
  'silo-alpha': [-18, 8, FACTORY_ZONE_Z.silos],
  'silo-beta': [-9, 8, FACTORY_ZONE_Z.silos],
  'silo-gamma': [0, 8, FACTORY_ZONE_Z.silos],
  'silo-delta': [9, 8, FACTORY_ZONE_Z.silos],
  'silo-epsilon': [18, 8, FACTORY_ZONE_Z.silos],

  // Roller Mills (Zone 2, z=-6)
  'rm-101': [-15, 2.5, FACTORY_ZONE_Z.milling],
  'rm-102': [-7.5, 2.5, FACTORY_ZONE_Z.milling],
  'rm-103': [0, 2.5, FACTORY_ZONE_Z.milling],
  'rm-104': [7.5, 2.5, FACTORY_ZONE_Z.milling],
  'rm-105': [15, 2.5, FACTORY_ZONE_Z.milling],
  'rm-106': [22.5, 2.5, FACTORY_ZONE_Z.milling],

  // Plansifters (Zone 3, z=6, elevated)
  'plansifter-a': [-14, 9, FACTORY_ZONE_Z.sifting],
  'plansifter-b': [0, 9, FACTORY_ZONE_Z.sifting],
  'plansifter-c': [14, 9, FACTORY_ZONE_Z.sifting],

  // Packers (Zone 4, z=25)
  'pack-line-1': [-12, 2, FACTORY_ZONE_Z.packing],
  'pack-line-2': [0, 2, FACTORY_ZONE_Z.packing],
  'pack-line-3': [12, 2, FACTORY_ZONE_Z.packing],
};

// Production flow connections (upstream → downstream)
const FLOW_CONNECTIONS: [string[], string[]][] = [
  // Silos → Mills
  [
    ['silo-alpha', 'silo-beta'],
    ['rm-101', 'rm-102'],
  ],
  [['silo-gamma'], ['rm-103', 'rm-104']],
  [
    ['silo-delta', 'silo-epsilon'],
    ['rm-105', 'rm-106'],
  ],

  // Mills → Sifters
  [['rm-101', 'rm-102'], ['plansifter-a']],
  [['rm-103', 'rm-104'], ['plansifter-b']],
  [['rm-105', 'rm-106'], ['plansifter-c']],

  // Sifters → Packers
  [['plansifter-a'], ['pack-line-1']],
  [['plansifter-b'], ['pack-line-2']],
  [['plansifter-c'], ['pack-line-3']],
];

function getColor(riskLevel: CascadeConnection['riskLevel']): string {
  switch (riskLevel) {
    case 'critical':
      return '#ef4444'; // Red
    case 'high':
      return '#f97316'; // Orange
    case 'medium':
      return '#eab308'; // Yellow
    default:
      return '#22c55e'; // Green
  }
}

function getMachineLoad(machines: MachineData[], id: string): number {
  const machine = machines.find((m) => m.id.toLowerCase().includes(id.split('-').slice(-1)[0]));
  return machine?.metrics.load ?? 50;
}

function isStressed(
  machines: MachineData[],
  sources: string[],
  targets: string[]
): { stressed: boolean; riskLevel: CascadeConnection['riskLevel'] } {
  const sourceLoads = sources.map((s) => getMachineLoad(machines, s));
  const targetLoads = targets.map((t) => getMachineLoad(machines, t));

  const maxSourceLoad = Math.max(...sourceLoads);
  const maxTargetLoad = Math.max(...targetLoads);

  // Stressed if source > 80% AND target > 70%
  const stressed = maxSourceLoad > 80 && maxTargetLoad > 70;

  let riskLevel: CascadeConnection['riskLevel'] = 'low';
  if (maxSourceLoad > 90 && maxTargetLoad > 85) riskLevel = 'critical';
  else if (maxSourceLoad > 85 || maxTargetLoad > 80) riskLevel = 'high';
  else if (maxSourceLoad > 75 || maxTargetLoad > 70) riskLevel = 'medium';

  return { stressed, riskLevel };
}

export const CascadeVisualization: React.FC = () => {
  const machines = useProductionStore(useShallow((state) => state.machines));

  const connections = useMemo<CascadeConnection[]>(() => {
    const result: CascadeConnection[] = [];

    FLOW_CONNECTIONS.forEach(([sources, targets]) => {
      // Create center-to-center connection for each flow
      const sourceCenter: [number, number, number] = [
        sources.reduce((sum, s) => sum + (MACHINE_POSITIONS[s]?.[0] ?? 0), 0) / sources.length,
        sources.reduce((sum, s) => sum + (MACHINE_POSITIONS[s]?.[1] ?? 0), 0) / sources.length,
        sources.reduce((sum, s) => sum + (MACHINE_POSITIONS[s]?.[2] ?? 0), 0) / sources.length,
      ];

      const targetCenter: [number, number, number] = [
        targets.reduce((sum, t) => sum + (MACHINE_POSITIONS[t]?.[0] ?? 0), 0) / targets.length,
        targets.reduce((sum, t) => sum + (MACHINE_POSITIONS[t]?.[1] ?? 0), 0) / targets.length,
        targets.reduce((sum, t) => sum + (MACHINE_POSITIONS[t]?.[2] ?? 0), 0) / targets.length,
      ];

      const { stressed, riskLevel } = isStressed(machines, sources, targets);

      result.push({
        from: sources.join('+'),
        to: targets.join('+'),
        fromPosition: sourceCenter,
        toPosition: targetCenter,
        stressed,
        riskLevel,
      });
    });

    return result;
  }, [machines]);

  // Only render stressed connections or all connections if no stress
  const hasStressedConnections = connections.some((c) => c.stressed);
  const visibleConnections = hasStressedConnections
    ? connections.filter((c) => c.stressed || c.riskLevel !== 'low')
    : connections;

  return (
    <group name="cascade-visualization">
      {visibleConnections.map((conn, idx) => (
        <Line
          key={`cascade-${idx}`}
          points={[conn.fromPosition, conn.toPosition]}
          color={getColor(conn.riskLevel)}
          lineWidth={conn.stressed ? 4 : 2}
          opacity={conn.stressed ? 0.9 : 0.4}
          transparent
          dashed={!conn.stressed}
          dashSize={conn.stressed ? 0 : 1}
          gapSize={conn.stressed ? 0 : 0.5}
        />
      ))}
    </group>
  );
};
