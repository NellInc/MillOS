import { translate } from '../i18n';
import { unifiedGameTickMessages as msg } from '../systems/UnifiedGameTick.messages';
import type { DispatchLoadSnapshot } from './operationsCampaignStore';

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
