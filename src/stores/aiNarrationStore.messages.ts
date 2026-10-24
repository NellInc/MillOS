import { defineMessages } from '../i18n';

/** Narration bodies. Paragraphs are separated by a blank line (parseNarrationContent). */
export const aiNarrationStoreMessages = defineMessages({
  en: {
    welcome:
      'Welcome to MillOS {version}.\n\nThis is a staffed grain-mill digital twin with autonomous logistics. The factory floor, loading yard, garage, village, farm, stream, mountains, sky, and celestial cycle form one continuous world.\n\nI coordinate process state, logistics, safety interlocks, quality genealogy, maintenance, and SCADA evidence. Open Datalinks for concise explanations of how each subsystem fits together.',
    library:
      'Datalinks explains the mill as you explore: follow waiting grain, investigate a held batch, compare useful output with running costs, and see how a completed order supplies the bakery. Optional developer references sit in a separate section.',
    extendedSession:
      'The simulation has been running for an hour. This is a useful point to review alarm history, maintenance wear, genealogy balance, and graphics performance before increasing the time scale.',
    emergencyActive:
      'A fail-safe stop is active. Production and mobile equipment remain interlocked until the recovery state is verified.',
  },
  'pt-BR': {
    welcome:
      'Boas-vindas ao MillOS {version}.\n\nEste é um gêmeo digital de um moinho de grãos operado por pessoas, com logística autônoma. O chão de fábrica, o pátio de carregamento, a garagem, a vila, a fazenda, o riacho, as montanhas, o céu e o ciclo celeste formam um único mundo contínuo.\n\nEu coordeno o estado do processo, a logística, os intertravamentos de segurança, a genealogia de qualidade, a manutenção e as evidências do SCADA. Abra o Datalinks para explicações concisas de como cada subsistema se encaixa.',
    library:
      'O Datalinks explica o moinho enquanto você explora: acompanhe o grão em espera, investigue um lote retido, compare a produção útil com os custos de operação e veja como um pedido concluído abastece a padaria. Referências opcionais para desenvolvedores ficam em uma seção separada.',
    extendedSession:
      'A simulação está rodando há uma hora. Este é um bom momento para revisar o histórico de alarmes, o desgaste de manutenção, o balanço da genealogia e o desempenho gráfico antes de aumentar a escala de tempo.',
    emergencyActive:
      'Uma parada à prova de falhas está ativa. A produção e os equipamentos móveis continuam intertravados até que o estado de recuperação seja verificado.',
  },
});
