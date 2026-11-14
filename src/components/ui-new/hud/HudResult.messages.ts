import { defineMessages } from '../../../i18n';

const EN_SHIFT: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Night',
};
const PT_SHIFT_OF: Record<string, string> = {
  morning: 'da manhã',
  afternoon: 'da tarde',
  night: 'da noite',
};

export const hudResultMessages = defineMessages({
  en: {
    fulfilledOnTime: '{customer}: {kg} kg, on time',
    fulfilledLate: '{customer}: {kg} kg, {duration} late',
    withQualityFailure: '{result}, {kg} kg failed quality',
    shiftGraded: (p: { shift: string; grade: string }) =>
      `${EN_SHIFT[p.shift] ?? 'Last'} shift: grade ${p.grade}`,
  },
  'pt-BR': {
    fulfilledOnTime: '{customer}: {kg} kg, no prazo',
    fulfilledLate: '{customer}: {kg} kg, com {duration} de atraso',
    withQualityFailure: '{result}, {kg} kg reprovados na qualidade',
    shiftGraded: (p: { shift: string; grade: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? 'anterior'}: nota ${p.grade}`,
  },
});
