import { defineMessages } from '../i18n';

/**
 * CAMERA_PRESETS keeps its English `name` and `description`: importers find a
 * preset by name ('Packing', guide.view) and key menu rows by it. The words are
 * translated where they are shown, from that English id.
 */
const PT_PRESET_NAMES: Record<string, string> = {
  Overview: 'Visão geral',
  Silos: 'Silos',
  Milling: 'Moagem',
  Sifting: 'Peneiramento',
  Packing: 'Ensaque',
  Shipping: 'Expedição',
  Receiving: 'Recebimento',
};

export const cameraControllerMessages = defineMessages({
  en: {
    cameraView: 'Camera view',
    presetName: (p: { name: string }) => p.name,
  },
  'pt-BR': {
    cameraView: 'Visão da câmera',
    presetName: (p: { name: string }) => PT_PRESET_NAMES[p.name] ?? p.name,
  },
});
