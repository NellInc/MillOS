import React from 'react';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { floorProposalMessages } from '../../../simulation/floorProposals.messages';
import { formatFixed, useT } from '../../../i18n';

/**
 * A silo's grain readings (plan item 3.1): the mass-weighted mean of the
 * stamped lots it holds, which is what flour milled from it is stamped by.
 * Only lots with readings count (a signed Chronicle charter stamps them);
 * a silo holding none shows nothing.
 */
export const SiloLotReadings: React.FC<{ machineId: string }> = ({ machineId }) => {
  const t = useT(floorProposalMessages);
  const readings = useMaterialFlowStore((state) => {
    const buffer = state.machineBuffers.get(machineId);
    if (!buffer || buffer.machineType !== 'silo') return null;
    let mass = 0;
    let falling = 0;
    let moisture = 0;
    for (const material of buffer.outputBuffer)
      for (const source of material.sourceContributions ?? []) {
        const crop = state.sourceLots.get(source.lotId)?.crop;
        if (!crop || !(source.amount > 0)) continue;
        mass += source.amount;
        falling += crop.fallingNumberS * source.amount;
        moisture += crop.moisturePct * source.amount;
      }
    if (mass <= 0) return null;
    // Rounded here, so the selector returns the same string while nothing changes.
    return `${Math.round(falling / mass)}|${Math.round((moisture / mass) * 10) / 10}`;
  });
  if (!readings) return null;
  const [fallingNumber, moisture] = readings.split('|').map(Number);
  return (
    <p className="mt-2 font-mono text-[11px] text-slate-300" data-testid="silo-lot-readings">
      {t('siloReadings', {
        fallingNumber: formatFixed(fallingNumber, 0),
        moisture: formatFixed(moisture, 1),
      })}
    </p>
  );
};
