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

// Machine positions in the factory (approximate centers).
// Keys are the LIVE machine ids created in MillScene.tsx (silo-0..4,
// rm-101..104, sifter-a/b/c, packer-0..2) so getMachineLoad can resolve
// loads by exact id. The legacy silo-alpha / plansifter-* / pack-line-*
// keys existed in no live roster, so load lookups either fell back to the
// 50 default (silos) or substring-matched the wrong machine (pack-line-1
// -> silo-1), making the stress overlay misreport exactly what it exists
// to visualize.
const MACHINE_POSITIONS: Record<string, [number, number, number]> = {
  // Silos (Zone 1, z=-22) - live x = i*9 for i=-2..2
  'silo-0': [-18, 8, FACTORY_ZONE_Z.silos],
  'silo-1': [-9, 8, FACTORY_ZONE_Z.silos],
  'silo-2': [0, 8, FACTORY_ZONE_Z.silos],
  'silo-3': [9, 8, FACTORY_ZONE_Z.silos],
  'silo-4': [18, 8, FACTORY_ZONE_Z.silos],

  // Roller Mills (Zone 2, z=-6)
  'rm-101': [-15, 2.5, FACTORY_ZONE_Z.milling],
  'rm-102': [-7.5, 2.5, FACTORY_ZONE_Z.milling],
  'rm-103': [7.5, 2.5, FACTORY_ZONE_Z.milling],
  'rm-104': [15, 2.5, FACTORY_ZONE_Z.milling],

  // Plansifters (Zone 3, z=6, elevated)
  'sifter-a': [-14, 9, FACTORY_ZONE_Z.sifting],
  'sifter-b': [0, 9, FACTORY_ZONE_Z.sifting],
  'sifter-c': [14, 9, FACTORY_ZONE_Z.sifting],

  // Packers (Zone 4, z=25) - live x = i*8 for i=-1..1 (was +/-12, off by 4)
  'packer-0': [-8, 2, FACTORY_ZONE_Z.packing],
  'packer-1': [0, 2, FACTORY_ZONE_Z.packing],
  'packer-2': [8, 2, FACTORY_ZONE_Z.packing],
};

// Production flow connections (upstream → downstream)
const FLOW_CONNECTIONS: [string[], string[]][] = [
  // Silos → Mills (5 silos -> 4 mills)
  [
    ['silo-0', 'silo-1'],
    ['rm-101', 'rm-102'],
  ],
  [['silo-2'], ['rm-102', 'rm-103']],
  [
    ['silo-3', 'silo-4'],
    ['rm-103', 'rm-104'],
  ],

  // Mills → Sifters (mirrors physical spouting: rm[i] -> sifter[i % 3])
  [['rm-101', 'rm-104'], ['sifter-a']],
  [['rm-102'], ['sifter-b']],
  [['rm-103'], ['sifter-c']],

  // Sifters → Packers (packer i is fed by sifter[i % 3])
  [['sifter-a'], ['packer-0']],
  [['sifter-b'], ['packer-1']],
  [['sifter-c'], ['packer-2']],
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
  // Exact-id lookup. The previous fuzzy match on the last id segment
  // (m.id.includes(id.split('-').pop())) resolved 'pack-line-1' to 'silo-1'
  // (silos are scanned first) and resolved every silo to nothing at all.
  const machine = machines.find((m) => m.id === id);
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
