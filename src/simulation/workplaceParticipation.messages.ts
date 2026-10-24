import { defineMessages } from '../i18n';

export const workplaceParticipationMessages = defineMessages({
  en: {
    mandatePrompt: 'What authority does the current adviser mandate grant?',
    mandateAdvice: 'Advice only, no delegated execution',
    mandateBounded: 'Only this approved, revocable bounded agreement',
    mandateUnlimited: 'Whatever increases output',
    mandateClarifyAdvice: 'This mandate is advice only. Execution needs a new bounded agreement.',
    mandateClarifyBounded:
      'This mandate is bounded to current agreed work. Safety, qualification and individual boundaries still apply.',
    refusalPrompt: 'What remains after refusing or withdrawing optional duty?',
    refusalRetained: 'Pay and earned compensation/recovery, with no private reason required',
    refusalForfeit: 'Earned pay and recovery are forfeited',
    refusalClarify:
      'Refusal needs no private reason. Earned pay, compensation and recovery remain protected.',
    dutyPrompt: 'Does approving this policy volunteer your optional extra duty?',
    dutySeparate: 'No, separate current qualified consent is needed',
    dutyAutomatic: 'Yes, a policy majority volunteers everyone',
    dutyClarify:
      'Policy approval grants no individual extra-duty consent. Qualification and a separate revocable choice remain necessary.',
  },
  'pt-BR': {
    mandatePrompt: 'Que autoridade o mandato atual do conselheiro concede?',
    mandateAdvice: 'Apenas recomendação, sem execução delegada',
    mandateBounded: 'Somente este acordo limitado, aprovado e revogável',
    mandateUnlimited: 'Tudo o que aumentar a produção',
    mandateClarifyAdvice:
      'Este mandato é apenas de recomendação. A execução exige um novo acordo limitado.',
    mandateClarifyBounded:
      'Este mandato está limitado ao trabalho atualmente acordado. Segurança, qualificação e limites individuais continuam valendo.',
    refusalPrompt: 'O que permanece depois de recusar ou desistir de uma tarefa opcional?',
    refusalRetained:
      'A remuneração e a compensação/o tempo de recuperação já conquistados, sem exigir nenhum motivo pessoal',
    refusalForfeit: 'A remuneração e o tempo de recuperação conquistados são perdidos',
    refusalClarify:
      'A recusa não exige motivo pessoal. A remuneração conquistada, a compensação e o tempo de recuperação continuam protegidos.',
    dutyPrompt: 'Aprovar esta política inscreve você como voluntário na tarefa extra opcional?',
    dutySeparate: 'Não, é preciso um consentimento separado, atual e qualificado',
    dutyAutomatic: 'Sim, uma maioria a favor da política torna todos voluntários',
    dutyClarify:
      'Aprovar a política não concede consentimento individual para tarefa extra. A qualificação e uma escolha separada e revogável continuam necessárias.',
  },
});
