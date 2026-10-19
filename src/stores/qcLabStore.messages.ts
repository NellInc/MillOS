import { defineMessages } from '../i18n';

export const qcLabStoreMessages = defineMessages({
  en: {
    auditNoteReleased: 'Grade {grade}: material released for dispatch.',
    auditNoteHeld: 'Grade {grade}: material held for investigation.',
    testReason: 'Test {id}: {grade}',
    retestReason: 'Retest {id}: {grade}',
    contaminationNoteDefault: 'Foreign material investigation opened',
    recallReason: 'Material recalled under {alertId}',
    clearedReason: 'Investigation {alertId} cleared material',
  },
  'pt-BR': {
    auditNoteReleased: 'Classe {grade}: material liberado para expedição.',
    auditNoteHeld: 'Classe {grade}: material retido para investigação.',
    testReason: 'Teste {id}: {grade}',
    retestReason: 'Reteste {id}: {grade}',
    contaminationNoteDefault: 'Investigação de material estranho aberta',
    recallReason: 'Material recolhido conforme {alertId}',
    clearedReason: 'A investigação {alertId} liberou o material',
  },
});
