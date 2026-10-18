import { defineMessages } from '../i18n';

/* Workplace roles and tasks are store values compared in logic. English renders
   them verbatim; pt-BR maps the known values and falls back to the raw value. */
const pick = (table: Record<string, string>, value: string) => table[value] ?? value;

const PT_ROLE: Record<string, string> = {
  Packing: 'Ensaque',
  Quality: 'Qualidade',
  Maintenance: 'Manutenção',
  Coordinator: 'Coordenação',
};
const PT_TASK: Record<string, string> = {
  Packing: 'Ensaque',
  'Pallet checks': 'Conferência de paletes',
  'Quality release': 'Liberação de qualidade',
  Sampling: 'Amostragem',
  'Maintenance planning': 'Planejamento da manutenção',
  Coordination: 'Coordenação',
};

/** Floating agreement label over a resident; route tasks stay diagnostic English. */
export const communityAgreementMessages = defineMessages({
  en: {
    role: (p: { value: string }) => p.value,
    task: (p: { value: string }) => p.value,
    awaitingAssignment: 'Awaiting a qualified assignment',
    protectedRecovery: 'Protected recovery',
    protectedRest: 'Protected rest',
    voluntaryCover: 'Voluntary cover',
    paidBriefing: 'Paid handoff briefing',
    agreed: 'Agreed: {task}',
  },
  'pt-BR': {
    role: (p: { value: string }) => pick(PT_ROLE, p.value),
    task: (p: { value: string }) => pick(PT_TASK, p.value),
    awaitingAssignment: 'Aguardando uma atribuição qualificada',
    protectedRecovery: 'Recuperação protegida',
    protectedRest: 'Descanso protegido',
    voluntaryCover: 'Cobertura voluntária',
    paidBriefing: 'Briefing remunerado de passagem de função',
    agreed: 'Acordado: {task}',
  },
});
