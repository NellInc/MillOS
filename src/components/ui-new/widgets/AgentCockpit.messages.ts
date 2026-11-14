import { defineMessages, formatGrouped } from '../../../i18n';

type PreviewStatusParams = { status: string };
type CostParams = { compute: string; latency: string; external: boolean };

const PT_PREVIEW_STATUS: Record<string, string> = {
  ready: 'pronto',
  'requires-approval': 'requer aprovação',
  denied: 'negado',
};

/** AgentResourceCostModel compute and latency classes, shown as words in pt-BR. */
const PT_COST_CLASS: Record<string, string> = {
  trivial: 'trivial',
  bounded: 'limitado',
  intensive: 'intensivo',
  local: 'local',
  interactive: 'interativa',
  'long-running': 'de longa duração',
};

/*
 * The agent runtime writes its titles, summaries, checks and objections in
 * English, and that text is part of the registry contract and its hashes
 * (preview fingerprints, policy revision). The cockpit translates it where it
 * is shown: by stable id where there is one, otherwise by the exact English
 * line the runtime wrote. A line this table does not know is shown as written.
 */
type CapabilityTitleParams = { id: string; title: string };
type ObjectionParams = { id: string; statement: string };
type AgentTextParams = { text: string };
type BriefStatusParams = { status: string };
type ModeParams = { mode: string };
type FieldLabelParams = { name: string; label: string };
type EnumOptionParams = { value: string; label: string };
type ReceiptStatusParams = { status: string };

const EN_BRIEF_STATUS: Record<string, string> = {
  nominal: 'Nominal',
  attention: 'Attention',
  'attention-required': 'Attention required',
};

const PT_BRIEF_STATUS: Record<string, string> = {
  nominal: 'Normal',
  attention: 'Atenção',
  'attention-required': 'Atenção necessária',
};

const PT_RUNTIME_MODE: Record<string, string> = {
  simulation: 'simulação',
  shadow: 'sombra',
  replay: 'reprodução',
  'live-external': 'externo ao vivo',
};

const PT_CAPABILITY_TITLES: Record<string, string> = {
  'operations.activate-order': 'Ativar um pedido de produção',
  'incident.acknowledge': 'Reconhecer uma ocorrência da campanha',
  'incident.mitigate': 'Mitigar uma ocorrência da campanha',
  'workplace.activate-plan': 'Executar um plano de trabalho acordado',
  'ai.respond-to-decision': 'Responder a uma decisão da IA',
  'maintenance.request-repair': 'Solicitar trabalho de reparo',
  'maintenance.request-restart': 'Solicitar reinício controlado da máquina',
  'quality.hold-batch': 'Colocar um lote de produto em retenção de qualidade',
  'quality.release-batch': 'Liberar um lote de produto retido',
  'dispatch.release': 'Liberar a transferência de expedição',
  'simulation.set-speed': 'Definir a velocidade determinística da simulação',
  'simulation.start-fire-drill': 'Iniciar um simulado de evacuação',
  'scada.acknowledge-alarm': 'Reconhecer um alarme SCADA simulado',
  'scada.write-setpoint': 'Gravar um setpoint SCADA simulado',
};

const PT_OBJECTIONS: Record<string, string> = {
  'objection.live-external-control-held':
    'As gravações SCADA externas não têm endpoint aceito, permissão, lista de permissões nem evidência do lado remoto.',
};

const PT_FIELD_LABELS: Record<string, string> = {
  orderUri: 'URI do pedido',
  incidentUri: 'URI da ocorrência',
  revision: 'Revisão',
  decisionUri: 'URI da decisão',
  disposition: 'Resposta',
  note: 'Observação',
  modifiedAction: 'Ação modificada',
  breakdownUri: 'URI da pane',
  batchUri: 'URI do lote',
  reason: 'Motivo',
  dispatchUri: 'URI da expedição',
  simulationUri: 'URI da simulação',
  speed: 'Velocidade',
  totalZones: 'Total de zonas',
  alarmUri: 'URI do alarme',
  tagUri: 'URI da tag',
  value: 'Valor',
};

const PT_ENUM_OPTIONS: Record<string, string> = {
  accepted: 'Aceita',
  modified: 'Modificada',
  rejected: 'Rejeitada',
  deferred: 'Adiada',
};

