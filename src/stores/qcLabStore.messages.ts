import { defineMessages } from '../i18n';

export const qcLabStoreMessages = defineMessages({
  en: {
    auditNoteReleased: 'Grade {grade}: material released for dispatch.',
    auditNoteHeld: 'Grade {grade}: material held for investigation.',
    testReason: 'Test {id}: {grade}',
    retestReason: 'Retest {id}: {grade}',
    contaminationNoteDefault: 'Foreign material investigation opened',
    // The campaign's supplier incident files its hold note with this key.
    supplierTraceabilityNote:
      'Supplier notification requires traceability review before dispatch release.',
    holdReason: '{alertId}: {note}',
    recallReason: 'Material recalled under {alertId}',
    clearedReason: 'Investigation {alertId} cleared material',
  },
  'pt-BR': {
    auditNoteReleased: 'Classe {grade}: material liberado para expedição.',
    auditNoteHeld: 'Classe {grade}: material retido para investigação.',
    testReason: 'Teste {id}: {grade}',
    retestReason: 'Reteste {id}: {grade}',
    contaminationNoteDefault: 'Investigação de material estranho aberta',
    supplierTraceabilityNote:
      'A notificação do fornecedor exige revisão de rastreabilidade antes da liberação para expedição.',
    holdReason: '{alertId}: {note}',
    recallReason: 'Material recolhido conforme {alertId}',
    clearedReason: 'A investigação {alertId} liberou o material',
  },
});
