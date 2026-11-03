import { createTranslator, defineMessages, formatFixed, translate, type Locale } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { unifiedGameTickMessages as msg } from '../systems/UnifiedGameTick.messages';
import type { AlertData } from '../types';
import type {
  DispatchBlockCode,
  DispatchLoadSnapshot,
  DispatchQualityBlockCode,
} from './operationsCampaignStore';

/*
 * A dispatch load is persisted, and after an empty departure its reason is not
 * recomputed until the next truck docks. Render through this helper: it words
 * the load's reason code in the language active now, and falls back to the
 * stored text for a load saved before codes existed.
 */
export function dispatchBlockText(
  load: Pick<DispatchLoadSnapshot, 'blockReason' | 'blockCode' | 'materialType'>
): string | null {
  const code = load.blockCode;
  if (code === 'waitingForMaterial')
    return translate(msg, 'waitingForMaterial', { material: load.materialType });
  if (code) return translate(msg, code);
  return load.blockReason;
}

/*
 * The shipping hold notices the tick files (UnifiedGameTick) are restored with
 * the plant, so their stored text would keep the language they were filed in.
 * These keys word each one from raw values in the language active now: a code,
 * a material id, the demurrage rate as a number. A code this build does not
 * know words nothing, so the bell keeps the stored text.
 */
const DISPATCH_HOLD_ALERT_CATALOG = 'campaign-dispatch-hold';
const QUALITY_CODES: readonly DispatchQualityBlockCode[] = [
  'certificationExpired',
  'unresolvedContamination',
  'failedQualityTest',
  'incidentDispatchIsolation',
  'qualityInterlockNotReleased',
];
const isQualityCode = (code: unknown): code is DispatchQualityBlockCode =>
  QUALITY_CODES.includes(code as DispatchQualityBlockCode);

interface SupplyParams {
  code: string;
  material: string;
}
const holdWords = (locale: Locale) => {
  const t = createTranslator(msg, locale);
  return {
    programmeTitle: t('shippingAwaitingProgrammeTitle'),
    programmeMessage: t('noCommitmentToShip'),
    qualityTitle: t('dispatchQualityHoldTitle'),
    qualityMessage: (p: { code: string; rate: number }) =>
      isQualityCode(p.code) && Number.isFinite(p.rate)
        ? t('clearBeforeRelease', { reason: t(p.code), rate: formatFixed(p.rate, 2, locale) })
        : '',
    supplyTitle: t('shippingAwaitingProductTitle'),
    // As the tick words it: the load's own reason, or waiting for product.
    supplyMessage: (p: SupplyParams) =>
      p.code === 'waitingForMaterial'
        ? t('waitingForMaterial', { material: p.material })
        : p.code === 'departedWithoutLoad'
          ? t('departedWithoutLoad')
          : p.code === ''
            ? t('waitingForProduct')
            : '',
  };
};
registerAlertCatalog(
  DISPATCH_HOLD_ALERT_CATALOG,
  defineMessages({ en: holdWords('en'), 'pt-BR': holdWords('pt-BR') })
);

/** A shipping hold notice, as the tick files it. */
export type DispatchHoldNotice =
  | { kind: 'programme' }
  | { kind: 'quality'; code: DispatchQualityBlockCode; rate: number }
  | { kind: 'supply'; code: DispatchBlockCode | null | undefined; material: string };

/** Keys for a shipping hold notice, so the bell words it in the language active now. */
export function dispatchHoldAlertCopy(notice: DispatchHoldNotice): AlertData['copy'] {
  switch (notice.kind) {
    case 'programme':
      return {
        catalog: DISPATCH_HOLD_ALERT_CATALOG,
        title: 'programmeTitle',
        message: 'programmeMessage',
      };
    case 'quality':
      return {
        catalog: DISPATCH_HOLD_ALERT_CATALOG,
        title: 'qualityTitle',
        message: 'qualityMessage',
        params: { code: notice.code, rate: notice.rate },
      };
    case 'supply':
      return {
        catalog: DISPATCH_HOLD_ALERT_CATALOG,
        title: 'supplyTitle',
        message: 'supplyMessage',
        params: { code: notice.code ?? '', material: notice.material },
      };
  }
}