const PT_RECEIPT_STATUS: Record<string, string> = {
  rejected: 'rejeitado',
  previewed: 'pré-visualizado',
  committed: 'executado',
  verified: 'verificado',
  failed: 'falhou',
  duplicate: 'duplicado',
};

const PT_CRISIS: Record<string, string> = {
  fire: 'incêndio',
  power_outage: 'queda de energia',
  supply_emergency: 'emergência de abastecimento',
  inspection: 'inspeção',
  weather: 'clima',
};

const PT_HOLD_REASON: Record<string, string> = {
  none: 'nenhum',
  certification_expired: 'certificação vencida',
  unresolved_contamination: 'contaminação não resolvida',
  failed_quality_test: 'teste de qualidade reprovado',
};

const PT_DECISION_DISPOSITION: Record<string, string> = {
  accepted: 'aceita',
  modified: 'modificada',
  rejected: 'rejeitada',
  deferred: 'adiada',
};

const PT_PHASE: Record<string, string> = {
  acknowledged: 'reconhecida',
  mitigated: 'mitigada',
  raised: 'aberta',
  unresolved: 'não resolvida',
  unmitigated: 'não mitigada',
};

const PT_BATCH_DISPOSITION: Record<string, string> = {
  hold: 'retido',
  released: 'liberado',
};

const PT_SCHEMA_TYPE: Record<string, string> = {
  string: 'um texto',
  number: 'um número',
  integer: 'um número inteiro',
  boolean: 'um booleano',
  array: 'uma lista',
  object: 'um objeto',
};

const ptNumber = (text: string): string => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value)
    ? formatGrouped(value, { maximumFractionDigits: 6 }, 'pt-BR')
    : text;
};

