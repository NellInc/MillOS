import { useShallow } from 'zustand/react/shallow';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { formatFixed, useT } from '../i18n';
import { conveyorSystemMessages } from './ConveyorSystem.messages';

/** Only mounted on hover: stock belongs to the plant, never the visual sack. */
export function ConveyorStockTooltip() {
  const t = useT(conveyorSystemMessages);
  const stock = useMaterialFlowStore(
    useShallow((state) => {
      let flour = 0;
      let semolina = 0;
      for (const batch of state.productionBatches) {
        if (
          batch.disposition !== 'released' ||
          !Number.isFinite(batch.availableKg) ||
          batch.availableKg <= 0
        )
          continue;
        if (batch.materialType === 'flour') flour += batch.availableKg;
        else if (batch.materialType === 'semolina') semolina += batch.availableKg;
      }
      return { flour, semolina };
    })
  );
  return (
    <div className="pointer-events-none min-w-[160px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur">
      <div className="text-xs font-mono font-bold text-white">{t('releasedStock')}</div>
      <div className="mt-1 text-[10px] text-slate-400">
        <div className="flex justify-between gap-3">
          <span>{t('flour')}</span>
          <span className="text-white">{formatFixed(stock.flour, 1)} kg</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t('semolina')}</span>
          <span className="text-white">{formatFixed(stock.semolina, 1)} kg</span>
        </div>
      </div>
    </div>
  );
}
