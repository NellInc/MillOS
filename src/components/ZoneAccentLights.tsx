/**
 * ZoneAccentLights Component
 *
 * Adds zone-colored point lights to illuminate different factory areas.
 * Part of the digital twin aesthetic - makes zones visually distinct.
 */
import React from 'react';
import { FACTORY_ZONE_Z } from '../constants/factoryLayout';
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
 * - Packing: z=25 (Zone 4 - Output)
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
        position={[0, 6, FACTORY_ZONE_Z.silos]}
        intensity={0.6 * intensity}
        color={PALETTE.zones.silos}
        distance={20}
        decay={2}
      />

      {/* Zone 2: Milling - Purple (processing) */}
      <pointLight
        position={[0, 5, FACTORY_ZONE_Z.milling]}
        intensity={0.5 * intensity}
        color={PALETTE.zones.milling}
        distance={18}
        decay={2}
      />

      {/* Zone 3: Sifting - Cyan (quality/sorting) - elevated */}
      <pointLight
        position={[0, 12, FACTORY_ZONE_Z.sifting]}
        intensity={0.4 * intensity}
        color={PALETTE.zones.sifting}
        distance={20}
        decay={2}
      />

      {/* Zone 4: Packing - Green (output/complete) */}
      <pointLight
        position={[0, 4, FACTORY_ZONE_Z.packing]}
        intensity={0.5 * intensity}
        color={PALETTE.zones.packing}
        distance={18}
        decay={2}
      />
    </>
  );
};

export default ZoneAccentLights;