const PT_AGENT_TEXT: Record<string, string> = {
  // Situation brief exceptions (queryService collectHealthExceptions)
  'Facility emergency is active.': 'Uma emergência na instalação está ativa.',
  'Forklift emergency stop is active.': 'A parada de emergência das empilhadeiras está ativa.',
  'Line idle until a person presses RESTART LINE; no agent command restarts it.':
    'Linha parada até uma pessoa pressionar REINICIAR LINHA; nenhum comando de agente a reinicia.',
  'SCADA is flagged live without a verified connection observation in the query projection.':
    'O SCADA está marcado como ao vivo sem uma observação de conexão verificada na projeção da consulta.',
  'External SCADA writes lack accepted endpoint, permission, allowlist, and far-side evidence.':
    PT_OBJECTIONS['objection.live-external-control-held'],
  // Handler effects, checks and verification (runtimeCommandHandlers)
  'Run the exact agreed plan, with protected rest and funded obligations.':
    'Executar exatamente o plano acordado, com descanso protegido e obrigações financiadas.',
  'Local simulation only.': 'Somente simulação local.',
  'Agreement terms must still be current.': 'Os termos do acordo ainda devem estar vigentes.',
  'Consent, understanding, objections and funding checked.':
    'Consentimento, compreensão, objeções e financiamento verificados.',
  'Workshop and Pilot preparation have no plant control.':
    'A preparação de oficina e de piloto não controla a planta.',
  'No new work during an emergency.': 'Nenhum trabalho novo durante uma emergência.',
  'The agreed local plan is active.': 'O plano local acordado está ativo.',
  'Make the target order active.': 'Tornar ativo o pedido alvo.',
  'Move any previous active order back to planned.':
    'Devolver o pedido ativo anterior ao estado planejado.',
  'Reset the execution recipe to planning.': 'Redefinir a receita de execução para o planejamento.',
  'Order must be planned, active, or late.': 'O pedido deve estar planejado, ativo ou atrasado.',
  'orderUri must equal targetUri.': 'orderUri deve ser igual a targetUri.',
  'Order is already the active order.': 'O pedido já é o pedido ativo.',
  'Shipping transfer is already released.': 'A transferência de expedição já foi liberada.',
  'Order switching is held until the recovery challenge ends.':
    'A troca de pedido fica retida até o fim do desafio de recuperação.',
  'A recovery challenge incident must be acknowledged before mitigation.':
    'Uma ocorrência de desafio de recuperação deve ser reconhecida antes da mitigação.',
  'Order activation is held during an emergency.':
    'A ativação de pedidos fica retida durante uma emergência.',
  'Campaign logbook remains within its 160-entry bound.':
    'O diário da campanha permanece dentro do limite de 160 registros.',
  'Active order ID matches the command target.':
    'O ID do pedido ativo corresponde ao alvo do comando.',
  'Exactly one order is active.': 'Exatamente um pedido está ativo.',
  'Execution recipe matches the selected order.':
    'A receita de execução corresponde ao pedido selecionado.',
  'Command and capture modes agree.': 'Os modos do comando e da captura coincidem.',
  'Decision must still be pending.': 'A decisão ainda deve estar pendente.',
  'A deferred decision is deferred once; accept or reject it.':
    'Uma decisão adiada só é adiada uma vez; aceite-a ou rejeite-a.',
  'A modified response needs the replacement action.':
    'Uma resposta modificada precisa da ação substituta.',
  "A proposal is answered accepted (the partner's choice), rejected (the other of two) or modified (modifiedAction names an option).":
    'Uma proposta é respondida como aceita (a escolha do parceiro), rejeitada (a outra de duas) ou modificada (modifiedAction nomeia uma opção).',
  'Decision response keeps the current truth label.':
    'A resposta à decisão mantém o rótulo de veracidade atual.',
  'Decision response matches the command.': 'A resposta à decisão corresponde ao comando.',
  'Consume the required simulated parts and move the work order to repairing.':
    'Consumir as peças simuladas necessárias e passar a ordem de serviço para reparo.',
  'Work order must be diagnosed or awaiting parts.':
    'A ordem de serviço deve estar diagnosticada ou aguardando peças.',
  'Required parts are available.': 'As peças necessárias estão disponíveis.',
  'Returned equipment cannot re-enter repair through this command.':
    'Um equipamento devolvido ao serviço não pode voltar a reparo por este comando.',
  'Repair result and work-order phase agree.':
    'O resultado do reparo e a fase da ordem de serviço coincidem.',
  'Move the verified work order to restart_requested.':
    'Passar a ordem de serviço verificada para reinício solicitado.',
  'Repair must be independently verified first.':
    'O reparo precisa antes ser verificado de forma independente.',
  'Restart cannot bypass repair verification.':
    'O reinício não pode ignorar a verificação do reparo.',
  'Work order is queued for controlled restart.':
    'A ordem de serviço está na fila para reinício controlado.',
  'Shipped or recalled product cannot be held.':
    'Produto expedido ou recolhido não pode ser retido.',
  'Only a non-contaminated hold may be released.':
    'Somente uma retenção sem contaminação pode ser liberada.',
  'A disposition reason is required.': 'É necessário um motivo para a destinação.',
  'A recall cannot be reversed by release.':
    'Um recolhimento não pode ser revertido por uma liberação.',
  'Set shipping transfer readiness for the current docked truck.':
    'Marcar a transferência de expedição como pronta para o caminhão na doca.',
  'A shipping truck must be docked.': 'Um caminhão de expedição deve estar na doca.',
  'Held or recalled material cannot dispatch.':
    'Material retido ou recolhido não pode ser expedido.',
  'Shipping transfer is ready.': 'A transferência de expedição está pronta.',
  'Speed must be finite.': 'A velocidade deve ser um número finito.',
  'Speed control is local to simulation or shadow mode.':
    'O controle de velocidade é restrito ao modo de simulação ou sombra.',
  'Simulation speed matches the request.': 'A velocidade da simulação corresponde à solicitação.',
  'Activate the simulated fire-drill interlock and egress metrics.':
    'Ativar o intertravamento do simulado de evacuação e as métricas de rota de saída.',
  'Stop simulated production and mobile equipment.':
    'Parar a produção simulada e os equipamentos móveis.',
  'Leave production idle after the drill until an operator restarts the line.':
    'Deixar a produção parada depois do simulado até um operador reiniciar a linha.',
  'No emergency or crisis may already be active.':
    'Nenhuma emergência ou crise pode já estar ativa.',
  'The drill cannot override an active emergency.':
    'O simulado não pode se sobrepor a uma emergência ativa.',
  'Fire drill mode is active.': 'O modo de simulado de evacuação está ativo.',
  'Drill metrics are active.': 'As métricas do simulado estão ativas.',
  'SCADA simulation service must be connected.':
    'O serviço de simulação SCADA deve estar conectado.',
  'Alarm must be active.': 'O alarme deve estar ativo.',
  'Alarm must be unacknowledged.': 'O alarme ainda não pode ter sido reconhecido.',
  'Agent acknowledgement is restricted to the SimulationAdapter.':
    'O reconhecimento pelo agente é restrito ao SimulationAdapter.',
  'Alarm acknowledgement is recorded.': 'O reconhecimento do alarme está registrado.',
  'SCADA service must be connected.': 'O serviço SCADA deve estar conectado.',
  'Only SimulationAdapter writes are authorized.':
    'Somente gravações pelo SimulationAdapter são autorizadas.',
  'Tag must exist and be writable.': 'A tag deve existir e permitir gravação.',
  'Value must lie within the tag engineering range.':
    'O valor deve estar dentro da faixa de engenharia da tag.',
  'Live external command mode remains denied.':
    'O modo de comando externo ao vivo continua negado.',
  'Setpoint truth label remains simulated.':
    'O rótulo de veracidade do setpoint continua simulado.',
  'SimulationAdapter readback matches the requested setpoint.':
    'A leitura de volta do SimulationAdapter corresponde ao setpoint solicitado.',
  // Kernel and authority problems (commandKernel, authority)
  'The exact current preview requires a bound approval token.':
    'Esta prévia exata exige um token de aprovação vinculado.',
  'Invariant was not evaluated.': 'O invariante não foi avaliado.',
  'Command schema version must be 1.': 'A versão do esquema do comando deve ser 1.',
  'Capability is not marked implemented.': 'A capacidade não está marcada como implementada.',
  'No runtime handler is registered.': 'Nenhum manipulador de execução está registrado.',
  'Command capability version does not match the registry.':
    'A versão da capacidade no comando não corresponde ao registro.',
  'Command mode does not match the current runtime mode.':
    'O modo do comando não corresponde ao modo de execução atual.',
  'A non-empty reason is required.': 'É necessário informar um motivo.',
  'Capability does not exist.': 'A capacidade não existe.',
  'Actor is unknown or suspended.': 'O ator é desconhecido ou está suspenso.',
  'Grant does not exist.': 'A autorização não existe.',
  'Grant belongs to another actor.': 'A autorização pertence a outro ator.',
  'Grant has expired.': 'A autorização expirou.',
  'Grant does not include this capability.': 'A autorização não inclui esta capacidade.',
  'Grant does not include this runtime mode.': 'A autorização não inclui este modo de execução.',
  'Capability is unavailable in this runtime mode.':
    'A capacidade não está disponível neste modo de execução.',
  'Target URI is outside grant scope.': 'O URI alvo está fora do escopo da autorização.',
  'Capability exceeds the grant risk ceiling.':
    'A capacidade excede o teto de risco da autorização.',
  'Grant command budget is exhausted.': 'O limite de comandos da autorização se esgotou.',
  'Grant forbids external calls.': 'A autorização proíbe chamadas externas.',
  // Commit and approval refusals (commandKernel commit, validateCommit, approve)
  'A current preview is required.': 'É necessária uma prévia atual.',
  'The supplied preview is denied.': 'A prévia informada foi negada.',
  'The supplied preview has expired.': 'A prévia informada expirou.',
  'The command changed after preview.': 'O comando mudou depois da prévia.',
  'Approval is bound to another preview.': 'A aprovação está vinculada a outra prévia.',
  'Approval is bound to another revision.': 'A aprovação está vinculada a outra revisão.',
  'Approval is bound to materially different parameters.':
    'A aprovação está vinculada a parâmetros materialmente diferentes.',
  'Approval has expired.': 'A aprovação expirou.',
  'Approval token is unknown or has been altered.':
    'O token de aprovação é desconhecido ou foi alterado.',
  'This command is already being committed.': 'Este comando já está sendo executado.',
  'Preview does not exist or has fallen outside the bounded preview history.':
    'A prévia não existe ou saiu do histórico limitado de prévias.',
  'This preview does not require approval.': 'Esta prévia não exige aprovação.',
  'Preview has expired.': 'A prévia expirou.',
  'A command cannot be approved by the actor that requested it.':
    'Um comando não pode ser aprovado pelo ator que o solicitou.',
  // Handler execution refusals (runtimeCommandHandlers execute)
  'The safety stop holds this agreement.': 'A parada de segurança retém este acordo.',
  'Agreement did not activate.': 'O acordo não foi ativado.',
};

