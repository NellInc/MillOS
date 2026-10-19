import { defineMessages } from '../i18n';

/* Source material ids ('wheat_grain', 'corn_grain') render as words in
   English; pt-BR maps the known values and falls back to the English words. */
const PT_MATERIAL: Record<string, string> = {
  wheat_grain: 'grão de trigo',
  corn_grain: 'grão de milho',
};

export const operationsPlayMessages = defineMessages({
  en: {
    blockActiveChallenge: 'Finish or abandon the active challenge first.',
    blockNoCommitment: 'Accept a production programme with an open commitment first.',
    blockOpenIncidents: 'Recover existing incidents before adding another challenge.',
    blockPlanning: 'Wait for the selected route to refresh its inventory and quality readings.',
    blockNoFeedstock: 'Receive the active recipe feedstock before starting.',
    blockQualityHold: 'Resolve the existing quality hold before starting.',

    challengePowerRecovery: 'Recover from a power sag',
    challengePackagingRecovery: 'Restore packaging throughput',
    challengeNetworkRecovery: 'Recover control availability',
    challengeFallback: 'Recovery challenge',

    acknowledgeLabel: 'Acknowledge incident',
    acknowledgeConsequence:
      '{title}: acknowledgement records ownership; its production and safety effects remain active.',
    mitigateLabel: 'Apply incident mitigation',
    mitigateConsequence:
      'Halves the incident’s throughput and quality penalties. Existing equipment failures and quality holds still require their own recovery.',
    resumeLabel: 'Resume shift for controller response',
    resumeConsequence:
      'Resumes the whole shift at relaxed pace. Production and customer deadlines advance; the shift stays running until you pause it.',
    resolveLabel: 'Restore challenge controller',
    resolveConsequenceActive:
      'Restores this effect-only controller scenario to normal. Complete the challenge by dispatching its target mass through the real quality and shipping gates.',
    resolveConsequenceEnded:
      'Restores the abandoned or expired scenario controller to normal. Its recorded challenge result remains unchanged; a fresh challenge can then be started.',
    repairLabel: 'Repair the stopped machine in Overview',
    programmeLabel: 'Accept next production programme',
    programmeConsequence:
      'Creates three new 3,000 kg customer commitments with real recipe, quality and dispatch requirements. Existing stock remains available; no goods or revenue are created.',
    qualityLabel: 'Review the quality hold in Overview',
    qualityConsequence:
      'Inspect source traceability and tests in the QC lab. Held batches cannot satisfy a customer commitment.',
    receivingLabel: 'Check incoming grain in SCADA',
    sourceMaterial: (p: { value: string }) => p.value.replaceAll('_', ' '),
    receivingConsequence:
      'The {material} route is empty. Receiving and releasing the matching source lot permits milling to resume.',
    dispatchLabel: 'Check shipping in SCADA',
    dispatchConsequence:
      'Only material recorded on a departed shipping manifest credits the commitment. Loading and released stock alone earn no revenue.',
    residualLabel: 'Check remaining incident effects in SCADA',
    productionLabel: 'Check the production line in SCADA',
    residualConsequence:
      '{title} retains residual effects. Recover the affected equipment or hold in its owning workspace; acknowledgement alone cannot restore it.',
    productionConsequence:
      'Follow feedstock through mills, sifters and packers. The scheduler sets recipe throughput; quality release precedes shipment.',

    instructionInspect: 'Inspect the incident in the operations workspace.',
    instructionAcknowledge: 'Acknowledge the incident, then apply mitigation.',
    instructionMitigate: "Apply mitigation to reduce the controller's penalties.",
    instructionRestored:
      'Controller restored. Dispatch fresh, quality-released goods through the shipping bay.',
    instructionRestore:
      'Restore the challenge controller, then dispatch fresh, quality-released goods.',
    instructionQueued:
      'The response is queued. Resume the shift to process it before restoring the controller.',
  },
  'pt-BR': {
    blockActiveChallenge: 'Primeiro conclua ou abandone o desafio ativo.',
    blockNoCommitment: 'Primeiro aceite um programa de produção com um compromisso em aberto.',
    blockOpenIncidents: 'Recupere as ocorrências existentes antes de adicionar outro desafio.',
    blockPlanning: 'Aguarde a rota selecionada atualizar as leituras de estoque e de qualidade.',
    blockNoFeedstock: 'Receba a matéria-prima da receita ativa antes de começar.',
    blockQualityHold: 'Resolva a retenção de qualidade existente antes de começar.',

    challengePowerRecovery: 'Recuperar-se de uma queda de tensão',
    challengePackagingRecovery: 'Restabelecer a vazão de embalagem',
    challengeNetworkRecovery: 'Recuperar a disponibilidade do controle',
    challengeFallback: 'Desafio de recuperação',

    acknowledgeLabel: 'Reconhecer ocorrência',
    acknowledgeConsequence:
      '{title}: o reconhecimento registra quem é responsável; os efeitos na produção e na segurança continuam ativos.',
    mitigateLabel: 'Aplicar mitigação da ocorrência',
    mitigateConsequence:
      'Reduz à metade as penalidades de vazão e de qualidade da ocorrência. As falhas de equipamento e as retenções de qualidade existentes ainda exigem sua própria recuperação.',
    resumeLabel: 'Retomar o turno para a resposta do controlador',
    resumeConsequence:
      'Retoma o turno inteiro em ritmo tranquilo. A produção e os prazos dos clientes avançam; o turno continua rodando até você pausá-lo.',
    resolveLabel: 'Restaurar o controlador do desafio',
    resolveConsequenceActive:
      'Restaura ao normal este cenário do controlador, que atua apenas sobre os efeitos. Conclua o desafio expedindo a massa-alvo pelas etapas reais de qualidade e de expedição.',
    resolveConsequenceEnded:
      'Restaura ao normal o controlador do cenário abandonado ou expirado. O resultado registrado do desafio não muda; depois disso, um novo desafio pode ser iniciado.',
    repairLabel: 'Reparar a máquina parada na Visão geral',
    programmeLabel: 'Aceitar o próximo programa de produção',
    programmeConsequence:
      'Cria três novos compromissos de 3.000 kg com clientes, com exigências reais de receita, qualidade e expedição. O estoque existente continua disponível; nenhum produto ou faturamento é criado.',
    qualityLabel: 'Revisar a retenção de qualidade na Visão geral',
    qualityConsequence:
      'Inspecione a rastreabilidade da origem e os testes no laboratório de CQ. Lotes retidos não podem atender a um compromisso com o cliente.',
    receivingLabel: 'Verificar o grão recebido no SCADA',
    sourceMaterial: (p: { value: string }) => PT_MATERIAL[p.value] ?? p.value.replaceAll('_', ' '),
    receivingConsequence:
      'A rota de {material} está vazia. Receber e liberar o lote de origem correspondente permite retomar a moagem.',
    dispatchLabel: 'Verificar a expedição no SCADA',
    dispatchConsequence:
      'Somente o material registrado em um romaneio de expedição que já saiu conta para o compromisso. O carregamento e o estoque liberado, por si sós, não geram faturamento.',
    residualLabel: 'Verificar os efeitos restantes da ocorrência no SCADA',
    productionLabel: 'Verificar a linha de produção no SCADA',
    residualConsequence:
      '{title} mantém efeitos residuais. Recupere o equipamento afetado ou resolva a retenção no espaço de trabalho correspondente; só o reconhecimento não basta para restabelecer a operação.',
    productionConsequence:
      'Acompanhe a matéria-prima pelos moinhos de rolos, plansifters e ensacadeiras. A programação da produção define a vazão da receita; a liberação de qualidade vem antes da expedição.',

    instructionInspect: 'Inspecione a ocorrência no espaço de trabalho de operações.',
    instructionAcknowledge: 'Reconheça a ocorrência e depois aplique a mitigação.',
    instructionMitigate: 'Aplique a mitigação para reduzir as penalidades do controlador.',
    instructionRestored:
      'Controlador restaurado. Expeça pela doca de expedição produtos recém-produzidos e liberados pela qualidade.',
    instructionRestore:
      'Restaure o controlador do desafio e depois expeça produtos recém-produzidos e liberados pela qualidade.',
    instructionQueued:
      'A resposta está na fila. Retome o turno para processá-la antes de restaurar o controlador.',
  },
});
