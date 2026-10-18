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

const PT_PRESET_DESCRIPTIONS: Record<string, string> = {
  'Whole mill and logistics site': 'Todo o moinho e a área de logística',
  'Raw material storage (Zone 1)': 'Armazenagem de matéria-prima (Zona 1)',
  'Roller mills (Zone 2)': 'Moinhos de rolos (Zona 2)',
  'Plansifters (Zone 3)': 'Plansifters (Zona 3)',
  'Packaging lines (Zone 4)': 'Linhas de ensaque (Zona 4)',
  'Shipping dock (front)': 'Doca de expedição (frente)',
  'Receiving dock (back)': 'Doca de recebimento (fundos)',
};

export const cameraControllerMessages = defineMessages({
  en: {
    cameraView: 'Camera view',
    presetName: (p: { name: string }) => p.name,
    presetDescription: (p: { description: string }) => p.description,
  },
  'pt-BR': {
    cameraView: 'Visão da câmera',
    presetName: (p: { name: string }) => PT_PRESET_NAMES[p.name] ?? p.name,
    presetDescription: (p: { description: string }) =>
      PT_PRESET_DESCRIPTIONS[p.description] ?? p.description,
  },
});