const PT_AGENT_PATTERNS: ReadonlyArray<readonly [RegExp, (match: RegExpMatchArray) => string]> = [
  [/^(.+) is warning\.$/, (m) => `${m[1]} está em alerta.`],
  [/^(.+) is critical\.$/, (m) => `${m[1]} está em estado crítico.`],
  [/^(.+) breakdown is active\.$/, (m) => `Pane ativa em ${m[1]}.`],
  [
    /^Simulation crisis active: (.+)\.$/,
    (m) => `Crise simulada ativa: ${PT_CRISIS[m[1]] ?? m[1]}.`,
  ],
  [
    /^Dispatch quality hold: (.+)\.$/,
    (m) => `Retenção de qualidade na expedição: ${PT_HOLD_REASON[m[1]] ?? m[1]}.`,
  ],
  [/^Order (.+) must exist\.$/, (m) => `O pedido ${m[1]} deve existir.`],
  [
    /^Move incident (.+) to (\w+)\.$/,
    (m) => `Passar a ocorrência ${m[1]} para ${PT_PHASE[m[2]] ?? m[2]}.`,
  ],
  [/^Incident (.+) must exist\.$/, (m) => `A ocorrência ${m[1]} deve existir.`],
  [/^Incident must be (\w+)\.$/, (m) => `A ocorrência deve estar ${PT_PHASE[m[1]] ?? m[1]}.`],
  [/^Incident phase is (\w+)\.$/, (m) => `A fase da ocorrência é ${PT_PHASE[m[1]] ?? m[1]}.`],
  [
    /^Record (\S+) for decision (.+)\.$/,
    (m) => `Registrar ${PT_DECISION_DISPOSITION[m[1]] ?? m[1]} para a decisão ${m[2]}.`,
  ],
  [/^Decision (.+) must exist\.$/, (m) => `A decisão ${m[1]} deve existir.`],
  [/^Breakdown (.+) must be active\.$/, (m) => `A pane ${m[1]} deve estar ativa.`],
  [/^Missing parts: (.+)\.$/, (m) => `Peças em falta: ${m[1]}.`],
  [
    /^Set batch (.+) disposition to (\w+)\.$/,
    (m) => `Definir a destinação do lote ${m[1]} como ${PT_BATCH_DISPOSITION[m[2]] ?? m[2]}.`,
  ],
  [/^Batch (.+) must exist\.$/, (m) => `O lote ${m[1]} deve existir.`],
  [
    /^Batch disposition is (\w+)\.$/,
    (m) => `A destinação do lote é ${PT_BATCH_DISPOSITION[m[1]] ?? m[1]}.`,
  ],
  [
    /^Quality dispatch release is required; current reason: (.+)\.$/,
    (m) =>
      `A liberação de qualidade para expedição é necessária; motivo atual: ${PT_HOLD_REASON[m[1]] ?? m[1]}.`,
  ],
  [
    /^Set simulation speed to (.+)\.$/,
    (m) => `Definir a velocidade da simulação para ${ptNumber(m[1])}.`,
  ],
  [
    /^Acknowledge alarm (.+) without clearing its process condition\.$/,
    (m) => `Reconhecer o alarme ${m[1]} sem eliminar sua condição de processo.`,
  ],
  [
    /^Write (.+) to simulated tag (.+) and read it back\.$/,
    (m) => `Gravar ${ptNumber(m[1])} na tag simulada ${m[2]} e ler o valor de volta.`,
  ],
  [/^Unexpected domain mutations: (.+)\.$/, (m) => `Mutações inesperadas de domínio: ${m[1]}.`],
  [/^Unknown capability: (.+)\.$/, (m) => `Capacidade desconhecida: ${m[1]}.`],
  [
    /^Observed revision (.+) is stale\. Current revision is (.+)\.$/,
    (m) => `A revisão observada ${m[1]} está desatualizada. A revisão atual é ${m[2]}.`,
  ],
  [
    /^Target must be a canonical MillOS URI of kind (.+)\.$/,
    (m) => `O alvo deve ser um URI canônico do MillOS do tipo ${m[1]}.`,
  ],
  [
    /^(.+) must equal the command target URI\.$/,
    (m) => `${m[1].split(' or ').join(' ou ')} deve ser igual ao URI alvo do comando.`,
  ],
  [/^Missing required parameter: (.+)\.$/, (m) => `Parâmetro obrigatório ausente: ${m[1]}.`],
  [/^Unknown parameter: (.+)\.$/, (m) => `Parâmetro desconhecido: ${m[1]}.`],
  [/^(\S+) must be an? (\w+)\.$/, (m) => `${m[1]} deve ser ${PT_SCHEMA_TYPE[m[2]] ?? m[2]}.`],
  [/^(\S+) is outside the allowed values\.$/, (m) => `${m[1]} está fora dos valores permitidos.`],
  [
    /^(\S+) does not match its semantic pattern\.$/,
    (m) => `${m[1]} não corresponde ao seu padrão semântico.`,
  ],
  [/^(\S+) is below its minimum\.$/, (m) => `${m[1]} está abaixo do mínimo.`],
  [/^(\S+) exceeds its maximum\.$/, (m) => `${m[1]} excede o máximo.`],
  [
    /^Expected (\S+) URI, received (\S+)\.$/,
    (m) => `Era esperado um URI do tipo ${m[1]}, mas foi recebido ${m[2]}.`,
  ],
  [
    /^Grant was revoked: (.+)\.$/,
    (m) =>
      `A autorização foi revogada: ${m[1] === 'no reason recorded' ? 'nenhum motivo registrado' : m[1]}.`,
  ],
  [/^Active objection: (.+)$/s, (m) => `Objeção ativa: ${localizeAgentTextPt(m[1])}`],
  [
    /^This idempotency key was already consumed by (.+); its receipt has left the bounded history\.$/,
    (m) =>
      `Esta chave de idempotência já foi usada por ${m[1]}; o comprovante saiu do histórico limitado.`,
  ],
  [
    /^Approval must come from a registered human actor, not (.+)\.$/,
    (m) => `A aprovação deve vir de um ator humano registrado, não de ${m[1]}.`,
  ],
];

