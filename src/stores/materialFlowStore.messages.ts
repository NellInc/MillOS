import { defineMessages } from '../i18n';

export const materialFlowStoreMessages = defineMessages({
  en: {
    openingInventory: 'Opening inventory',
    scheduledFarmIntake: 'Scheduled farm intake',
    earlierStock: 'Earlier stock (lots over three days old)',
    inheritedDisposition: 'Inherited source-lot disposition',
    fullyDispatched: 'Fully dispatched',
  },
  'pt-BR': {
    openingInventory: 'Estoque inicial',
    scheduledFarmIntake: 'Recebimento programado da fazenda',
    earlierStock: 'Estoque anterior (lotes com mais de três dias)',
    inheritedDisposition: 'Destinação herdada do lote de origem',
    fullyDispatched: 'Totalmente expedido',
  },
});
