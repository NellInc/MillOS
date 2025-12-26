import React from 'react';
import {
  FactoryFloor,
  FactoryWalls,
  FactoryRoof,
  FactoryLighting,
  SafetyEquipment,
  UtilityConduits,
  DockForklift,
} from './infrastructure';

interface Props {
  floorSize: number; // Legacy: used as fallback
  floorWidth?: number; // X dimension (wider for truck bays)
  floorDepth?: number; // Z dimension
  showZones: boolean;
}

export const FactoryInfrastructure: React.FC<Props> = ({
  floorSize,
  floorWidth,
  floorDepth,
  showZones,
}) => {
  // Use new dimensions if provided, otherwise fall back to legacy square
  const actualWidth = floorWidth ?? floorSize;
  const actualDepth = floorDepth ?? floorSize;

  return (
    <group>
      {/* Floor with markings, safety zones, puddles, and worn paths */}
      <FactoryFloor
        floorSize={floorSize}
        floorWidth={floorWidth}
        floorDepth={floorDepth}
        showZones={showZones}
      />

      {/* Walls, catwalks, stairs, break rooms, and locker rooms */}
      <FactoryWalls floorWidth={actualWidth} floorDepth={actualDepth} />

      {/* Roof, skylights, and ventilation ducts */}
      <FactoryRoof floorWidth={actualWidth} floorDepth={actualDepth} />

      {/* Overhead lighting fixtures */}
      <FactoryLighting floorWidth={actualWidth} floorDepth={actualDepth} />

      {/* Safety stations, signage, barriers, and warehouse clutter */}
      <SafetyEquipment floorWidth={actualWidth} floorDepth={actualDepth} />

      {/* Cables, conduits, and utility infrastructure */}
      <UtilityConduits floorWidth={actualWidth} floorDepth={actualDepth} />

      {/* Dock Forklifts - visible internally and externally */}
      {/* Front Dock (Shipping) */}
      <DockForklift position={[0, 0, 52]} rotation={[0, 0, 0]} cycleOffset={0} dockType="shipping" />
      {/* Back Dock (Receiving) */}
      <DockForklift position={[0, 0, -52]} rotation={[0, Math.PI, 0]} cycleOffset={Math.PI} dockType="receiving" />
    </group>
  );
};