function localizeAgentTextPt(text: string): string {
  const exact = PT_AGENT_TEXT[text];
  if (exact) return exact;
  for (const [pattern, render] of PT_AGENT_PATTERNS) {
    const match = text.match(pattern);
    if (match) return render(match);
  }
  return text;
}

export const agentCockpitMessages = defineMessages({
  en: {
    warmingUp: 'Agent runtime is warming up',
    defaultReason: 'Advance the current production objective.',
    selectCapabilityError: 'Select an implemented capability.',
    situationBrief: 'Situation brief',
    stateObserved: 'State observed',
    briefStatusLine: '{status} · build {build}',
    revision: 'Revision',
    authority: 'Authority',
    scopedCommands: 'Scoped commands',
    noActiveGrant: 'No active grant',
    exceptionQueue: 'Exception queue',
    noExceptions: 'No open exceptions or objections.',
    objection: 'Objection: {statement}',
    operationalException: 'Operational exception',
    intentAndPlan: 'Intent and plan',
    capability: 'Capability',
    reason: 'Reason',
    previewEffects: 'Preview effects and authority',
    currentPreview: 'Current preview',
    effects: 'Effects',
    preconditions: 'Preconditions',
    invariants: 'Invariants',
    cost: (p: CostParams) =>
      `Cost: ${p.compute} compute, ${p.latency} latency, ${p.external ? 'external call' : 'no external call'}.`,
    receiptIssued: 'Receipt issued for this preview.',
    approveAndCommit: 'Approve exact preview and commit',
    commitPreview: 'Commit preview',
    executionReceipt: 'Execution receipt',
    receiptStatus: 'Status:',
    changedDomains: 'Changed domains: {domains}',
    none: 'none',
    pass: 'Pass: {detail}',
    fail: 'Fail: {detail}',
    causalWorkspace: 'Causal workspace',
    event: 'event',
    selectOption: 'Select',
    targetOption: '{name} · {id}',
    satisfied: 'Satisfied: ',
    notSatisfied: 'Not satisfied: ',
    previewStatus: (p: PreviewStatusParams) => p.status,
    capabilityTitle: (p: CapabilityTitleParams) => p.title,
    objectionStatement: (p: ObjectionParams) => p.statement,
    agentText: (p: AgentTextParams) => p.text,
    briefStatus: (p: BriefStatusParams) => EN_BRIEF_STATUS[p.status] ?? p.status,
    runtimeMode: (p: ModeParams) => p.mode,
    fieldLabel: (p: FieldLabelParams) => p.label,
    enumOption: (p: EnumOptionParams) => p.label,
    receiptStatusValue: (p: ReceiptStatusParams) => p.status,
  },
  'pt-BR': {
    warmingUp: 'O ambiente do agente está iniciando',
    defaultReason: 'Avançar o objetivo de produção atual.',
    selectCapabilityError: 'Selecione uma capacidade implementada.',
    situationBrief: 'Resumo da situação',
    stateObserved: 'Estado observado',
    briefStatusLine: '{status} · versão {build}',
    revision: 'Revisão',
    authority: 'Autoridade',
    scopedCommands: 'Comandos com escopo',
    noActiveGrant: 'Nenhuma autorização ativa',
    exceptionQueue: 'Fila de exceções',
    noExceptions: 'Nenhuma exceção ou objeção em aberto.',
    objection: 'Objeção: {statement}',
    operationalException: 'Exceção operacional',
    intentAndPlan: 'Intenção e plano',
    capability: 'Capacidade',
    reason: 'Motivo',
    previewEffects: 'Pré-visualizar efeitos e autoridade',
    currentPreview: 'Prévia atual',
    effects: 'Efeitos',
    preconditions: 'Pré-condições',
    invariants: 'Invariantes',
    cost: (p: CostParams) =>
      `Custo: processamento ${PT_COST_CLASS[p.compute] ?? p.compute}, latência ${PT_COST_CLASS[p.latency] ?? p.latency}, ${p.external ? 'com chamada externa' : 'sem chamada externa'}.`,
    receiptIssued: 'Comprovante emitido para esta prévia.',
    approveAndCommit: 'Aprovar exatamente esta prévia e executar',
    commitPreview: 'Executar prévia',
    executionReceipt: 'Comprovante de execução',
    receiptStatus: 'Status:',
    changedDomains: 'Domínios alterados: {domains}',
    none: 'nenhum',
    pass: 'Aprovado: {detail}',
    fail: 'Reprovado: {detail}',
    causalWorkspace: 'Espaço de trabalho causal',
    event: 'evento',
    selectOption: 'Selecione',
    targetOption: '{name} · {id}',
    satisfied: 'Atendida: ',
    notSatisfied: 'Não atendida: ',
    previewStatus: (p: PreviewStatusParams) => PT_PREVIEW_STATUS[p.status] ?? p.status,
    capabilityTitle: (p: CapabilityTitleParams) => PT_CAPABILITY_TITLES[p.id] ?? p.title,
    objectionStatement: (p: ObjectionParams) =>
      PT_OBJECTIONS[p.id] ?? localizeAgentTextPt(p.statement),
    agentText: (p: AgentTextParams) => localizeAgentTextPt(p.text),
    briefStatus: (p: BriefStatusParams) => PT_BRIEF_STATUS[p.status] ?? p.status,
    runtimeMode: (p: ModeParams) => PT_RUNTIME_MODE[p.mode] ?? p.mode,
    fieldLabel: (p: FieldLabelParams) => PT_FIELD_LABELS[p.name] ?? p.label,
    enumOption: (p: EnumOptionParams) => PT_ENUM_OPTIONS[p.value] ?? p.label,
    receiptStatusValue: (p: ReceiptStatusParams) => PT_RECEIPT_STATUS[p.status] ?? p.status,
  },
});
