/**
 * CascadeVisualization Component
 *
 * Renders connection lines between machines showing production flow.
 * Highlights stressed connections when load is high.
 */

import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { SIFTER_LAYOUT, SITE_LAYOUT } from '../constants/siteLayout';
import { useProductionStore } from '../stores/productionStore';
import { useShallow } from 'zustand/react/shallow';
import { MachineData } from '../types';

interface CascadeConnection {
  from: string;
  to: string;
  points: readonly [[number, number, number], [number, number, number]];
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
  ...Object.fromEntries(
    SITE_LAYOUT.machines.silos.map(({ id, position }) => [
      id,
      [position[0], position[1] + SITE_LAYOUT.machineDimensions.silo[1] / 2, position[2]],
    ])
  ),
  ...Object.fromEntries(
    SITE_LAYOUT.machines.rollerMills.map(({ id, position }) => [
      id,
      [position[0], position[1] + SITE_LAYOUT.machineDimensions.rollerMill[1] / 2, position[2]],
    ])
  ),
  // Plansifters stand on the mezzanine; anchor at the centre of the sieve body.
  ...Object.fromEntries(
    SITE_LAYOUT.machines.sifters.map(({ id, position }) => [
      id,
      [position[0], position[1] + SIFTER_LAYOUT.bodyCentreY, position[2]],
    ])
  ),
  ...Object.fromEntries(
    SITE_LAYOUT.machines.packers.map(({ id, position }) => [
      id,
      [position[0], position[1] + SITE_LAYOUT.machineDimensions.packer[1] / 2, position[2]],
    ])
  ),
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

const groupCentre = (ids: readonly string[]): [number, number, number] => [
  ids.reduce((sum, id) => sum + (MACHINE_POSITIONS[id]?.[0] ?? 0), 0) / ids.length,
  ids.reduce((sum, id) => sum + (MACHINE_POSITIONS[id]?.[1] ?? 0), 0) / ids.length,
  ids.reduce((sum, id) => sum + (MACHINE_POSITIONS[id]?.[2] ?? 0), 0) / ids.length,
];

// The endpoints never move, so they are built once. A stable `points` array
// lets each <Line> keep its geometry across the 0.5 s simulation ticks that
// only change machine load.
const FLOW_LINKS = FLOW_CONNECTIONS.map(([sources, targets]) => ({
  sources,
  targets,
  from: sources.join('+'),
  to: targets.join('+'),
  points: [groupCentre(sources), groupCentre(targets)] as const,
}));

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
    // Centre-to-centre connection for each flow; only the stress changes.
    return FLOW_LINKS.map(({ sources, targets, from, to, points }) => ({
      from,
      to,
      points,
      ...isStressed(machines, sources, targets),
    }));
  }, [machines]);

  // Only render stressed connections or all connections if no stress
  const hasStressedConnections = connections.some((c) => c.stressed);
  const visibleConnections = hasStressedConnections
    ? connections.filter((c) => c.stressed || c.riskLevel !== 'low')
    : connections;

  return (
    <group name="cascade-visualization">
      {visibleConnections.map((conn) => (
        <Line
          key={`${conn.from}>${conn.to}`}
          points={conn.points}
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
