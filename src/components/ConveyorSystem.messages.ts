import { defineMessages } from '../i18n';
import type { GrainQuality } from '../types';

const PT_QUALITY: Record<GrainQuality, string> = {
  premium: 'premium',
  standard: 'padrão',
  economy: 'econômica',
  mixed: 'mista',
};

export const conveyorSystemMessages = defineMessages({
  en: {
    quality: 'Quality:',
    weight: 'Weight:',
    // Rendered lowercase; the tooltip capitalises it with CSS.
    qualityValue: (p: { quality: GrainQuality }): string => p.quality,
  },
  'pt-BR': {
    quality: 'Qualidade:',
    weight: 'Peso:',
    qualityValue: (p: { quality: GrainQuality }) => PT_QUALITY[p.quality] ?? p.quality,
  },
});
