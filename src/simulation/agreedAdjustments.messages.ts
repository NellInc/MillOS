import { defineMessages } from '../i18n';

/**
 * The register's own names (agreedAdjustments.ts, D-058), keyed by register
 * id: each adjustment, and each role an adjustment is agreed with. Whatever
 * shows an entry (the resident card) reads its name from here. The first three
 * adjustment names are the factory AI's own words for the same entries
 * (aiAccommodation.messages.ts); agreedAdjustmentsNames.test.ts keeps them equal.
 */
export const agreedAdjustmentsMessages = defineMessages({
  en: {
    'step-free-route': 'Step-free route',
    'visual-alerts': 'Alarms as light and vibration',
    'quiet-room': 'Quiet room',
    'adjustable-bench': 'Bench set to seated working height',
    'tactile-wayfinding': 'Tactile paving and a clear route',
    captions: 'PA lines as captions',
    'shift-supervisor': 'Shift supervisor',
    'quality-lead': 'Quality lead',
    'council-office': 'Council office',
  },
  'pt-BR': {
    'step-free-route': 'Rota sem degraus',
    'visual-alerts': 'Alarmes como luz e vibração',
    'quiet-room': 'Sala silenciosa',
    'adjustable-bench': 'Bancada na altura de trabalho sentado',
    'tactile-wayfinding': 'Piso tátil e rota desobstruída',
    captions: 'Avisos sonoros com legendas',
    'shift-supervisor': 'Supervisão do turno',
    'quality-lead': 'Responsável pela qualidade',
    'council-office': 'Gabinete da prefeitura',
  },
});
