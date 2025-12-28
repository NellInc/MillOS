/**
 * ZoneAccentLights Component
 *
 * Adds zone-colored point lights to illuminate different factory areas.
 * Part of the digital twin aesthetic - makes zones visually distinct.
 */
import React from 'react';
import { PALETTE } from '../utils/digitalTwinPalette';

interface ZoneAccentLightsProps {
  /** Intensity multiplier (default 1.0) */
  intensity?: number;
  /** Whether to show lights (respects graphics quality) */
  enabled?: boolean;
}

/**
 * Zone positions match MillScene factory layout:
 * - Silos: z=-22 (Zone 1 - Storage/Input)
 * - Milling: z=-6 (Zone 2 - Processing)
 * - Sifting: z=6 (Zone 3 - Quality/Sorting) - elevated at y=9
 * - Packing: z=20 (Zone 4 - Output)
 */
export const ZoneAccentLights: React.FC<ZoneAccentLightsProps> = ({
  intensity = 1.0,
  enabled = true,
}) => {
  if (!enabled) return null;

  return (
    <>
      {/* Zone 1: Silos - Blue (storage/input) */}
      <pointLight
        position={[0, 6, -22]}
        intensity={0.6 * intensity}
        color={PALETTE.zones.silos}
        distance={20}
        decay={2}
      />

      {/* Zone 2: Milling - Purple (processing) */}
      <pointLight
        position={[0, 5, -6]}
        intensity={0.5 * intensity}
        color={PALETTE.zones.milling}
        distance={18}
        decay={2}
      />

      {/* Zone 3: Sifting - Cyan (quality/sorting) - elevated */}
      <pointLight
        position={[0, 12, 6]}
        intensity={0.4 * intensity}
        color={PALETTE.zones.sifting}
        distance={20}
        decay={2}
      />

      {/* Zone 4: Packing - Green (output/complete) */}
      <pointLight
        position={[0, 4, 20]}
        intensity={0.5 * intensity}
        color={PALETTE.zones.packing}
        distance={18}
        decay={2}
      />
    </>
  );
};

export default ZoneAccentLights;
