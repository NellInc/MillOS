import React from 'react';
import { Html } from '@react-three/drei';
import { GrainQuality } from '../../types';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { QUALITY_COLORS, QUALITY_LABELS, UNIT_CYLINDER, UNIT_CYLINDER_LOW } from './shared';

// Fill level indicator for silos
export const SiloFillIndicator: React.FC<{
  fillLevel: number;
  quality: GrainQuality;
  grainType: string;
  radius: number;
  height: number;
}> = React.memo(({ fillLevel, quality, grainType, radius, height }) => {
  const fillHeight = (fillLevel / 100) * height * 0.85;
  const qualityColor = QUALITY_COLORS[quality];
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);

  // Calculate scales
  const cylinderRadius = radius - 0.15;
  // Position calculation:
  // Base is at -height/2 + 0.5.
  // We want the visual center of the cylinder to be at base + fillHeight/2.
  // Original: position={[0, -height / 2 + fillHeight / 2 + 0.5, 0]} with height=fillHeight
  // New: Same position, but geometry is height 1, so we scale Y by fillHeight.
  const posY = -height / 2 + fillHeight / 2 + 0.5;

  return (
    <group>
      {/* Grain fill visualization */}
      <mesh
        position={[0, posY, 0]}
        scale={[cylinderRadius, fillHeight, cylinderRadius]}
        geometry={graphicsQuality === 'low' ? UNIT_CYLINDER_LOW : UNIT_CYLINDER}
      >
        {graphicsQuality === 'low' ? (
          <meshBasicMaterial
            color={
              quality === 'premium' ? '#f5d78e' : quality === 'economy' ? '#d4a574' : '#e8c872'
            }
            transparent
            opacity={0.7}
          />
        ) : (
          <meshStandardMaterial
            color={
              quality === 'premium' ? '#f5d78e' : quality === 'economy' ? '#d4a574' : '#e8c872'
            }
            roughness={0.9}
            transparent
            opacity={0.7}
          />
        )}
      </mesh>

      {/* Quality indicator ring at fill level - skip on low */}
      {graphicsQuality !== 'low' && (
        <mesh position={[0, -height / 2 + fillHeight + 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius - 0.1, 0.05, 8, 32]} />
          <meshStandardMaterial
            color={qualityColor}
            emissive={qualityColor}
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Fill level percentage display - skip on low */}
      {graphicsQuality !== 'low' && (
        <Html position={[radius + 0.8, 0, 0]} center distanceFactor={15}>
          <div className="bg-slate-900/90 backdrop-blur px-2 py-1 rounded-lg border border-slate-700 min-w-[70px]">
            <div className="text-xs font-mono text-white font-bold">{fillLevel.toFixed(0)}%</div>
            <div className="text-[9px] text-slate-400">{grainType}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: qualityColor }} />
              <span className="text-[8px]" style={{ color: qualityColor }}>
                {QUALITY_LABELS[quality]}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Maintenance countdown timer display
export const MaintenanceCountdown: React.FC<{
  hoursRemaining: number;
  position: [number, number, number];
}> = React.memo(({ hoursRemaining, position }) => {
  const graphics = useGraphicsStore((state) => state.graphics.quality);

  // Skip Html overlay on low graphics
  if (graphics === 'low') return null;

  const isUrgent = hoursRemaining < 24;
  const isCritical = hoursRemaining < 8;

  const color = isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : '#22c55e';

  // Format hours to days/hours display
  const formatTime = (hours: number) => {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.floor(hours % 24);
      return `${days}d ${remainingHours}h`;
    }
    return `${Math.floor(hours)}h`;
  };

  return (
    <Html position={position} center distanceFactor={12}>
      <div
        className={`bg-slate-900/90 backdrop-blur px-2 py-1 rounded border ${
          isCritical
            ? 'border-red-500/50 animate-pulse'
            : isUrgent
              ? 'border-amber-500/50'
              : 'border-slate-700'
        }`}
      >
        <div className="text-[8px] text-slate-500 uppercase tracking-wider">Maintenance</div>
        <div className="text-xs font-mono font-bold flex items-center gap-1" style={{ color }}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {formatTime(hoursRemaining)}
        </div>
      </div>
    </Html>
  );
});
